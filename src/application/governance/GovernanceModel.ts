export type GovernancePolicyCategory = 'SECURITY' | 'AI_USAGE' | 'BUDGET' | 'QUALITY' | 'DATA_ACCESS' | 'WORKFLOW' | 'PROVIDER';

export type GovernanceViolationType = 'POLICY_BLOCKED' | 'BUDGET_EXCEEDED' | 'PROVIDER_RESTRICTED' | 'DATA_ACCESS_DENIED' | 'WORKFLOW_NOT_ALLOWED';

export type GovernanceScope = 'ORGANIZATION' | 'TEAM' | 'PROJECT' | 'USER';

export interface GovernanceRule {
  readonly id: string;
  readonly category: GovernancePolicyCategory;
  readonly rule: string;
  readonly limit?: number;
  readonly providers?: readonly string[];
  readonly workflows?: readonly string[];
  readonly permissions?: readonly string[];
  readonly enabled: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface GovernancePolicy {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly scope: GovernanceScope;
  readonly scopeId: string;
  readonly category: GovernancePolicyCategory;
  readonly name: string;
  readonly rules: readonly GovernanceRule[];
  readonly enabled: boolean;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export interface GovernanceContext {
  readonly tenantId: string;
  readonly organizationId: string;
  readonly teamId?: string;
  readonly projectId?: string;
  readonly userId: string;
  readonly prompt?: string;
  readonly workflowId?: string;
  readonly providerId?: string;
  readonly estimatedCost?: number;
  readonly userPermissions?: readonly string[];
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export interface GovernanceViolation {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly policyId: string;
  readonly ruleId: string;
  readonly type: GovernanceViolationType;
  readonly reason: string;
  readonly at: number;
  readonly snapshot: unknown;
}

export interface GovernanceDecision {
  readonly id: string;
  readonly tenantId: string;
  readonly organizationId: string;
  readonly allowed: boolean;
  readonly reason: string;
  readonly checks: readonly GovernanceEvaluationCheck[];
  readonly violations: readonly GovernanceViolation[];
  readonly at: number;
}

export interface GovernanceEvaluationCheck {
  readonly name: string;
  readonly allowed: boolean;
  readonly reason: string;
  readonly policyId?: string;
  readonly ruleId?: string;
}
