import type { CapabilityGraph } from '../CapabilityGraph';

/** User plan constraints relevant to routing. */
export interface RoutingBudget { readonly tier: 'free' | 'pro' | 'enterprise'; readonly maxCredits: number; }

/** Cost estimate produced before execution. */
export interface RoutingCostEstimate { readonly totalCredits: number; readonly providerCredits: Readonly<Record<string, number>>; readonly withinBudget: boolean; }

const defaultProviderCosts: Readonly<Record<string, number>> = Object.freeze({ fashn: 20, reve: 12, sam3: 2 });

/** Estimates route credits without invoking a provider. */
export class RoutingCostEstimator {
  constructor(private readonly graph: CapabilityGraph, private readonly providerCosts: Readonly<Record<string, number>> = defaultProviderCosts) {}

  estimate(capabilities: readonly string[], providers: readonly string[], budget: RoutingBudget): RoutingCostEstimate {
    const capabilityCost = capabilities.reduce((sum, id) => sum + (this.graph.get(id)?.cost ?? 0), 0);
    const providerCredits = Object.fromEntries(providers.map((id) => [id, this.providerCosts[id] ?? 0]));
    const totalCredits = Math.max(capabilityCost, ...Object.values(providerCredits), 0);
    return Object.freeze({ totalCredits, providerCredits: Object.freeze(providerCredits), withinBudget: totalCredits <= budget.maxCredits });
  }
}
