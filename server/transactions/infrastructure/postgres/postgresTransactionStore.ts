import type { JournalEntry, JournalEvent, JournalSource, Reservation } from '../../domain/model.ts';
import type { ReserveInput, ReserveResult, TransactionStore, TransitionResult } from '../../application/ports.ts';
import type { IdGenerator, SqlTransaction, SqlTransactionRunner } from './sql.ts';

type ReservationRow = ReserveInput & Pick<Reservation, 'id' | 'status' | 'provider_state'> & { created_at: string | Date };
type JournalRow = Omit<JournalEntry, 'metadata'> & { metadata: Record<string, unknown> };
type WalletRow = { balance: string | number; reserved: string | number; lifetime_spent: string | number; total_credited: string | number };

/** PostgreSQL adapter; business decisions remain in TypeScript. */
export class PostgresTransactionStore implements TransactionStore {
  private readonly runner: SqlTransactionRunner;
  private readonly ids: IdGenerator;
  constructor(runner: SqlTransactionRunner, ids: IdGenerator) { this.runner = runner; this.ids = ids; }

  reserve(input: ReserveInput, occurredAt: string): Promise<ReserveResult> {
    return this.runner.transaction('read committed', async (tx) => {
      const databaseNow = await this.databaseNow(tx);
      const ttlMilliseconds = Date.parse(input.expires_at) - Date.parse(occurredAt);
      if (!Number.isFinite(ttlMilliseconds) || ttlMilliseconds <= 0) throw new Error('invalid reservation TTL');
      const wallet = await this.lockWallet(tx, input.owner_id);
      const existing = await tx.query<ReservationRow>(
        'SELECT * FROM credit_reservations WHERE owner_id = $1 AND idempotency_key = $2 FOR UPDATE',
        [input.owner_id, input.idempotency_key],
      );
      if (existing.rowCount) {
        const reservation = mapReservation(existing.rows[0]);
        return reservation.request_fingerprint === input.request_fingerprint
          ? { kind: 'replayed', reservation } : { kind: 'conflict' };
      }
      if (wallet.balance - wallet.reserved < input.amount) return { kind: 'insufficient_credits' };

      const id = this.ids.next();
      await tx.query(
        `INSERT INTO credit_reservations
          (id, correlation_id, idempotency_key, request_fingerprint, owner_id, project_id,
           operation_id, operation_version, provider, amount, status, created_at, expires_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'reserved',$11,$11::timestamptz + $12 * interval '1 millisecond')
         RETURNING *`,
        [id, input.correlation_id, input.idempotency_key, input.request_fingerprint,
          input.owner_id, input.project_id, input.operation_id, input.operation_version,
          input.provider, input.amount, databaseNow, ttlMilliseconds],
      );
      await tx.query(
        'UPDATE credit_wallets SET reserved = reserved + $1, version = version + 1, updated_at = $2 WHERE owner_id = $3',
        [input.amount, databaseNow, input.owner_id],
      );
      await tx.query('INSERT INTO reservation_journal_sequences (reservation_id, next_sequence) VALUES ($1, 2)', [id]);
      await this.insertJournal(tx, { reservation_id: id, correlation_id: input.correlation_id,
        sequence: 1, event: 'reservation_created', source: 'reservation_service', occurred_at: databaseNow, metadata: {} });
      return { kind: 'created', reservation: Object.freeze({ ...input, id, status: 'reserved', provider_state: 'pending',
        created_at: databaseNow, expires_at: new Date(Date.parse(databaseNow) + ttlMilliseconds).toISOString() }) };
    });
  }

  commit(id: string, ownerId: string, at: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution'): Promise<TransitionResult> {
    return this.terminal('committed', id, ownerId, at, source, {});
  }

  release(id: string, ownerId: string, at: string, reason: string, source: 'transaction_service' | 'recovery_service' | 'manual_resolution'): Promise<TransitionResult> {
    return this.terminal('released', id, ownerId, at, source, { reason });
  }

