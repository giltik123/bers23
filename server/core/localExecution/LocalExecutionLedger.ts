import type { LocalExecutionAdmissionDecision, LocalExecutionTicket } from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';

export type MaybePromise<T> = T | Promise<T>;

export type LocalExecutionClaimInput = Readonly<{
  ticketId: string;
  result: unknown;
  callerScope: Scope;
  now: number;
}>;

/**
 * Durable/server-side state boundary for ticket issuance, replay protection and finalization claims.
 * Implementations must not grant provider, Billing, Project or canonical Artifact authority.
 */
export interface LocalExecutionLedger {
  issue(ticket: LocalExecutionTicket): MaybePromise<LocalExecutionTicket>;
  get(ticketId: string): MaybePromise<LocalExecutionTicket | undefined>;
  getByIdempotencyKey(scope: Scope, idempotencyKey: string): MaybePromise<LocalExecutionTicket | undefined>;
  claim(input: LocalExecutionClaimInput): MaybePromise<LocalExecutionAdmissionDecision>;
  /** Terminal finalization owns a durable/leased resource and is therefore explicitly async. */
  commit(ticketId: string): Promise<void>;
  release(ticketId: string): Promise<void>;
}
