import { decideTransition, isAbandoned, type JournalEntry, type JournalEvent, type JournalSource, type Reservation } from '../../domain/model.ts';
import type { ReserveInput, ReserveResult, TransactionStore, TransitionResult } from '../../application/ports.ts';

type Wallet = { balance: number; reserved: number; spent: number };

/** Executable atomic adapter for tests/local use; never a production persistence substitute. */
export class InMemoryTransactionStore implements TransactionStore {
  private readonly reservations = new Map<string, Reservation>();
  private readonly idempotency = new Map<string, string>();
  private readonly entries = new Map<string, JournalEntry[]>();
  private readonly wallets = new Map<string, Wallet>();
  private nextId = 1;
  private readonly leases = new Map<string, { owner: string; until: string }>();

  setWallet(ownerId: string, balance: number): void { this.wallets.set(ownerId, { balance, reserved: 0, spent: 0 }); }
  getWallet(ownerId: string): Readonly<Wallet> | null { const value = this.wallets.get(ownerId); return value ? { ...value } : null; }

  async reserve(input: ReserveInput, occurredAt: string): Promise<ReserveResult> {
    const key = `${input.owner_id}:${input.idempotency_key}`;
    const existingId = this.idempotency.get(key);
    if (existingId) {
      const existing = this.reservations.get(existingId)!;
      return existing.request_fingerprint === input.request_fingerprint
        ? { kind: 'replayed', reservation: existing } : { kind: 'conflict' };
    }
    const wallet = this.wallets.get(input.owner_id);
    if (!wallet || wallet.balance - wallet.reserved < input.amount) return { kind: 'insufficient_credits' };
    const reservation = Object.freeze({ ...input, id: `reservation-${this.nextId++}`, status: 'reserved' as const, created_at: occurredAt });
    wallet.reserved += input.amount;
    this.reservations.set(reservation.id, reservation);
    this.idempotency.set(key, reservation.id);
    this.append(reservation, 'reservation_created', 'reservation_service', occurredAt, {});
    return { kind: 'created', reservation };
  }

  commit(id: string, ownerId: string, at: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution'): Promise<TransitionResult> {
    return Promise.resolve(this.transition(id, ownerId, 'committed', at, source, {}));
  }

  release(id: string, ownerId: string, at: string, reason: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution'): Promise<TransitionResult> {
    return Promise.resolve(this.transition(id, ownerId, 'released', at, source, { reason }));
  }

  async appendProviderFact(id: string, event: 'provider_dispatched' | 'provider_succeeded' | 'provider_failed', at: string): Promise<JournalEntry> {
    const reservation = this.reservations.get(id); if (!reservation) throw new Error('reservation not found');
    const entries = this.entries.get(id) ?? [];
    const duplicate = entries.find((entry) => entry.event === event); if (duplicate) return duplicate;
    const hasDispatch = entries.some((entry) => entry.event === 'provider_dispatched');
    const hasResult = entries.some((entry) => entry.event === 'provider_succeeded' || entry.event === 'provider_failed');
    if ((event === 'provider_dispatched' && entries.at(-1)?.event !== 'reservation_created') ||
      (event !== 'provider_dispatched' && (!hasDispatch || hasResult))) throw new Error('journal causality violation');
    return this.append(reservation, event, 'transaction_service', at, {});
  }

  async appendRecoveryDeferred(id: string, at: string): Promise<JournalEntry> {
    const reservation = this.reservations.get(id); if (!reservation) throw new Error('reservation not found');
    return this.append(reservation, 'recovery_deferred', 'recovery_service', at, {});
  }

  async claimAbandoned(now: string, limit: number, leaseOwner: string, leaseUntil: string): Promise<readonly Reservation[]> {
    const date = new Date(now);
    const claimed = [...this.reservations.values()].filter((reservation) => {
      const lease = this.leases.get(reservation.id);
      return isAbandoned(reservation, date) && (!lease || lease.until <= now);
    }).slice(0, limit);
    for (const reservation of claimed) this.leases.set(reservation.id, { owner: leaseOwner, until: leaseUntil });
    return claimed;
  }
  async journal(id: string): Promise<readonly JournalEntry[]> { return Object.freeze([...(this.entries.get(id) ?? [])]); }

  private transition(id: string, ownerId: string, requested: 'committed' | 'released', at: string, source: JournalSource, metadata: Record<string, unknown>): TransitionResult {
    const current = this.reservations.get(id); if (!current || current.owner_id !== ownerId) return { kind: 'not_found' };
    const decision = decideTransition(current.status, requested);
    const event = requested === 'committed' ? 'reservation_committed' : 'reservation_released';
    if (decision === 'conflict') return { kind: 'conflict' };
    if (decision === 'replay') return { kind: 'replayed', reservation: current, journal: this.entries.get(id)!.find((entry) => entry.event === event)! };
    const facts = this.entries.get(id) ?? [];
    if (requested === 'committed' && !facts.some((entry) => entry.event === 'provider_succeeded')) throw new Error('commit requires provider success');
    const wallet = this.wallets.get(ownerId); if (!wallet) throw new Error('wallet missing');
    wallet.reserved -= current.amount;
    if (requested === 'committed') { wallet.balance -= current.amount; wallet.spent += current.amount; }
    const updated = Object.freeze({ ...current, status: requested }); this.reservations.set(id, updated);
    return { kind: 'applied', reservation: updated, journal: this.append(updated, event, source, at, metadata) };
  }

  private append(reservation: Reservation, event: JournalEvent, source: JournalSource, at: string, metadata: Record<string, unknown>): JournalEntry {
    const list = this.entries.get(reservation.id) ?? [];
    const entry = Object.freeze({ id: `journal-${this.nextId++}`, reservation_id: reservation.id, correlation_id: reservation.correlation_id, sequence: list.length + 1, event, source, occurred_at: at, metadata: Object.freeze({ ...metadata }) });
    list.push(entry); this.entries.set(reservation.id, list); return entry;
  }
}
