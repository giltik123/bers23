import { PipelineQualityGate } from '../pipeline';
import type { CloudProviderArtifactView, CloudProviderResultView, ExecutionAccounting, ExecutionTarget, ImageArtifact, InferenceResult, OperationName, QualityMeasurement, TelemetryEvent, TelemetryEventName, VerificationResult, VerticalSliceDependencies, VerticalSliceRequest, VerticalSliceResult } from './types';

const freeze = <T>(value: T): Readonly<T> => {
  if (value && typeof value === 'object' && !Object.isFrozen(value) && !(value instanceof Uint8Array)) {
    Object.freeze(value);
    for (const child of Object.values(value as object)) freeze(child);
  }
  return value as Readonly<T>;
};
const clamp = (value: number) => Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));

export class ArtifactValidator {
  async validate(artifact: ImageArtifact, hash: (bytes: Uint8Array) => Promise<string>): Promise<Readonly<{ valid: boolean; errors: readonly string[] }>> {
    const errors: string[] = [];
    if (!(artifact.bytes instanceof Uint8Array) || artifact.bytes.byteLength === 0) errors.push('Artifact bytes are empty');
    if (artifact.width <= 0 || artifact.height <= 0) errors.push('Artifact dimensions are invalid');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(artifact.mimeType)) errors.push('Artifact MIME type is unsupported');
    if (artifact.bytes.byteLength && await hash(artifact.bytes) !== artifact.hash) errors.push('Artifact hash mismatch');
    return freeze({ valid: errors.length === 0, errors });
  }
}

export class RealQualityGate {
  constructor(private readonly pipelineGate = new PipelineQualityGate()) {}
  evaluate(measurement: QualityMeasurement, threshold = 0.8, failure: QualityDecisionHint = 'ESCALATE'): VerificationResult {
    const normalized = { quality: clamp(measurement.quality), goalCompletion: clamp(measurement.goalCompletion), artifactIntegrity: clamp(measurement.artifactIntegrity), identityPreservation: clamp(measurement.identityPreservation), operationSuccess: clamp(measurement.operationSuccess) };
    const score = normalized.quality * .3 + normalized.goalCompletion * .25 + normalized.artifactIntegrity * .2 + normalized.identityPreservation * .15 + normalized.operationSuccess * .1;
    const gate = this.pipelineGate.evaluate('vertical-slice', score, threshold);
    const reasons = Object.entries(normalized).filter(([, value]) => value < threshold).map(([metric]) => `${metric} below ${threshold}`);
    return freeze({ ...normalized, score, threshold, decision: gate.decision === 'SKIP_AI' && reasons.length === 0 ? 'ACCEPT' : failure, reasons });
  }
}
type QualityDecisionHint = 'RETRY' | 'ESCALATE' | 'REPLAN';

