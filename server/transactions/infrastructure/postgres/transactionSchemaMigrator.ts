import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

import type { PgPoolLike } from './retryingTransactionRunner.ts';

export const TRANSACTION_MIGRATION_VERSION = '001_transaction_store';
const MIGRATION_LOCK_ID = 734_221_907;

type MigrationClient = Awaited<ReturnType<PgPoolLike['connect']>>;

export type MigrationResult = Readonly<{
  version: typeof TRANSACTION_MIGRATION_VERSION;
  status: 'applied' | 'already_applied';
  checksum: string;
}>;

/** Applies the transaction schema exactly once under a PostgreSQL advisory lock. */
export async function migrateTransactionSchema(pool: PgPoolLike): Promise<MigrationResult> {
  const { sql, checksum } = await loadMigration();
  const client: MigrationClient = await pool.connect();
  let locked = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    locked = true;
    await client.query(`CREATE TABLE IF NOT EXISTS transaction_schema_migrations (
      version text PRIMARY KEY,
      checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
      applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`);
    const existing = await client.query<{ checksum: string }>(
      'SELECT checksum FROM transaction_schema_migrations WHERE version = $1',
      [TRANSACTION_MIGRATION_VERSION],
    );
    if (existing.rowCount) {
      if (existing.rows[0].checksum !== checksum) throw new Error('recorded transaction migration checksum does not match source');
      return Object.freeze({ version: TRANSACTION_MIGRATION_VERSION, status: 'already_applied', checksum });
    }

    await client.query('BEGIN');
    try {
      await client.query(withoutOuterTransaction(sql));
      await client.query(
        'INSERT INTO transaction_schema_migrations (version, checksum) VALUES ($1, $2)',
        [TRANSACTION_MIGRATION_VERSION, checksum],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
    return Object.freeze({ version: TRANSACTION_MIGRATION_VERSION, status: 'applied', checksum });
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

export async function checkTransactionSchema(pool: PgPoolLike): Promise<void> {
  const { checksum } = await loadMigration();
  const client: MigrationClient = await pool.connect();
  try {
    const result = await client.query<{
      wallet: string | null; reservations: string | null; journal_sequences: string | null;
      journal: string | null; migration: string | null;
    }>(`SELECT
      to_regclass('credit_wallets')::text AS wallet,
      to_regclass('credit_reservations')::text AS reservations,
      to_regclass('reservation_journal_sequences')::text AS journal_sequences,
      to_regclass('transaction_journal')::text AS journal,
      to_regclass('transaction_schema_migrations')::text AS migration`);
    if (!result.rowCount || Object.values(result.rows[0]).some((value) => value === null)) {
      throw new Error('transaction schema is incomplete');
    }
    const recorded = await client.query<{ checksum: string }>(
      'SELECT checksum FROM transaction_schema_migrations WHERE version = $1',
      [TRANSACTION_MIGRATION_VERSION],
    );
    if (!recorded.rowCount) throw new Error('transaction migration is not recorded');
    if (recorded.rows[0].checksum !== checksum) throw new Error('transaction migration checksum does not match source');
  } finally {
    client.release();
  }
}

async function loadMigration(): Promise<{ sql: string; checksum: string }> {
  const sql = await readFile(new URL('./migrations/001_transaction_store.sql', import.meta.url), 'utf8');
  return { sql, checksum: createHash('sha256').update(sql).digest('hex') };
}

function withoutOuterTransaction(sql: string): string {
  const body = sql.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '').trim();
  if (!body || body === sql.trim()) throw new Error('migration must have an explicit outer transaction');
  return body;
}
