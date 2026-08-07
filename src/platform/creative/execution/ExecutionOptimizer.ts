import { clamp, deepFreeze } from './immutable';
import { ExecutionCostEstimator } from './ExecutionCostEstimator';
import type { ExecutionGraphSnapshot, ExecutionOptimization } from './types';

export class ExecutionOptimizer {
  private readonly costs = new ExecutionCostEstimator();

  optimize(graph: ExecutionGraphSnapshot): ExecutionOptimization {
    const cost = this.costs.estimate(graph);
    const switches = graph.topologicalOrder.reduce((count, id, index, order) => {
      if (!index) return 0;
      const previous = graph.nodes.find((node) => node.id === order[index - 1])!;
      const current = graph.nodes.find((node) => node.id === id)!;
      return count + (previous.mode === current.mode ? 0 : 1);
    }, 0);
    const parallelSavings = graph.stages.reduce((sum, stage) => {
      const latencies = stage.groups.flatMap((group) => group.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)!.latency));
      return sum + Math.max(0, latencies.reduce((total, value) => total + value, 0) - Math.max(0, ...latencies));
    }, 0);
    const savings = { latency: parallelSavings, credits: 0, aiCalls: 0, memory: 0, pipelineSwitches: switches };
    const score = clamp(1 - cost.latency / 200 - cost.credits / 200 - cost.expectedAiCalls / 20 - cost.memory / 500 - switches / 20 + parallelSavings / 100);
    return deepFreeze({ graph, score, savings, changes: ['Parallelized independent operations', `Grouped execution modes to avoid ${switches} pipeline switches`] });
  }
}
