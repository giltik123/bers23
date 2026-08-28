import type { CanonicalPlanningPort, CreativeDecision, CreativeOperation, CreativePlan, CreativePlanArtifactSnapshot, CreativePlanCandidate, CreativePlanConstraints, CreativePlannerConfigSnapshot, CreativePlanProvenance, CreativePlanScore, CreativePlanStatus, CreativePlanUncertainty, CreativeRequest, ExecutionTarget, PlanningConfirmationPolicy, PlanningExecutionPolicy, PlanningTelemetryPort } from '../contracts';
import { buildExplanation, buildReplay, emitPlanTelemetry, fallbackFor, immutable, verificationFor } from './advisoryPolicies';

export const CANONICAL_PLANNER_VERSION = '6.42C3.1';
type Options = Readonly<{ plannerVersion?: string; minimumIntentConfidence?: number; minimumTargetConfidence?: number; maximumPreservationRisk?: number; compositeExecutionEnabled?: boolean; localCompositeContinuationEnabled?: boolean; telemetry?: PlanningTelemetryPort }>;
type PlannerCropRect = Readonly<{ x: number; y: number; width: number; height: number }>;

/** Deterministic advisory planner. Canonical Core revalidates every proposal. */
export class CanonicalPlanningService implements CanonicalPlanningPort {
  readonly #options: Omit<Required<Options>, 'telemetry'> & Pick<Options, 'telemetry'>;
  constructor(options: Options = {}) { this.#options = { plannerVersion: options.plannerVersion ?? CANONICAL_PLANNER_VERSION, minimumIntentConfidence: options.minimumIntentConfidence ?? .65, minimumTargetConfidence: options.minimumTargetConfidence ?? .65, maximumPreservationRisk: options.maximumPreservationRisk ?? .7, compositeExecutionEnabled: options.compositeExecutionEnabled ?? false, localCompositeContinuationEnabled: options.localCompositeContinuationEnabled ?? false, telemetry: options.telemetry }; }

  async plan(request: CreativeRequest, decision: CreativeDecision): Promise<CreativePlan> {
    const artifacts = immutable((request.inputArtifacts ?? []).map(({ id, kind, role }) => ({ id, kind, role } satisfies CreativePlanArtifactSnapshot)));
    const constraints = immutable(readConstraints(request, decision));
    const uncertainty = immutable(readUncertainty(request));
    const plannerConfig = immutable({ minimumIntentConfidence: this.#options.minimumIntentConfidence, minimumTargetConfidence: this.#options.minimumTargetConfidence, maximumPreservationRisk: this.#options.maximumPreservationRisk, compositeExecutionEnabled: this.#options.compositeExecutionEnabled, localCompositeContinuationEnabled: this.#options.localCompositeContinuationEnabled } satisfies CreativePlannerConfigSnapshot);
    const interactiveSegmentation = request.metadata?.operationIntent === 'INTERACTIVE_SEGMENTATION';
    const backgroundIsolation = request.metadata?.operationIntent === 'BACKGROUND_ISOLATION';
    const crop = request.metadata?.operationIntent === 'CROP';
    const superResolution = request.metadata?.operationIntent === 'SUPER_RESOLUTION';
    const localComposite = request.metadata?.operationIntent === 'LOCAL_SEGMENT_BACKGROUND_ISOLATION_COMPOSITE';
    const composite = request.metadata?.operationIntent === 'COMPOSITE_REPLACE_RELIGHT';
    const requestedIsolationSourceId = backgroundIsolation && typeof request.metadata?.sourceArtifactId === 'string' ? request.metadata.sourceArtifactId : undefined;
    const requestedIsolationMaskId = backgroundIsolation && typeof request.metadata?.maskArtifactId === 'string' ? request.metadata.maskArtifactId : undefined;
    const requestedCropSourceId = crop && typeof request.metadata?.sourceArtifactId === 'string' ? request.metadata.sourceArtifactId : undefined;
    const requestedSuperResolutionSourceId = superResolution && typeof request.metadata?.sourceArtifactId === 'string' ? request.metadata.sourceArtifactId : undefined;
    const localCompositeOriginalUnavailable = localComposite && !artifacts.some(artifact => artifact.kind === 'image' && artifact.role === 'ORIGINAL');
    const compositeOriginalUnavailable = composite && !artifacts.some(artifact => artifact.kind === 'image' && artifact.role === 'ORIGINAL');
    const segmentationInputUnavailable = interactiveSegmentation && !artifacts.some(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'WORKING'));
    const isolationSourceUnavailable = backgroundIsolation && !artifacts.some(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE') && (!requestedIsolationSourceId || artifact.id === requestedIsolationSourceId));
    const isolationMaskUnavailable = backgroundIsolation && !artifacts.some(artifact => artifact.kind === 'mask' && artifact.role === 'MASK' && (!requestedIsolationMaskId || artifact.id === requestedIsolationMaskId));
    const cropSourceUnavailable = crop && !artifacts.some(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE') && (!requestedCropSourceId || artifact.id === requestedCropSourceId));
    const cropRectInvalid = crop && !readPlannerCropRect(request.metadata?.cropRect);
    const superResolutionSourceUnavailable = superResolution && !artifacts.some(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE') && (!requestedSuperResolutionSourceId || artifact.id === requestedSuperResolutionSourceId));
    const strategies = crop
      ? [cropOperations(artifacts, constraints, request)]
      : superResolution
        ? [superResolutionOperations(artifacts, constraints, request)]
        : backgroundIsolation
          ? [backgroundIsolationOperations(artifacts, constraints, request)]
          : interactiveSegmentation
            ? [interactiveSegmentationOperations(artifacts, constraints, request)]
            : localComposite
              ? [localCompositeOperations(artifacts, constraints, request)]
              : composite
                ? [compositeOperations('local-efficient', artifacts, constraints, decision.goal), compositeOperations('cloud-quality', artifacts, constraints, decision.goal)]
                : [simpleOperations(request, artifacts, constraints)];
    const rawCandidates = strategies.map((operations, index) => candidate(
      localComposite ? 'local-continuation' : index === 0 ? 'local-efficient' : 'cloud-quality',
      operations,
      localComposite ? 'LOCAL' : index === 0 ? 'LOCAL' : 'CLOUD',
      localComposite ? 0 : composite ? (index === 0 ? 1 : 5) : 0,
      localComposite ? 180 : composite ? (index === 0 ? 1200 : 2800) : interactiveSegmentation ? 120 : backgroundIsolation ? 20 : crop ? 5 : superResolution ? 900 : 0,
      localComposite ? 1 : composite ? (index === 0 ? .76 : .94) : backgroundIsolation || crop ? 1 : superResolution ? .9 : .9,
      uncertainty.aggregateConfidence,
    ));
    const ranked = rankAndFilter(rawCandidates, constraints);
    const candidates = immutable(ranked.map(value => ({ ...value, fallbackAdvice: fallbackFor(value, constraints, ranked.find(other => other.id !== value.id && other.status === 'ACCEPTED')) })));
    const selected = candidates.find(item => item.status === 'ACCEPTED');
    const confirmationReasons: string[] = [];
    const localUnavailable = constraints.executionPolicy === 'LOCAL_ONLY' && !selected;
    const localCompositeExecutionUnavailable = localComposite && !this.#options.localCompositeContinuationEnabled;
    const compositeExecutionUnavailable = composite && !this.#options.compositeExecutionEnabled;
    if (uncertainty.intentInterpretation < this.#options.minimumIntentConfidence) confirmationReasons.push('LOW_INTENT_CONFIDENCE');
    if (uncertainty.targetResolution < this.#options.minimumTargetConfidence) confirmationReasons.push('AMBIGUOUS_TARGET');
    if (uncertainty.preservationRisk > this.#options.maximumPreservationRisk && constraints.confirmationPolicy !== 'ALLOW_PRESERVATION_RISK') confirmationReasons.push('HIGH_PRESERVATION_RISK');
    if (localUnavailable) confirmationReasons.push('NO_FEASIBLE_LOCAL_STRATEGY');
    if (segmentationInputUnavailable) confirmationReasons.push('CANONICAL_IMAGE_REQUIRED');
    if (isolationSourceUnavailable) confirmationReasons.push('CANONICAL_SOURCE_IMAGE_REQUIRED');
    if (isolationMaskUnavailable) confirmationReasons.push('CANONICAL_MASK_REQUIRED');
    if (cropSourceUnavailable) confirmationReasons.push('CANONICAL_SOURCE_IMAGE_REQUIRED');
    if (cropRectInvalid) confirmationReasons.push('INVALID_CROP_RECT');
    if (superResolutionSourceUnavailable) confirmationReasons.push('CANONICAL_SOURCE_IMAGE_REQUIRED');
    if (localCompositeOriginalUnavailable) confirmationReasons.push('CANONICAL_ORIGINAL_REQUIRED');
    if (compositeOriginalUnavailable) confirmationReasons.push('CANONICAL_ORIGINAL_REQUIRED');
    if (localCompositeExecutionUnavailable) confirmationReasons.push('LOCAL_COMPOSITE_CONTINUATION_NOT_WIRED');
    if (compositeExecutionUnavailable) confirmationReasons.push('COMPOSITE_EXECUTION_NOT_WIRED');
    const hardBlocked = segmentationInputUnavailable || isolationSourceUnavailable || isolationMaskUnavailable || cropSourceUnavailable || cropRectInvalid || superResolutionSourceUnavailable || localCompositeExecutionUnavailable || localCompositeOriginalUnavailable || compositeExecutionUnavailable || compositeOriginalUnavailable || (localUnavailable && constraints.confirmationPolicy === 'BLOCK');
    const status: CreativePlanStatus = hardBlocked ? 'BLOCKED' : confirmationReasons.length || !selected ? 'NEEDS_CONFIRMATION' : 'READY';
    const operations = immutable(status === 'BLOCKED' ? [] : selected?.operations ?? []);
    const rejected = immutable(candidates.filter(item => item.status === 'REJECTED').map(({ id, reasonCodes }) => ({ id, reasonCodes })));
    const planReason = crop ? 'CROP_LOCAL_DETERMINISTIC_V1' : superResolution ? 'SUPER_RESOLUTION_LOCAL_MODEL_V1' : backgroundIsolation ? 'BACKGROUND_ISOLATION_LOCAL_DETERMINISTIC_V1' : interactiveSegmentation ? 'INTERACTIVE_SEGMENTATION_LOCAL_V1' : localComposite ? 'LOCAL_SEGMENT_BACKGROUND_ISOLATION_COMPOSITE_V1' : composite ? 'COMPOSITE_INTENT_REGISTRY_V2' : 'SIMPLE_EDIT_COMPATIBILITY';
    let provenance = immutable({ plannerVersion: this.#options.plannerVersion, plannerConfig, decisionGoal: decision.goal, inputArtifacts: artifacts, constraints, chosenCandidateId: selected?.id, rejectedCandidates: rejected, scoringRationale: ['weighted-quality-30', 'weighted-cost-20', 'weighted-latency-15', 'weighted-reliability-15', 'weighted-confidence-20', 'tie-break-candidate-id'], reasons: [planReason, ...(segmentationInputUnavailable ? ['CANONICAL_IMAGE_REQUIRED'] : []), ...(isolationSourceUnavailable ? ['CANONICAL_SOURCE_IMAGE_REQUIRED'] : []), ...(isolationMaskUnavailable ? ['CANONICAL_MASK_REQUIRED'] : []), ...(cropSourceUnavailable ? ['CANONICAL_SOURCE_IMAGE_REQUIRED'] : []), ...(cropRectInvalid ? ['INVALID_CROP_RECT'] : []), ...(superResolutionSourceUnavailable ? ['CANONICAL_SOURCE_IMAGE_REQUIRED'] : []), ...(localCompositeOriginalUnavailable ? ['CANONICAL_ORIGINAL_REQUIRED'] : []), ...(compositeOriginalUnavailable ? ['CANONICAL_ORIGINAL_REQUIRED'] : []), ...(localCompositeExecutionUnavailable ? ['LOCAL_COMPOSITE_CONTINUATION_NOT_WIRED'] : []), ...(compositeExecutionUnavailable ? ['COMPOSITE_EXECUTION_NOT_WIRED'] : [])] } satisfies CreativePlanProvenance);
    provenance = immutable({ ...provenance, replay: buildReplay(this.#options.plannerVersion, plannerConfig, { provenance, selectedCandidateId: selected?.id }) });
    const result = immutable({ requestId: request.id, operations, status, planningConstraints: constraints, candidates, selectedCandidateId: selected?.id, uncertainty, confirmationReasons: immutable(confirmationReasons), proposalId: `${this.#options.plannerVersion}:${request.id}`, plannerVersion: this.#options.plannerVersion, goal: decision.goal, assumptions: [], constraints: [...decision.constraints], provenance, explanation: buildExplanation(this.#options.plannerVersion, plannerConfig, selected, candidates, constraints, uncertainty, confirmationReasons) });
    void emitPlanTelemetry(this.#options.telemetry, result);
    return result;
  }
}

function interactiveSegmentationOperations(artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints, request: CreativeRequest): readonly CreativeOperation[] {
  const source = artifacts.find(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'WORKING'));
  if (!source) return immutable([]);
  const id = 'interactive-segmentation';
  return immutable([{ id, type: 'segment', requiredArtifacts: [source.id], produces: ['mask'], verification: verificationFor(id, 'segment', constraints, 'mask'), input: { selectionRequestId: request.metadata?.selectionRequestId, analysis: request.metadata?.analysis, points: request.metadata?.points } }]);
}

function backgroundIsolationOperations(artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints, request: CreativeRequest): readonly CreativeOperation[] {
  const requestedSourceId = typeof request.metadata?.sourceArtifactId === 'string' ? request.metadata.sourceArtifactId : undefined;
  const requestedMaskId = typeof request.metadata?.maskArtifactId === 'string' ? request.metadata.maskArtifactId : undefined;
  const source = artifacts.find(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE') && (!requestedSourceId || artifact.id === requestedSourceId));
  const mask = artifacts.find(artifact => artifact.kind === 'mask' && artifact.role === 'MASK' && (!requestedMaskId || artifact.id === requestedMaskId));
  if (!source || !mask) return immutable([]);
  const id = 'background-isolation';
  return immutable([{
    id,
    type: 'BACKGROUND_ISOLATION',
    requiredArtifacts: [source.id, mask.id],
    produces: ['image'],
    outputArtifacts: ['background-isolation:composite'],
    verification: verificationFor(id, 'BACKGROUND_ISOLATION', constraints, 'image'),
    input: Object.freeze({ sourceArtifactId: source.id, maskArtifactId: mask.id, deterministicTool: 'background-isolation@1' }),
  }]);
}

function cropOperations(artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints, request: CreativeRequest): readonly CreativeOperation[] {
  const requestedSourceId = typeof request.metadata?.sourceArtifactId === 'string' ? request.metadata.sourceArtifactId : undefined;
  const source = artifacts.find(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE') && (!requestedSourceId || artifact.id === requestedSourceId));
  const rect = readPlannerCropRect(request.metadata?.cropRect);
  if (!source || !rect) return immutable([]);
  const id = 'crop';
  return immutable([{
    id,
    type: 'CROP',
    requiredArtifacts: [source.id],
    produces: ['image'],
    outputArtifacts: ['crop:composite'],
    verification: verificationFor(id, 'CROP', constraints, 'image'),
    input: Object.freeze({
      sourceArtifactId: source.id,
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
      deterministicTool: 'crop@1',
      coordinateSpace: 'CANONICAL_ORIENTATION_1_PIXEL_INDICES',
      rectangleSemantics: 'HALF_OPEN',
    }),
  }]);
}

function superResolutionOperations(artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints, request: CreativeRequest): readonly CreativeOperation[] {
  const requestedSourceId = typeof request.metadata?.sourceArtifactId === 'string' ? request.metadata.sourceArtifactId : undefined;
  const source = artifacts.find(artifact => artifact.kind === 'image' && (artifact.role === 'ORIGINAL' || artifact.role === 'COMPOSITE') && (!requestedSourceId || artifact.id === requestedSourceId));
  if (!source) return immutable([]);
  const id = 'super-resolution';
  return immutable([{
    id,
    type: 'SUPER_RESOLUTION',
    requiredArtifacts: [source.id],
    produces: ['image'],
    outputArtifacts: ['super-resolution:composite'],
    verification: verificationFor(id, 'SUPER_RESOLUTION', constraints, 'image'),
    input: Object.freeze({ sourceArtifactId: source.id, scale: 4, alphaPolicy: 'OPAQUE_INPUT_ONLY' }),
  }]);
}

function simpleOperations(request: CreativeRequest, artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints): readonly CreativeOperation[] {
  const selected = request.metadata?.selectedObjectIds as readonly unknown[] | undefined;
  const controlled = request.metadata?.editCapability === 'CONTROLLED_LOCAL_EDIT' && artifacts.some(a => a.role === 'ORIGINAL') && artifacts.some(a => a.role === 'MASK') && Boolean(selected?.length);
  const id = 'creative-image-edit'; return immutable([{ id, type: controlled ? 'CONTROLLED_LOCAL_EDIT' : 'image-edit', providerId: 'fal', requiredArtifacts: artifacts.map(a => a.id), produces: ['image'], verification: verificationFor(id, 'image-edit', constraints, 'image'), input: controlled ? { instruction: request.intent, preserveMode: request.metadata?.preserveMode ?? 'STRICT', correlationId: request.metadata?.correlationId } : { prompt: request.intent, correlationId: request.metadata?.correlationId } }]);
}

function localCompositeOperations(artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints, request: CreativeRequest): readonly CreativeOperation[] {
  const original = artifacts.find(artifact => artifact.kind === 'image' && artifact.role === 'ORIGINAL');
  if (!original) return immutable([]);
  const segmentId = 'local-continuation-01-segment';
  const isolationId = 'local-continuation-02-background-isolation';
  const verifyId = 'local-continuation-03-verify';
  const maskArtifact = 'local-continuation:segmentation-mask';
  const compositeArtifact = 'local-continuation:background-isolation-composite';
  const verifiedArtifact = 'local-continuation:verified';
  const segment: CreativeOperation = {
    id: segmentId,
    type: 'segment',
    dependencies: [],
    requiredArtifacts: [original.id],
    produces: ['mask'],
    outputArtifacts: [maskArtifact],
    verification: verificationFor(segmentId, 'segment', constraints, 'mask'),
    input: Object.freeze({ selectionRequestId: request.metadata?.selectionRequestId, analysis: request.metadata?.analysis, points: request.metadata?.points }),
  };
  const isolate: CreativeOperation = {
    id: isolationId,
    type: 'BACKGROUND_ISOLATION',
    dependencies: [segmentId],
    requiredArtifacts: [original.id, maskArtifact],
    produces: ['image'],
    outputArtifacts: [compositeArtifact],
    verification: verificationFor(isolationId, 'BACKGROUND_ISOLATION', constraints, 'image'),
    input: Object.freeze({ sourceArtifactId: original.id, maskArtifactId: maskArtifact, deterministicTool: 'background-isolation@1' }),
  };
  const verify: CreativeOperation = {
    id: verifyId,
    type: 'verify',
    dependencies: [isolationId],
    requiredArtifacts: [compositeArtifact],
    produces: ['image'],
    outputArtifacts: [verifiedArtifact],
    verification: verificationFor(verifyId, 'verify', constraints, 'image'),
    input: Object.freeze({ sourceArtifactId: compositeArtifact, semanticOperation: 'verify' }),
  };
  return immutable([segment, isolate, verify]);
}

function compositeOperations(prefix: string, artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints, intent: string): readonly CreativeOperation[] {
  const original = artifacts.find(artifact => artifact.kind === 'image' && artifact.role === 'ORIGINAL');
  if (!original) return immutable([]);
  const originalInputs = [original.id];
  const semantic = (semanticOperation: string) => immutable({ intent, semanticOperation });
  const step = (id: string, type: string, dependencies: readonly string[], requiredArtifacts: readonly string[], output: string, outputKind: string): CreativeOperation => {
    const stepId = `${prefix}-${id}`;
    return { id: stepId, type, dependencies, requiredArtifacts, produces: [outputKind], outputArtifacts: [output], verification: verificationFor(stepId, type, constraints, outputKind), input: semantic(type) };
  };
  const segmentation = `${prefix}:segmentation`;
  const removed = `${prefix}:removed`;
  const backgroundOutput = `${prefix}:background`;
  const relit = `${prefix}:relit`;
  const segment = step('01-segment', 'segment', [], originalInputs, segmentation, 'mask');
  const remove = step('02-remove', 'remove', [segment.id], [...originalInputs, segmentation], removed, 'image');
  const background = step('03-background-replace', 'background_replace', [remove.id], [removed], backgroundOutput, 'image');
  const relight = step('04-relight', 'relight', [background.id], [backgroundOutput], relit, 'image');
  const verify = step('05-verify', 'verify', [relight.id], [relit], `${prefix}:verified`, 'image');
  return immutable([segment, remove, background, relight, verify]);
}
function candidate(id: string, operations: readonly CreativeOperation[], targetPreference: Exclude<ExecutionTarget, 'BLOCKED' | 'HYBRID'>, estimatedCredits: number, estimatedLatencyMs: number, quality: number, confidence: number): CreativePlanCandidate {
  const score = scoreCandidate(quality, estimatedCredits, estimatedLatencyMs, targetPreference === 'LOCAL' ? .82 : .94, confidence);
  return { id: `candidate-v1-${id}`, operations, targetPreference, estimatedCredits, estimatedLatencyMs, score, status: 'ACCEPTED', reasonCodes: [] };
}
export function scoreCandidate(quality: number, credits: number, latencyMs: number, reliability: number, confidence: number): CreativePlanScore { const costEfficiency = clamp(1 - credits / 10); const latency = clamp(1 - latencyMs / 10000); return immutable({ quality, costEfficiency, latency, reliability, confidence, total: round(quality * .3 + costEfficiency * .2 + latency * .15 + reliability * .15 + confidence * .2) }); }
export function rankAndFilter(input: readonly CreativePlanCandidate[], constraints: CreativePlanConstraints): readonly CreativePlanCandidate[] { return [...input].map(value => { const reasons: string[] = []; if (constraints.executionPolicy === 'LOCAL_ONLY' && value.targetPreference !== 'LOCAL') reasons.push('EXECUTION_POLICY_LOCAL_ONLY'); if (constraints.forbiddenTargets.includes(value.targetPreference)) reasons.push('FORBIDDEN_TARGET'); if (constraints.maxCredits !== undefined && value.estimatedCredits > constraints.maxCredits) reasons.push('MAX_CREDITS_EXCEEDED'); if (constraints.maxLatencyMs !== undefined && value.estimatedLatencyMs > constraints.maxLatencyMs) reasons.push('MAX_LATENCY_EXCEEDED'); if (constraints.minimumQuality !== undefined && value.score.quality < constraints.minimumQuality) reasons.push('MINIMUM_QUALITY_NOT_MET'); return immutable({ ...value, status: reasons.length ? 'REJECTED' as const : 'ACCEPTED' as const, reasonCodes: immutable(reasons) }); }).sort((a, b) => b.score.total - a.score.total || a.id.localeCompare(b.id)); }
function readConstraints(request: CreativeRequest, decision: CreativeDecision): CreativePlanConstraints { const source = object(request.metadata?.planningConstraints); const policy = enumValue(source.executionPolicy, ['LOCAL_ONLY', 'CLOUD_ALLOWED', 'CLOUD_PREFERRED', 'AUTO'], 'AUTO') as PlanningExecutionPolicy; return { preserveMode: stringValue(source.preserveMode, stringValue(request.metadata?.preserveMode, 'STRICT')), mustPreserve: strings(source.mustPreserve), mustChange: strings(source.mustChange), forbiddenTargets: strings(source.forbiddenTargets).filter(value => ['LOCAL', 'CLOUD', 'HYBRID'].includes(value)) as Exclude<ExecutionTarget, 'BLOCKED'>[], forbiddenRegions: strings(source.forbiddenRegions), executionPolicy: policy, maxCredits: numberValue(source.maxCredits), maxLatencyMs: numberValue(source.maxLatencyMs), minimumQuality: numberValue(source.minimumQuality), confirmationPolicy: enumValue(source.confirmationPolicy, ['ASK', 'BLOCK', 'ALLOW_PRESERVATION_RISK'], 'ASK') as PlanningConfirmationPolicy }; }
function readUncertainty(request: CreativeRequest): CreativePlanUncertainty { const source = object(request.metadata?.uncertainty); const intentInterpretation = confidence(source.intentInterpretation, .95); const targetResolution = confidence(source.targetResolution, .95); const feasibilityCapability = confidence(source.feasibilityCapability, .9); const preservationRisk = confidence(source.preservationRisk, .1); return { intentInterpretation, targetResolution, feasibilityCapability, preservationRisk, aggregateConfidence: round((intentInterpretation + targetResolution + feasibilityCapability + (1 - preservationRisk)) / 4) }; }
function readPlannerCropRect(value: unknown): PlannerCropRect | undefined { const source = object(value); const x = source.x; const y = source.y; const width = source.width; const height = source.height; if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || !Number.isSafeInteger(width) || !Number.isSafeInteger(height) || Number(x) < 0 || Number(y) < 0 || Number(width) < 1 || Number(height) < 1) return undefined; return immutable({ x: Number(x), y: Number(y), width: Number(width), height: Number(height) }); }
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
function stringValue(value: unknown, fallback: string) { return typeof value === 'string' ? value : fallback; }
function enumValue(value: unknown, allowed: readonly string[], fallback: string): string { return typeof value === 'string' && allowed.includes(value) ? value : fallback; }
function confidence(value: unknown, fallback: number): number { return typeof value === 'number' ? clamp(value) : fallback; }
function clamp(value: number) { return Math.max(0, Math.min(1, value)); }
function round(value: number) { return Math.round(value * 1_000_000) / 1_000_000; }
