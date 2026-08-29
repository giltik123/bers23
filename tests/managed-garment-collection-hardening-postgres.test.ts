import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { checkGarmentSchema, migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentCollectionStore } from '../server/core/fashion/postgresGarmentCollectionStore.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for F2b hardening acceptance');

const owner = Object.freeze({ tenantId: 'wardrobe-f2b-hardening', userId: 'owner' });
const limits = Object.freeze({ maxUploadBytes: 4 * 1024 * 1024, maxDimension: 1024, maxPixels: 1024 * 1024 });

async function jpeg(): Promise<Uint8Array> {
  const width = 64; const height = 64;
  const rgba = Buffer.alloc(width * height * 4, 120);
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).jpeg({ quality: 90 }).toBuffer());
}

async function garment(store: PostgresGarmentStore, name: string) {
  return store.createWithInitialView(owner, {
    name,
    viewKind: 'FRONT',
    sourceContentType: 'image/jpeg',
    bytes: await jpeg(),
  }, limits);
}

async function truncate(pool: Pool): Promise<void> {
  await pool.query(`TRUNCATE
    canonical_garment_collection_members,
    canonical_garment_collections,
    canonical_garment_views,
    canonical_garments CASCADE`);
}

test('F2b collection identity is UUID-canonical, Unicode-aligned and tombstone-stable', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  try {
    await migrateGarmentSchema(pool);
    await truncate(pool);
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const collections = new PostgresGarmentCollectionStore(pool);

    const source = await collections.create(owner, { name: '😀'.repeat(100), description: 'Unicode boundary' });
    assert.equal(Array.from(source.name).length, 100, 'API character limit must match PostgreSQL char_length semantics');
    await assert.rejects(
      () => collections.create(owner, { name: '😀'.repeat(101) }),
      (error: unknown) => (error as any)?.status === 400 && (error as any)?.code === 'invalid_collection_name',
    );
    const target = await collections.create(owner, { name: 'Target' });

    const moving = await garment(garments, 'Uppercase UUID probe');
    const added = await collections.addGarment(owner, source.id.toUpperCase(), 1, moving.id.toUpperCase());
    assert.equal(added.revision, 2);
    assert.deepEqual(added.garmentIds, [moving.id]);

    const moved = await collections.moveGarment(owner, {
      garmentId: moving.id.toUpperCase(),
      sourceCollectionId: source.id.toUpperCase(),
      targetCollectionId: target.id.toUpperCase(),
      expectedSourceRevision: 2,
      expectedTargetRevision: 1,
    });
    assert.equal(moved.source.revision, 3);
    assert.equal(moved.target.revision, 2);
    assert.deepEqual(moved.target.garmentIds, [moving.id]);

    const tombstone = await garment(garments, 'Durable tombstone reference');
    const withTombstone = await collections.addGarment(owner, source.id, 3, tombstone.id);
    assert.equal(withTombstone.revision, 4);
    assert.deepEqual(withTombstone.garmentIds, [tombstone.id]);

    await wardrobe.delete(owner, tombstone.id, 1);
    const afterDelete = await collections.get(owner, source.id);
    assert.equal(afterDelete?.revision, 4, 'Garment soft-delete must not silently mutate Collection revision');
    assert.deepEqual(afterDelete?.garmentIds, [tombstone.id], 'durable membership must survive Garment tombstoning until Collection mutation');

    await assert.rejects(
      () => collections.addGarment(owner, target.id, 2, tombstone.id),
      (error: unknown) => (error as any)?.status === 404 && (error as any)?.code === 'garment_not_found',
      'terminally deleted Garments cannot acquire new Collection membership',
    );

    const cleaned = await collections.removeGarment(owner, source.id, 4, tombstone.id.toUpperCase());
    assert.equal(cleaned.revision, 5);
    assert.deepEqual(cleaned.garmentIds, [], 'Collection owner can explicitly remove a durable tombstone reference');
  } finally {
    await truncate(pool).catch(() => undefined);
    await pool.end();
  }
});

