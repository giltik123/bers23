import type { RoutingCostEstimate, RoutingBudget } from '../cost/RoutingCostEstimator';
import type { RiskScore } from '../risk/RoutingRiskAnalyzer';

/** Runtime constraints evaluated after a route has been proposed. */
export interface RoutingPolicyContext { readonly budget: RoutingBudget; readonly cost: RoutingCostEstimate; readonly risk: RiskScore; readonly allowHighRisk?: boolean; }
/** Result of the execution permission check. */
export interface RoutingPolicyResult { readonly allowed: boolean; readonly violations: readonly string[]; readonly warnings: readonly string[]; }

/** Determines whether a proposed route is permitted by cost and safety policy. */
export class RoutingPolicyEngine {
  evaluate(context: RoutingPolicyContext): RoutingPolicyResult {
    const violations: string[] = [];
    const warnings = [...context.risk.warnings];
    if (!context.cost.withinBudget) violations.push(`Estimated cost ${context.cost.totalCredits} exceeds ${context.budget.tier} plan limit of ${context.budget.maxCredits} credits.`);
    if (context.risk.overall >= 0.8 && !context.allowHighRisk) violations.push('Route exceeds the permitted identity or scene-drift risk.');
    return Object.freeze({ allowed: violations.length === 0, violations: Object.freeze(violations), warnings: Object.freeze(warnings) });
  }
}
