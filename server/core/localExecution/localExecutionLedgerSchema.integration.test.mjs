import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { checkLocalExecutionLedgerSchema, migrateLocalExecutionLedgerSchema } from './localExecutionLedgerSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
const destructiveSchemaProofEnabled = process.env.LOCAL_EXECUTION_SCHEMA_TEST === '1';

test('migration 013 repairs prerelease local execution ledger authority constraints', { skip: !databaseUrl || !destructiveSchemaProofEnabled }, async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'bers-local-ledger-schema-integration' });
  try {
    await pool.query('DELETE FROM local_execution_tickets');
    await pool.query('DELETE FROM local_execution_uploads');
    await pool.query(`
      DROP INDEX IF EXISTS local_execution_tickets_scope_idempotency_unique;
      ALTER TABLE local_execution_tickets DROP CONSTRAINT IF EXISTS local_execution_tickets_idempotency_key_key;
      ALTER TABLE local_execution_tickets ADD CONSTRAINT local_execution_tickets_idempotency_key_key UNIQUE (idempotency_key);
      ALTER TABLE local_execution_tickets DROP COLUMN IF EXISTS finalized_status;
      ALTER TABLE local_execution_tickets DROP COLUMN IF EXISTS finalized_at;
      ALTER TABLE local_execution_uploads ALTER COLUMN artifact_role DROP NOT NULL;
      DROP INDEX IF EXISTS canonical_mask_artifacts_local_execution_ticket_unique;
    `);

    await assert.rejects(() => checkLocalExecutionLedgerSchema(pool), /local execution ledger schema is incomplete/);
    await migrateLocalExecutionLedgerSchema(pool);
    await checkLocalExecutionLedgerSchema(pool);

    const result = await pool.query(`SELECT
      to_regclass('local_execution_tickets_scope_idempotency_unique') IS NOT NULL AS scoped_unique,
      to_regclass('canonical_mask_artifacts_local_execution_ticket_unique') IS NOT NULL AS mask_unique,
      NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = current_schema()
          AND t.relname = 'local_execution_tickets'
          AND c.conname = 'local_execution_tickets_idempotency_key_key'
      ) AS legacy_unique_removed,
      (
        SELECT count(*) = 2
        FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'local_execution_tickets'
          AND column_name IN ('finalized_status','finalized_at')
      ) AS finalization_columns,
      EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema()
          AND table_name = 'local_execution_uploads'
          AND column_name = 'artifact_role'
          AND is_nullable = 'NO'
      ) AS artifact_role_not_null`);
    assert.deepEqual(result.rows[0], {
      scoped_unique: true,
      mask_unique: true,
      legacy_unique_removed: true,
      finalization_columns: true,
      artifact_role_not_null: true,
    });
  } finally {
    await pool.end();
  }
});
