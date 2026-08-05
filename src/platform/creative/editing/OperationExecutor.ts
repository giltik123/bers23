import type { CreativeCanvas } from '../CreativeTypes';
import type { CreativeOperation, EditDecision, EditRequest } from './CreativeOperation';
import { immutableEditingSnapshot } from './EditingImmutable';

export class OperationExecutor {
  private sequence = 0;
  constructor(private readonly clock: () => number = Date.now) {}

  execute(canvas: CreativeCanvas, request: EditRequest, decision: EditDecision): CreativeOperation {
    if (request.targetLayer && !canvas.layers.some((layer) => layer.id === request.targetLayer)) throw new Error('Target layer not found');
    return Object.freeze({
      id: `op_${++this.sequence}`,
      type: decision.type,
      source: decision.mode,
      targetLayer: request.targetLayer || null,
      parameters: immutableEditingSnapshot(request.parameters || {}),
      reversible: true,
      cost: decision.estimatedCost,
      status: 'APPLIED',
      workflow: decision.workflow,
      createdAt: this.clock(),
    });
  }
}
