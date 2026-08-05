export type IntelligenceUserPlan = 'free' | 'pro' | 'studio';
export interface BudgetProviderOption { readonly provider: string; readonly estimatedCost: number; readonly quality: number; readonly resolution?: string; }
export interface BudgetOptimizationRequest { readonly plan: IntelligenceUserPlan; readonly availableCredits: number; readonly qualityRequirement?: number; readonly options: readonly BudgetProviderOption[]; }
export interface BudgetOptimizationDecision { readonly provider?: string; readonly quality: 'medium' | 'balanced' | 'maximum'; readonly resolution?: string; readonly estimatedCost: number; readonly reason: string; }

/** Selects an affordable provider according to product-plan quality policy. */
export class BudgetOptimizer {
  optimize(request: BudgetOptimizationRequest): BudgetOptimizationDecision {
    const affordable = request.options.filter((option) => option.estimatedCost <= request.availableCredits && option.quality >= (request.qualityRequirement ?? 0));
    if (affordable.length === 0) return Object.freeze({ quality: request.plan === 'studio' ? 'maximum' : request.plan === 'pro' ? 'balanced' : 'medium', estimatedCost: 0, reason: 'No provider satisfies available credits and quality requirements.' });
    const selected = request.plan === 'free'
      ? [...affordable].sort((left, right) => left.estimatedCost - right.estimatedCost || right.quality - left.quality)[0]
      : request.plan === 'studio'
        ? [...affordable].sort((left, right) => right.quality - left.quality || left.estimatedCost - right.estimatedCost)[0]
        : [...affordable].sort((left, right) => (right.quality / Math.max(right.estimatedCost, 0.0001)) - (left.quality / Math.max(left.estimatedCost, 0.0001)))[0];
    return Object.freeze({ provider: selected.provider, quality: request.plan === 'free' ? 'medium' : request.plan === 'studio' ? 'maximum' : 'balanced', resolution: request.plan === 'free' ? selected.resolution ?? 'standard' : selected.resolution, estimatedCost: selected.estimatedCost, reason: request.plan === 'free' ? 'Selected the lowest-cost affordable route.' : request.plan === 'studio' ? 'Selected the maximum-quality affordable route.' : 'Selected the best historical quality-to-cost balance.' });
  }
}
