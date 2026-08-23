import type { CreativeFallbackAdvice, CreativeOperation, CreativePlan, CreativePlanCandidate, CreativePlanConstraints, ExecutionTarget } from '../contracts';
import { FALLBACK_POLICY_VERSION, OPERATION_RULES_VERSION, PLAN_SCHEMA_VERSION, SCORING_POLICY_VERSION, VERIFICATION_POLICY_VERSION } from './advisoryPolicies';

export class InvalidCreativePlanError extends Error { constructor(message: string) { super(`Invalid creative plan: ${message}`); this.name = 'InvalidCreativePlanError'; } }

/** Pure fail-closed validation. This validates advice; it grants no execution authority. */
export function validateCreativePlan(plan: CreativePlan, canonicalInputArtifactIds: readonly string[] = []): void {
  validateReplayMetadata(plan);
  if ((plan.status ?? 'READY') !== 'READY') throw new InvalidCreativePlanError(`${plan.status} plans are not executable`);
  if (!plan.operations.length) throw new InvalidCreativePlanError('READY plan requires an executable operation');
  if (plan.planningConstraints && plan.provenance?.constraints && !sameJson(plan.planningConstraints, plan.provenance.constraints)) throw new InvalidCreativePlanError('provenance constraints differ from plan constraints');
  if (plan.candidates) {
    const candidateIds = new Set<string>();
    for (const candidate of plan.candidates) {
      if (candidateIds.has(candidate.id)) throw new InvalidCreativePlanError(`duplicate candidate ID ${candidate.id}`);
      candidateIds.add(candidate.id);
    }
    const selected = plan.candidates.find(candidate => candidate.id === plan.selectedCandidateId);
    if (!selected) throw new InvalidCreativePlanError('selected candidate does not exist');
    if (selected.status !== 'ACCEPTED') throw new InvalidCreativePlanError('selected candidate is rejected');
    const rejectedCandidates = plan.candidates.filter(candidate => candidate.status === 'REJECTED').map(({ id, reasonCodes }) => ({ id, reasonCodes }));
    if (plan.provenance?.rejectedCandidates && !sameJson(rejectedCandidates, plan.provenance.rejectedCandidates)) throw new InvalidCreativePlanError('provenance rejected candidates differ from candidate facts');
    if (plan.planningConstraints) validateCandidateConstraints(selected, plan.planningConstraints);
    if (!sameOperations(plan.operations, selected.operations)) throw new InvalidCreativePlanError('projected operations differ from selected candidate');
    for (const candidate of plan.candidates) validateFallbacks(plan, candidate);
  }
  if (canonicalInputArtifactIds.length && plan.provenance?.replay) {
    const expected = [...canonicalInputArtifactIds].sort();
    const replayed = plan.provenance.replay.inputArtifacts.map(item => item.id).sort();
    if (!sameJson(expected, replayed)) throw new InvalidCreativePlanError('replay input artifacts differ from canonical request inputs; explicit replan required');
  }
  validateDag(plan.operations, new Set([...(plan.provenance?.inputArtifacts.map(item => item.id) ?? []), ...canonicalInputArtifactIds]));
}

export function validateReplayMetadata(plan: CreativePlan): void {
  const replay = plan.provenance?.replay;
  if (!replay) return; // 6.40A/B compatibility plans remain valid.
  const provenance = plan.provenance;
  if (plan.plannerVersion && provenance.plannerVersion !== plan.plannerVersion) throw new InvalidCreativePlanError('stale or incompatible replay metadata; explicit replan required');
  const expected = [PLAN_SCHEMA_VERSION, plan.plannerVersion ?? provenance.plannerVersion, OPERATION_RULES_VERSION, SCORING_POLICY_VERSION, VERIFICATION_POLICY_VERSION, FALLBACK_POLICY_VERSION];
  const actual = [replay.schemaVersion, replay.plannerVersion, replay.operationRulesVersion, replay.scoringPolicyVersion, replay.verificationPolicyVersion, replay.fallbackPolicyVersion];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new InvalidCreativePlanError('stale or incompatible replay metadata; explicit replan required');
  if (!provenance.plannerConfig || !sameJson(replay.plannerConfig, provenance.plannerConfig)) throw new InvalidCreativePlanError('stale or incompatible replay planner config; explicit replan required');
  if (!sameJson(replay.inputArtifacts, provenance.inputArtifacts)) throw new InvalidCreativePlanError('stale or incompatible replay input artifacts; explicit replan required');
  if (replay.selectedCandidateId !== plan.selectedCandidateId || replay.selectedCandidateId !== provenance.chosenCandidateId) throw new InvalidCreativePlanError('stale or incompatible replay selected candidate; explicit replan required');
  if (!sameJson(replay.rejectedCandidates, provenance.rejectedCandidates ?? [])) throw new InvalidCreativePlanError('stale or incompatible replay rejected candidates; explicit replan required');
}

