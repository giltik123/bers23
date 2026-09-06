import { ArtifactRouter } from './ArtifactRouter';
import { immutableClone } from './immutable';
import { assertIntermediateSeedIsolation, bindIntermediateRuntimeOutputs } from './IntermediateArtifactBinding';
import { WorkflowOptimizer } from './WorkflowOptimizer';
import type { Artifact, CompiledWorkflow, ResourceBudget, StepResult, TimelineEvent, VerificationResult, WorkflowEngineDependencies, WorkflowMetrics, WorkflowOperation, WorkflowSnapshot } from './types';
import { createOriginalMask, executeControlledLocalEdit, type OriginalMask, type PixelImage, type PreserveMode } from '../pipeline/ControlledLocalEdit';
const zeroMetrics = (): WorkflowMetrics => ({ executionTimeMs: 0, latencyMs: 0, credits: 0, peakMemoryMb: 0, gpuMs: 0, aiCalls: 0, failures: 0, retries: 0, maxParallelism: 0, providerUsage: {} });
const operationCost = (operation: WorkflowOperation): ResourceBudget => ({ credits: 0, latencyMs: 0, ramMb: 0, gpuMs: 0, aiCalls: operation.providerId ? 1 : 0, retries: 0, ...operation.cost });

export type AdmittedOnDeviceStepResult = Readonly<{
  artifacts: readonly Omit<Artifact, 'scope' | 'producerStepId'>[];
  latencyMs?: number;
  memoryMb?: number;
  gpuMs?: number;
}>;

