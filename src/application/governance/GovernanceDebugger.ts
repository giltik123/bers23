import type { GovernanceContext, GovernanceDecision, GovernancePolicy, GovernanceViolation } from './GovernanceModel';

export interface GovernanceDebugSnapshot {
  readonly organization: string;
  readonly policies: readonly GovernancePolicy[];
  readonly rules: readonly GovernancePolicy['rules'][number][];
  readonly evaluation?: GovernanceContext;
  readonly decision?: GovernanceDecision;
  readonly violations: readonly GovernanceViolation[];
}

export class GovernanceDebugger {
  debug(input: { organizationId: string; policies: readonly GovernancePolicy[]; evaluation?: GovernanceContext; decision?: GovernanceDecision }): GovernanceDebugSnapshot {
    return Object.freeze({
      organization: input.organizationId,
      policies: Object.freeze([...input.policies]),
      rules: Object.freeze(input.policies.flatMap((policy) => policy.rules)),
      evaluation: input.evaluation,
      decision: input.decision,
      violations: Object.freeze(input.decision?.violations ? [...input.decision.violations] : []),
    });
  }
}
