import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { checkProjectBodyAnchorSchema, migrateProjectBodyAnchorSchema } from '../server/core/fashion/bodyAnchorSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F4b.3 body-anchor schema acceptance');

const schemaError = /body anchor schema is incomplete or drifted/i;

test('F4b.3/F4b.6c readiness rejects weakened CHECK sequence index unique and trigger semantics', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-f4b3-body-anchor-schema' });
  try {
    await migrateProjectBodyAnchorSchema(pool);
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_image_width_check');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets ADD CONSTRAINT canonical_project_body_anchor_sets_image_width_check CHECK (project_image_width >= 0)');
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'weakened positive-dimension CHECK must fail readiness');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_image_width_check');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets ADD CONSTRAINT canonical_project_body_anchor_sets_image_width_check CHECK (project_image_width > 0)');
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('DROP INDEX canonical_project_body_anchor_sets_owner_project_idx');
    await pool.query(`CREATE INDEX canonical_project_body_anchor_sets_owner_project_idx
      ON canonical_project_body_anchor_sets (tenant_id,user_id,project_id,anchor_set_id)`);
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'same-name but incomplete owner index must fail readiness');
    await pool.query('DROP INDEX canonical_project_body_anchor_sets_owner_project_idx');
    await pool.query(`CREATE INDEX canonical_project_body_anchor_sets_owner_project_idx
      ON canonical_project_body_anchor_sets (tenant_id,user_id,project_id,project_image_storage_id,acquisition_sequence DESC,anchor_set_id)`);
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DROP CONSTRAINT canonical_project_body_anchor_sets_acquisition_sequence_unique');
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'missing acquisition-sequence uniqueness must fail readiness');
    await pool.query(`ALTER TABLE canonical_project_body_anchor_sets
      ADD CONSTRAINT canonical_project_body_anchor_sets_acquisition_sequence_unique UNIQUE (acquisition_sequence)`);
    await checkProjectBodyAnchorSchema(pool);

    await pool.query('ALTER TABLE canonical_project_body_anchor_sets DISABLE TRIGGER canonical_project_body_anchor_sets_insert_guard');
    await assert.rejects(checkProjectBodyAnchorSchema(pool), schemaError, 'disabled insert guard must fail readiness');
    await pool.query('ALTER TABLE canonical_project_body_anchor_sets ENABLE TRIGGER canonical_project_body_anchor_sets_insert_guard');
    await checkProjectBodyAnchorSchema(pool);
  } finally {
    await pool.end();
  }
});
