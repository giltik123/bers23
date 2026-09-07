import { randomUUID } from 'node:crypto';
import { Pool, type PoolConfig } from 'pg';

import { BillableOperationService } from '../../application/billableOperationService.ts';
import { ReservationGateway } from '../../application/reservationGateway.ts';
import { RecoveryService } from '../../application/recoveryService.ts';
import { RecoveryWorker, type RecoveryWorkerOptions } from '../../application/recoveryWorker.ts';
import type { ProviderRecoveryPort } from '../../application/ports.ts';
import { type TransactionTelemetry, NOOP_TRANSACTION_TELEMETRY } from '../../application/telemetry.ts';
import { TransactionService } from '../../application/transactionService.ts';
import { PostgresFinancialAccountStore } from './postgresFinancialAccountStore.ts';
import { PostgresTransactionStore } from './postgresTransactionStore.ts';
import { RetryingPostgresTransactionRunner, type PostgresRunnerOptions } from './retryingTransactionRunner.ts';

export type PostgresRuntimeOptions = Readonly<{
  databaseUrl: string;
  poolSize?: number;
  applicationName?: string;
  ssl?: PoolConfig['ssl'];
  runner?: PostgresRunnerOptions;
  telemetry?: TransactionTelemetry;
}>;

export type PostgresTransactionRuntime = Readonly<{
  pool: Pool;
  store: PostgresTransactionStore;
  financialAccounts: PostgresFinancialAccountStore;
  transactions: TransactionService;
  reservations: ReservationGateway;
  billableOperations: BillableOperationService;
  createRecoveryWorker(provider: ProviderRecoveryPort, workerId: string, options?: RecoveryWorkerOptions): RecoveryWorker;
  close(): Promise<void>;
}>;

/** Production composition root. It never logs or returns the database URL. */
export function createPostgresTransactionRuntime(options: PostgresRuntimeOptions): PostgresTransactionRuntime {
  if (typeof options.databaseUrl !== 'string' || !options.databaseUrl.startsWith('postgres')) {
    throw new Error('PostgreSQL database URL is required');
  }
  const poolSize = options.poolSize ?? 10;
  if (!Number.isInteger(poolSize) || poolSize < 1 || poolSize > 50) throw new Error('poolSize must be between 1 and 50');

  const pool = new Pool({ connectionString: options.databaseUrl, max: poolSize,
    application_name: options.applicationName ?? 'bers-transaction-runtime', ssl: options.ssl });
  const telemetry = options.telemetry ?? NOOP_TRANSACTION_TELEMETRY;
  pool.on('error', () => {
    try {
      telemetry.record({ name: 'infrastructure_error', occurred_at: new Date().toISOString(),
        outcome: 'postgres_idle_client_error' });
    } catch {
      // Pool safety cannot depend on telemetry availability.
    }
  });
  const runner = new RetryingPostgresTransactionRunner(pool, undefined, options.runner);
  const store = new PostgresTransactionStore(runner, { next: randomUUID });
  const financialAccounts = new PostgresFinancialAccountStore(runner);
  const clock = Object.freeze({ now: () => new Date() });
  const transactions = new TransactionService(store, clock);
  const reservations = new ReservationGateway(transactions, { next: randomUUID });
  const billableOperations = new BillableOperationService(
    reservations,
    store,
    transactions,
    clock,
    telemetry,
  );

  return Object.freeze({
    pool,
    store,
    financialAccounts,
    transactions,
    reservations,
    billableOperations,
    createRecoveryWorker(provider, workerId, workerOptions) {
      if (!workerId || workerId.length > 128) throw new Error('recovery worker ID is required');
      const recovery = new RecoveryService(store, provider, transactions, clock, workerId);
      return new RecoveryWorker(recovery, telemetry, workerOptions);
    },
    close: () => pool.end(),
  });
}
