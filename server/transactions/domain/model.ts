/** Reservation state machine owned by the transaction domain. */
export type ReservationStatus = 'reserved' | 'committed' | 'released';
export type ProviderState = 'pending' | 'dispatched' | 'success' | 'failed' | 'unknown';
export type JournalSource = 'reservation_service' | 'transaction_service' | 'recovery_service' | 'manual_resolution';
export type JournalEvent = 'reservation_created' | 'provider_dispatched' | 'provider_succeeded' | 'provider_failed' | 'reservation_committed' | 'reservation_released' | 'recovery_deferred' | 'manual_resolution_recorded';

export const RESERVATION_TTL_MS = 15 * 60 * 1000;

export type Reservation = Readonly<{
  id: string; correlation_id: string; idempotency_key: string; request_fingerprint: string;
  owner_id: string; project_id: string; operation_id: string; operation_version: number;
  provider: string; amount: number; status: ReservationStatus; provider_state: ProviderState;
  created_at: string; expires_at: string;
}>;

export type JournalEntry = Readonly<{
  id: string; reservation_id: string; correlation_id: string; sequence: number;
  event: JournalEvent; source: JournalSource; occurred_at: string;
  metadata: Readonly<Record<string, unknown>>;
}>;

export type TransitionDecision = 'apply' | 'replay' | 'conflict';

/** Same terminal command replays; the opposite terminal command conflicts. */
export function decideTransition(current: ReservationStatus, requested: 'committed' | 'released'): TransitionDecision {
  if (current === 'reserved') return 'apply';
  return current === requested ? 'replay' : 'conflict';
}

export function isAbandoned(reservation: Reservation, now: Date): boolean {
  const expiry = Date.parse(reservation.expires_at);
  return reservation.status === 'reserved' && Number.isFinite(expiry) && expiry <= now.getTime();
}
