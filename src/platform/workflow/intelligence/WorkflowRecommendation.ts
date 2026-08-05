import type { WorkflowAnalyticsSnapshot } from './WorkflowAnalytics';
import { WorkflowRanker, type WorkflowRankingCandidate, type WorkflowRankingWeights } from './WorkflowRanker';

export interface WorkflowRecommendationContext { readonly plan?: 'Free' | 'Studio' | 'Enterprise' | string; readonly workflowAnalytics?: readonly WorkflowAnalyticsSnapshot[]; readonly availableWorkflows?: readonly string[]; readonly weights?: WorkflowRankingWeights; }
export interface WorkflowRecommendationResult { readonly workflow: string; readonly alternatives: readonly string[]; readonly confidence: number; readonly explanation: string; }

const promptWorkflow = (prompt: string) => {
  if (/каталог|одежд|пример|try.?on|garment|catalog/i.test(prompt)) return 'virtual-try-on';
  if (/фон|background/i.test(prompt)) return 'background-replacement';
  if (/волос|hair/i.test(prompt)) return 'hair-color-edit';
  if (/портрет|portrait|face|лицо/i.test(prompt)) return 'portrait-enhancement';
  return 'image-edit-basic';
};

export class WorkflowRecommendation {
  recommend(prompt: string, context: WorkflowRecommendationContext = {}): WorkflowRecommendationResult {
    const preferred = promptWorkflow(prompt);
    const analytics = context.workflowAnalytics || [];
    const candidates = analytics.filter((item) => !context.availableWorkflows || context.availableWorkflows.includes(item.workflowId)).map((item): WorkflowRankingCandidate => ({ workflowId: item.workflowId, analytics: item }));
    const ranked = candidates.length ? new WorkflowRanker(context.weights).rank(candidates) : [];
    const planAdjusted = this.planAdjusted(preferred, context.plan, ranked);
    const workflow = planAdjusted || ranked[0]?.workflowId || preferred;
    return Object.freeze({ workflow, alternatives: Object.freeze(ranked.map((item) => item.workflowId).filter((id) => id !== workflow).slice(0, 3)), confidence: workflow === preferred ? 0.88 : ranked[0]?.score ?? 0.7, explanation: `Selected ${workflow} for prompt intent and ${context.plan || 'default'} optimization profile.` });
  }

  private planAdjusted(preferred: string, plan: string | undefined, ranked: readonly { workflowId: string; factors: { quality: number; costEfficiency: number } }[]): string | null {
    if (!ranked.length) return preferred;
    if (plan === 'Free') return [...ranked].sort((left, right) => right.factors.costEfficiency - left.factors.costEfficiency)[0]?.workflowId || preferred;
    if (plan === 'Studio') return [...ranked].sort((left, right) => right.factors.quality - left.factors.quality)[0]?.workflowId || preferred;
    return preferred;
  }
}
