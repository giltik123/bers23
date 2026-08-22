import type { CanonicalPlanningPort, CreativeDecision, CreativeOperation, CreativePlan, CreativePlanArtifactSnapshot, CreativePlanCandidate, CreativePlanConstraints, CreativePlanProvenance, CreativePlanScore, CreativePlanStatus, CreativePlanUncertainty, CreativeRequest, ExecutionTarget, PlanningConfirmationPolicy, PlanningExecutionPolicy, PlanningTelemetryPort } from '../contracts';
import { buildExplanation, buildReplay, emitPlanTelemetry, fallbackFor, immutable, verificationFor } from './advisoryPolicies';

export const CANONICAL_PLANNER_VERSION = '6.40C.1';
type Options = Readonly<{ plannerVersion?: string; minimumIntentConfidence?: number; minimumTargetConfidence?: number; maximumPreservationRisk?: number; compositeExecutionEnabled?: boolean; telemetry?: PlanningTelemetryPort }>;

/** Deterministic advisory planner. Canonical Core revalidates every proposal. */
export class CanonicalPlanningService implements CanonicalPlanningPort {
  readonly #options: Omit<Required<Options>, 'telemetry'> & Pick<Options, 'telemetry'>;
  constructor(options: Options = {}) { this.#options = { plannerVersion: options.plannerVersion ?? CANONICAL_PLANNER_VERSION, minimumIntentConfidence: options.minimumIntentConfidence ?? .65, minimumTargetConfidence: options.minimumTargetConfidence ?? .65, maximumPreservationRisk: options.maximumPreservationRisk ?? .7, compositeExecutionEnabled: options.compositeExecutionEnabled ?? false, telemetry: options.telemetry }; }

  async plan(request: CreativeRequest, decision: CreativeDecision): Promise<CreativePlan> {
    const artifacts = immutable((request.inputArtifacts ?? []).map(({ id, kind, role }) => ({ id, kind, role } satisfies CreativePlanArtifactSnapshot)));
    const constraints = immutable(readConstraints(request, decision));
    const uncertainty = immutable(readUncertainty(request));
    const composite = request.metadata?.operationIntent === 'COMPOSITE_REPLACE_RELIGHT';
    const strategies = composite ? [compositeOperations('local-efficient', artifacts, constraints), compositeOperations('cloud-quality', artifacts, constraints)] : [simpleOperations(request, artifacts, constraints)];
    const rawCandidates = strategies.map((operations, index) => candidate(index === 0 ? 'local-efficient' : 'cloud-quality', operations, index === 0 ? 'LOCAL' : 'CLOUD', composite ? (index === 0 ? 1 : 5) : 0, composite ? (index === 0 ? 1200 : 2800) : 0, composite ? (index === 0 ? .76 : .94) : .9, uncertainty.aggregateConfidence));
    const ranked = rankAndFilter(rawCandidates, constraints);
    const candidates = immutable(ranked.map(value => ({ ...value, fallbackAdvice: fallbackFor(value, constraints, ranked.find(other => other.id !== value.id && other.status === 'ACCEPTED')) })));
    const selected = candidates.find(item => item.status === 'ACCEPTED');
    const confirmationReasons: string[] = [];
    const localUnavailable = constraints.executionPolicy === 'LOCAL_ONLY' && !selected;
    const compositeExecutionUnavailable = composite && !this.#options.compositeExecutionEnabled;
    if (uncertainty.intentInterpretation < this.#options.minimumIntentConfidence) confirmationReasons.push('LOW_INTENT_CONFIDENCE');
    if (uncertainty.targetResolution < this.#options.minimumTargetConfidence) confirmationReasons.push('AMBIGUOUS_TARGET');
    if (uncertainty.preservationRisk > this.#options.maximumPreservationRisk && constraints.confirmationPolicy !== 'ALLOW_PRESERVATION_RISK') confirmationReasons.push('HIGH_PRESERVATION_RISK');
    if (localUnavailable) confirmationReasons.push('NO_FEASIBLE_LOCAL_STRATEGY');
    if (compositeExecutionUnavailable) confirmationReasons.push('COMPOSITE_EXECUTION_NOT_WIRED');
    const status: CreativePlanStatus = compositeExecutionUnavailable || (localUnavailable && constraints.confirmationPolicy === 'BLOCK') ? 'BLOCKED' : confirmationReasons.length || !selected ? 'NEEDS_CONFIRMATION' : 'READY';
    const operations = immutable(status === 'BLOCKED' ? [] : selected?.operations ?? []);
    const rejected = immutable(candidates.filter(item => item.status === 'REJECTED').map(({ id, reasonCodes }) => ({ id, reasonCodes })));
    let provenance = immutable({ plannerVersion: this.#options.plannerVersion, decisionGoal: decision.goal, inputArtifacts: artifacts, constraints, chosenCandidateId: selected?.id, rejectedCandidates: rejected, scoringRationale: ['weighted-quality-30', 'weighted-cost-20', 'weighted-latency-15', 'weighted-reliability-15', 'weighted-confidence-20', 'tie-break-candidate-id'], reasons: [composite ? 'COMPOSITE_INTENT_REGISTRY_V1' : 'SIMPLE_EDIT_COMPATIBILITY', ...(compositeExecutionUnavailable ? ['COMPOSITE_EXECUTION_NOT_WIRED'] : [])] } satisfies CreativePlanProvenance);
    provenance = immutable({ ...provenance, replay: buildReplay(this.#options.plannerVersion, { provenance, selectedCandidateId: selected?.id }) });
    const result = immutable({ requestId: request.id, operations, status, planningConstraints: constraints, candidates, selectedCandidateId: selected?.id, uncertainty, confirmationReasons: immutable(confirmationReasons), proposalId: `${this.#options.plannerVersion}:${request.id}`, plannerVersion: this.#options.plannerVersion, goal: decision.goal, assumptions: [], constraints: [...decision.constraints], provenance, explanation: buildExplanation(this.#options.plannerVersion, selected, candidates, constraints, uncertainty, confirmationReasons) });
    await emitPlanTelemetry(this.#options.telemetry, result);
    return result;
  }
}

function simpleOperations(request: CreativeRequest, artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints): readonly CreativeOperation[] {
  const selected = request.metadata?.selectedObjectIds as readonly unknown[] | undefined;
  const controlled = request.metadata?.editCapability === 'CONTROLLED_LOCAL_EDIT' && artifacts.some(a => a.role === 'ORIGINAL') && artifacts.some(a => a.role === 'MASK') && Boolean(selected?.length);
  const id = 'creative-image-edit'; return immutable([{ id, type: controlled ? 'CONTROLLED_LOCAL_EDIT' : 'image-edit', providerId: 'fal', requiredArtifacts: artifacts.map(a => a.id), produces: ['image'], verification: verificationFor(id, 'image-edit', constraints), input: controlled ? { instruction: request.intent, preserveMode: request.metadata?.preserveMode ?? 'STRICT', correlationId: request.metadata?.correlationId } : { prompt: request.intent, correlationId: request.metadata?.correlationId } }]);
}
function compositeOperations(prefix: string, artifacts: readonly CreativePlanArtifactSnapshot[], constraints: CreativePlanConstraints): readonly CreativeOperation[] {
  const seed = artifacts.map(a => a.id); const operation = (id: string, type: string, dependencies: readonly string[], requiredArtifacts: readonly string[], output: string): CreativeOperation => { const stepId = `${prefix}-${id}`; return { id: stepId, type, dependencies, requiredArtifacts, produces: ['image'], outputArtifacts: [output], verification: verificationFor(stepId, type, constraints) }; };
  const segment = operation('01-segment', 'segment', [], seed, `${prefix}:segmentation`);
  const remove = operation('02-remove', 'remove', [segment.id], [`${prefix}:segmentation`], `${prefix}:removed`);
  const background = operation('03-background-replace', 'background_replace', [remove.id], [`${prefix}:removed`], `${prefix}:background`);
  const relight = operation('04-relight', 'relight', [background.id], [`${prefix}:background`], `${prefix}:relit`);
  const verify = operation('05-verify', 'verify', [relight.id], [`${prefix}:relit`], `${prefix}:verified`);
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
function object(value: unknown): Record<string, unknown> { return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function strings(value: unknown): string[] { return Array.isArray(value) ? value.filter(item => typeof item === 'string') : []; }
function numberValue(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined; }
function stringValue(value: unknown, fallback: string): string { return typeof value === 'string' ? value : fallback; }
function enumValue(value: unknown, allowed: readonly string[], fallback: string): string { return typeof value === 'string' && allowed.includes(value) ? value : fallback; }
function confidence(value: unknown, fallback: number): number { return typeof value === 'number' ? clamp(value) : fallback; }
function clamp(value: number): number { return Math.max(0, Math.min(1, value)); }
function round(value: number): number { return Math.round(value * 1_000_000) / 1_000_000; }