  appendProviderFact(id: string, event: 'provider_dispatched' | 'provider_succeeded' | 'provider_failed', at: string): Promise<JournalEntry> {
    return this.runner.transaction('read committed', async (tx) => {
      at = await this.databaseNow(tx);
      const result = await tx.query<ReservationRow>('SELECT * FROM credit_reservations WHERE id = $1 FOR UPDATE', [id]);
      if (!result.rowCount) throw new Error('reservation not found');
      const row = result.rows[0];
      const target = event === 'provider_dispatched' ? 'dispatched' : event === 'provider_succeeded' ? 'success' : 'failed';
      if (row.provider_state === target) return this.findJournal(tx, id, event);
      if (row.status !== 'reserved') throw new Error('terminal reservation is immutable');
      if ((target === 'dispatched' && row.provider_state !== 'pending') ||
        (target !== 'dispatched' && row.provider_state !== 'dispatched')) throw new Error('journal causality violation');
      await tx.query('UPDATE credit_reservations SET provider_state = $1 WHERE id = $2', [target, id]);
      return this.appendJournal(tx, row, event, 'transaction_service', at, {});
    });
  }

  appendRecoveryDeferred(id: string, at: string): Promise<JournalEntry> {
    return this.runner.transaction('read committed', async (tx) => {
      at = await this.databaseNow(tx);
      const result = await tx.query<ReservationRow>('SELECT * FROM credit_reservations WHERE id = $1 FOR UPDATE', [id]);
      if (!result.rowCount) throw new Error('reservation not found');
      if (result.rows[0].status !== 'reserved') throw new Error('terminal reservation is immutable');
      return this.appendJournal(tx, result.rows[0], 'recovery_deferred', 'recovery_service', at, {});
    });
  }

