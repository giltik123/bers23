import { deepFreeze, sameScope } from './immutable';
import type { ExecutionCheckpoint, ExecutionDependencies, ExecutionGraphSnapshot, ExecutionScope, ExecutionStatus, ExecutionVerificationStep } from './types';

export class CheckpointEngine {
  constructor(private readonly dependencies: ExecutionDependencies) {}

  create(graph: ExecutionGraphSnapshot, stageId: string, verification: readonly ExecutionVerificationStep[]): ExecutionCheckpoint {
    const stage = graph.stages.find((item) => item.id === stageId);
    if (!stage) throw new Error('Unknown execution stage');
    const nodeIds = stage.groups.flatMap((group) => group.nodeIds);
    const previous = graph.stages.filter((item) => item.order < stage.order).flatMap((item) => item.groups).flatMap((group) => group.nodeIds);
    const state: Record<string, ExecutionStatus> = {};
    for (const node of graph.nodes) state[node.id] = previous.includes(node.id) || nodeIds.includes(node.id) ? 'completed' : 'pending';
    return deepFreeze({
      id: this.dependencies.id(), scope: { ...graph.scope }, graphId: graph.id, stageId,
      state, inputs: previous, outputs: nodeIds, metrics: { completed: previous.length + nodeIds.length, total: graph.nodes.length },
      verification: verification.filter((item) => item.stageId === stageId), dependencies: previous,
      createdAt: this.dependencies.now(),
    });
  }

  assertScope(checkpoint: ExecutionCheckpoint, scope: ExecutionScope): void {
    if (!sameScope(checkpoint.scope, scope)) throw new Error('Scope isolation violation');
  }
}
