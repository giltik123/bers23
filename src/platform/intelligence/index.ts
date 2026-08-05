import { ExecutionAnalytics } from './execution/ExecutionAnalytics';
import { FeedbackProcessor } from './feedback/FeedbackProcessor';
import { RoutingOptimizer } from './feedback/RoutingOptimizer';
import { BudgetOptimizer } from './optimization/BudgetOptimizer';
import { ProviderRankingEngine } from './ranking/ProviderRankingEngine';
import type { RankingWeights } from './ranking/RankingTypes';

/** Public self-optimization services exposed as platform.intelligence-compatible state. */
export interface ExecutionIntelligence {
  readonly analytics: ExecutionAnalytics; readonly ranking: ProviderRankingEngine; readonly optimizer: RoutingOptimizer;
  readonly budget: BudgetOptimizer; readonly feedback: FeedbackProcessor;
}
export function createExecutionIntelligence(weights?: RankingWeights): ExecutionIntelligence {
  const analytics = new ExecutionAnalytics(); const ranking = new ProviderRankingEngine(analytics.performance, analytics.cost, weights);
  return Object.freeze({ analytics, ranking, optimizer: new RoutingOptimizer(ranking), budget: new BudgetOptimizer(), feedback: new FeedbackProcessor(analytics) });
}
export * from './execution';
export * from './feedback';
export * from './optimization';
export * from './ranking';
