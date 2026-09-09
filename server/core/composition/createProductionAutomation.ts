import type { Pool } from 'pg';
import type { AutomationManualExecutionDependencies } from '../automation/AutomationManualExecutionService.ts';
import { AutomationManualExecutionService } from '../automation/AutomationManualExecutionService.ts';
import { PostgresAutomationDefinitionStore, type AutomationDefinitionLimits } from '../automation/PostgresAutomationDefinitionStore.ts';
import { PostgresAutomationInvocationStore } from '../automation/PostgresAutomationInvocationStore.ts';

export type ProductionAutomationCompositionInput = Readonly<{
  pool: Pool;
  boundedAgent: AutomationManualExecutionDependencies['agent'];
  artifacts: AutomationManualExecutionDependencies['artifacts'];
  limits: AutomationDefinitionLimits;
}>;

/**
 * Production Automation composition owns Automation definition/invocation stores
 * only. Execution and Artifact authority are injected from the already accepted
 * production Core so C3 cannot create a parallel Agent or execution registry.
 */
export function createProductionAutomation(input: ProductionAutomationCompositionInput) {
  const definitions = new PostgresAutomationDefinitionStore(input.pool, input.limits);
  const invocations = new PostgresAutomationInvocationStore(input.pool);
  const manualExecution = new AutomationManualExecutionService(Object.freeze({
    invocations,
    agent: input.boundedAgent,
    artifacts: input.artifacts,
  }));
  return Object.freeze({ definitions, invocations, manualExecution });
}
