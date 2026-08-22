import type { CreativeOperation, CreativePlan, CreativePlanCandidate, CreativePlanConstraints, ExecutionTarget } from '../contracts';
import { FALLBACK_POLICY_VERSION, OPERATION_RULES_VERSION, PLAN_SCHEMA_VERSION, SCORING_POLICY_VERSION, VERIFICATION_POLICY_VERSION } from './advisoryPolicies';

export class InvalidCreativePlanError extends Error { constructor(message: string) { super(`Invalid creative plan: ${message}`); this.name = 'InvalidCreativePlanError'; } }

/** Pure fail-closed validation. This validates advice; it grants no execution authority. */
export function validateCreativePlan(plan: CreativePlan, canonicalInputArtifactIds: readonly string[] = []): void {
  validateReplayMetadata(plan);
  if ((plan.status ?? 'READY') !== 'READY') throw new InvalidCreativePlanError(`${plan.status} plans are not executable`);
  if (!plan.operations.length) throw new InvalidCreativePlanError('READY plan requires an executable operation');
  if (plan.candidates) {
    const candidateIds = new Set<string>();
    for (const candidate of plan.candidates) {
      if (candidateIds.has(candidate.id)) throw new InvalidCreativePlanError(`duplicate candidate ID ${candidate.id}`);
      candidateIds.add(candidate.id);
    }
    const selected = plan.candidates.find(candidate => candidate.id === plan.selectedCandidateId);
    if (!selected) throw new InvalidCreativePlanError('selected candidate does not exist');
    if (selected.status !== 'ACCEPTED') throw new InvalidCreativePlanError('selected candidate is rejected');
    if (plan.planningConstraints) validateCandidateConstraints(selected, plan.planningConstraints);
    if (!sameOperations(plan.operations, selected.operations)) throw new InvalidCreativePlanError('projected operations differ from selected candidate');
    for (const candidate of plan.candidates) for (const fallback of candidate.fallbackAdvice ?? []) {
      if (fallback.candidateId !== candidate.id) throw new InvalidCreativePlanError(`fallback references missing candidate ${fallback.candidateId}`);
      if (!candidate.operations.some(operation => operation.id === fallback.stepId)) throw new InvalidCreativePlanError(`fallback references missing step ${fallback.stepId}`);
      if (fallback.alternateCandidateId && !plan.candidates.some(value => value.id === fallback.alternateCandidateId)) throw new InvalidCreativePlanError(`fallback references missing alternate candidate ${fallback.alternateCandidateId}`);
      if (fallback.maxAttempts < 0 || fallback.maxGenerationDepth < 0) throw new InvalidCreativePlanError('fallback bounds must be non-negative');
    }
  }
  validateDag(plan.operations, new Set([...(plan.provenance?.inputArtifacts.map(item => item.id) ?? []), ...canonicalInputArtifactIds]));
}

export function validateReplayMetadata(plan: CreativePlan): void {
  const replay = plan.provenance?.replay;
  if (!replay) return; // 6.40A/B compatibility plans remain valid.
  const expected = [PLAN_SCHEMA_VERSION, plan.plannerVersion ?? plan.provenance?.plannerVersion, OPERATION_RULES_VERSION, SCORING_POLICY_VERSION, VERIFICATION_POLICY_VERSION, FALLBACK_POLICY_VERSION];
  const actual = [replay.schemaVersion, replay.plannerVersion, replay.operationRulesVersion, replay.scoringPolicyVersion, replay.verificationPolicyVersion, replay.fallbackPolicyVersion];
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new InvalidCreativePlanError('stale or incompatible replay metadata; explicit replan required');
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

function sameOperations(left: readonly CreativeOperation[], right: readonly CreativeOperation[]): boolean { return JSON.stringify(left) === JSON.stringify(right); }
