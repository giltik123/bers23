import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import {
  checkTransactionSchema,
  migrateTransactionSchema,
  TRANSACTION_MIGRATION_VERSION,
} from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for bounded F4b.4 PostgreSQL bootstrap');

test('F4b.4 PostgreSQL bootstrap applies only the transaction predecessor through its canonical migrator', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-f4b4-bounded-bootstrap' });
  try {
    const result = await migrateTransactionSchema(pool);
    assert.equal(result.version, TRANSACTION_MIGRATION_VERSION);
    assert.ok(result.status === 'applied' || result.status === 'already_applied');
    assert.match(result.checksum, /^[a-f0-9]{64}$/);
    await checkTransactionSchema(pool);
  } finally {
    await pool.end();
  }
});
