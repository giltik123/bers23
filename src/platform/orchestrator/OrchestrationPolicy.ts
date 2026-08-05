import type { ExecutionPlan } from '../execution';
import type { RoutingDecision } from '../router';
import type { OrchestrationContext } from './OrchestrationContext';
export interface OrchestrationPolicyResult { readonly allowed: boolean; readonly violations: readonly string[]; readonly warnings: readonly string[]; }

/** Validates budget, risk, tenant isolation, provider availability, and execution permissions before runtime start. */
export class OrchestrationPolicy {
  evaluate(context: OrchestrationContext, route: RoutingDecision, plan: ExecutionPlan): OrchestrationPolicyResult {
    const violations: string[] = []; const warnings: string[] = [];
    if (!context.tenantId || !context.userId) violations.push('Tenant and user identity are required.');
    if (context.budget && plan.estimatedCost > context.budget.credits) violations.push(`Estimated cost ${plan.estimatedCost} exceeds available credits ${context.budget.credits}.`);
    if (route.risk.overall >= 0.8 && context.budget?.plan === 'free') violations.push('High-risk routes require Pro or Studio plan.');
    if (route.fallback.required) violations.push(route.fallback.reason ?? 'Fallback route is required before execution.');
    if (!route.validation.valid) violations.push(...route.validation.errors);
    if (!route.policy.allowed) violations.push(...route.policy.violations);
    if (route.providers.length === 0) warnings.push('No provider was selected for this route.');
    if (plan.nodes.length === 0) violations.push('Execution plan contains no nodes.');
    return Object.freeze({ allowed: violations.length === 0, violations: Object.freeze(violations), warnings: Object.freeze(warnings) });
  }
}
