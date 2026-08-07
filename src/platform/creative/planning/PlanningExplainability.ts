import { deepFreeze } from './immutable';
import type { CreativePlan, PlanningExplanation, VerificationStep } from './types';

export class PlanningExplainability {
  explain(plan: CreativePlan, alternatives: readonly CreativePlan[], verification: readonly VerificationStep[]): PlanningExplanation {
    const dependencies = plan.graph.edges.map((edge) => `${edge.source} → ${edge.target}`);
    const narrative = [
      `Goal: ${plan.goalTree[0]?.title ?? plan.name}`,
      `Plan: ${plan.name}`,
      `Dependencies: ${dependencies.length}`,
      `Optimization: ${plan.strategy}`,
      `Alternatives: ${alternatives.map((item) => item.name).join(', ') || 'none'}`,
      `Verification: ${verification.length} checks`,
      `Execution Readiness: ${plan.ready}`,
    ].join('\n');
    return deepFreeze({ goal: plan.goalTree[0]?.title ?? plan.name, plan: plan.name, dependencies, optimization: plan.strategy, alternatives: alternatives.map((item) => item.name), verification: verification.map((item) => item.check), executionReadiness: plan.ready, narrative });
  }
}
