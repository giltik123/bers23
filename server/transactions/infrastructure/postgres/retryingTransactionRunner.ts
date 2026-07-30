import type { SqlResult, SqlTransaction, SqlTransactionRunner } from './sql.ts';

export interface PgClientLike {
  query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<{ rows: readonly Row[]; rowCount: number | null }>;
  release(discard?: boolean): void;
}
export interface PgPoolLike { connect(): Promise<PgClientLike> }
export interface RetryDelay { wait(milliseconds: number): Promise<void> }
export type PostgresRunnerOptions = Readonly<{
  maxAttempts?: number;
  lockTimeoutMs?: number;
  statementTimeoutMs?: number;
}>;

const RETRYABLE_SQLSTATES = new Set([
  '40001', // serialization_failure
  '40P01', // deadlock_detected
  '55P03', // lock_not_available, including lock_timeout
  '08000', '08001', '08003', '08004', '08006', // connection exceptions
  '57P01', // admin_shutdown
  '53300', // too_many_connections
]);

/** Bounded PostgreSQL transaction runner compatible with a pg Pool. */
export class RetryingPostgresTransactionRunner implements SqlTransactionRunner {
  private readonly pool: PgPoolLike;
  private readonly delay: RetryDelay;
  private readonly maxAttempts: number;
  private readonly lockTimeoutMs: number;
  private readonly statementTimeoutMs: number;

  constructor(
    pool: PgPoolLike,
    delay: RetryDelay = { wait: (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
    options: PostgresRunnerOptions = {},
  ) {
    this.pool = pool;
    this.delay = delay;
    this.maxAttempts = options.maxAttempts ?? 3;
    this.lockTimeoutMs = options.lockTimeoutMs ?? 2_000;
    this.statementTimeoutMs = options.statementTimeoutMs ?? 15_000;
    requireIntegerRange('maxAttempts', this.maxAttempts, 1, 5);
    requireIntegerRange('lockTimeoutMs', this.lockTimeoutMs, 100, 30_000);
    requireIntegerRange('statementTimeoutMs', this.statementTimeoutMs, 500, 60_000);
    if (this.lockTimeoutMs >= this.statementTimeoutMs) {
      throw new Error('lockTimeoutMs must be lower than statementTimeoutMs');
    }
  }

  async transaction<T>(isolation: 'read committed', work: (transaction: SqlTransaction) => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      let client: PgClientLike | undefined;
      let discard = false;
      try {
        // A fresh pool checkout occurs for every attempt, including after a
        // successful rollback. Potentially broken clients are never reused here.
        client = await this.pool.connect();
        await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
        await client.query("SELECT set_config('lock_timeout', $1, true)", [`${this.lockTimeoutMs}ms`]);
        await client.query("SELECT set_config('statement_timeout', $1, true)", [`${this.statementTimeoutMs}ms`]);
        const transaction: SqlTransaction = {
          query: async <Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>> => {
            const result = await client!.query<Row>(text, values);
            return { rows: result.rows, rowCount: result.rowCount ?? result.rows.length };
          },
        };
        const result = await work(transaction);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        lastError = error;
        const retryable = isRetryablePostgresError(error);
        // Do not let a physical connection involved in a retryable failure
        // return to the pool, even when PostgreSQL accepted ROLLBACK.
        discard = retryable;
        if (client) {
          try { await client.query('ROLLBACK'); } catch { discard = true; }
        }
        if (!retryable || attempt === this.maxAttempts) throw error;
        await this.delay.wait(25 * (2 ** (attempt - 1)));
      } finally {
        client?.release(discard);
      }
    }
    throw lastError;
  }
}

/** Classification uses PostgreSQL SQLSTATE only; error messages are ignored. */
export function isRetryablePostgresError(error: unknown): boolean {
  return !!error && typeof error === 'object' && 'code' in error &&
    typeof error.code === 'string' && RETRYABLE_SQLSTATES.has(error.code);
}

function requireIntegerRange(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
}
