import type {
  AnyLocalExecutionTicket,
  LocalExecutionExecutorBinding,
  LocalExecutionModelBinding,
  LocalExecutionTicket,
  LocalExecutionTicketIssueRequest,
  LocalExecutionTicketIssueRequestV2,
  LocalExecutionTicketIssuerPort,
  LocalExecutionTicketV2,
  LocalExecutionTicketV2IssuerPort,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import type { LocalExecutionLedger, LocalExecutionLedgerV2 } from './LocalExecutionLedger.ts';

export type LocalExecutionTicketAuthorityDependencies = Readonly<{
  now: () => number;
  id: () => string;
  nonce: () => string;
  ttlMs: number;
  modelsByCapability: Readonly<Record<string, readonly LocalExecutionModelBinding[]>>;
  /** V2 policy is explicit and does not implicitly inherit the v1 model catalog. */
  executorsByCapability?: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>>;
}>;

type TicketLedger = Pick<LocalExecutionLedger, 'issue'> & Pick<LocalExecutionLedgerV2, 'issueV2'>;

export class LocalExecutionModelUnavailableError extends Error {
  readonly status = 422;
  readonly code = 'local_model_unavailable';
  constructor(capability: string) { super(`No approved local models for capability ${capability}; production approval is required`); this.name = 'LocalExecutionModelUnavailableError'; }
}
export class LocalExecutionExecutorUnavailableError extends Error {
  readonly status = 422;
  readonly code = 'local_executor_unavailable';
  constructor(capability: string) { super(`No approved local executors for capability ${capability}`); this.name = 'LocalExecutionExecutorUnavailableError'; }
}

/** Core authority for minting narrow, short-lived, zero-cloud-cost local execution tickets. */
export class LocalExecutionTicketAuthority implements LocalExecutionTicketIssuerPort, LocalExecutionTicketV2IssuerPort {
  private readonly ledger: TicketLedger;
  private readonly dependencies: LocalExecutionTicketAuthorityDependencies;

  constructor(ledger: TicketLedger, dependencies: LocalExecutionTicketAuthorityDependencies) {
    if (!Number.isFinite(dependencies.ttlMs) || dependencies.ttlMs <= 0) throw new Error('Local execution ticket TTL must be positive');
    this.ledger = ledger; this.dependencies = dependencies;
  }

  issue(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket | Promise<LocalExecutionTicket>;
  issue(input: LocalExecutionTicketIssueRequestV2): LocalExecutionTicketV2 | Promise<LocalExecutionTicketV2>;
  issue(input: LocalExecutionTicketIssueRequest | LocalExecutionTicketIssueRequestV2): AnyLocalExecutionTicket | Promise<AnyLocalExecutionTicket> {
    return 'ticketVersion' in input && input.ticketVersion === '2' ? this.issueV2(input) : this.issueV1(input);
  }

  private issueV1(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket | Promise<LocalExecutionTicket> {
    const allowedModels = this.dependencies.modelsByCapability[input.operation.capability];
    if (!allowedModels?.length) throw new LocalExecutionModelUnavailableError(input.operation.capability);
    const issuedAt = this.dependencies.now();
    return this.ledger.issue({ ticketId:this.dependencies.id(), version:'1', issuer:'CORE', requestId:input.requestId, workflowId:input.workflowId, stepId:input.stepId, operation:input.operation, scope:input.scope, inputs:input.inputs, expectedOutputs:input.expectedOutputs, allowedModels, policy:input.policy, idempotencyKey:input.idempotencyKey, nonce:this.dependencies.nonce(), issuedAt, expiresAt:issuedAt+this.dependencies.ttlMs, cost:{paidCloudCredits:0,providerCalls:0} });
  }

  private issueV2(input: LocalExecutionTicketIssueRequestV2): LocalExecutionTicketV2 | Promise<LocalExecutionTicketV2> {
    const allowedExecutors = this.dependencies.executorsByCapability?.[input.operation.capability];
    if (!allowedExecutors?.length) throw new LocalExecutionExecutorUnavailableError(input.operation.capability);
    const issuedAt = this.dependencies.now();
    return this.ledger.issueV2({ ticketId:this.dependencies.id(), version:'2', issuer:'CORE', requestId:input.requestId, workflowId:input.workflowId, stepId:input.stepId, operation:input.operation, scope:input.scope, inputs:input.inputs, expectedOutputs:input.expectedOutputs, allowedExecutors, policy:input.policy, idempotencyKey:input.idempotencyKey, nonce:this.dependencies.nonce(), issuedAt, expiresAt:issuedAt+this.dependencies.ttlMs, cost:{paidCloudCredits:0,providerCalls:0} });
  }
}
