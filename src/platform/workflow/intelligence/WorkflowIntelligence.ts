import { WorkflowAnalytics, type ProviderMetricsRecord, type WorkflowAnalyticsSnapshot, type WorkflowExecutionRecord } from './WorkflowAnalytics';
import { WorkflowExperiment } from './WorkflowExperiment';
import { WorkflowOptimizer } from './WorkflowOptimizer';
import { WorkflowRanker, type WorkflowRankingCandidate } from './WorkflowRanker';
import { WorkflowRecommendation, type WorkflowRecommendationContext } from './WorkflowRecommendation';
import { WorkflowVersioning } from './WorkflowVersioning';

export class WorkflowIntelligence {
  readonly analytics = new WorkflowAnalytics();
  readonly ranker = new WorkflowRanker();
  readonly optimizer = new WorkflowOptimizer(this.ranker);
  readonly recommendation = new WorkflowRecommendation();
  readonly versioning = new WorkflowVersioning();
  readonly experiment = new WorkflowExperiment();

  summarize(workflowIds: readonly string[], executions: readonly WorkflowExecutionRecord[], providerMetrics: readonly ProviderMetricsRecord[] = []): WorkflowAnalyticsSnapshot[] { return this.analytics.summarizeAll(workflowIds, executions, providerMetrics); }
  rank(snapshots: readonly WorkflowAnalyticsSnapshot[]) { return this.ranker.rank(snapshots.map((analytics): WorkflowRankingCandidate => ({ workflowId: analytics.workflowId, analytics }))); }
  advise(currentWorkflow: string, snapshots: readonly WorkflowAnalyticsSnapshot[]) { return this.optimizer.advise(currentWorkflow, snapshots.map((analytics): WorkflowRankingCandidate => ({ workflowId: analytics.workflowId, analytics }))); }
  recommend(prompt: string, context: WorkflowRecommendationContext = {}) { return this.recommendation.recommend(prompt, context); }
}