export class CreativeWorkflowEngine {
  readonly #snapshots = new Map<string, WorkflowSnapshot>();
  constructor(private readonly dependencies: WorkflowEngineDependencies) {}
  async execute(source: CompiledWorkflow, seedArtifacts: readonly Artifact[] = [], admittedOnDevice: Readonly<Record<string, AdmittedOnDeviceStepResult>> = {}): Promise<WorkflowSnapshot> {
    const workflow = new WorkflowOptimizer().optimize(source, seedArtifacts.map((item) => item.id)); const router = new ArtifactRouter();
    assertIntermediateSeedIsolation(workflow, seedArtifacts);
    seedArtifacts.forEach((item) => router.put(assertArtifactScope(item, workflow))); const timeline: TimelineEvent[] = []; const steps: StepResult[] = []; const verification: VerificationResult[] = [];
    const metrics = zeroMetrics() as MutableMetrics; const now = this.dependencies.now ?? (() => Date.now()); const started = now();
    const emit = (type: string, stepId?: string, details?: Record<string, unknown>) => timeline.push({ sequence: timeline.length + 1, at: now(), type, stepId, details });
    emit('WORKFLOW_STARTED', undefined, { prompt: workflow.prompt }); let failed = false;
    for (const group of workflow.parallelGroups) { metrics.maxParallelism = Math.max(metrics.maxParallelism, group.length);
      for (const id of group) { const operation = workflow.operations.find((item) => item.id === id)!; const result = await this.#runStep(workflow, operation, router, steps, verification, metrics, emit, admittedOnDevice); steps.push(result); if (result.state === 'FAILED') { failed = true; break; } }
      if (failed) break; }
    metrics.executionTimeMs = now() - started; emit(failed ? 'WORKFLOW_FAILED' : 'WORKFLOW_FINISHED');
    const snapshot: WorkflowSnapshot = immutableClone({ workflow, status: failed ? 'FAILED' as const : 'SUCCESS' as const, steps, artifacts: router.list(workflow.scope), verification, metrics, timeline, budget: workflow.budget, health: failed ? 'failed' as const : metrics.retries ? 'degraded' as const : 'healthy' as const, replay: { snapshotVersion: 1 as const, executableWithoutProviders: true as const } });
    this.#snapshots.set(workflow.id, snapshot); return snapshot;
  }
  snapshot(workflowId: string): WorkflowSnapshot | undefined { return this.#snapshots.get(workflowId); }
  replay(snapshot: WorkflowSnapshot): WorkflowSnapshot { return immutableClone(snapshot) as WorkflowSnapshot; }
  explain(snapshot: WorkflowSnapshot) { return immutableClone(snapshot.steps.map((step) => ({ stepId: step.stepId, decision: snapshot.workflow.operations.find((item) => item.id === step.stepId)?.type, provider: step.providerId, state: step.state, reason: `Dependencies and policy satisfied; verification ${step.state === 'FINISHED' ? 'passed' : 'did not pass'}` }))); }
  debug(snapshot: WorkflowSnapshot) { const runningStep = [...snapshot.steps].reverse().find((step) => !['FINISHED', 'FAILED', 'SKIPPED'].includes(step.state)); return immutableClone({ compiledWorkflow: snapshot.workflow, executionGraph: snapshot.workflow.parallelGroups, runningStep, providers: snapshot.steps.map((step) => step.providerId).filter(Boolean), artifacts: snapshot.artifacts, metrics: snapshot.metrics, verification: snapshot.verification, result: snapshot.status }); }
  async #runStep(workflow: CompiledWorkflow, operation: WorkflowOperation, router: ArtifactRouter, prior: StepResult[], verification: VerificationResult[], metrics: MutableMetrics, emit: (type: string, stepId?: string, details?: Record<string, unknown>) => void, admittedOnDevice: Readonly<Record<string, AdmittedOnDeviceStepResult>>): Promise<StepResult> {
    emit('WAITING', operation.id); const unavailableDependency = (operation.dependencies ?? []).find((id) => prior.find((item) => item.stepId === id)?.state !== 'FINISHED'); const inputs = router.route(operation.requiredArtifacts ?? [], workflow.scope); const missingArtifact = (operation.requiredArtifacts ?? []).find((id) => !inputs.some((item) => item.id === id)); const denied = this.dependencies.policy && !this.dependencies.policy.allows(operation, workflow.scope);
    if (unavailableDependency || missingArtifact || denied) return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts: 0, artifacts: [], error: unavailableDependency ? `Dependency unavailable: ${unavailableDependency}` : missingArtifact ? `Artifact unavailable: ${missingArtifact}` : 'Policy or permission denied' });
    const requested = operationCost(operation); if (exceeds(metrics, requested, workflow.budget)) return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts: 0, artifacts: [], error: 'Workflow budget exceeded' });
    let providerId = operation.providerId; let attempts = 0; let lastError = '';
    const onDevice = operation.executionRoute === 'ON_DEVICE';
    const retryBudget = operation.type === 'CONTROLLED_LOCAL_EDIT' || onDevice ? 0 : workflow.budget.retries;
    while (attempts <= retryBudget) { attempts += 1; emit(attempts > 1 ? 'RECOVERING' : 'READY', operation.id, { providerId });
      if (operation.executionRoute === 'PROVIDER' && providerId && !this.dependencies.providers.isAvailable(providerId, workflow.scope)) { const fallback = this.dependencies.providers.fallback(providerId, operation, workflow.scope); if (!fallback) return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts, providerId, artifacts: [], error: 'Provider unavailable' }); providerId = fallback; metrics.retries += 1; emit('FALLBACK_PROVIDER', operation.id, { providerId }); }
      try { emit('RUNNING', operation.id, { providerId }); const controlled = operation.type === 'CONTROLLED_LOCAL_EDIT'; const internal = operation.executionRoute === 'INTERNAL';
        if (internal && operation.type !== 'verify') throw new Error('Unsupported INTERNAL operation');
        if (onDevice && providerId) throw new Error('ON_DEVICE operation cannot use a provider');
        const internalVerification = internal ? await (this.dependencies.verifier ? this.dependencies.verifier.verify(operation, inputs) : Promise.resolve(defaultVerify(operation, inputs))) : undefined;
        if (internalVerification && !internalVerification.valid) throw new Error(internalVerification.errors.join('; ') || 'Verification failed');
        const external = onDevice ? admittedOnDevice[operation.id] : undefined;
        if (onDevice && !external) throw new Error('ON_DEVICE result is not server-admitted');
        const response: StepRuntimeResponse = onDevice ? external! : internal ? { artifacts: inputs.map(input => ({ id: input.id, kind: input.kind, value: input.value, metadata: input.metadata })) } : controlled ? await this.#controlledEdit(workflow, operation, inputs) : await this.dependencies.runtime.execute({ workflowId: workflow.id, operation: { ...operation, providerId }, artifacts: inputs, scope: workflow.scope }); metrics.aiCalls += requested.aiCalls; metrics.credits += requested.credits; metrics.latencyMs += response.latencyMs ?? requested.latencyMs; metrics.gpuMs += response.gpuMs ?? requested.gpuMs; metrics.peakMemoryMb = Math.max(metrics.peakMemoryMb, response.memoryMb ?? requested.ramMb); if (providerId) metrics.providerUsage[providerId] = (metrics.providerUsage[providerId] ?? 0) + 1;
        const bound = (operation.outputBindings?.length ?? 0) > 0 ? bindIntermediateRuntimeOutputs(workflow, operation, inputs, response.artifacts ?? []) : undefined;
        const candidates = bound ?? (response.artifacts ?? []).filter(item => item.metadata?.artifactRole !== 'COMPOSITE').map((item) => router.put({ ...item, producerStepId: operation.id, scope: workflow.scope }));
        const verificationArtifacts = onDevice
          ? (response.artifacts ?? []).map(item => ({ ...item, producerStepId: operation.id, scope: workflow.scope }))
          : candidates;
        emit('VERIFYING', operation.id); const controlledVerification = response.verification; const checked = internalVerification ?? controlledVerification ?? (this.dependencies.verifier ? await this.dependencies.verifier.verify(operation, verificationArtifacts) : defaultVerify(operation, verificationArtifacts)); verification.push(immutableClone(checked) as VerificationResult); if (!checked.valid) throw new Error(checked.errors.join('; ') || 'Verification failed');
        const routedCandidates = bound ? bound.map(item => router.put(item)) : candidates;
        const finals = bound ? [] : (response.artifacts ?? []).filter(item => item.metadata?.artifactRole === 'COMPOSITE').map((item) => router.put({ ...item, producerStepId: operation.id, scope: workflow.scope })); const artifacts = [...routedCandidates, ...finals]; emit('SUCCESS', operation.id); emit('FINISHED', operation.id); return immutableClone({ stepId: operation.id, state: 'FINISHED' as const, attempts, providerId, artifacts });
      } catch (error) { if (isCreativeCancellation(error) || isUnknownProviderOutcome(error)) throw error; lastError = error instanceof Error ? error.message : String(error); metrics.failures += 1; emit('FAILED', operation.id, { error: lastError }); if (attempts <= retryBudget) { metrics.retries += 1; providerId = operation.executionRoute === 'PROVIDER' ? (providerId && this.dependencies.providers.fallback(providerId, operation, workflow.scope)) || providerId : undefined; } }
    }
    return immutableClone({ stepId: operation.id, state: 'FAILED' as const, attempts, providerId, artifacts: [], error: lastError });
  }
  async #controlledEdit(workflow: CompiledWorkflow, operation: WorkflowOperation, inputs: readonly Artifact[]) {
    const originalArtifact = inputs.find(item => item.metadata?.artifactRole === 'ORIGINAL') ?? inputs.find(item => isPixelImage(item.value));
    const maskArtifact = inputs.find(item => item.metadata?.artifactRole === 'MASK');
    if (!originalArtifact || !isPixelImage(originalArtifact.value) || !maskArtifact) throw new Error('Controlled local edit requires ORIGINAL pixels and MASK');
    const original = originalArtifact.value; const mask = toOriginalMask(maskArtifact, original); const preserveMode = preserveModeOf(operation.input?.preserveMode);
    const result = await executeControlledLocalEdit({ executionId: workflow.id, original, mask, maskArtifactId: maskArtifact.id, instruction: String(operation.input?.instruction ?? workflow.prompt), policy: { preserveMode, haloPixels: numberOr(operation.input?.haloPixels, 0), haloRatio: numberOr(operation.input?.haloRatio, .1), minimumProviderSize: numberOr(operation.input?.minimumProviderSize, 1), boundaryMeanDeltaLimit: typeof operation.input?.boundaryMeanDeltaLimit === 'number' ? operation.input.boundaryMeanDeltaLimit : undefined }, provider: async request => {
      const roiArtifact: Artifact = { id: `${operation.id}:roi-input`, kind: 'image', value: request.roi, producerStepId: operation.id, scope: workflow.scope, metadata: { lifecycle: 'AVAILABLE', artifactRole: 'ROI_INPUT', parentArtifactIds: [originalArtifact.id, maskArtifact.id], mask: request.mask, transform: request.transform } };
      const response = await this.dependencies.runtime.execute({ workflowId: workflow.id, operation: { ...operation, input: { ...operation.input, instruction: request.instruction, preserveMode: request.preservationConstraints, roiTransform: request.transform } }, artifacts: [roiArtifact, maskArtifact], scope: workflow.scope });
      const patch = response.artifacts?.find(item => isPixelImage(item.value)); if (!patch || !isPixelImage(patch.value)) throw new Error('Controlled edit provider returned no pixel patch'); return patch.value;
    }});
    const lineage = { originalArtifactId: originalArtifact.id, maskArtifactId: maskArtifact.id, roiInputArtifactId: `${operation.id}:roi-input` };
    return { artifacts: [
      { id: `${operation.id}:roi-input`, kind: 'image', value: { transform: result.candidatePatch.transform }, metadata: { lifecycle: 'AVAILABLE', artifactRole: 'ROI_INPUT', parentArtifactIds: [originalArtifact.id, maskArtifact.id], ...lineage } },
      { id: `${operation.id}:provider-patch`, kind: 'image', value: result.candidatePatch.image, metadata: { lifecycle: 'AVAILABLE', artifactRole: 'PATCH', parentArtifactIds: [`${operation.id}:roi-input`], ...lineage } },
      { id: `${operation.id}:verified-patch`, kind: 'image', value: result.candidatePatch.image, metadata: { lifecycle: result.verification.valid ? 'VALIDATED' : 'FAILED', artifactRole: 'VERIFIED_PATCH', parentArtifactIds: [`${operation.id}:provider-patch`], verification: result.verification, ...lineage } },
      { id: `${operation.id}:composite`, kind: 'image', value: result.composite.image, metadata: { lifecycle: 'FINAL', artifactRole: 'COMPOSITE', parentArtifactIds: [originalArtifact.id, `${operation.id}:verified-patch`], integrityMetrics: result.metrics, ...lineage } },
    ], verification: { stepId: operation.id, valid: result.verification.valid, checks: result.verification.checks, errors: result.verification.errors } };
  }
}
type MutableMetrics = { -readonly [K in keyof WorkflowMetrics]: K extends 'providerUsage' ? Record<string, number> : WorkflowMetrics[K] };
type StepRuntimeResponse = Readonly<{ artifacts?: readonly Omit<Artifact, 'scope' | 'producerStepId'>[]; latencyMs?: number; memoryMb?: number; gpuMs?: number; verification?: VerificationResult }>;
function defaultVerify(operation: WorkflowOperation, artifacts: readonly Artifact[]): VerificationResult { const missing = (operation.produces ?? []).filter((kind) => !artifacts.some((item) => item.kind === kind)); return { stepId: operation.id, valid: !missing.length, checks: ['artifacts', 'pipeline-integrity', 'metadata'], errors: missing.map((kind) => `Missing ${kind}`) }; }
function exceeds(metrics: WorkflowMetrics, requested: ResourceBudget, budget: ResourceBudget): boolean { return metrics.credits + requested.credits > budget.credits || metrics.latencyMs + requested.latencyMs > budget.latencyMs || Math.max(metrics.peakMemoryMb, requested.ramMb) > budget.ramMb || metrics.gpuMs + requested.gpuMs > budget.gpuMs || metrics.aiCalls + requested.aiCalls > budget.aiCalls; }
function assertArtifactScope(artifact: Artifact, workflow: CompiledWorkflow): Artifact { if (artifact.scope.tenantId !== workflow.scope.tenantId || artifact.scope.projectId !== workflow.scope.projectId || artifact.scope.userId !== workflow.scope.userId) throw new Error('Artifact scope isolation violation'); return artifact; }
function isCreativeCancellation(error: unknown): boolean { return error instanceof DOMException && error.name === 'AbortError'; }
function isUnknownProviderOutcome(error: unknown): boolean { return Boolean(error && typeof error === 'object' && ('unknownOutcome' in error || (error as { code?: string }).code === 'PROVIDER_RESULT_UNKNOWN')); }
function isPixelImage(value: unknown): value is PixelImage { return Boolean(value && typeof value === 'object' && Number.isInteger((value as PixelImage).width) && Number.isInteger((value as PixelImage).height) && (value as PixelImage).data instanceof Uint8ClampedArray); }
function toOriginalMask(artifact: Artifact, original: PixelImage): OriginalMask { const value = artifact.value as Partial<OriginalMask>; if (!(value.alpha instanceof Uint8Array)) throw new Error('Controlled local edit MASK has no alpha pixels'); return createOriginalMask({ artifactId: artifact.id, width: value.width ?? original.width, height: value.height ?? original.height, source: value.source ?? 'USER', alpha: value.alpha, userMaskArtifactId: value.userMaskArtifactId }); }
function preserveModeOf(value: unknown): PreserveMode { return value === 'BALANCED' || value === 'CREATIVE' ? value : 'STRICT'; }
function numberOr(value: unknown, fallback: number): number { return typeof value === 'number' && Number.isFinite(value) ? value : fallback; }
