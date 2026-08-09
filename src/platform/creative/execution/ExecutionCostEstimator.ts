import { deepFreeze } from './immutable';
import type { ExecutionCost, ExecutionGraphSnapshot } from './types';

export class ExecutionCostEstimator {
  estimate(graph: ExecutionGraphSnapshot): ExecutionCost {
    return deepFreeze({
      credits: graph.nodes.reduce((sum, node) => sum + node.credits, 0),
      latency: graph.nodes.reduce((sum, node) => sum + node.latency, 0),
      gpuTime: graph.nodes.reduce((sum, node) => sum + node.gpuTime, 0),
      cpuTime: graph.nodes.reduce((sum, node) => sum + node.cpuTime, 0),
      memory: Math.max(0, ...graph.nodes.map((node) => node.memory)),
      expectedAiCalls: graph.nodes.reduce((sum, node) => sum + node.aiCalls, 0),
      expectedRetries: graph.nodes.reduce((sum, node) => sum + node.expectedRetries, 0),
    });
  }
}
