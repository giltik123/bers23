import { pipelineDeepFreeze } from './PipelineImmutable';
import type { PipelineGraphSnapshot, PipelineOptimizationResultV2 } from './ImagePipelineTypes';

export class PipelineOptimizer {
  optimize(graph: PipelineGraphSnapshot): PipelineOptimizationResultV2 {
    const seen = new Map<string, string>();
    const removed: string[] = [];
    for (const operation of graph.operations) {
      const key = `${operation.implementation}:${JSON.stringify(operation.resources)}`;
      if (seen.has(key) && !graph.dependencies.some((item) => item.source === operation.id || item.target === operation.id)) removed.push(operation.id);
      else seen.set(key, operation.id);
    }
    const active = graph.operations.filter((item) => !removed.includes(item.id));
    const parallelGroups = graph.stages.map((stage) => stage.operationIds.filter((id) => !removed.includes(id))).filter((group) => group.length);
    const reorderedOperationIds = graph.stages.slice().sort((a, b) => a.order - b.order).flatMap((stage) => stage.operationIds.filter((id) => !removed.includes(id)).slice().sort((a, b) => {
      const left = graph.operations.find((item) => item.id === a)!;
      const right = graph.operations.find((item) => item.id === b)!;
      return left.resources.ram - right.resources.ram || a.localeCompare(b);
    }));
    const memorySavings = removed.reduce((sum, id) => sum + graph.operations.find((item) => item.id === id)!.resources.ram, 0);
    const bufferSavings = Math.max(0, graph.operations.reduce((sum, item) => sum + item.resources.ram, 0) - Math.max(0, ...active.map((item) => item.resources.ram)));
    return pipelineDeepFreeze({ graph, removedOperationIds: removed.sort(), reorderedOperationIds, parallelGroups, memorySavings, bufferSavings });
  }
}
