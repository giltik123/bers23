import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { checkProjectBodyAnchorSchema, migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.3 body-anchor schema acceptance');

const schemaError = /body anchor schema is incomplete or drifted/i;
const legacyIndex = 'canonical_project_body_anchor_sets_owner_project_idx';
const sequenceIndex = 'canonical_project_body_anchor_sets_owner_project_sequence_idx';
const idempotencyIndex = 'canonical_project_body_anchor_sets_owner_idempotency_key_unique';

async function indexState(pool: Pool) {
  const result = await pool.query(`SELECT i.indexname,x.indisvalid,x.indisready
    FROM pg_indexes i
    JOIN pg_namespace n ON n.nspname=i.schemaname
    JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=i.indexname
    JOIN pg_index x ON x.indexrelid=c.oid
    WHERE i.schemaname=current_schema() AND i.tablename='canonical_project_body_anchor_sets'
      AND i.indexname IN ($1,$2)
    ORDER BY i.indexname`, [legacyIndex, sequenceIndex]);
  return result.rows.map(row => ({
    name: String(row.indexname),
    valid: row.indisvalid === true,
    ready: row.indisready === true,
  }));
}

async function createLegacyIndex(pool: Pool): Promise<void> {
  await pool.query(`CREATE INDEX ${legacyIndex}
    ON canonical_project_body_anchor_sets
    (tenant_id,user_id,project_id,project_image_storage_id,created_at DESC,anchor_set_id)`);
}

async function createSequenceIndex(pool: Pool): Promise<void> {
  await pool.query(`CREATE INDEX ${sequenceIndex}
    ON canonical_project_body_anchor_sets
    (tenant_id,user_id,project_id,project_image_storage_id,acquisition_sequence DESC,anchor_set_id)`);
}

async function createIdempotencyIndex(pool: Pool): Promise<void> {
  await pool.query(`CREATE UNIQUE INDEX ${idempotencyIndex}
    ON canonical_project_body_anchor_sets (tenant_id,user_id,idempotency_key)
    WHERE idempotency_key IS NOT NULL`);
}

test('F4b.3/F4b.6c sequence-reader schema preserves rolling overlap and fail-closes index drift', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-f4b3-body-anchor-schema' });
  try {
    await migrateProjectBodyAnchorSchema(pool);
    await checkProjectBodyAnchorSchema(pool);

    assert.deepEqual(await indexState(pool), [
      { name: legacyIndex, valid: true, ready: true },
      { name: sequenceIndex, valid: true, ready: true },
    ], 'automatic migration must preserve the 031 overlap state for old and new readers');

    // A malformed sequence index must fail closed while the legacy index remains
    // available to old application instances during the rolling deployment.
    await pool.query(`DROP INDEX ${sequenceIndex}`);
    await pool.query(`CREATE INDEX ${sequenceIndex}
      ON canonical_project_body_anchor_sets (tenant_id,user_id,project_id,anchor_set_id)`);
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'drifted sequence lookup must fail readiness');
    assert.equal((await pool.query(`SELECT to_regclass($1)::text AS relation`, [legacyIndex])).rows[0]?.relation, legacyIndex);
    await pool.query(`DROP INDEX ${sequenceIndex}`);
    await createSequenceIndex(pool);
    await checkProjectBodyAnchorSchema(pool);

    // Definition-only checks are insufficient: PostgreSQL can retain an index
    // relation whose catalog flags say it is not valid/ready for planner use.
    await pool.query(`UPDATE pg_index
      SET indisvalid=false, indisready=false
      WHERE indexrelid=to_regclass($1)`, [sequenceIndex]);
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'invalid/unready sequence index must fail readiness');
    await pool.query(`UPDATE pg_index
      SET indisvalid=true, indisready=true
      WHERE indexrelid=to_regclass($1)`, [sequenceIndex]);
    await checkProjectBodyAnchorSchema(pool);

    // The new reader is contract-compatible with the later cleanup release: once
    // every old instance is gone, sequence-only remains a healthy schema state.
    await pool.query(`DROP INDEX ${legacyIndex}`);
    await checkProjectBodyAnchorSchema(pool);
    assert.deepEqual(await indexState(pool), [{ name: sequenceIndex, valid: true, ready: true }]);

    // Recreate overlap to prove rollback compatibility while this release rolls.
    await createLegacyIndex(pool);
    await checkProjectBodyAnchorSchema(pool);

    // If the optional legacy index exists it must still be healthy and exact,
    // because old instances may still depend on it during the overlap window.
    await pool.query(`DROP INDEX ${legacyIndex}`);
    await pool.query(`CREATE INDEX ${legacyIndex}
      ON canonical_project_body_anchor_sets (tenant_id,user_id,project_id,anchor_set_id)`);
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'drifted legacy overlap index must fail readiness while present');
    await pool.query(`DROP INDEX ${legacyIndex}`);
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_image_width_check');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets ADD CONSTRAINT canonical_project_body_anchor_sets_image_width_check CHECK (project_image_width >= 0)');
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'weakened positive-dimension CHECK must fail readiness');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_image_width_check');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets ADD CONSTRAINT canonical_project_body_anchor_sets_image_width_check CHECK (project_image_width > 0)');
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_acquisition_sequence_unique');
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'missing acquisition-sequence uniqueness must fail readiness');
    await pool.query(`ALTER TABLE canonical_project_body_anchor_sets
      ADD CONSTRAINT canonical_project_body_anchor_sets_acquisition_sequence_unique UNIQUE (acquisition_sequence)`);
    await checkProjectBodyAnchorSchema(pool);

    await pool.query(`DROP INDEX ${idempotencyIndex}`);
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'missing idempotency uniqueness must fail readiness');
    await createIdempotencyIndex(pool);
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_idempotency_binding_check');
    await pool.query(`ALTER TABLE canonical_project_body_anchor_sets
      ADD CONSTRAINT canonical_project_body_anchor_sets_idempotency_binding_check CHECK (idempotency_key IS NULL OR idempotency_binding_sha256 IS NOT NULL)`);
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'weakened idempotency pair binding must fail readiness');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_idempotency_binding_check');
    await pool.query(`ALTER TABLE canonical_project_body_anchor_sets
      ADD CONSTRAINT canonical_project_body_anchor_sets_idempotency_binding_check CHECK (
        (idempotency_key IS NULL AND idempotency_binding_sha256 IS NULL)
        OR (idempotency_key IS NOT NULL AND idempotency_binding_sha256 IS NOT NULL AND idempotency_binding_sha256 ~ '^[0-9a-f]{64}$')
      )`);
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DISABLE TRIGGER canonical_project_body_anchor_sets_insert_guard');
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'disabled insert guard must fail readiness');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets ENABLE TRIGGER canonical_project_body_anchor_sets_insert_guard');
    await checkProjectBodyAnchorSchema(pool);
  } finally {
    await pool.end();
  }
});
