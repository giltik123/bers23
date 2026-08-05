import type { WorkflowAnalyticsSnapshot } from './WorkflowAnalytics';

export interface WorkflowRankingWeights { readonly successRate: number; readonly quality: number; readonly costEfficiency: number; readonly speed: number; }
export interface WorkflowRankingCandidate { readonly workflowId: string; readonly analytics: WorkflowAnalyticsSnapshot; readonly metadata?: Record<string, unknown>; }
export interface WorkflowRankingResult { readonly workflowId: string; readonly score: number; readonly factors: { readonly successRate: number; readonly quality: number; readonly costEfficiency: number; readonly speed: number }; readonly analytics: WorkflowAnalyticsSnapshot; }

export const defaultWorkflowRankingWeights: WorkflowRankingWeights = Object.freeze({ successRate: 0.4, quality: 0.25, costEfficiency: 0.2, speed: 0.15 });

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const qualityScore = (signals: Record<string, number>) => {
  const values = Object.values(signals);
  return values.length ? clamp(values.reduce((sum, value) => sum + value, 0) / values.length) : 0.5;
};
const inverseScore = (value: number, max: number) => max <= 0 ? 1 : clamp(1 - value / max);

export class WorkflowRanker {
  constructor(private readonly weights: WorkflowRankingWeights = defaultWorkflowRankingWeights) {}

  rank(candidates: readonly WorkflowRankingCandidate[]): WorkflowRankingResult[] {
    const maxCost = Math.max(...candidates.map((candidate) => candidate.analytics.averageCost), 0);
    const maxDuration = Math.max(...candidates.map((candidate) => candidate.analytics.averageDuration), 0);
    return candidates.map((candidate) => {
      const factors = {
        successRate: clamp(candidate.analytics.successRate),
        quality: qualityScore(candidate.analytics.qualitySignals),
        costEfficiency: inverseScore(candidate.analytics.averageCost, maxCost),
        speed: inverseScore(candidate.analytics.averageDuration, maxDuration),
      };
      const score = factors.successRate * this.weights.successRate + factors.quality * this.weights.quality + factors.costEfficiency * this.weights.costEfficiency + factors.speed * this.weights.speed;
      return { workflowId: candidate.workflowId, score, factors, analytics: candidate.analytics };
    }).sort((left, right) => right.score - left.score);
  }

  best(candidates: readonly WorkflowRankingCandidate[]): WorkflowRankingResult | null { return this.rank(candidates)[0] ?? null; }
}
