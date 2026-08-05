import type { WorkflowRankingCandidate } from './WorkflowRanker';
import { WorkflowRanker } from './WorkflowRanker';

export interface WorkflowOptimizationAdvice {
  readonly currentWorkflow: string;
  readonly recommendedWorkflow: string;
  readonly reason: string;
  readonly confidence: number;
  readonly expectedImprovement: number;
}

export class WorkflowOptimizer {
  constructor(private readonly ranker = new WorkflowRanker()) {}

  advise(currentWorkflow: string, candidates: readonly WorkflowRankingCandidate[]): WorkflowOptimizationAdvice {
    const ranking = this.ranker.rank(candidates);
    const current = ranking.find((item) => item.workflowId === currentWorkflow) ?? ranking[0];
    const recommended = ranking[0];
    const improvement = recommended && current ? Math.max(0, recommended.score - current.score) : 0;
    return Object.freeze({
      currentWorkflow,
      recommendedWorkflow: recommended?.workflowId || currentWorkflow,
      reason: improvement > 0 ? `${recommended.workflowId} has stronger weighted success, quality, cost, and speed signals.` : 'Current workflow remains the strongest candidate.',
      confidence: Math.min(0.99, 0.6 + improvement),
      expectedImprovement: improvement,
    });
  }
}
