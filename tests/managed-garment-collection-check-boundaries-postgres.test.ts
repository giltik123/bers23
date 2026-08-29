import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { checkGarmentSchema, migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Collection CHECK-boundary acceptance');

test('F2b readiness rejects permissive numeric CHECK lookalikes and repair restores exact bounds', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await migrateGarmentSchema(pool);

    await pool.query('ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_name_check');
    await pool.query(`ALTER TABLE canonical_garment_collections
      ADD CONSTRAINT canonical_garment_collections_name_check CHECK (
        char_length(name) >= 1
        AND char_length(name) <= 1000
        AND name = btrim(name)
        AND name !~ '[[:cntrl:]]'
      )`);
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    await assert.rejects(
      () => pool.query(`INSERT INTO canonical_garment_collections
        (collection_id,tenant_id,user_id,name) VALUES ($1,'boundary-tenant','boundary-user',$2)`,
      ['11111111-1111-4111-8111-111111111111', 'x'.repeat(101)]),
      (error: unknown) => (error as any)?.code === '23514',
      'repaired name CHECK must reject 101 characters, not accept a <=1000 lookalike',
    );

    await pool.query('ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_description_check');
    await pool.query(`ALTER TABLE canonical_garment_collections
      ADD CONSTRAINT canonical_garment_collections_description_check CHECK (
        char_length(description) <= 5000
        AND description !~ '[[:cntrl:]]'
      )`);
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    await assert.rejects(
      () => pool.query(`INSERT INTO canonical_garment_collections
        (collection_id,tenant_id,user_id,name,description) VALUES ($1,'boundary-tenant','boundary-user','Boundary',$2)`,
      ['22222222-2222-4222-8222-222222222222', 'y'.repeat(501)]),
      (error: unknown) => (error as any)?.code === '23514',
      'repaired description CHECK must reject 501 characters, not accept a <=5000 lookalike',
    );
  } finally {
    await pool.query(`DELETE FROM canonical_garment_collections WHERE tenant_id='boundary-tenant' AND user_id='boundary-user'`).catch(() => undefined);
    await pool.end();
  }
});
