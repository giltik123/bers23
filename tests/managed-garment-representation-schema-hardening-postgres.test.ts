import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { checkGarmentRepresentationSchema, migrateGarmentRepresentationSchema } from '../server/core/fashion/garmentRepresentationSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentRepresentationStore } from '../server/core/fashion/postgresGarmentRepresentationStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Garment representation schema hardening acceptance');
const owner = Object.freeze({ tenantId: 'fashion-representation-schema-tenant', userId: 'fashion-representation-schema-user' });
const limits = Object.freeze({ maxUploadBytes: 1024 * 1024, maxDimension: 64, maxPixels: 4096 });

async function tinyImage(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({ create: { width: 8, height: 8, channels: 4, background: { r: 30, g: 80, b: 130, alpha: 1 } } }).png().toBuffer());
}

async function dropFashion(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS
    canonical_garment_representation_sources,
    canonical_garment_representations,
    canonical_outfit_entries,
    canonical_outfits,
    canonical_garment_collection_members,
    canonical_garment_collections,
    canonical_garment_tags,
    canonical_garment_views,
    canonical_garments CASCADE`);
}

async function preF4Migrate(pool: Pool): Promise<void> {
  for (const file of [
    '022_managed_garments_and_initial_views.sql',
    '023_managed_garment_wardrobe_metadata.sql',
    '024_managed_garment_collections.sql',
    '025_managed_outfits.sql',
  ]) {
    await pool.query(await readFile(resolve(process.cwd(), 'server/core/fashion/migrations', file), 'utf8'));
  }
}

async function createClassifiedGarment(pool: Pool): Promise<Readonly<{ id: string; revision: number; primaryViewId: string }>> {
  const garments = new PostgresGarmentStore(pool);
  const wardrobe = new PostgresGarmentWardrobeStore(pool);
  const created = await garments.createWithInitialView(owner, {
    name: 'Schema garment', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: await tinyImage(),
  }, limits);
  const metadata = await wardrobe.updateMetadata(owner, created.id, created.revision, { category: 'tshirts' });
  return Object.freeze({ id: created.id, revision: metadata.revision, primaryViewId: created.primaryViewId });
}

function parametric(): unknown {
  return {
    schemaVersion: 1,
    coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
    points: [[0.1, 0.1], [0.9, 0.1], [0.5, 0.9]],
    triangles: [[0, 1, 2]],
    outline: [0, 1, 2],
  };
}

test('F4a representation schema readiness detects and repairs canonical drift', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await dropFashion(pool);
    await migrateGarmentSchema(pool);
    await checkGarmentRepresentationSchema(pool);
    await migrateGarmentRepresentationSchema(pool);
    await checkGarmentRepresentationSchema(pool);

    await pool.query(`ALTER TABLE canonical_garment_representations ALTER COLUMN admission_state SET DEFAULT 'REVOKED'`);
    await assert.rejects(checkGarmentRepresentationSchema(pool), /columns/);
    await migrateGarmentRepresentationSchema(pool);
    await checkGarmentRepresentationSchema(pool);

    await pool.query(`ALTER TABLE canonical_garment_representations DROP CONSTRAINT canonical_garment_representations_tier_check`);
    await pool.query(`ALTER TABLE canonical_garment_representations ADD CONSTRAINT canonical_garment_representations_tier_check CHECK (tier <> 'BROKEN')`);
    await assert.rejects(checkGarmentRepresentationSchema(pool), /tier_check/);
    await migrateGarmentRepresentationSchema(pool);
    await checkGarmentRepresentationSchema(pool);

    await pool.query(`DROP INDEX canonical_garment_representations_owner_garment_idx`);
    await pool.query(`CREATE INDEX canonical_garment_representations_owner_garment_idx ON canonical_garment_representations (garment_id,tenant_id,user_id)`);
    await assert.rejects(checkGarmentRepresentationSchema(pool), /canonical_garment_representations_owner_garment_idx/);
    await migrateGarmentRepresentationSchema(pool);
    await checkGarmentRepresentationSchema(pool);

    await pool.query(`CREATE OR REPLACE FUNCTION canonical_assert_garment_representation_summary()
      RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$`);
    await assert.rejects(checkGarmentRepresentationSchema(pool), /representation_summary_check/);
    await migrateGarmentRepresentationSchema(pool);
    await checkGarmentRepresentationSchema(pool);
  } finally {
    await pool.end();
  }
});

test('F4a migration rolls back rather than legitimizing an advanced tier without evidence', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await dropFashion(pool);
    await preF4Migrate(pool);
    const garment = await createClassifiedGarment(pool);
    await pool.query(`UPDATE canonical_garments SET representation_tier='PARAMETRIC' WHERE garment_id=$1`, [garment.id]);

    await assert.rejects(migrateGarmentRepresentationSchema(pool), /tier summary lacks matching admitted evidence/);
    const tableState = await pool.query(`SELECT to_regclass('canonical_garment_representations')::text AS representations`);
    assert.equal(tableState.rows[0].representations, null, 'failed migration must roll its newly-created authority tables back');
    const tier = await pool.query(`SELECT representation_tier FROM canonical_garments WHERE garment_id=$1`, [garment.id]);
    assert.equal(tier.rows[0].representation_tier, 'PARAMETRIC', 'failed repair must not silently rewrite pre-existing data');

    await pool.query(`UPDATE canonical_garments SET representation_tier='BASIC' WHERE garment_id=$1`, [garment.id]);
    await migrateGarmentRepresentationSchema(pool);
    await checkGarmentRepresentationSchema(pool);
  } finally {
    await pool.end();
  }
});

test('F4a migration rejects malformed persisted source lineage atomically', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await dropFashion(pool);
    await migrateGarmentSchema(pool);
    const garment = await createClassifiedGarment(pool);
    const representations = new PostgresGarmentRepresentationStore(pool);
    const admitted = await representations.admit(owner, garment.id, garment.revision, {
      tier: 'PARAMETRIC', generatorId: 'schema.fixture', generatorVersion: '1', sourceViewIds: [garment.primaryViewId], payload: parametric(),
    });

    await pool.query(`DROP TRIGGER canonical_garment_representation_sources_immutable_guard ON canonical_garment_representation_sources`);
    await pool.query(`DROP TRIGGER canonical_garment_representation_sources_source_set_check ON canonical_garment_representation_sources`);
    await pool.query(`DROP TRIGGER canonical_garment_representations_source_set_check ON canonical_garment_representations`);
    await pool.query(`DELETE FROM canonical_garment_representation_sources WHERE representation_id=$1`, [admitted.representation.id]);
    await assert.rejects(checkGarmentRepresentationSchema(pool), /immutable_guard|source_set_check/);

    await assert.rejects(migrateGarmentRepresentationSchema(pool), /invalid source lineage|source set/);
    const rows = await pool.query(`SELECT COUNT(*)::int AS count FROM canonical_garment_representation_sources WHERE representation_id=$1`, [admitted.representation.id]);
    assert.equal(rows.rows[0].count, 0, 'failed repair must preserve the pre-repair malformed state instead of partly mutating it');
    const missingTrigger = await pool.query(`SELECT 1 FROM pg_trigger WHERE tgname='canonical_garment_representation_sources_immutable_guard' AND NOT tgisinternal`);
    assert.equal(missingTrigger.rowCount, 0, 'failed migration must roll trigger recreation back');
  } finally {
    await pool.end();
  }
});
