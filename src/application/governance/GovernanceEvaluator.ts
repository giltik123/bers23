import type { GovernanceContext, GovernanceDecision, GovernanceEvaluationCheck, GovernancePolicy, GovernanceViolation, GovernanceViolationType } from './GovernanceModel';
import { immutableGovernanceSnapshot } from './GovernanceHistory';

export class GovernanceEvaluator {
  private sequence = 0;

  constructor(private readonly clock: () => number = Date.now) {}

  evaluate(context: GovernanceContext, policies: readonly GovernancePolicy[]): GovernanceDecision {
    const applicable = policies.filter((policy) => policy.enabled && this.appliesToContext(policy, context));
    const checks: GovernanceEvaluationCheck[] = [];
    const violations: GovernanceViolation[] = [];

    for (const policy of applicable) {
      for (const rule of policy.rules.filter((candidate) => candidate.enabled)) {
        const check = this.evaluateRule(context, policy, rule);
        checks.push(check);
        if (!check.allowed) violations.push(this.createViolation(context, policy.id, rule.id, this.violationType(policy.category), check.reason, { context, policy, rule }));
      }
    }

    const allowed = violations.length === 0;
    return Object.freeze({
      id: `governance-decision-${++this.sequence}`,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      allowed,
      reason: allowed ? 'Execution allowed' : violations[0].reason,
      checks: Object.freeze(checks),
      violations: Object.freeze(violations),
      at: this.clock(),
    });
  }

  private evaluateRule(context: GovernanceContext, policy: GovernancePolicy, rule: GovernancePolicy['rules'][number]): GovernanceEvaluationCheck {
    if (policy.category === 'BUDGET' && typeof rule.limit === 'number' && typeof context.estimatedCost === 'number' && context.estimatedCost > rule.limit) {
      return this.check('budget', false, 'Budget limit exceeded', policy.id, rule.id);
    }
    if (policy.category === 'PROVIDER' && rule.providers?.length && context.providerId && rule.providers.includes(context.providerId)) {
      return this.check('provider', false, 'Provider restricted', policy.id, rule.id);
    }
    if (policy.category === 'WORKFLOW' && rule.workflows?.length && context.workflowId && !rule.workflows.includes(context.workflowId)) {
      return this.check('workflow', false, 'Workflow not allowed', policy.id, rule.id);
    }
    if (policy.category === 'DATA_ACCESS' && rule.permissions?.length) {
      const granted = new Set(context.userPermissions || []);
      const missing = rule.permissions.filter((permission) => !granted.has(permission));
      if (missing.length > 0) return this.check('permissions', false, 'Data access denied', policy.id, rule.id);
    }
    if (policy.category === 'SECURITY' && rule.permissions?.length) {
      const granted = new Set(context.userPermissions || []);
      const missing = rule.permissions.filter((permission) => !granted.has(permission));
      if (missing.length > 0) return this.check('security', false, 'Security policy blocked execution', policy.id, rule.id);
    }
    return this.check(policy.category.toLowerCase(), true, 'Rule passed', policy.id, rule.id);
  }

  private appliesToContext(policy: GovernancePolicy, context: GovernanceContext): boolean {
    if (policy.tenantId !== context.tenantId || policy.organizationId !== context.organizationId) return false;
    if (policy.scope === 'ORGANIZATION') return policy.scopeId === context.organizationId;
    if (policy.scope === 'TEAM') return policy.scopeId === context.teamId;
    if (policy.scope === 'PROJECT') return policy.scopeId === context.projectId;
    return policy.scope === 'USER' && policy.scopeId === context.userId;
  }

  private check(name: string, allowed: boolean, reason: string, policyId: string, ruleId: string): GovernanceEvaluationCheck {
    return Object.freeze({ name, allowed, reason, policyId, ruleId });
  }

  private createViolation(context: GovernanceContext, policyId: string, ruleId: string, type: GovernanceViolationType, reason: string, snapshot: unknown): GovernanceViolation {
    return Object.freeze({ id: `governance-violation-${++this.sequence}`, tenantId: context.tenantId, organizationId: context.organizationId, policyId, ruleId, type, reason, at: this.clock(), snapshot: immutableGovernanceSnapshot(snapshot) });
  }

  private violationType(category: GovernancePolicy['category']): GovernanceViolationType {
    if (category === 'BUDGET') return 'BUDGET_EXCEEDED';
    if (category === 'PROVIDER') return 'PROVIDER_RESTRICTED';
    if (category === 'DATA_ACCESS' || category === 'SECURITY') return 'DATA_ACCESS_DENIED';
    if (category === 'WORKFLOW') return 'WORKFLOW_NOT_ALLOWED';
    return 'POLICY_BLOCKED';
  }
}
