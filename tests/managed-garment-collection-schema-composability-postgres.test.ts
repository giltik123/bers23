import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { checkGarmentSchema, migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Collection schema composability acceptance');

test('F2b repair preserves correct Collection keys used by future migrations', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await migrateGarmentSchema(pool);
    await pool.query('DROP TABLE IF EXISTS future_collection_owner_reference');
    await pool.query('DROP TABLE IF EXISTS future_collection_id_reference');
    await pool.query('ALTER TABLE canonical_garment_collections DROP CONSTRAINT IF EXISTS future_collection_name_guard');

    await pool.query(`CREATE TABLE future_collection_id_reference (
      collection_id UUID NOT NULL,
      CONSTRAINT future_collection_id_reference_fkey
        FOREIGN KEY (collection_id)
        REFERENCES canonical_garment_collections (collection_id)
    )`);
    await pool.query(`CREATE TABLE future_collection_owner_reference (
      collection_id UUID NOT NULL,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      CONSTRAINT future_collection_owner_reference_fkey
        FOREIGN KEY (collection_id,tenant_id,user_id)
        REFERENCES canonical_garment_collections (collection_id,tenant_id,user_id)
    )`);
    await pool.query(`ALTER TABLE canonical_garment_collections
      ADD CONSTRAINT future_collection_name_guard CHECK (char_length(name) <= 1000)`);

    await pool.query('ALTER TABLE canonical_garment_collections ALTER COLUMN description DROP DEFAULT');
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);

    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);

    const dependencies = await pool.query(`SELECT conname,contype,convalidated
      FROM pg_constraint
      WHERE conname IN (
        'future_collection_id_reference_fkey',
        'future_collection_owner_reference_fkey',
        'future_collection_name_guard'
      ) ORDER BY conname`);
    assert.deepEqual(
      dependencies.rows.map(row => [row.conname, row.contype, row.convalidated]),
      [
        ['future_collection_id_reference_fkey', 'f', true],
        ['future_collection_name_guard', 'c', true],
        ['future_collection_owner_reference_fkey', 'f', true],
      ],
      'unrelated 024 repair must preserve future constraints and dependencies on already-correct canonical keys',
    );

    const defaultState = await pool.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema=current_schema()
        AND table_name='canonical_garment_collections'
        AND column_name='description'`);
    assert.equal(defaultState.rows[0]?.column_default, "''::text");
  } finally {
    await pool.query('DROP TABLE IF EXISTS future_collection_owner_reference').catch(() => undefined);
    await pool.query('DROP TABLE IF EXISTS future_collection_id_reference').catch(() => undefined);
    await pool.query('ALTER TABLE canonical_garment_collections DROP CONSTRAINT IF EXISTS future_collection_name_guard').catch(() => undefined);
    await pool.end();
  }
});
