import { deepFreeze } from './immutable';
import type { ExecutionCheckpoint, ExecutionGraphSnapshot, RollbackPlan } from './types';

export class RollbackPlanner {
  plan(graph: ExecutionGraphSnapshot, checkpoint: ExecutionCheckpoint): RollbackPlan {
    if (checkpoint.graphId !== graph.id) throw new Error('Checkpoint does not belong to execution graph');
    const stage = graph.stages.find((item) => item.id === checkpoint.stageId);
    if (!stage) throw new Error('Checkpoint stage is missing');
    const previous = graph.stages.filter((item) => item.order < stage.order).at(-1);
    const preserve = previous ? graph.stages.filter((item) => item.order <= previous.order).flatMap((item) => item.groups).flatMap((group) => group.nodeIds) : [];
    const recalculate = graph.stages.filter((item) => item.order >= stage.order).flatMap((item) => item.groups).flatMap((group) => group.nodeIds);
    return deepFreeze({ checkpointId: checkpoint.id, rollbackToStageId: previous?.id, recalculate, preserve, remove: recalculate.slice() });
  }
}
