import { immutableOperationClone } from '../immutable';
import type { OperationSnapshot } from '../types';

export class OperationDebugger {
  inspect(snapshot: OperationSnapshot) {
    return immutableOperationClone({
      operation: snapshot.descriptor.operationId,
      validation: snapshot.validation,
      compatibility: snapshot.compatibility,
      executionPolicy: snapshot.policy,
      resources: snapshot.resources,
      optimization: snapshot.optimization,
      decision: snapshot.decision,
    });
  }
}
