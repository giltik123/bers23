import type { JournalEntry, Reservation } from '../domain/model.ts';

export interface ServerClock { now(): Date }

export type ReserveInput = Omit<Reservation, 'id' | 'status' | 'provider_state' | 'created_at'>;
export type ReserveResult =
  | { kind: 'created' | 'replayed'; reservation: Reservation }
  | { kind: 'conflict' }
  | { kind: 'insufficient_credits' };
export type TransitionResult =
  | { kind: 'applied' | 'replayed'; reservation: Reservation; journal: JournalEntry }
  | { kind: 'conflict' }
  | { kind: 'not_found' };

/** Atomic single-writer store. Sequential read/write implementations are invalid. */
export interface TransactionStore {
  reserve(input: ReserveInput, occurredAt: string): Promise<ReserveResult>;
  commit(reservationId: string, ownerId: string, occurredAt: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution'): Promise<TransitionResult>;
  release(reservationId: string, ownerId: string, occurredAt: string, reason: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution'): Promise<TransitionResult>;
  appendProviderFact(reservationId: string, event: 'provider_dispatched' | 'provider_succeeded' | 'provider_failed', occurredAt: string): Promise<JournalEntry>;
  appendRecoveryDeferred(reservationId: string, occurredAt: string): Promise<JournalEntry>;
  claimAbandoned(now: string, limit: number, leaseOwner: string, leaseUntil: string): Promise<readonly Reservation[]>;
  journal(reservationId: string): Promise<readonly JournalEntry[]>;
}

export type ProviderOutcome = 'succeeded' | 'failed' | 'not_dispatched' | 'unknown';
export interface ProviderRecoveryPort { resolve(reservation: Reservation): Promise<ProviderOutcome> }
