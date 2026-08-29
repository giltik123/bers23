import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { checkGarmentSchema, migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Garment schema acceptance');

const VIEW_OWNER_DEFINITION = 'FOREIGN KEY (garment_id, tenant_id, user_id) REFERENCES canonical_garments(garment_id, tenant_id, user_id)%';

async function validated(pool: Pool, relation: string, constraintName: string): Promise<boolean> {
  const result = await pool.query(
    `SELECT convalidated FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname=$2`,
    [relation, constraintName],
  );
  return result.rows[0]?.convalidated === true;
}

test('managed Garment readiness rejects NOT VALID ownership foreign keys and migration repairs them', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);

    const viewOwner = await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_views') AND contype='f'
        AND confrelid=to_regclass('canonical_garments')
        AND pg_get_constraintdef(oid) LIKE $1
      ORDER BY oid LIMIT 1`, [VIEW_OWNER_DEFINITION]);
    const viewOwnerName = String(viewOwner.rows[0]?.conname ?? '');
    assert.match(viewOwnerName, /^[a-zA-Z0-9_]+$/, 'expected a safe PostgreSQL-owned view ownership constraint name');

    await pool.query(`ALTER TABLE canonical_garment_views DROP CONSTRAINT "${viewOwnerName}"`);
    await pool.query(`ALTER TABLE canonical_garment_views ADD CONSTRAINT "${viewOwnerName}"
      FOREIGN KEY (garment_id, tenant_id, user_id)
      REFERENCES canonical_garments (garment_id, tenant_id, user_id)
      ON DELETE RESTRICT NOT VALID`);
    assert.equal(await validated(pool, 'canonical_garment_views', viewOwnerName), false);
    await assert.rejects(() => checkGarmentSchema(pool), /ownership constraints are incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    assert.equal(await validated(pool, 'canonical_garment_views', viewOwnerName), true, 'migration 022 must validate the view ownership FK before readiness');

    await pool.query('ALTER TABLE canonical_garments DROP CONSTRAINT canonical_garments_primary_view_owner_fkey');
    await pool.query(`ALTER TABLE canonical_garments ADD CONSTRAINT canonical_garments_primary_view_owner_fkey
      FOREIGN KEY (primary_view_id, garment_id, tenant_id, user_id)
      REFERENCES canonical_garment_views (view_id, garment_id, tenant_id, user_id)
      DEFERRABLE INITIALLY DEFERRED NOT VALID`);
    assert.equal(await validated(pool, 'canonical_garments', 'canonical_garments_primary_view_owner_fkey'), false);
    await assert.rejects(() => checkGarmentSchema(pool), /ownership constraints are incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    assert.equal(await validated(pool, 'canonical_garments', 'canonical_garments_primary_view_owner_fkey'), true, 'migration 022 must recreate the primary-view ownership FK as validated');
  } finally {
    await pool.end();
  }
});
