import type { LocalExecutionTicket, LocalExecutionTicketIssueRequest, LocalExecutionTicketIssuerPort } from '../../../src/platform/creative/canonical/localExecution.ts';
import { LocalExecutionAdmissionRegistry } from './LocalExecutionAdmission.ts';

export type LocalExecutionTicketAuthorityDependencies = Readonly<{
  now: () => number;
  id: () => string;
  nonce: () => string;
  ttlMs: number;
}>;

/** Core authority for minting narrow, short-lived, zero-cloud-cost local execution tickets. */
export class LocalExecutionTicketAuthority implements LocalExecutionTicketIssuerPort {
  constructor(
    private readonly registry: LocalExecutionAdmissionRegistry,
    private readonly dependencies: LocalExecutionTicketAuthorityDependencies,
  ) {
    if (!Number.isFinite(dependencies.ttlMs) || dependencies.ttlMs <= 0) throw new Error('Local execution ticket TTL must be positive');
  }

  issue(input: LocalExecutionTicketIssueRequest): LocalExecutionTicket {
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
      policy: input.policy,
      idempotencyKey: input.idempotencyKey,
      nonce: this.dependencies.nonce(),
      issuedAt,
      expiresAt: issuedAt + this.dependencies.ttlMs,
      cost: { paidCloudCredits: 0, providerCalls: 0 },
    };
    return this.registry.issue(ticket);
  }
}
