import { immutableOperationClone } from '../immutable';
import type { OperationSnapshot } from '../types';

export class OperationExplainability {
  explain(snapshot: OperationSnapshot, alternatives: readonly OperationSnapshot[] = []) {
    const reasons: string[] = [];
    reasons.push(snapshot.decision.selected ? `Selected ${snapshot.descriptor.displayName}` : `Skipped ${snapshot.descriptor.displayName}`);
    reasons.push(snapshot.decision.reason);
    reasons.push(snapshot.capabilities.matched ? 'All capabilities are available' : `Missing capabilities: ${snapshot.capabilities.missing.join(', ')}`);
    reasons.push(snapshot.validation.valid ? 'Parameters are valid' : `Invalid parameters: ${snapshot.validation.errors.join(', ')}`);
    reasons.push(snapshot.compatibility.compatible ? 'Artifacts are compatible' : `Incompatible artifacts: ${snapshot.compatibility.errors.join(', ')}`);
    const rejectedAlternatives = alternatives.map((alternative) => ({
      operationId: alternative.descriptor.operationId,
      reason: alternative.decision.selected
        ? `Not selected because ${snapshot.descriptor.operationId} is the requested canonical operation`
        : alternative.decision.reason,
    }));
    return immutableOperationClone({
      operationId: snapshot.descriptor.operationId,
      selected: snapshot.decision.selected,
      route: snapshot.decision.route,
      reasons,
      rejectedAlternatives,
    });
  }
}
