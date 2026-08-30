import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { checkOutfitSchema, migrateOutfitSchema } from '../server/core/fashion/outfitSchema.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Outfit schema hardening acceptance');

async function reset(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS
    future_outfit_pk_ref,
    future_outfit_owner_ref,
    canonical_outfit_entries,
    canonical_outfits,
    canonical_garment_collection_members,
    canonical_garment_collections,
    canonical_garment_tags,
    canonical_garment_views,
    canonical_garments
    CASCADE`);
  await migrateGarmentSchema(pool);
}

async function mustFailCheck(pool: Pool, expectedFailure: string): Promise<void> {
  await assert.rejects(checkOutfitSchema(pool), (cause: any) => {
    assert.match(String(cause?.message ?? ''), new RegExp(`\\[.*${expectedFailure}.*\\]`));
    return true;
  });
}

test('Outfit migration repairs drift fail-closed and preserves structurally correct dependency keys', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await reset(pool);
    await checkOutfitSchema(pool);

    await pool.query(`ALTER TABLE canonical_outfits RENAME CONSTRAINT canonical_outfits_pkey TO future_named_outfits_pk`);
    await pool.query(`CREATE TABLE future_outfit_pk_ref (
      id UUID PRIMARY KEY,
      outfit_id UUID NOT NULL REFERENCES canonical_outfits(outfit_id)
    )`);
    await mustFailCheck(pool, 'outfit_pk');
    await migrateOutfitSchema(pool);
    const pkDependency = await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid=to_regclass('future_outfit_pk_ref') AND contype='f'`);
    assert.equal(pkDependency.rowCount, 1);
    const canonicalPk = await pool.query(`SELECT 1 FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_pkey'
        AND pg_get_constraintdef(oid)='PRIMARY KEY (outfit_id)'`);
    assert.equal(canonicalPk.rowCount, 1);

    await pool.query(`ALTER TABLE canonical_outfits RENAME CONSTRAINT canonical_outfits_owner_unique TO future_named_outfit_owner_unique`);
    await pool.query(`CREATE TABLE future_outfit_owner_ref (
      id UUID PRIMARY KEY,
      outfit_id UUID NOT NULL,
      tenant_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      FOREIGN KEY (outfit_id,tenant_id,user_id)
        REFERENCES canonical_outfits(outfit_id,tenant_id,user_id)
    )`);
    await mustFailCheck(pool, 'outfit_owner_unique');
    await migrateOutfitSchema(pool);
    const ownerDependency = await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid=to_regclass('future_outfit_owner_ref') AND contype='f'`);
    assert.equal(ownerDependency.rowCount, 1);

    await pool.query(`ALTER TABLE canonical_outfit_entries
      RENAME CONSTRAINT canonical_outfit_entries_outfit_position_unique TO future_named_position_unique`);
    await mustFailCheck(pool, 'outfit_position_unique');
    await migrateOutfitSchema(pool);
    const positionUnique = await pool.query(`SELECT condeferrable,condeferred,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries')
        AND conname='canonical_outfit_entries_outfit_position_unique'`);
    assert.equal(positionUnique.rows[0]?.condeferrable, true);
    assert.equal(positionUnique.rows[0]?.condeferred, true);
    assert.match(String(positionUnique.rows[0]?.definition), /UNIQUE \(outfit_id, "?position"?\)/);

    await pool.query(`DROP INDEX canonical_outfits_owner_updated_idx`);
    await pool.query(`CREATE INDEX canonical_outfits_owner_updated_idx ON canonical_outfits(outfit_id)`);
    await mustFailCheck(pool, 'owner_updated_index');
    await migrateOutfitSchema(pool);
    const repairedIndex = await pool.query(`SELECT ARRAY(
      SELECT a.attname::text
      FROM pg_index i
      JOIN LATERAL unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord) ON TRUE
      JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
      WHERE i.indexrelid=to_regclass('canonical_outfits_owner_updated_idx') AND k.ord <= i.indnkeyatts
      ORDER BY k.ord
    )::text[] AS columns`);
    assert.deepEqual(repairedIndex.rows[0]?.columns, ['tenant_id','user_id','updated_at','outfit_id']);

    await pool.query(`ALTER TABLE canonical_outfits ALTER COLUMN deleted_at SET DEFAULT CURRENT_TIMESTAMP`);
    await mustFailCheck(pool, 'columns');
    await migrateOutfitSchema(pool);
    const deletedDefault = await pool.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_outfits' AND column_name='deleted_at'`);
    assert.equal(deletedDefault.rows[0]?.column_default, null);

    await pool.query(`ALTER TABLE canonical_outfits ALTER COLUMN outfit_id SET DEFAULT '00000000-0000-0000-0000-000000000001'::uuid`);
    await mustFailCheck(pool, 'columns');
    await migrateOutfitSchema(pool);
    const idDefault = await pool.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_outfits' AND column_name='outfit_id'`);
    assert.equal(idDefault.rows[0]?.column_default, null);

    await pool.query(`ALTER TABLE canonical_outfits ALTER COLUMN created_at SET DEFAULT '2000-01-01T00:00:00Z'::timestamptz`);
    await mustFailCheck(pool, 'columns');
    await migrateOutfitSchema(pool);
    const createdDefault = await pool.query(`SELECT lower(replace(column_default,' ','')) AS value FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_outfits' AND column_name='created_at'`);
    assert.ok(['current_timestamp','now()'].includes(String(createdDefault.rows[0]?.value)));

    await pool.query(`ALTER TABLE canonical_outfits DROP CONSTRAINT canonical_outfits_style_check`);
    await pool.query(`ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_style_check CHECK (
      NOT (style IN ('minimal','classic','elegant','streetwear','business','luxury','sport','vintage','casual','modern','creative','smart_casual'))
    )`);
    await mustFailCheck(pool, 'style_check');
    await migrateOutfitSchema(pool);
    await checkOutfitSchema(pool);

    await pool.query(`ALTER TABLE canonical_outfit_entries DROP CONSTRAINT canonical_outfit_entries_position_check`);
    await pool.query(`ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_position_check CHECK (
      position < 0 OR position >= 32
    )`);
    await mustFailCheck(pool, 'position_check');
    await migrateOutfitSchema(pool);
    await checkOutfitSchema(pool);

    await pool.query(`ALTER TABLE canonical_outfit_entries DROP CONSTRAINT canonical_outfit_entries_outfit_position_unique`);
    await pool.query(`ALTER TABLE canonical_outfit_entries ADD CONSTRAINT canonical_outfit_entries_outfit_position_unique
      UNIQUE (outfit_id, position) NOT DEFERRABLE`);
    await mustFailCheck(pool, 'outfit_position_unique');
    await migrateOutfitSchema(pool);
    const repairedPositionUnique = await pool.query(`SELECT condeferrable,condeferred FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfit_entries')
        AND conname='canonical_outfit_entries_outfit_position_unique'`);
    assert.equal(repairedPositionUnique.rows[0]?.condeferrable, true);
    assert.equal(repairedPositionUnique.rows[0]?.condeferred, true);

    await pool.query(`ALTER TABLE canonical_outfits DROP CONSTRAINT canonical_outfits_name_check`);
    await pool.query(`ALTER TABLE canonical_outfits ADD CONSTRAINT canonical_outfits_name_check CHECK (
      char_length(name) >= 1 AND char_length(name) <= 1000 AND name = btrim(name) AND name !~ '[[:cntrl:]]'
    )`);
    const invalidId = '90000000-0000-0000-0000-000000000001';
    await pool.query(`INSERT INTO canonical_outfits (outfit_id,tenant_id,user_id,name)
      VALUES ($1,'rollback-tenant','rollback-user',$2)`, [invalidId, 'x'.repeat(201)]);
    await assert.rejects(migrateOutfitSchema(pool), (cause: any) => {
      assert.equal(cause?.code, '23514');
      return true;
    });
    const rollbackConstraint = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_outfits') AND conname='canonical_outfits_name_check'`);
    assert.match(String(rollbackConstraint.rows[0]?.definition), /1000/);
    await pool.query(`DELETE FROM canonical_outfits WHERE outfit_id=$1`, [invalidId]);
    await migrateOutfitSchema(pool);
    await checkOutfitSchema(pool);
  } finally {
    await pool.end();
  }
});
