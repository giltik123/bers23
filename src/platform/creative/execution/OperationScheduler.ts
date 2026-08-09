import { clamp, deepFreeze } from './immutable';
import type { ExecutionGraphSnapshot, ExecutionSchedule } from './types';

export class OperationScheduler {
  schedule(graph: ExecutionGraphSnapshot): ExecutionSchedule {
    const latencyById = new Map(graph.nodes.map((node) => [node.id, node.latency]));
    const totalLatency = graph.stages.reduce((sum, stage) => sum + Math.max(0, ...stage.groups.flatMap((group) => group.nodeIds.map((id) => latencyById.get(id) ?? 0))), 0);
    const criticalPath = graph.stages.flatMap((stage) => stage.groups.map((group) => group.nodeIds.slice().sort((a, b) => (latencyById.get(b) ?? 0) - (latencyById.get(a) ?? 0) || a.localeCompare(b))[0]).filter(Boolean));
    const parallelNodes = graph.stages.flatMap((stage) => stage.groups).reduce((sum, group) => sum + Math.max(0, group.nodeIds.length - 1), 0);
    return deepFreeze({ graphId: graph.id, stages: graph.stages, criticalPath, totalLatency, parallelism: clamp(parallelNodes / Math.max(1, graph.nodes.length)) });
  }
}
