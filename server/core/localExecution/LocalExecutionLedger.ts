import type {
  LocalExecutionAdmissionDecision,
  LocalExecutionAdmissionDecisionV2,
  LocalExecutionTicket,
  LocalExecutionTicketV2,
} from '../../../src/platform/creative/canonical/localExecution.ts';
import type { Scope } from '../../../src/platform/creative/workflow-engine/types.ts';

export type MaybePromise<T> = T | Promise<T>;
export type LocalExecutionFinalizationStatus = 'SUCCESS' | 'FAILED' | 'UNKNOWN';
export type LocalExecutionFinalization = Readonly<{ status: LocalExecutionFinalizationStatus; finalizedAt?: string }>;

export type LocalExecutionClaimInput = Readonly<{
  ticketId: string;
  result: unknown;
  callerScope: Scope;
  now: number;
}>;

/** Existing v1 model-only ledger surface. */
export interface LocalExecutionLedger {
  issue(ticket: LocalExecutionTicket): MaybePromise<LocalExecutionTicket>;
  get(ticketId: string): MaybePromise<LocalExecutionTicket | undefined>;
  getByIdempotencyKey(scope: Scope, idempotencyKey: string): MaybePromise<LocalExecutionTicket | undefined>;
  getFinalization(ticketId: string): MaybePromise<LocalExecutionFinalization | undefined>;
  claim(input: LocalExecutionClaimInput): MaybePromise<LocalExecutionAdmissionDecision>;
  commit(ticketId: string, status: Exclude<LocalExecutionFinalizationStatus, 'UNKNOWN'>): Promise<void>;
  release(ticketId: string): Promise<void>;
}

/**
 * V2 executor ledger surface. Implementations may share the same storage and locks
 * with v1; the separate method names prevent old capability code from silently
 * consuming a future ticket schema.
 */
export interface LocalExecutionLedgerV2 {
  issueV2(ticket: LocalExecutionTicketV2): MaybePromise<LocalExecutionTicketV2>;
  getV2(ticketId: string): MaybePromise<LocalExecutionTicketV2 | undefined>;
  getByIdempotencyKeyV2(scope: Scope, idempotencyKey: string): MaybePromise<LocalExecutionTicketV2 | undefined>;
  getFinalization(ticketId: string): MaybePromise<LocalExecutionFinalization | undefined>;
  claimV2(input: LocalExecutionClaimInput): MaybePromise<LocalExecutionAdmissionDecisionV2>;
  commit(ticketId: string, status: Exclude<LocalExecutionFinalizationStatus, 'UNKNOWN'>): Promise<void>;
  release(ticketId: string): Promise<void>;
}
