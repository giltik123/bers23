import type { CreativeOperation, CreativePlan, CreativePlanCandidate, CreativeRequest, ExecutionTarget } from '../contracts';

export function assertPlanIntegrity(plan: CreativePlan, request: CreativeRequest): void {
  const errors = validatePlanIntegrity(plan, request);
  if (errors.length) throw new Error(`Invalid creative plan: ${errors.join('; ')}`);
}

export function assertExecutablePlan(plan: CreativePlan, request: CreativeRequest): void {
  assertPlanIntegrity(plan, request);
  const status = plan.status ?? 'READY';
  if (status !== 'READY') throw new Error(`Creative plan requires fail-closed handling: ${status}`);
}

export function assertExecutionTargetsRespectPlan(plan: CreativePlan, targets: Readonly<Record<string, ExecutionTarget>>): void {
  const constraints = plan.planningConstraints;
  if (!constraints) return;
  for (const [operationId, target] of Object.entries(targets)) {
    if (constraints.executionPolicy === 'LOCAL_ONLY' && target !== 'LOCAL') throw new Error(`LOCAL_ONLY plan cannot execute ${operationId} on ${target}`);
    if (target !== 'BLOCKED' && constraints.forbiddenTargets.includes(target)) throw new Error(`Plan forbids ${target} target for ${operationId}`);
  }
}

export function validatePlanIntegrity(plan: CreativePlan, request: CreativeRequest): readonly string[] {
  const errors: string[] = [];
  const status = plan.status ?? 'READY';
  if (plan.requestId !== request.id) errors.push('request-id-mismatch');
  if (status === 'READY' && plan.operations.length === 0) errors.push('ready-plan-has-no-operations');
  errors.push(...validateOperations(plan.operations, request));

  if (plan.candidates !== undefined) {
    const ids = new Set<string>();
    for (const candidate of plan.candidates) {
      if (ids.has(candidate.id)) errors.push(`duplicate-candidate:${candidate.id}`);
      ids.add(candidate.id);
      errors.push(...validateOperations(candidate.operations, request).map(error => `candidate:${candidate.id}:${error}`));
    }
    if (!plan.selectedCandidateId) {
      if (status !== 'BLOCKED') errors.push('selected-candidate-missing');
      if (status === 'BLOCKED' && plan.operations.length > 0) errors.push('blocked-plan-projects-operations');
    } else {
      const selected = plan.candidates.find(candidate => candidate.id === plan.selectedCandidateId);
      if (!selected) errors.push('selected-candidate-not-found');
      else {
        if (selected.rejected) errors.push('selected-candidate-rejected');
        if (!sameOperations(plan.operations, selected.operations)) errors.push('selected-candidate-projection-mismatch');
        errors.push(...validateSelectedConstraints(selected, plan));
      }
    }
  }
  return Object.freeze(errors);
}

function validateOperations(operations: readonly CreativeOperation[], request: CreativeRequest): string[] {
  const errors: string[] = [];
  const byId = new Map<string, CreativeOperation>();
  for (const operation of operations) {
    if (byId.has(operation.id)) errors.push(`duplicate-operation:${operation.id}`);
    byId.set(operation.id, operation);
  }
  for (const operation of operations) {
    for (const dependency of operation.dependencies ?? []) {
      if (dependency === operation.id) errors.push(`self-dependency:${operation.id}`);
      else if (!byId.has(dependency)) errors.push(`missing-dependency:${operation.id}:${dependency}`);
    }
  }
  errors.push(...cycleErrors(byId));

  const producerByArtifact = new Map<string, string>();
  for (const operation of operations) for (const produced of operation.produces ?? []) {
    if (producerByArtifact.has(produced)) errors.push(`conflicting-writer:${produced}`);
    else producerByArtifact.set(produced, operation.id);
  }
  const canonicalInputs = new Set((request.inputArtifacts ?? []).map(artifact => artifact.id));
  for (const operation of operations) for (const required of operation.requiredArtifacts ?? []) {
    if (canonicalInputs.has(required)) continue;
    const producer = producerByArtifact.get(required);
    if (!producer) errors.push(`undeclared-artifact:${operation.id}:${required}`);
    else if (!dependsTransitively(operation.id, producer, byId, new Set())) errors.push(`artifact-not-from-dependency:${operation.id}:${required}`);
  }
  return errors;
}

function cycleErrors(byId: ReadonlyMap<string, CreativeOperation>): string[] {
  const errors: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    if (visiting.has(id)) { errors.push(`cycle:${id}`); return; }
    visiting.add(id);
    for (const dependency of byId.get(id)?.dependencies ?? []) if (byId.has(dependency)) visit(dependency);
    visiting.delete(id);
    visited.add(id);
  };
  for (const id of byId.keys()) visit(id);
  return errors;
}

function dependsTransitively(operationId: string, producerId: string, byId: ReadonlyMap<string, CreativeOperation>, seen: Set<string>): boolean {
  if (seen.has(operationId)) return false;
  seen.add(operationId);
  for (const dependency of byId.get(operationId)?.dependencies ?? []) {
    if (dependency === producerId) return true;
    if (dependsTransitively(dependency, producerId, byId, seen)) return true;
  }
  return false;
}

function validateSelectedConstraints(candidate: CreativePlanCandidate, plan: CreativePlan): string[] {
  const constraints = plan.planningConstraints;
  if (!constraints) return [];
  const errors: string[] = [];
  if (constraints.executionPolicy === 'LOCAL_ONLY' && candidate.targetPreference !== 'LOCAL') errors.push('selected-violates-local-only');
  if (constraints.forbiddenTargets.includes(candidate.targetPreference)) errors.push('selected-uses-forbidden-target');
  if (constraints.maxCredits !== undefined && candidate.estimatedCredits > constraints.maxCredits) errors.push('selected-exceeds-max-credits');
  if (constraints.maxLatencyMs !== undefined && candidate.estimatedLatencyMs > constraints.maxLatencyMs) errors.push('selected-exceeds-max-latency');
  if (constraints.minimumQuality !== undefined && candidate.expectedQuality < constraints.minimumQuality) errors.push('selected-below-minimum-quality');
  return errors;
}

function sameOperations(left: readonly CreativeOperation[], right: readonly CreativeOperation[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}
