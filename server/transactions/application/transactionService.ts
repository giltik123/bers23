import { RESERVATION_TTL_MS, type Reservation } from '../domain/model.ts';
import type { ReserveResult, ServerClock, TransactionStore } from './ports.ts';

export class TransactionError extends Error {
  readonly code: string; readonly status: number;
  constructor(code: string, message: string, status: number) { super(message); this.name = 'TransactionError'; this.code = code; this.status = status; }
}

/** Narrow service: applies balance transitions and records journal facts only. */
export class TransactionService {
  private readonly store: TransactionStore; private readonly clock: ServerClock;
  constructor(store: TransactionStore, clock: ServerClock) { this.store = store; this.clock = clock; }

  async reserve(input: Omit<Reservation, 'id' | 'status' | 'provider_state' | 'created_at' | 'expires_at'>): Promise<Extract<ReserveResult, { kind: 'created' | 'replayed' }>> {
    const now = this.clock.now();
    const result = await this.store.reserve({ ...input, expires_at: new Date(now.getTime() + RESERVATION_TTL_MS).toISOString() }, now.toISOString());
    if (result.kind === 'conflict') throw new TransactionError('idempotency_conflict', 'Idempotency key conflict', 409);
    if (result.kind === 'insufficient_credits') throw new TransactionError('insufficient_credits', 'Insufficient credits', 403);
    return result;
  }

  async commit(id: string, ownerId: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution' = 'transaction_service'): Promise<Reservation> {
    return this.finish('commit', id, ownerId, '', source);
  }

  async release(id: string, ownerId: string, reason: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution' = 'transaction_service'): Promise<Reservation> {
    return this.finish('release', id, ownerId, reason, source);
  }

  private async finish(kind: 'commit' | 'release', id: string, ownerId: string, reason: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution'): Promise<Reservation> {
    const at = this.clock.now().toISOString();
    const result = kind === 'commit' ? await this.store.commit(id, ownerId, at, source) : await this.store.release(id, ownerId, at, reason, source);
    if (result.kind === 'not_found') throw new TransactionError('reservation_not_found', 'Reservation not found', 404);
    if (result.kind === 'conflict') throw new TransactionError('transaction_conflict', 'Terminal state conflict', 409);
    return result.reservation;
  }
}
