import type { Pool } from 'pg';
import { AeeResourceBudgetedSerialDriverV1 } from '../agentic/AeeResourceBudgetedSerialDriverV1.ts';
import { AeeSerialAdmittedGraphDriverV1 } from '../agentic/AeeSerialAdmittedGraphDriverV1.ts';
import { BoundedAgentAeeCompatibilityFacade } from '../agentic/BoundedAgentAeeCompatibilityFacade.ts';
import { PostgresAeeAdmittedPlanStore } from '../agentic/PostgresAeeAdmittedPlanStore.ts';
import { PostgresBoundedAgentCompatibilityAdmissionLock } from '../agentic/PostgresBoundedAgentCompatibilityAdmissionLock.ts';
import type { DurableArtifactLineageResolver } from '../artifacts/durableArtifactLineageResolver.ts';
import type { ExecutionRunRegistry } from '../execution/executionRunRegistry.ts';
import type { DeterministicWorkflowStepFinalRecoveryAuthority } from '../localExecution/DeterministicWorkflowStepFinalRecoveryAuthority.ts';
import type { LocalExecutionLedgerV2 } from '../localExecution/LocalExecutionLedger.ts';
import type { LocalOrthogonalTransformExecutionService } from '../localExecution/LocalOrthogonalTransformExecutionService.ts';
import type { LocalResizeExecutionService } from '../localExecution/LocalResizeExecutionService.ts';
import type { PostgresProjectStore } from '../projects/postgresProjectStore.ts';
import { BoundedAgentDeterministicWorkflowService } from '../workflow/BoundedAgentDeterministicWorkflowService.ts';
import type { WorkflowContinuationStore } from '../workflow/WorkflowContinuationStore.ts';
import type { WorkflowBoundLocalExecutionTicketV2Issuer } from '../workflow/WorkflowBoundLocalExecutionTicketV2Issuer.ts';

export type ProductionBoundedAgentCompatibilityInput = Readonly<{
  pool: Pool;
  continuations: WorkflowContinuationStore;
  tickets: LocalExecutionLedgerV2;
  workflowTickets: WorkflowBoundLocalExecutionTicketV2Issuer;
  orthogonal: LocalOrthogonalTransformExecutionService;
  resize: LocalResizeExecutionService;
  finalRecovery: DeterministicWorkflowStepFinalRecoveryAuthority;
  artifacts: DurableArtifactLineageResolver;
  projects: PostgresProjectStore;
  runs: ExecutionRunRegistry;
  now: () => number;
}>;

/**
 * AE-4c.2 composition with #548 resource admission. Policy and route selection
 * remain outside composition; this factory wires one AEE execution path and a
 * fail-closed Core-owned resource guard around it.
 */
export function createProductionBoundedAgentCompatibility(input: ProductionBoundedAgentCompatibilityInput) {
  const legacy = new BoundedAgentDeterministicWorkflowService({
    continuations: input.continuations,
    tickets: input.tickets,
    workflowTickets: input.workflowTickets,
    orthogonal: input.orthogonal,
    resize: input.resize,
    finalRecovery: input.finalRecovery,
    artifacts: input.artifacts,
    projects: input.projects,
    runs: input.runs,
    now: input.now,
  });
  const plans = new PostgresAeeAdmittedPlanStore(input.pool);
  const serial = new AeeSerialAdmittedGraphDriverV1({
    plans,
    continuations: input.continuations,
    tickets: input.tickets,
    workflowTickets: input.workflowTickets,
    orthogonal: input.orthogonal,
    resize: input.resize,
    finalRecovery: input.finalRecovery,
    artifacts: input.artifacts,
    projects: input.projects,
    runs: input.runs,
    now: input.now,
  });
  const aee = new AeeResourceBudgetedSerialDriverV1({
    delegate: serial,
    plans,
    continuations: input.continuations,
  });
  const admission = new PostgresBoundedAgentCompatibilityAdmissionLock(input.pool);
  return new BoundedAgentAeeCompatibilityFacade({
    continuations: input.continuations,
    plans,
    aee,
    legacy,
    projects: input.projects,
    artifacts: input.artifacts,
    admission,
  });
}
