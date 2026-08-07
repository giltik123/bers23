import { clamp, deepFreeze } from './immutable';
import type { ExecutionGraphSnapshot, ExecutionMetricsResult, ExecutionResourceAllocation, ExecutionSimulation, ExecutionVerificationStep } from './types';

export class ExecutionMetrics {
  calculate(graph: ExecutionGraphSnapshot, simulation: ExecutionSimulation, resources: ExecutionResourceAllocation, verification: readonly ExecutionVerificationStep[]): ExecutionMetricsResult {
    const rollbackNodes = graph.nodes.filter((node) => node.rollbackPoint).length;
    const verifiedNodes = graph.nodes.filter((node) => node.verificationRequired).length;
    const pipelineEfficiency = clamp(simulation.quality / (1 + simulation.latency / 100 + simulation.credits / 100));
    const result = {
      pipelineEfficiency,
      parallelEfficiency: clamp(simulation.parallelism + (graph.nodes.length <= 1 ? 1 : 0)),
      resourceEfficiency: resources.feasible ? clamp(1 - resources.shortages.length * 0.2) : 0.4,
      recoveryScore: clamp(graph.nodes.filter((node) => node.expectedRetries < 0.5).length / Math.max(1, graph.nodes.length)),
      verificationScore: clamp(verification.length / Math.max(1, verifiedNodes)),
      rollbackScore: clamp(rollbackNodes / Math.max(1, graph.nodes.length)),
    };
    return deepFreeze({ ...result, executionIq: clamp(Object.values(result).reduce((sum, value) => sum + value, 0) / Object.keys(result).length) });
  }
}
