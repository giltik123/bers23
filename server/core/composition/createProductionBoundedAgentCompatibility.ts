import type { Pool } from 'pg';
import { AeeSerialAdmittedGraphDriverV1 } from '../agentic/AeeSerialAdmittedGraphDriverV1.ts';
import { AeeWorkflowTicketResourceAdmissionV1 } from '../agentic/AeeWorkflowTicketResourceAdmissionV1.ts';
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
 * AE-4c.2 composition with #548 resource admission. The existing AE-4b driver
 * remains the sole AEE execution coordinator. #548 is installed at the shared
 * server-only workflow ticket issuance seam, immediately before a genuinely-new
 * local ticket can be minted; it owns no execution state and does not re-admit
 * already durable tickets/results.
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
  input.workflowTickets.installIssueGuard(new AeeWorkflowTicketResourceAdmissionV1({
    continuations: input.continuations,
    plans,
  }));
  const aee = new AeeSerialAdmittedGraphDriverV1({
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