/** Revalidate hard planning constraints against the actual downstream target choice. */
export function validateExecutionTargets(plan: CreativePlan, targets: Readonly<Record<string, ExecutionTarget>>): void {
  const constraints = plan.planningConstraints;
  if (!constraints) return;
  for (const [operationId, target] of Object.entries(targets)) {
    if (constraints.executionPolicy === 'LOCAL_ONLY' && target !== 'LOCAL') throw new InvalidCreativePlanError(`LOCAL_ONLY plan cannot execute ${operationId} on ${target}`);
    if (target !== 'BLOCKED' && constraints.forbiddenTargets.includes(target)) throw new InvalidCreativePlanError(`operation ${operationId} uses forbidden target ${target}`);
  }
}

export function validateDag(operations: readonly CreativeOperation[], canonicalInputs: ReadonlySet<string>): void {
  const ids = new Set<string>();
  for (const operation of operations) {
    if (!operation.id || ids.has(operation.id)) throw new InvalidCreativePlanError(`duplicate operation ID ${operation.id}`);
    ids.add(operation.id);
    if (operation.outputArtifacts !== undefined) {
      const outputs = operation.outputArtifacts;
      const produces = operation.produces ?? [];
      if (!outputs.length || outputs.length !== produces.length || outputs.some(output => !output)) throw new InvalidCreativePlanError(`output artifact contract mismatch for ${operation.id}`);
    }
  }
  const outputOwner = new Map<string, string>();
  for (const operation of operations) for (const output of operation.outputArtifacts ?? []) {
    if (canonicalInputs.has(output) || outputOwner.has(output)) throw new InvalidCreativePlanError(`conflicting terminal writer for artifact ${output}`);
    outputOwner.set(output, operation.id);
  }
  for (const operation of operations) {
    const dependencies = operation.dependencies ?? [];
    if (dependencies.includes(operation.id)) throw new InvalidCreativePlanError(`self dependency ${operation.id}`);
    for (const dependency of dependencies) if (!ids.has(dependency)) throw new InvalidCreativePlanError(`missing dependency ${dependency}`);
    for (const artifact of operation.requiredArtifacts ?? []) {
      if (canonicalInputs.has(artifact)) continue;
      const producer = outputOwner.get(artifact);
      if (!producer || !dependencies.includes(producer)) throw new InvalidCreativePlanError(`illegal artifact dependency ${artifact}`);
    }
  }
  const visiting = new Set<string>(); const visited = new Set<string>();
  const byId = new Map(operations.map(operation => [operation.id, operation]));
  const visit = (id: string): void => { if (visiting.has(id)) throw new InvalidCreativePlanError('operation cycle'); if (visited.has(id)) return; visiting.add(id); for (const dependency of byId.get(id)?.dependencies ?? []) visit(dependency); visiting.delete(id); visited.add(id); };
  for (const id of ids) visit(id);
}

export function validateCandidateConstraints(candidate: CreativePlanCandidate, constraints: CreativePlanConstraints): void {
  if (constraints.executionPolicy === 'LOCAL_ONLY' && candidate.targetPreference !== 'LOCAL') throw new InvalidCreativePlanError('LOCAL_ONLY candidate is not local');
  if (constraints.forbiddenTargets.includes(candidate.targetPreference)) throw new InvalidCreativePlanError('candidate uses forbidden target');
  if (constraints.maxCredits !== undefined && candidate.estimatedCredits > constraints.maxCredits) throw new InvalidCreativePlanError('candidate exceeds max credits');
  if (constraints.maxLatencyMs !== undefined && candidate.estimatedLatencyMs > constraints.maxLatencyMs) throw new InvalidCreativePlanError('candidate exceeds max latency');
  if (constraints.minimumQuality !== undefined && candidate.score.quality < constraints.minimumQuality) throw new InvalidCreativePlanError('candidate is below minimum quality');
}

