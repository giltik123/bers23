import type { CreativeFallbackAdvice, CreativeOperation, CreativePlan, CreativePlanCandidate, CreativePlanConstraints, CreativePlanExplanation, CreativePlannerConfigSnapshot, CreativePlanReplayMetadata, CreativePlanUncertainty, CreativeVerificationSpec, FallbackAction, PlanningTelemetryEvent, PlanningTelemetryPort } from '../contracts';

export const PLAN_SCHEMA_VERSION = 'creative-plan/3';
export const OPERATION_RULES_VERSION = 'decomposition/1';
export const SCORING_POLICY_VERSION = 'weighted-score/1';
export const VERIFICATION_POLICY_VERSION = 'verification/1';
export const FALLBACK_POLICY_VERSION = 'fallback/2';

export function verificationFor(stepId: string, type: string, constraints: CreativePlanConstraints): readonly CreativeVerificationSpec[] {
  const preservation = constraints.mustPreserve.map(value => `preserve:${value}`);
  return immutable([{ id: `${stepId}:output`, version: VERIFICATION_POLICY_VERSION, checkType: type === 'verify' ? 'INTEGRITY' : 'OUTPUT_KIND', criterion: type === 'verify' ? 'canonical-runtime-verifier-valid' : 'output-is-image', required: true, expectedOutputKind: 'image', expectedArtifactRole: type === 'verify' ? 'COMPOSITE' : 'WORKING', constraints: preservation, ...(constraints.minimumQuality === undefined ? {} : { predicate: { kind: 'MINIMUM' as const, threshold: constraints.minimumQuality } }), reasonCode: type === 'verify' ? 'FINAL_INTEGRITY_REQUIRED' : 'MEANINGFUL_STEP_OUTPUT_REQUIRED' }]);
}

export function fallbackFor(candidate: CreativePlanCandidate, constraints: CreativePlanConstraints, alternate?: CreativePlanCandidate): readonly CreativeFallbackAdvice[] {
  const remainingCredits = remaining(constraints.maxCredits, candidate.estimatedCredits);
  const remainingLatency = remaining(constraints.maxLatencyMs, candidate.estimatedLatencyMs);
  const localOnly = constraints.executionPolicy === 'LOCAL_ONLY';
  const alternateAllowed = Boolean(alternate
    && alternate.status === 'ACCEPTED'
    && (!localOnly || alternate.targetPreference === 'LOCAL')
    && !constraints.forbiddenTargets.includes(alternate.targetPreference)
    && (constraints.minimumQuality === undefined || alternate.score.quality >= constraints.minimumQuality)
    && alternate.estimatedCredits <= remainingCredits
    && alternate.estimatedLatencyMs <= remainingLatency);
  const stepId = candidate.operations.at(-1)?.id ?? '';
  return immutable([{ id: `${candidate.id}:verification-failure`, version: FALLBACK_POLICY_VERSION, trigger: 'VERIFICATION_FAILURE', action: alternateAllowed ? 'ALTERNATE_CANDIDATE' : 'ASK_USER', candidateId: candidate.id, stepId, ...(alternateAllowed && alternate ? { alternateCandidateId: alternate.id } : {}), maxAttempts: alternateAllowed ? 1 : 0, maxAdditionalCredits: alternateAllowed ? remainingCredits : 0, maxAdditionalLatencyMs: alternateAllowed ? remainingLatency : 0, maxGenerationDepth: alternateAllowed ? 1 : 0, reasonCode: alternateAllowed ? 'BOUNDED_ALTERNATE_AFTER_REVALIDATION' : 'NO_SAFE_AUTOMATIC_ALTERNATE', inheritedConstraints: constraints }]);
}

/** Pure advisory exhaustion projection. It performs no retry, spend, provider call or authority transition. */
export function resolveFallbackAction(advice: CreativeFallbackAdvice, state: Readonly<{ attemptsUsed: number; generationDepth: number; additionalCreditsUsed?: number; additionalLatencyMsUsed?: number }>): FallbackAction {
  const creditsUsed = state.additionalCreditsUsed ?? 0;
  const latencyUsed = state.additionalLatencyMsUsed ?? 0;
  if (!nonNegativeInteger(state.attemptsUsed) || !nonNegativeInteger(state.generationDepth) || !finiteNonNegative(creditsUsed) || !finiteNonNegative(latencyUsed)) return 'ABORT';
  if (advice.action === 'ASK_USER' || advice.action === 'ABORT') return advice.action;
  if (state.attemptsUsed >= advice.maxAttempts || state.generationDepth >= advice.maxGenerationDepth || creditsUsed > advice.maxAdditionalCredits || latencyUsed > advice.maxAdditionalLatencyMs) return 'ASK_USER';
  return advice.action;
}

