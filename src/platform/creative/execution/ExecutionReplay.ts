import { deepFreeze, sameScope } from './immutable';
import type { ExecutionCheckpoint, ExecutionGraphSnapshot, ExecutionScope } from './types';

export class ExecutionReplay {
  replay(graph: ExecutionGraphSnapshot, checkpoint: ExecutionCheckpoint, scope: ExecutionScope) {
    if (!sameScope(graph.scope, scope) || !sameScope(checkpoint.scope, scope)) throw new Error('Scope isolation violation');
    if (checkpoint.graphId !== graph.id) throw new Error('Checkpoint does not belong to graph');
    return deepFreeze({ graphId: graph.id, checkpointId: checkpoint.id, stageId: checkpoint.stageId, state: checkpoint.state, replayOrder: graph.topologicalOrder.filter((id) => checkpoint.state[id] !== 'completed'), deterministic: true });
  }
}
