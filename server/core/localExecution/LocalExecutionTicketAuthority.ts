import type { LocalExecutionModelBinding, LocalExecutionTicket, LocalExecutionTicketIssueRequest, LocalExecutionTicketIssuerPort } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { LocalExecutionLedger } from './LocalExecutionLedger.ts';

export type LocalExecutionTicketAuthorityDependencies = Readonly<{
  now: () => number;
  id: () => string;
  nonce: () => string;
  ttlMs: number;
  modelsByCapability: Readonly<Record<string, readonly LocalExecutionModelBinding[]>>;
}>;

export class LocalExecutionModelUnavailableError extends Error {
  readonly status = 422;
  readonly code = 'local_model_unavailable';

  constructor(capability: string) {
    super(`No approved local models for capability ${capability}; production approval is required`);
    this.name = 'LocalExecutionModelUnavailableError';
  }
}

/** Core authority for minting narrow, short-lived, zero-cloud-cost local execution tickets. */
export class LocalExecutionTicketAuthority implements LocalExecutionTicketIssuerPort {
  private readonly ledger: Pick<LocalExecutionLedger, 'issue'>;
  private readonly dependencies: LocalExecutionTicketAuthorityDependencies;

  constructor(ledger: Pick<LocalExecutionLedger, 'issue'>, dependencies: LocalExecutionTicketAuthorityDependencies) {
    if (!Number.isFinite(dependencies.ttlMs) || dependencies.ttlMs <= 0) throw new Error('Local execution ticket TTL must be positive');
    this.ledger = ledger;
    this.dependencies = dependencies;
  }

  issue(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket | Promise<LocalExecutionTicket> {
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
    return this.ledger.issue(ticket);
  }
}
