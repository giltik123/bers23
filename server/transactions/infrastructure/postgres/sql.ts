/** Minimal driver-neutral PostgreSQL result. */
export type SqlResult<Row> = Readonly<{ rows: readonly Row[]; rowCount: number }>;

/** Transaction-scoped SQL capability implemented by the chosen PostgreSQL driver. */
export interface SqlTransaction {
  query<Row extends Record<string, unknown>>(text: string, values?: readonly unknown[]): Promise<SqlResult<Row>>;
}

/** Runs the callback inside one READ COMMITTED PostgreSQL transaction. */
export interface SqlTransactionRunner {
  transaction<T>(isolation: 'read committed', work: (transaction: SqlTransaction) => Promise<T>): Promise<T>;
}

export interface IdGenerator { next(): string }
