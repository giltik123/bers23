import type { Pool } from 'pg';
import type { AutomationManualExecutionDependencies } from '../automation/AutomationManualExecutionService.ts';
import { AutomationManualExecutionService } from '../automation/AutomationManualExecutionService.ts';
import { AutomationScheduleWorker } from '../automation/AutomationScheduleWorker.ts';
import { PostgresAutomationDefinitionStore, type AutomationDefinitionLimits } from '../automation/PostgresAutomationDefinitionStore.ts';
import { PostgresAutomationInvocationStore } from '../automation/PostgresAutomationInvocationStore.ts';
import { PostgresAutomationScheduleStore } from '../automation/PostgresAutomationScheduleStore.ts';

export type ProductionAutomationCompositionInput = Readonly<{
  pool: Pool;
  boundedAgent: AutomationManualExecutionDependencies['agent'];
  artifacts: AutomationManualExecutionDependencies['artifacts'];
  limits: AutomationDefinitionLimits;
}>;

/**
 * Production Automation composition owns definition, immutable invocation binding and recurring
 * trigger timing stores only. Execution and Artifact authority are injected from the accepted Core;
 * C3d creates no parallel Agent, continuation, execution-run, provider or Billing authority.
 */
export function createProductionAutomation(input: ProductionAutomationCompositionInput) {
  const definitions = new PostgresAutomationDefinitionStore(input.pool, input.limits);
  const invocations = new PostgresAutomationInvocationStore(input.pool);
  const schedules = new PostgresAutomationScheduleStore(input.pool);
  const manualExecution = new AutomationManualExecutionService(Object.freeze({
    invocations,
    agent: input.boundedAgent,
    artifacts: input.artifacts,
  }));
  const scheduleWorker = new AutomationScheduleWorker(Object.freeze({
    schedules,
    invocations,
    execution: manualExecution,
  }));
  return Object.freeze({ definitions, invocations, schedules, manualExecution, scheduleWorker });
}
