import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { PgPoolLike } from './retryingTransactionRunner.ts';

const TRANSACTION_MIGRATIONS = Object.freeze([
  Object.freeze({ version: '001_transaction_store', file: '001_transaction_store.sql' }),
  Object.freeze({ version: '038_financial_account_foundation', file: '038_financial_account_foundation.sql' }),
] as const);

export const TRANSACTION_MIGRATION_VERSION = '038_financial_account_foundation' as const;
const MIGRATION_LOCK_ID = 734_221_907;

type MigrationClient = Awaited<ReturnType<PgPoolLike['connect']>>;
type TransactionMigrationVersion = (typeof TRANSACTION_MIGRATIONS)[number]['version'];
type LoadedMigration = Readonly<{ version: TransactionMigrationVersion; file: string; sql: string; checksum: string }>;

export type MigrationResult = Readonly<{
  version: typeof TRANSACTION_MIGRATION_VERSION;
  status: 'applied' | 'already_applied';
  checksum: string;
}>;

/** Applies every known transaction migration in immutable order under one advisory lock. */
export async function migrateTransactionSchema(pool: PgPoolLike): Promise<MigrationResult> {
  const migrations = await loadMigrations();
  const latest = migrations.at(-1);
  if (!latest || latest.version !== TRANSACTION_MIGRATION_VERSION) throw new Error('transaction migration inventory has no latest migration');

  const client: MigrationClient = await pool.connect();
  let locked = false;
  let applied = false;
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_ID]);
    locked = true;
    await ensureMigrationTable(client);

    const recorded = await recordedMigrations(client);
    assertKnownRecordedMigrations(recorded, migrations);
    assertNoOutOfOrderKnownMigrations(recorded, migrations);

    for (const migration of migrations) {
      const checksum = recorded.get(migration.version);
      if (checksum !== undefined) {
        if (checksum !== migration.checksum) throw new Error(`recorded transaction migration checksum does not match source: ${migration.version}`);
        continue;
      }
      await applyMigration(client, migration);
      recorded.set(migration.version, migration.checksum);
      applied = true;
    }

    return Object.freeze({
      version: TRANSACTION_MIGRATION_VERSION,
      status: applied ? 'applied' : 'already_applied',
      checksum: latest.checksum,
    });
  } finally {
    try {
      if (locked) await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
    } finally {
      client.release();
    }
  }
}

export async function checkTransactionSchema(pool: PgPoolLike): Promise<void> {
  const migrations = await loadMigrations();
  const client: MigrationClient = await pool.connect();
  try {
    const result = await client.query<{
      wallet: string | null; reservations: string | null; journal_sequences: string | null;
      journal: string | null; entitlement_accounts: string | null; grants: string | null; migration: string | null;
    }>(`SELECT
      to_regclass('credit_wallets')::text AS wallet,
      to_regclass('credit_reservations')::text AS reservations,
      to_regclass('reservation_journal_sequences')::text AS journal_sequences,
      to_regclass('transaction_journal')::text AS journal,
      to_regclass('financial_entitlement_accounts')::text AS entitlement_accounts,
      to_regclass('credit_grants')::text AS grants,
      to_regclass('transaction_schema_migrations')::text AS migration`);
    if (!result.rowCount || Object.values(result.rows[0]).some((value) => value === null)) {
      throw new Error('transaction schema is incomplete');
    }

    const recorded = await recordedMigrations(client);
    assertKnownRecordedMigrations(recorded, migrations);
    assertNoOutOfOrderKnownMigrations(recorded, migrations);
    if (recorded.size !== migrations.length) throw new Error('transaction migration sequence is incomplete');
    for (const migration of migrations) {
      const checksum = recorded.get(migration.version);
      if (checksum === undefined) throw new Error(`transaction migration is not recorded: ${migration.version}`);
      if (checksum !== migration.checksum) throw new Error(`transaction migration checksum does not match source: ${migration.version}`);
    }
  } finally {
    client.release();
  }
}

async function ensureMigrationTable(client: MigrationClient): Promise<void> {
  await client.query(`CREATE TABLE IF NOT EXISTS transaction_schema_migrations (
    version text PRIMARY KEY,
    checksum text NOT NULL CHECK (checksum ~ '^[a-f0-9]{64}$'),
    applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}

async function recordedMigrations(client: MigrationClient): Promise<Map<string, string>> {
  const result = await client.query<{ version: string; checksum: string }>(
    'SELECT version, checksum FROM transaction_schema_migrations ORDER BY version',
  );
  return new Map(result.rows.map((row) => [row.version, row.checksum]));
}

function assertKnownRecordedMigrations(recorded: ReadonlyMap<string, string>, migrations: readonly LoadedMigration[]): void {
  const known = new Set(migrations.map((migration) => migration.version));
  for (const version of recorded.keys()) {
    if (!known.has(version as TransactionMigrationVersion)) throw new Error(`unknown transaction migration is recorded: ${version}`);
  }
}

function assertNoOutOfOrderKnownMigrations(recorded: ReadonlyMap<string, string>, migrations: readonly LoadedMigration[]): void {
  let missingSeen = false;
  for (const migration of migrations) {
    const present = recorded.has(migration.version);
    if (!present) missingSeen = true;
    else if (missingSeen) throw new Error(`transaction migration sequence is out of order at ${migration.version}`);
  }
}

async function applyMigration(client: MigrationClient, migration: LoadedMigration): Promise<void> {
  await client.query('BEGIN');
  try {
    await client.query(withoutOuterTransaction(migration.sql));
    await client.query(
      'INSERT INTO transaction_schema_migrations (version, checksum) VALUES ($1, $2)',
      [migration.version, migration.checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  }
}

async function loadMigrations(): Promise<readonly LoadedMigration[]> {
  return Object.freeze(await Promise.all(TRANSACTION_MIGRATIONS.map(async (migration) => {
    const sql = await readMigrationSql(migration.file);
    return Object.freeze({
      ...migration,
      sql,
      checksum: createHash('sha256').update(sql).digest('hex'),
    });
  })));
}

async function readMigrationSql(file: string): Promise<string> {
  try {
    return await readFile(new URL(`./migrations/${file}`, import.meta.url), 'utf8');
  } catch (bundledLayoutError) {
    try {
      return await readFile(resolve(process.cwd(), 'server/transactions/infrastructure/postgres/migrations', file), 'utf8');
    } catch {
      throw bundledLayoutError;
    }
  }
}

function withoutOuterTransaction(sql: string): string {
  const body = sql.replace(/^\s*BEGIN;\s*/i, '').replace(/\s*COMMIT;\s*$/i, '').trim();
  if (!body || body === sql.trim()) throw new Error('migration must have an explicit outer transaction');
  return body;
}