  async claimAbandoned(now: string, limit: number, leaseOwner: string, leaseUntil: string): Promise<readonly Reservation[]> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('invalid recovery batch limit');
    const leaseMilliseconds = Date.parse(leaseUntil) - Date.parse(now);
    if (!Number.isFinite(leaseMilliseconds) || leaseMilliseconds < 1_000 || leaseMilliseconds > 300_000) {
      throw new Error('invalid recovery lease duration');
    }
    return this.runner.transaction('read committed', async (tx) => {
      const result = await tx.query<ReservationRow>(
        `WITH candidates AS (
           SELECT id FROM credit_reservations
           WHERE status = 'reserved' AND expires_at <= CURRENT_TIMESTAMP
             AND (lease_until IS NULL OR lease_until <= CURRENT_TIMESTAMP)
           ORDER BY expires_at ASC
           FOR UPDATE SKIP LOCKED LIMIT $1
         )
         UPDATE credit_reservations AS reservation
         SET lease_owner = $2, lease_until = CURRENT_TIMESTAMP + $3 * interval '1 millisecond', lease_version = lease_version + 1
         FROM candidates WHERE reservation.id = candidates.id
         RETURNING reservation.*`, [limit, leaseOwner, leaseMilliseconds],
      );
      return Object.freeze(result.rows.map(mapReservation));
    });
  }

  journal(id: string): Promise<readonly JournalEntry[]> {
    return this.runner.transaction('read committed', async (tx) => {
      const result = await tx.query<JournalRow>('SELECT * FROM transaction_journal WHERE reservation_id = $1 ORDER BY sequence ASC', [id]);
      return Object.freeze(result.rows.map(mapJournal));
    });
  }

  private terminal(requested: 'committed' | 'released', id: string, ownerId: string, at: string, source: JournalSource, metadata: Record<string, unknown>): Promise<TransitionResult> {
    return this.runner.transaction('read committed', async (tx) => {
      at = await this.databaseNow(tx);
      await this.lockWallet(tx, ownerId); // Global order: Wallet -> Reservation -> Sequence -> Journal.
      const result = await tx.query<ReservationRow & { provider_state: string }>('SELECT * FROM credit_reservations WHERE id = $1 AND owner_id = $2 FOR UPDATE', [id, ownerId]);
      if (!result.rowCount) return { kind: 'not_found' };
      const row = result.rows[0]; const current = mapReservation(row);
      const event = requested === 'committed' ? 'reservation_committed' : 'reservation_released';
      if (current.status === requested) return { kind: 'replayed', reservation: current, journal: await this.findJournal(tx, id, event) };
      if (current.status !== 'reserved') return { kind: 'conflict' };
      if (requested === 'committed' && row.provider_state !== 'success') throw new Error('commit requires provider success');

      if (requested === 'committed') {
        await tx.query(
          `UPDATE credit_wallets SET reserved = reserved - $1, balance = balance - $1,
           lifetime_spent = lifetime_spent + $1, version = version + 1, updated_at = $2
           WHERE owner_id = $3`, [current.amount, at, ownerId],
        );
      } else {
        await tx.query('UPDATE credit_wallets SET reserved = reserved - $1, version = version + 1, updated_at = $2 WHERE owner_id = $3', [current.amount, at, ownerId]);
      }
      const timestampColumn = requested === 'committed' ? 'committed_at' : 'released_at';
      await tx.query(`UPDATE credit_reservations SET status = $1, ${timestampColumn} = $2 WHERE id = $3`, [requested, at, id]);
      const reservation = Object.freeze({ ...current, status: requested });
      return { kind: 'applied', reservation, journal: await this.appendJournal(tx, row, event, source, at, metadata) };
    });
  }

  private async databaseNow(tx: SqlTransaction): Promise<string> {
    const result = await tx.query<{ now: string | Date }>('SELECT CURRENT_TIMESTAMP AS now');
    if (!result.rowCount) throw new Error('database clock unavailable');
    return iso(result.rows[0].now);
  }

  private async lockWallet(tx: SqlTransaction, ownerId: string): Promise<{ balance: number; reserved: number }> {
    const result = await tx.query<WalletRow>('SELECT balance, reserved, lifetime_spent, total_credited FROM credit_wallets WHERE owner_id = $1 FOR UPDATE', [ownerId]);
    if (!result.rowCount) throw new Error('wallet not found');
    return { balance: Number(result.rows[0].balance), reserved: Number(result.rows[0].reserved) };
  }

  private async appendJournal(tx: SqlTransaction, reservation: Pick<ReservationRow, 'id' | 'correlation_id'>, event: JournalEvent, source: JournalSource, at: string, metadata: Record<string, unknown>): Promise<JournalEntry> {
    const sequence = await tx.query<{ sequence: string | number }>(
      'UPDATE reservation_journal_sequences SET next_sequence = next_sequence + 1 WHERE reservation_id = $1 RETURNING next_sequence - 1 AS sequence', [reservation.id],
    );
    if (!sequence.rowCount) throw new Error('journal sequence missing');
    return this.insertJournal(tx, { reservation_id: reservation.id, correlation_id: reservation.correlation_id,
      sequence: Number(sequence.rows[0].sequence), event, source, occurred_at: at, metadata });
  }

  private async insertJournal(tx: SqlTransaction, entry: Omit<JournalEntry, 'id'>): Promise<JournalEntry> {
    const value = Object.freeze({ ...entry, id: this.ids.next(), metadata: Object.freeze({ ...entry.metadata }) });
    await tx.query(
      `INSERT INTO transaction_journal
       (id, reservation_id, correlation_id, sequence, event, source, occurred_at, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
      [value.id, value.reservation_id, value.correlation_id, value.sequence, value.event,
        value.source, value.occurred_at, JSON.stringify(value.metadata)],
    );
    return value;
  }

  private async findJournal(tx: SqlTransaction, id: string, event: JournalEvent): Promise<JournalEntry> {
    const result = await tx.query<JournalRow>(
      'SELECT * FROM transaction_journal WHERE reservation_id = $1 AND event = $2 ORDER BY sequence ASC LIMIT 1', [id, event],
    );
    if (!result.rowCount) throw new Error('terminal journal fact missing');
    return mapJournal(result.rows[0]);
  }
}

function mapReservation(row: ReservationRow): Reservation {
  return Object.freeze({ ...row, amount: Number(row.amount), operation_version: Number(row.operation_version),
    created_at: iso(row.created_at), expires_at: iso(row.expires_at) });
}
function mapJournal(row: JournalRow): JournalEntry {
  return Object.freeze({ ...row, sequence: Number(row.sequence), occurred_at: iso(row.occurred_at), metadata: Object.freeze({ ...row.metadata }) });
}
function iso(value: string | Date): string { return value instanceof Date ? value.toISOString() : new Date(value).toISOString(); }