test('F2b schema repair is transactional and verifies defaults, operators, PK identity and index structure', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 3 });
  try {
    await migrateGarmentSchema(pool);
    await truncate(pool);

    await pool.query('ALTER TABLE canonical_garment_collections ALTER COLUMN deleted_at SET DEFAULT CURRENT_TIMESTAMP');
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    const deletedDefault = await pool.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_garment_collections' AND column_name='deleted_at'`);
    assert.equal(deletedDefault.rows[0]?.column_default, null, 'deleted_at must remain opt-in tombstone state, never an insert default');

    await pool.query('ALTER TABLE canonical_garment_collections RENAME CONSTRAINT canonical_garment_collections_pkey TO future_collection_pk');
    await pool.query(`CREATE TABLE f2b_future_collection_refs (
      ref_id UUID PRIMARY KEY,
      collection_id UUID REFERENCES canonical_garment_collections(collection_id)
    )`);
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    const renamedPk = await pool.query(`SELECT conname FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections') AND contype='p'`);
    assert.equal(renamedPk.rows[0]?.conname, 'canonical_garment_collections_pkey');
    const futureFk = await pool.query(`SELECT convalidated FROM pg_constraint
      WHERE conrelid=to_regclass('f2b_future_collection_refs') AND contype='f'`);
    assert.equal(futureFk.rows[0]?.convalidated, true, 'renaming a structurally correct PK must preserve dependent future FKs');
    await pool.query('DROP TABLE f2b_future_collection_refs');

    await pool.query('DROP INDEX canonical_garment_collections_owner_updated_idx');
    await pool.query('CREATE INDEX canonical_garment_collections_owner_updated_idx ON canonical_garment_collections (collection_id)');
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    const indexState = await pool.query(`SELECT
      am.amname AS method,i.indisvalid,i.indisready,i.indpred IS NOT NULL AS partial,i.indexprs IS NOT NULL AS expressions,
      ARRAY(
        SELECT a.attname
        FROM unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(attnum,ord)
        JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.attnum
        WHERE k.ord <= i.indnkeyatts ORDER BY k.ord
      ) AS columns,
      ARRAY(
        SELECT o.option
        FROM unnest(i.indoption::smallint[]) WITH ORDINALITY AS o(option,ord)
        WHERE o.ord <= i.indnkeyatts ORDER BY o.ord
      ) AS options
      FROM pg_index i
      JOIN pg_class ic ON ic.oid=i.indexrelid
      JOIN pg_am am ON am.oid=ic.relam
      WHERE i.indexrelid=to_regclass('canonical_garment_collections_owner_updated_idx')`);
    assert.equal(indexState.rows[0]?.method, 'btree');
    assert.deepEqual(indexState.rows[0]?.columns, ['tenant_id', 'user_id', 'updated_at', 'collection_id']);
    assert.deepEqual(indexState.rows[0]?.options?.map(Number), [0, 0, 3, 0]);
    assert.equal(indexState.rows[0]?.indisvalid, true);
    assert.equal(indexState.rows[0]?.indisready, true);
    assert.equal(indexState.rows[0]?.partial, false);
    assert.equal(indexState.rows[0]?.expressions, false);

    await pool.query('ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_name_check');
    await pool.query(`ALTER TABLE canonical_garment_collections
      ADD CONSTRAINT canonical_garment_collections_name_check CHECK (
        char_length(name) >= 1 AND char_length(name) <= 100 AND name <> btrim(name) AND name ~ '[[:cntrl:]]'
      )`);
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);

    await pool.query('ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_name_check');
    await pool.query(`ALTER TABLE canonical_garment_collections
      ADD CONSTRAINT canonical_garment_collections_name_check CHECK (
        char_length(name) >= 1 AND char_length(name) <= 1000 AND name = btrim(name) AND name !~ '[[:cntrl:]]'
      )`);
    await pool.query(`INSERT INTO canonical_garment_collections
      (collection_id,tenant_id,user_id,name) VALUES
      ('11111111-1111-4111-8111-111111111111','rollback-tenant','rollback-user',$1)`, ['x'.repeat(101)]);
    await assert.rejects(() => migrateGarmentSchema(pool), (error: unknown) => (error as any)?.code === '23514');
    const rolledBackCheck = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collections') AND conname='canonical_garment_collections_name_check'`);
    assert.match(String(rolledBackCheck.rows[0]?.definition), /1000/, 'failed validation must roll back the canonical CHECK replacement');
    await pool.query(`DELETE FROM canonical_garment_collections WHERE tenant_id='rollback-tenant' AND user_id='rollback-user'`);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
  } finally {
    await pool.query('DROP TABLE IF EXISTS f2b_future_collection_refs').catch(() => undefined);
    await truncate(pool).catch(() => undefined);
    await pool.end();
  }
});