function validateFallbacks(plan: CreativePlan, candidate: CreativePlanCandidate): void {
  const ids = new Set<string>();
  for (const fallback of candidate.fallbackAdvice ?? []) {
    if (ids.has(fallback.id)) throw new InvalidCreativePlanError(`duplicate fallback ID ${fallback.id}`);
    ids.add(fallback.id);
    validateFallback(plan, candidate, fallback);
  }
}

function validateFallback(plan: CreativePlan, candidate: CreativePlanCandidate, fallback: CreativeFallbackAdvice): void {
  if (fallback.version !== FALLBACK_POLICY_VERSION) throw new InvalidCreativePlanError(`stale fallback policy ${fallback.version}`);
  if (fallback.candidateId !== candidate.id) throw new InvalidCreativePlanError(`fallback references missing candidate ${fallback.candidateId}`);
  if (!candidate.operations.some(operation => operation.id === fallback.stepId)) throw new InvalidCreativePlanError(`fallback references missing step ${fallback.stepId}`);
  if (!nonNegativeInteger(fallback.maxAttempts) || !nonNegativeInteger(fallback.maxGenerationDepth) || !finiteNonNegative(fallback.maxAdditionalCredits) || !finiteNonNegative(fallback.maxAdditionalLatencyMs)) throw new InvalidCreativePlanError('fallback bounds must be finite and non-negative');
  const constraints = plan.planningConstraints;
  if (constraints && !sameJson(fallback.inheritedConstraints, constraints)) throw new InvalidCreativePlanError('fallback does not inherit plan constraints');
  const alternate = fallback.alternateCandidateId ? plan.candidates?.find(value => value.id === fallback.alternateCandidateId) : undefined;
  if (fallback.action === 'ALTERNATE_CANDIDATE') {
    if (!alternate) throw new InvalidCreativePlanError('alternate fallback references missing candidate');
    if (alternate.status !== 'ACCEPTED') throw new InvalidCreativePlanError('alternate fallback references rejected candidate');
    if (fallback.maxAttempts === 0 || fallback.maxGenerationDepth === 0) throw new InvalidCreativePlanError('automatic alternate fallback requires positive attempt and generation bounds');
    if (constraints) {
      validateCandidateConstraints(alternate, constraints);
      const remainingCredits = remaining(constraints.maxCredits, candidate.estimatedCredits);
      const remainingLatency = remaining(constraints.maxLatencyMs, candidate.estimatedLatencyMs);
      if (fallback.maxAdditionalCredits > remainingCredits || fallback.maxAdditionalLatencyMs > remainingLatency) throw new InvalidCreativePlanError('fallback exceeds inherited hard planning envelope');
      if (alternate.estimatedCredits > fallback.maxAdditionalCredits || alternate.estimatedLatencyMs > fallback.maxAdditionalLatencyMs) throw new InvalidCreativePlanError('alternate fallback does not fit declared additional envelope');
    }
  } else if (fallback.alternateCandidateId) {
    throw new InvalidCreativePlanError('non-alternate fallback cannot reference an alternate candidate');
  }
}

function sameOperations(left: readonly CreativeOperation[], right: readonly CreativeOperation[]): boolean { return sameJson(left, right); }
function sameJson(left: unknown, right: unknown): boolean { return JSON.stringify(left) === JSON.stringify(right); }
function finiteNonNegative(value: number): boolean { return Number.isFinite(value) && value >= 0; }
function nonNegativeInteger(value: number): boolean { return Number.isInteger(value) && value >= 0; }
function remaining(limit: number | undefined, alreadyPlanned: number): number { return limit === undefined ? 0 : Math.max(0, limit - alreadyPlanned); }
