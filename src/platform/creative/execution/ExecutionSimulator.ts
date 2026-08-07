import { clamp, deepFreeze } from './immutable';
import { ExecutionCostEstimator } from './ExecutionCostEstimator';
import type { ExecutionGraphSnapshot, ExecutionSchedule, ExecutionSimulation } from './types';

export class ExecutionSimulator {
  private readonly estimator = new ExecutionCostEstimator();
  simulate(graph: ExecutionGraphSnapshot, schedule: ExecutionSchedule): ExecutionSimulation {
    const cost = this.estimator.estimate(graph);
    const quality = graph.nodes.length ? graph.nodes.reduce((sum, node) => sum + node.quality, 0) / graph.nodes.length : 1;
    const risk = graph.nodes.length ? graph.nodes.reduce((sum, node) => sum + node.risk, 0) / graph.nodes.length : 0;
    const risks = [...(risk > 0.3 ? ['operation risk'] : []), ...(cost.expectedAiCalls ? ['AI variability'] : []), ...(cost.expectedRetries > 1 ? ['retry pressure'] : [])];
    return deepFreeze({ quality: clamp(quality), latency: schedule.totalLatency, credits: cost.credits, parallelism: schedule.parallelism, successProbability: clamp(quality * (1 - risk) * (1 - Math.min(0.3, cost.expectedRetries * 0.03))), risks });
  }
}
