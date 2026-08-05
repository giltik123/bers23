import type { Reservation } from '../domain/model.ts';
import type { ServerClock, TransactionStore } from './ports.ts';
import {
  ReservationGateway,
  type ReservationCommand,
  type TrustedReservationContext,
} from './reservationGateway.ts';
import { TransactionService } from './transactionService.ts';
import { NOOP_TRANSACTION_TELEMETRY, type TransactionTelemetry } from './telemetry.ts';

export interface BillableProvider<Result> {
  execute(reservation: Reservation): Promise<Result>;
}

export type BillableOperationResult<Result> =
  | Readonly<{ kind: 'completed'; reservation: Reservation; value: Result }>
  | Readonly<{ kind: 'provider_outcome_pending'; reservation: Reservation }>
  | Readonly<{ kind: 'replayed'; reservation: Reservation }>;

/**
 * Owns the 4C.2 reserve -> provider -> commit/release chain.
 * A replay never calls the provider again. Ambiguous provider failures remain
 * reserved for RecoveryService instead of being incorrectly released.
 */
export class BillableOperationService {
  private readonly reservations: ReservationGateway;
  private readonly store: TransactionStore;
  private readonly transactions: TransactionService;
  private readonly clock: ServerClock;
  private readonly telemetry: TransactionTelemetry;

  constructor(
    reservations: ReservationGateway,
    store: TransactionStore,
    transactions: TransactionService,
    clock: ServerClock,
    telemetry: TransactionTelemetry = NOOP_TRANSACTION_TELEMETRY,
  ) {
    this.reservations = reservations;
    this.store = store;
    this.transactions = transactions;
    this.clock = clock;
    this.telemetry = telemetry;
  }

  async execute<Result>(
    context: TrustedReservationContext,
    command: ReservationCommand,
    provider: BillableProvider<Result>,
  ): Promise<BillableOperationResult<Result>> {
    const reservationResult = await this.reservations.reserve(context, command);
    const reservation = reservationResult.reservation;
    if (reservationResult.kind === 'replayed') {
      this.record(reservation, reservation.status === 'reserved' ? 'provider_outcome_pending' : 'reservation_replayed');
      return Object.freeze({
        kind: reservation.status === 'reserved' ? 'provider_outcome_pending' : 'replayed',
        reservation,
      });
    }

    this.record(reservation, 'reservation_created');
    await this.store.appendProviderFact(reservation.id, 'provider_dispatched', this.clock.now().toISOString());
    this.record(reservation, 'provider_dispatched');

    let value: Result;
    try {
      value = await provider.execute(reservation);
    } catch (error) {
      if (error instanceof DefinitiveProviderFailure) {
        await this.store.appendProviderFact(reservation.id, 'provider_failed', this.clock.now().toISOString());
        await this.transactions.release(
          reservation.id,
          reservation.owner_id,
          error.reason,
          'transaction_service',
        );
        this.record(reservation, 'provider_failed', error.reason);
        this.record(reservation, 'reservation_released', error.reason);
        throw error;
      }

      await this.store.appendRecoveryDeferred(reservation.id, this.clock.now().toISOString());
      this.record(reservation, 'provider_outcome_pending');
      throw new ProviderOutcomePendingError(reservation, error);
    }

    await this.store.appendProviderFact(reservation.id, 'provider_succeeded', this.clock.now().toISOString());
    this.record(reservation, 'provider_succeeded');
    const committed = await this.transactions.commit(
      reservation.id,
      reservation.owner_id,
      'transaction_service',
    );
    this.record(committed, 'reservation_committed');
    return Object.freeze({ kind: 'completed', reservation: committed, value });
  }

  private record(reservation: Reservation, name: Parameters<TransactionTelemetry['record']>[0]['name'], outcome?: string): void {
    try {
      this.telemetry.record({ name, occurred_at: this.clock.now().toISOString(), correlation_id: reservation.correlation_id,
        reservation_id: reservation.id, operation_id: reservation.operation_id, provider: reservation.provider, outcome });
    } catch {
      // Telemetry is deliberately non-authoritative and cannot change money state.
    }
  }
}

/** A provider explicitly confirmed that no billable work succeeded. */
export class DefinitiveProviderFailure extends Error {
  readonly code = 'provider_failed';
  readonly reason: string;

  constructor(reason: string, options?: ErrorOptions) {
    super('Provider operation failed', options);
    this.name = 'DefinitiveProviderFailure';
    if (!/^[a-z0-9_:-]{1,64}$/.test(reason)) throw new Error('invalid provider failure reason');
    this.reason = reason;
  }
}

/** The provider may have succeeded; RecoveryService must determine the outcome. */
export class ProviderOutcomePendingError extends Error {
  readonly code = 'provider_outcome_pending';
  readonly reservation_id: string;
  readonly correlation_id: string;

  constructor(reservation: Reservation, cause: unknown) {
    super('Provider outcome is pending recovery', { cause });
    this.name = 'ProviderOutcomePendingError';
    this.reservation_id = reservation.id;
    this.correlation_id = reservation.correlation_id;
  }
}
