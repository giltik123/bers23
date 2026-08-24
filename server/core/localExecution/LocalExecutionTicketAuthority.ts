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
import type { LocalExecutionLedger } from './LocalExecutionLedger.ts';

export type LocalExecutionTicketAuthorityDependencies = Readonly<{
  now: () => number;
  id: () => string;
  nonce: () => string;
  ttlMs: number;
  modelsByCapability: Readonly<Record<string, readonly LocalExecutionModelBinding[]>>;
  /** V2 policy is explicit and does not implicitly inherit the v1 model catalog. */
  executorsByCapability?: Readonly<Record<string, readonly LocalExecutionExecutorBinding[]>>;
}>;

export class LocalExecutionModelUnavailableError extends Error {
  readonly status = 422;
  readonly code = 'local_model_unavailable';

  constructor(capability: string) {
    super(`No approved local models for capability ${capability}; production approval is required`);
    this.name = 'LocalExecutionModelUnavailableError';
  }
}

export class LocalExecutionExecutorUnavailableError extends Error {
  readonly status = 422;
  readonly code = 'local_executor_unavailable';

  constructor(capability: string) {
    super(`No approved local executors for capability ${capability}`);
    this.name = 'LocalExecutionExecutorUnavailableError';
  }
}

/** Core authority for minting narrow, short-lived, zero-cloud-cost local execution tickets. */
export class LocalExecutionTicketAuthority implements LocalExecutionTicketIssuerPort, LocalExecutionTicketV2IssuerPort {
  private readonly ledger: Pick<LocalExecutionLedger, 'issue'>;
  private readonly dependencies: LocalExecutionTicketAuthorityDependencies;

  constructor(ledger: Pick<LocalExecutionLedger, 'issue'>, dependencies: LocalExecutionTicketAuthorityDependencies) {
    if (!Number.isFinite(dependencies.ttlMs) || dependencies.ttlMs <= 0) throw new Error('Local execution ticket TTL must be positive');
    this.ledger = ledger;
    this.dependencies = dependencies;
  }

  issue(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket | Promise<LocalExecutionTicket>;
  issue(input: LocalExecutionTicketIssueRequestV2): LocalExecutionTicketV2 | Promise<LocalExecutionTicketV2>;
  issue(input: LocalExecutionTicketIssueRequest | LocalExecutionTicketIssueRequestV2): AnyLocalExecutionTicket | Promise<AnyLocalExecutionTicket> {
    if ('ticketVersion' in input && input.ticketVersion === '2') return this.issueV2(input);
    return this.issueV1(input);
  }

  private issueV1(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket | Promise<LocalExecutionTicket> {
    const allowedModels = this.dependencies.modelsByCapability[input.operation.capability];
    if (!allowedModels?.length) throw new LocalExecutionModelUnavailableError(input.operation.capability);
    const issuedAt = this.dependencies.now();
    const ticket: LocalExecutionTicket = {
      ticketId: this.dependencies.id(),
      version: '1',
      issuer: 'CORE',
      requestId: input.requestId,
      workflowId: input.workflowId,
      stepId: input.stepId,
      operation: input.operation,
      scope: input.scope,
      inputs: input.inputs,
      expectedOutputs: input.expectedOutputs,
      allowedModels,
      policy: input.policy,
      idempotencyKey: input.idempotencyKey,
      nonce: this.dependencies.nonce(),
      issuedAt,
      expiresAt: issuedAt + this.dependencies.ttlMs,
      cost: { paidCloudCredits: 0, providerCalls: 0 },
    };
    const persisted = this.ledger.issue(ticket);
    return isPromise(persisted) ? persisted.then(assertV1) : assertV1(persisted);
  }

  private issueV2(input: LocalExecutionTicketIssueRequestV2): LocalExecutionTicketV2 | Promise<LocalExecutionTicketV2> {
    const allowedExecutors = this.dependencies.executorsByCapability?.[input.operation.capability];
    if (!allowedExecutors?.length) throw new LocalExecutionExecutorUnavailableError(input.operation.capability);
    const issuedAt = this.dependencies.now();
    const ticket: LocalExecutionTicketV2 = {
      ticketId: this.dependencies.id(),
      version: '2',
      issuer: 'CORE',
      requestId: input.requestId,
      workflowId: input.workflowId,
      stepId: input.stepId,
      operation: input.operation,
      scope: input.scope,
      inputs: input.inputs,
      expectedOutputs: input.expectedOutputs,
      allowedExecutors,
      policy: input.policy,
      idempotencyKey: input.idempotencyKey,
      nonce: this.dependencies.nonce(),
      issuedAt,
      expiresAt: issuedAt + this.dependencies.ttlMs,
      cost: { paidCloudCredits: 0, providerCalls: 0 },
    };
    const persisted = this.ledger.issue(ticket);
    return isPromise(persisted) ? persisted.then(assertV2) : assertV2(persisted);
  }
}

function assertV1(ticket: AnyLocalExecutionTicket): LocalExecutionTicket {
  if (ticket.version !== '1') throw new Error('Local execution ledger returned a different ticket version for v1 issuance');
  return ticket;
}
function assertV2(ticket: AnyLocalExecutionTicket): LocalExecutionTicketV2 {
  if (ticket.version !== '2') throw new Error('Local execution ledger returned a different ticket version for v2 issuance');
  return ticket;
}
function isPromise<T>(value: T | Promise<T>): value is Promise<T> { return !!value && typeof (value as Promise<T>).then === 'function'; }
