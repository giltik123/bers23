import { GovernanceDebugger } from './GovernanceDebugger';
import { GovernanceEvaluator } from './GovernanceEvaluator';
import { GovernanceHistory, immutableGovernanceSnapshot } from './GovernanceHistory';
import type { GovernanceContext, GovernanceDecision, GovernancePolicy, GovernancePolicyCategory, GovernanceRule, GovernanceScope } from './GovernanceModel';

export interface GovernanceAccessContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly actorId: string;
}

export interface GovernanceInspection {
  readonly organizationId: string;
  readonly policies: readonly GovernancePolicy[];
  readonly activity: ReturnType<GovernanceHistory['list']>;
}

export class GovernanceManager {
  private policies = new Map<string, GovernancePolicy[]>();
  readonly history: GovernanceHistory;
  private readonly evaluator: GovernanceEvaluator;
  private readonly debuggerApi = new GovernanceDebugger();
  private sequence = 0;
  private lastEvaluation = new Map<string, { context: GovernanceContext; decision: GovernanceDecision }>();

  constructor(private readonly clock: () => number = Date.now) {
    this.history = new GovernanceHistory(clock);
    this.evaluator = new GovernanceEvaluator(clock);
  }

  createPolicy(context: GovernanceAccessContext, input: { policyId?: string; name: string; category: GovernancePolicyCategory; scope?: GovernanceScope; scopeId?: string; rules: readonly Omit<GovernanceRule, 'id' | 'category' | 'enabled' | 'metadata'>[]; enabled?: boolean; metadata?: Record<string, unknown> }): GovernancePolicy {
    const list = this.getPolicyList(context.tenantId, context.organizationId);
    const now = this.clock();
    const policy = Object.freeze({
      id: input.policyId || `governance-policy-${++this.sequence}`,
      tenantId: context.tenantId,
      organizationId: context.organizationId,
      scope: input.scope || 'ORGANIZATION',
      scopeId: input.scopeId || context.organizationId,
      category: input.category,
      name: input.name,
      rules: Object.freeze(input.rules.map((rule) => this.createRule(input.category, rule))),
      enabled: input.enabled ?? true,
      metadata: immutableGovernanceSnapshot(input.metadata || {}),
      createdAt: now,
      updatedAt: now,
    });
    if (list.some((existing) => existing.id === policy.id)) throw new Error('Policy already exists');
    list.push(policy);
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'policy.created', actorId: context.actorId, snapshot: policy });
    return policy;
  }

  updatePolicy(context: GovernanceAccessContext, policyId: string, patch: { name?: string; rules?: readonly Omit<GovernanceRule, 'id' | 'category' | 'enabled' | 'metadata'>[]; enabled?: boolean; metadata?: Record<string, unknown> }): GovernancePolicy {
    const list = this.getPolicyList(context.tenantId, context.organizationId);
    const index = list.findIndex((policy) => policy.id === policyId);
    if (index === -1) throw new Error('Policy not found');
    const existing = list[index];
    const updated = Object.freeze({
      ...existing,
      name: patch.name ?? existing.name,
      rules: patch.rules ? Object.freeze(patch.rules.map((rule) => this.createRule(existing.category, rule))) : existing.rules,
      enabled: patch.enabled ?? existing.enabled,
      metadata: patch.metadata ? immutableGovernanceSnapshot({ ...existing.metadata, ...patch.metadata }) : existing.metadata,
      updatedAt: this.clock(),
    });
    list[index] = updated;
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'policy.updated', actorId: context.actorId, snapshot: updated });
    return updated;
  }

  removePolicy(context: GovernanceAccessContext, policyId: string): void {
    const list = this.getPolicyList(context.tenantId, context.organizationId);
    const policy = list.find((candidate) => candidate.id === policyId);
    if (!policy) throw new Error('Policy not found');
    this.policies.set(this.key(context.tenantId, context.organizationId), list.filter((candidate) => candidate.id !== policyId));
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'policy.removed', actorId: context.actorId, snapshot: policy });
  }

  evaluate(context: GovernanceContext): GovernanceDecision {
    const policies = this.listPolicies({ tenantId: context.tenantId, organizationId: context.organizationId, actorId: context.userId });
    const decision = this.evaluator.evaluate(context, policies);
    this.lastEvaluation.set(this.key(context.tenantId, context.organizationId), { context, decision });
    this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: decision.allowed ? 'execution.allowed' : 'execution.blocked', actorId: context.userId, snapshot: decision });
    for (const violation of decision.violations) {
      this.history.record({ tenantId: context.tenantId, organizationId: context.organizationId, type: 'violation.created', actorId: context.userId, snapshot: violation });
    }
    return decision;
  }

  listPolicies(context: GovernanceAccessContext): readonly GovernancePolicy[] {
    return Object.freeze([...this.getPolicyList(context.tenantId, context.organizationId)]);
  }

  inspect(context: GovernanceAccessContext): GovernanceInspection {
    return Object.freeze({ organizationId: context.organizationId, policies: this.listPolicies(context), activity: this.history.list(context.tenantId, context.organizationId) });
  }

  debug(context: GovernanceAccessContext) {
    const last = this.lastEvaluation.get(this.key(context.tenantId, context.organizationId));
    return this.debuggerApi.debug({ organizationId: context.organizationId, policies: this.listPolicies(context), evaluation: last?.context, decision: last?.decision });
  }

  private createRule(category: GovernancePolicyCategory, input: Omit<GovernanceRule, 'id' | 'category' | 'enabled' | 'metadata'>): GovernanceRule {
    return Object.freeze({
      id: `governance-rule-${++this.sequence}`,
      category,
      rule: input.rule,
      limit: input.limit,
      providers: input.providers ? Object.freeze([...input.providers]) : undefined,
      workflows: input.workflows ? Object.freeze([...input.workflows]) : undefined,
      permissions: input.permissions ? Object.freeze([...input.permissions]) : undefined,
      enabled: true,
      metadata: Object.freeze({}),
    });
  }

  private getPolicyList(tenantId: string, organizationId: string): GovernancePolicy[] {
    const key = this.key(tenantId, organizationId);
    if (!this.policies.has(key)) this.policies.set(key, []);
    return this.policies.get(key)!;
  }

  private key(tenantId: string, organizationId: string): string { return `${tenantId}:${organizationId}`; }
}
