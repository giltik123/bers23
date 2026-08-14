import { immutableOperationClone } from '../immutable';
import type { OperationDescriptor, OptimizationDecision } from '../types';

export class OperationOptimizer {
  analyze(operations: readonly OperationDescriptor[]): readonly OptimizationDecision[] {
    const decisions: OptimizationDecision[] = [];
    for (let index = 0; index < operations.length - 1; index += 1) {
      const left = operations[index];
      const right = operations[index + 1];
      if (left.operationId === 'resize' && right.operationId === 'upscale') {
        decisions.push({ ruleId: 'quality-upscale-before-resize', applied: true, operationIds: [left.operationId, right.operationId], replacementIds: [right.operationId, left.operationId], reason: 'Upscaling before resizing preserves generated detail' });
      }
      if (left.operationId === 'adjust-tone' && right.operationId === 'adjust-tone') {
        decisions.push({ ruleId: 'merge-tone-adjustments', applied: true, operationIds: [left.operationId, right.operationId], replacementIds: ['adjust-tone'], reason: 'Tone adjustments can share a single pixel pass' });
      }
    }
    return immutableOperationClone(decisions);
  }

  optimize(operations: readonly OperationDescriptor[]): readonly OperationDescriptor[] {
    const result = [...operations];
    for (let index = 0; index < result.length - 1; index += 1) {
      if (result[index].operationId === 'resize' && result[index + 1].operationId === 'upscale') {
        [result[index], result[index + 1]] = [result[index + 1], result[index]];
      } else if (result[index].operationId === 'adjust-tone' && result[index + 1].operationId === 'adjust-tone') {
        result.splice(index + 1, 1);
      }
    }
    return Object.freeze(result);
  }
}