export function buildReplay(plannerVersion: string, plannerConfig: CreativePlannerConfigSnapshot, plan: Pick<CreativePlan, 'provenance' | 'selectedCandidateId'>): CreativePlanReplayMetadata { return immutable({ schemaVersion: PLAN_SCHEMA_VERSION, plannerVersion, plannerConfig, operationRulesVersion: OPERATION_RULES_VERSION, scoringPolicyVersion: SCORING_POLICY_VERSION, verificationPolicyVersion: VERIFICATION_POLICY_VERSION, fallbackPolicyVersion: FALLBACK_POLICY_VERSION, inputArtifacts: plan.provenance?.inputArtifacts ?? [], selectedCandidateId: plan.selectedCandidateId, rejectedCandidates: plan.provenance?.rejectedCandidates ?? [] }); }

export function buildExplanation(plannerVersion: string, plannerConfig: CreativePlannerConfigSnapshot, selected: CreativePlanCandidate | undefined, candidates: readonly CreativePlanCandidate[], constraints: CreativePlanConstraints, uncertainty: CreativePlanUncertainty, uncertaintyReasons: readonly string[]): CreativePlanExplanation {
  const verification = selected?.operations.flatMap(operation => operation.verification ?? []) ?? [];
  const fallbacks = selected?.fallbackAdvice ?? [];
  return immutable({ selectedCandidate: selected && { id: selected.id, reasonCodes: ['HIGHEST_ACCEPTED_DETERMINISTIC_SCORE'] }, rejectedCandidates: candidates.filter(value => value.status === 'REJECTED').map(({ id, reasonCodes }) => ({ id, reasonCodes })), materialConstraints: [`execution:${constraints.executionPolicy}`, `preserve:${constraints.preserveMode}`, ...(constraints.maxCredits === undefined ? [] : [`max-credits:${constraints.maxCredits}`]), ...(constraints.maxLatencyMs === undefined ? [] : [`max-latency-ms:${constraints.maxLatencyMs}`]), ...(constraints.minimumQuality === undefined ? [] : [`minimum-quality:${constraints.minimumQuality}`])], uncertaintyReasons: [...uncertaintyReasons, `aggregate-confidence:${uncertainty.aggregateConfidence}`], requiredVerificationIds: verification.filter(value => value.required).map(value => value.id), fallbackPaths: fallbacks.map(({ id, action, reasonCode }) => ({ id, action, reasonCode })), plannerConfig, versions: { planner: plannerVersion, schema: PLAN_SCHEMA_VERSION, verificationPolicy: VERIFICATION_POLICY_VERSION, fallbackPolicy: FALLBACK_POLICY_VERSION } });
}

export async function emitPlanTelemetry(sink: PlanningTelemetryPort | undefined, plan: CreativePlan): Promise<void> {
  if (!sink) return;
  const selected = plan.candidates?.find(value => value.id === plan.selectedCandidateId);
  const verification = selected?.operations.flatMap(value => value.verification ?? []) ?? [];
  const fallbacks = selected?.fallbackAdvice ?? [];
  const event: PlanningTelemetryEvent = immutable({ version: '1', type: 'PLAN_PROPOSED', requestId: plan.requestId, proposalId: plan.proposalId ?? plan.requestId, status: plan.status ?? 'READY', selectedCandidateId: plan.selectedCandidateId, candidateCount: plan.candidates?.length ?? 0, scoreSummary: plan.candidates?.map(value => ({ candidateId: value.id, total: value.score.total })) ?? [], uncertaintyBuckets: plan.confirmationReasons ?? [], verificationPolicyIds: [...new Set(verification.map(value => value.version))], verificationCount: verification.length, fallbackPolicyIds: [...new Set(fallbacks.map(value => value.version))], fallbackCount: fallbacks.length, artifactRoles: [...new Set((plan.provenance?.inputArtifacts ?? []).map(value => value.role ?? 'UNSPECIFIED'))], artifactCount: plan.provenance?.inputArtifacts.length ?? 0 });
  try { await sink.record(event); } catch { /* Advisory observability is deliberately best effort. */ }
}

export function immutable<T>(value: T): T { if (value && typeof value === 'object' && !Object.isFrozen(value)) { for (const child of Object.values(value as object)) immutable(child); Object.freeze(value); } return value; }
function remaining(limit: number | undefined, alreadyPlanned: number): number { return limit === undefined ? 0 : Math.max(0, limit - alreadyPlanned); }
function finiteNonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function nonNegativeInteger(value: number): boolean { return Number.isInteger(value) && value >= 0; }