export class ProductionTelemetry {
  #events: TelemetryEvent[] = [];
  constructor(private readonly runId: string, private readonly now: () => number, private readonly id: () => string) {}
  emit(type: TelemetryEventName, fields: Omit<TelemetryEvent, 'id' | 'type' | 'timestamp' | 'runId' | 'data'> & { data?: Readonly<Record<string, unknown>> } = {}): void {
    this.#events.push(freeze({ id: this.id(), type, timestamp: this.now(), runId: this.runId, ...fields, data: sanitize(fields.data ?? {}) }) as TelemetryEvent);
  }
  events(): readonly TelemetryEvent[] { return freeze([...this.#events]); }
}

const PLANS: Readonly<Record<VerticalSliceRequest['scenario'], readonly OperationName[]>> = freeze({
  SMART_UPSCALE: ['analysis', 'upscale', 'verification'],
  SMART_BACKGROUND_EDIT: ['analysis', 'segmentation', 'mask-cleanup', 'background-edit', 'enhancement', 'verification'],
  SMART_CREATIVE_ENHANCEMENT: ['analysis', 'enhancement', 'verification'],
  GENERATIVE_EDIT: ['analysis', 'generative-edit', 'verification'],
});

export class CreativeVerticalSlice {
  readonly #now: () => number; readonly #id: () => string; readonly #hash: (bytes: Uint8Array) => Promise<string>;
  constructor(private readonly deps: VerticalSliceDependencies) {
    this.#now = deps.now ?? (() => Date.now()); this.#id = deps.id ?? (() => crypto.randomUUID());
    this.#hash = deps.hash ?? sha256;
  }

  async execute(request: VerticalSliceRequest): Promise<VerticalSliceResult> {
    validateRequest(request); const runId = this.#id(); const telemetry = new ProductionTelemetry(runId, this.#now, this.#id);
    const plan = PLANS[request.scenario]; const path: ExecutionTarget[] = []; const accounting: ExecutionAccounting[] = [];
    const threshold = request.qualityThreshold ?? .8; let artifact = request.image; let verification: VerificationResult | undefined;
    const initial = await new ArtifactValidator().validate(artifact, this.#hash);
    if (!initial.valid) return this.finish('FAILED', `Invalid input: ${initial.errors.join(', ')}`, request, runId, plan, path, accounting, artifact, verification, telemetry);
    const operations = plan.filter((operation) => operation !== 'verification');
    for (const operation of operations) {
      const localAvailable = await this.deps.providers.local.available(operation);
      if (localAvailable) {
        try {
          const local = await this.local(operation, artifact, request, telemetry, accounting); path.push('LOCAL'); artifact = local.artifact;
          verification = await this.verify(local, threshold, operation, telemetry);
          if (verification.decision === 'ACCEPT') continue;
          telemetry.emit('Rejected', { operation, target: 'LOCAL', data: { decision: verification.decision, score: verification.score } });
          accounting[accounting.length - 1] = freeze({ ...accounting[accounting.length - 1], result: 'REJECTED' });
          if (!this.canCloud(request)) return this.finish('BLOCKED', 'Local quality was insufficient and privacy policy forbids cloud escalation', request, runId, plan, path, accounting, artifact, verification, telemetry);
          telemetry.emit('Escalated', { operation, target: this.cloudTarget(request.scenario), data: { from: 'LOCAL', reason: 'QUALITY_GATE' } });
          const cloud = await this.cloud(operation, artifact, request, telemetry, accounting); path.push(cloud.target); artifact = cloud.result.artifact; verification = await this.verify(cloud.result, threshold, operation, telemetry);
          if (verification.decision !== 'ACCEPT') return this.finish('FAILED', 'Cloud result did not pass verification', request, runId, plan, path, accounting, artifact, verification, telemetry);
        } catch (error) {
          if (accounting.at(-1)?.provider === 'local' && accounting.at(-1)?.result === 'REJECTED') return this.finish('FAILED', `Cloud escalation failed: ${(error as Error).message}`, request, runId, plan, path, accounting, artifact, verification, telemetry);
          if (!this.canCloud(request)) return this.finish('FAILED', `Local inference failed: ${(error as Error).message}`, request, runId, plan, path, accounting, artifact, verification, telemetry);
          telemetry.emit('Fallback', { operation, target: this.cloudTarget(request.scenario), data: { from: 'LOCAL', reason: 'INFERENCE_FAILED' } });
          try { const cloud = await this.cloud(operation, artifact, request, telemetry, accounting); path.push(cloud.target); artifact = cloud.result.artifact; verification = await this.verify(cloud.result, threshold, operation, telemetry); }
          catch (cloudError) { return this.finish('FAILED', `Local and cloud inference failed: ${(cloudError as Error).message}`, request, runId, plan, path, accounting, artifact, verification, telemetry); }
        }
      } else {
        if (!this.canCloud(request)) return this.finish('BLOCKED', `Operation ${operation} is unavailable locally and cloud execution is forbidden`, request, runId, plan, path, accounting, artifact, verification, telemetry);
        try { const cloud = await this.cloud(operation, artifact, request, telemetry, accounting); path.push(cloud.target); artifact = cloud.result.artifact; verification = await this.verify(cloud.result, threshold, operation, telemetry); if (verification.decision !== 'ACCEPT') return this.finish('FAILED', 'Cloud result did not pass verification', request, runId, plan, path, accounting, artifact, verification, telemetry); }
        catch (cloudError) {
          telemetry.emit('Fallback', { operation, target: 'LOCAL', data: { from: this.cloudTarget(request.scenario), reason: 'INFERENCE_FAILED' } });
          if (!await this.deps.providers.local.available(operation)) return this.finish('FAILED', `Cloud failed and no compatible local fallback exists: ${(cloudError as Error).message}`, request, runId, plan, path, accounting, artifact, verification, telemetry);
        }
      }
    }
    return this.finish('COMPLETED', undefined, request, runId, plan, path, accounting, artifact, verification, telemetry);
  }

  private async local(operation: OperationName, artifact: ImageArtifact, request: VerticalSliceRequest, telemetry: ProductionTelemetry, accounting: ExecutionAccounting[]): Promise<InferenceResult> {
    telemetry.emit('LocalInferenceStarted', { operation, target: 'LOCAL', data: { artifactId: artifact.id } }); const started = this.#now();
    const result = await this.deps.providers.local.infer({ operation, artifact, prompt: request.prompt, signal: request.signal }); await this.assertArtifact(result.artifact);
    const latency = result.latencyMs || Math.max(0, this.#now() - started); accounting.push(freeze({ provider: 'local', model: result.model, operation, estimatedCost: 0, actualCost: 0, credits: 0, latencyMs: latency, deviceTimeMs: latency, energyEstimateWh: latency * .000015, result: 'SUCCESS', quality: result.quality.quality }));
    telemetry.emit('LocalInferenceCompleted', { operation, target: 'LOCAL', data: { model: result.model, latencyMs: latency, artifactId: result.artifact.id } }); return result;
  }

  private async cloud(operation: OperationName, artifact: ImageArtifact, request: VerticalSliceRequest, telemetry: ProductionTelemetry, accounting: ExecutionAccounting[]): Promise<{ target: Exclude<ExecutionTarget, 'LOCAL'>; result: InferenceResult }> {
    const target = this.cloudTarget(request.scenario); telemetry.emit('CloudInferenceStarted', { operation, target, data: { artifactId: artifact.id } }); const started = this.#now();
    let result: InferenceResult;
    if (target === 'REVE') { if (!this.deps.providers.reve) throw new Error('Reve provider is unavailable'); result = await this.deps.providers.reve.execute({ scope: request.scope, prompt: request.prompt, artifact, signal: request.signal }); }
    else {
      if (!this.deps.providers.fal) throw new Error('Fal provider is unavailable');
      const fal = await this.deps.providers.fal.execute({ scope: request.scope, capability: falCapability(operation), prompt: request.prompt, inputs: { image: artifact.bytes, mimeType: artifact.mimeType }, metadata: { artifactId: artifact.id }, timeoutMs: 60_000 });
      result = await this.fromFal(fal, artifact);
    }
    await this.assertArtifact(result.artifact); const latency = result.latencyMs || Math.max(0, this.#now() - started); const estimated = this.deps.estimatedCloudCredits?.[operation] ?? 1; const actual = result.actualCost ?? estimated;
    accounting.push(freeze({ provider: target === 'FAL' ? 'fal' : 'reve', model: result.model, operation, estimatedCost: estimated, actualCost: actual, credits: actual, latencyMs: latency, deviceTimeMs: 0, energyEstimateWh: 0, result: 'SUCCESS', quality: result.quality.quality }));
    telemetry.emit('CloudInferenceCompleted', { operation, target, data: { model: result.model, latencyMs: latency, cost: actual, artifactId: result.artifact.id } }); return { target, result };
  }

  private async fromFal(result: CloudProviderResultView, previous: ImageArtifact): Promise<InferenceResult> {
    const source = result.artifacts[0]; if (!source) throw new Error('Fal returned no artifact'); const bytes = artifactBytes(source); if (!bytes.byteLength) throw new Error('Fal artifact has no loaded bytes');
    return { artifact: freeze({ id: result.id, mimeType: source.mimeType as ImageArtifact['mimeType'], bytes, width: numberMeta(result.data.width, previous.width), height: numberMeta(result.data.height, previous.height), hash: source.hash || await this.#hash(bytes), createdAt: result.createdAt, metadata: { provider: 'fal', sourceUrl: source.url } }), quality: qualityFrom(result.data), model: String(result.data.model ?? 'fal'), latencyMs: result.metrics.latencyMs, actualCost: result.metrics.cost };
  }
  private async verify(result: InferenceResult, threshold: number, operation: OperationName, telemetry: ProductionTelemetry) { const verification = new RealQualityGate().evaluate(result.quality, threshold); telemetry.emit('Verified', { operation, data: { decision: verification.decision, score: verification.score } }); return verification; }
  private canCloud(request: VerticalSliceRequest) { return request.cloudAllowed !== false && !['LOCAL_ONLY', 'OFFLINE_ONLY'].includes(request.privacyMode ?? 'NORMAL'); }
  private cloudTarget(scenario: VerticalSliceRequest['scenario']): 'FAL' | 'REVE' { return scenario === 'GENERATIVE_EDIT' || scenario === 'SMART_CREATIVE_ENHANCEMENT' ? 'REVE' : 'FAL'; }
  private async assertArtifact(artifact: ImageArtifact) { const validation = await new ArtifactValidator().validate(artifact, this.#hash); if (!validation.valid) throw new Error(validation.errors.join(', ')); }
  private finish(status: VerticalSliceResult['status'], reason: string | undefined, request: VerticalSliceRequest, runId: string, plan: readonly OperationName[], path: readonly ExecutionTarget[], accounting: readonly ExecutionAccounting[], artifact: ImageArtifact, verification: VerificationResult | undefined, telemetry: ProductionTelemetry): VerticalSliceResult {
    const local = accounting.filter((item) => item.provider === 'local' && item.result === 'SUCCESS'); const cloud = accounting.filter((item) => item.provider !== 'local'); const potential = new Set(accounting.map(item => item.operation)).size; const localOperations = new Set(local.map(item => item.operation)).size; const creditsSaved = local.reduce((sum, item) => sum + (this.deps.estimatedCloudCredits?.[item.operation] ?? 1), 0);
    telemetry.emit(status === 'COMPLETED' ? 'Completed' : 'Rejected', { data: { status, reason, cloudAvoidanceRate: potential ? localOperations / potential : 0 } });
    const explanation = explain(path, accounting, reason);
    return freeze({ status, ...(reason ? { reason } : {}), ...(status === 'COMPLETED' ? { finalArtifact: artifact } : {}), metadata: { scenario: request.scenario, cloudAvoidanceRate: potential ? localOperations / potential : 0, localSuccessRate: local.length / Math.max(1, accounting.filter(x => x.provider === 'local').length), escalationRate: telemetry.events().some(x => x.type === 'Escalated') ? 1 : 0 }, executionSnapshot: { runId, intent: request.scenario, plan, processingPath: [...path], accounting: [...accounting] }, costSummary: { cloudCredits: cloud.reduce((sum, x) => sum + x.credits, 0), cloudCost: cloud.reduce((sum, x) => sum + x.actualCost, 0), localOperations: local.length, deviceTimeMs: local.reduce((sum, x) => sum + x.deviceTimeMs, 0), energyEstimateWh: local.reduce((sum, x) => sum + x.energyEstimateWh, 0), creditsSaved }, ...(verification ? { verification } : {}), explanation, telemetry: telemetry.events() }) as VerticalSliceResult;
  }
}

export class CreativeVerticalSliceDebugger {
  inspect(request: VerticalSliceRequest, result: VerticalSliceResult) { return freeze({ prompt: request.prompt, intent: result.executionSnapshot.intent, plan: result.executionSnapshot.plan, executionGraph: result.executionSnapshot.plan.map((operation, index) => ({ operation, dependsOn: index ? result.executionSnapshot.plan[index - 1] : null })), targetSelection: result.executionSnapshot.processingPath, actualResult: result.status, verification: result.verification, escalation: result.telemetry.filter(x => x.type === 'Escalated' || x.type === 'Fallback'), finalResult: result.finalArtifact?.id, realCost: result.costSummary }); }
}

function validateRequest(request: VerticalSliceRequest) { if (!request?.scope?.tenantId || !request.scope.projectId || !request.scope.userId) throw new Error('Complete scope is required'); if (!request.prompt?.trim()) throw new Error('Prompt is required'); }
function falCapability(operation: OperationName) { return ({ segmentation: 'segmentation', 'background-edit': 'background-remove', upscale: 'upscale', enhancement: 'image-edit', analysis: 'image-edit', 'mask-cleanup': 'inpaint', 'generative-edit': 'image-edit', verification: 'image-edit' } as const)[operation]; }
function artifactBytes(artifact: CloudProviderArtifactView) { return artifact.bytes ? new Uint8Array(artifact.bytes) : new Uint8Array(); }
function numberMeta(value: unknown, fallback: number) { return typeof value === 'number' && value > 0 ? value : fallback; }
function qualityFrom(data: Readonly<Record<string, unknown>>): QualityMeasurement { const q = typeof data.quality === 'number' ? data.quality : .9; return { quality: q, goalCompletion: typeof data.goalCompletion === 'number' ? data.goalCompletion : q, artifactIntegrity: 1, identityPreservation: typeof data.identityPreservation === 'number' ? data.identityPreservation : .9, operationSuccess: 1 }; }
function explain(path: readonly ExecutionTarget[], accounting: readonly ExecutionAccounting[], reason?: string) { const local = accounting.filter(x => x.provider === 'local').length; const cloud = accounting.filter(x => x.provider !== 'local'); if (reason) return `${reason}. Processing path: ${path.join(' → ') || 'none'}.`; if (!cloud.length) return `The image was processed entirely on device in ${local} local operations, using 0 cloud credits.`; return `The system first used ${local} on-device operations. Cloud AI (${[...new Set(cloud.map(x => x.provider))].join(', ')}) was used only where local capability or verified quality was insufficient, costing ${cloud.reduce((sum, x) => sum + x.credits, 0)} credits.`; }
function sanitize(value: Readonly<Record<string, unknown>>) { const forbidden = /key|secret|token|authorization|billing/i; return Object.fromEntries(Object.entries(value).filter(([key]) => !forbidden.test(key)).map(([key, child]) => [key, typeof child === 'object' && child !== null && !ArrayBuffer.isView(child) ? sanitize(child as Record<string, unknown>) : child])); }
async function sha256(bytes: Uint8Array) { const digest = await crypto.subtle.digest('SHA-256', bytes as BufferSource); return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join(''); }
