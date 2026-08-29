import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { checkGarmentSchema, migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresGarmentCollectionStore } from '../server/core/fashion/postgresGarmentCollectionStore.ts';
import { createManagedGarmentCollectionHttpAdapter } from '../server/core/http/managedGarmentCollectionHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Garment Collection acceptance');

const owner = Object.freeze({ tenantId: 'wardrobe-f2b-tenant', userId: 'wardrobe-f2b-owner' });
const other = Object.freeze({ tenantId: 'wardrobe-f2b-tenant', userId: 'wardrobe-f2b-other' });
const limits = Object.freeze({ maxUploadBytes: 4 * 1024 * 1024, maxDimension: 1024, maxPixels: 1024 * 1024 });

async function jpeg(): Promise<Uint8Array> {
  const width = 320; const height = 320;
  const rgba = Buffer.alloc(width * height * 4, 90);
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).jpeg({ quality: 90 }).toBuffer());
}

async function createGarment(store: PostgresGarmentStore, scope = owner, name = 'Jacket') {
  return store.createWithInitialView(scope, {
    name,
    viewKind: 'FRONT',
    sourceContentType: 'image/jpeg',
    bytes: await jpeg(),
  }, limits);
}

function config() { return { allowedWebOrigins: ['https://editor.example.test'] } as any; }

async function httpServer(collections: PostgresGarmentCollectionStore) {
  let principal: { tenantId: string; userId: string } = owner;
  let accepting = true;
  const adapter = createManagedGarmentCollectionHttpAdapter({
    collections,
    auth: { verify: async () => principal as any },
    config: config(),
    accepting: () => accepting,
  });
  const server = createServer((request, response) => { void adapter(request, response); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Collection test server address is unavailable');
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    setPrincipal(value: { tenantId: string; userId: string }) { principal = value; },
    setAccepting(value: boolean) { accepting = value; },
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  });
}

function revisionHeaders(revision: number): HeadersInit {
  return { Authorization: 'Bearer test', 'X-Expected-Collection-Revision': String(revision) };
}
function moveHeaders(sourceRevision: number, targetRevision: number): HeadersInit {
  return {
    Authorization: 'Bearer test',
    'X-Expected-Source-Collection-Revision': String(sourceRevision),
    'X-Expected-Target-Collection-Revision': String(targetRevision),
  };
}
async function json(response: Response): Promise<any> { return response.json(); }

async function truncate(pool: Pool) {
  await pool.query(`TRUNCATE
    canonical_garment_collection_members,
    canonical_garment_collections,
    canonical_garment_views,
    canonical_garments CASCADE`);
}

test('F2b owns revision-safe many-to-many Collection membership and atomic move/copy', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 8 });
  await migrateGarmentSchema(pool);
  await truncate(pool);
  const garments = new PostgresGarmentStore(pool);
  const wardrobe = new PostgresGarmentWardrobeStore(pool);
  const collections = new PostgresGarmentCollectionStore(pool);
  const server = await httpServer(collections);
  t.after(async () => {
    await server.close().catch(() => undefined);
    await truncate(pool).catch(() => undefined);
    await pool.end();
  });

  let response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections`, {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '  Summer   Trip  ', description: '  Warm   weather ' }),
  });
  assert.equal(response.status, 201);
  const sourceCreated = await json(response);
  assert.equal(sourceCreated.name, 'Summer Trip');
  assert.equal(sourceCreated.description, 'Warm weather');
  assert.equal(sourceCreated.revision, 1);
  assert.deepEqual(sourceCreated.garment_ids, []);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections`, {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Travel', description: '' }),
  });
  assert.equal(response.status, 201);
  const targetCreated = await json(response);
  assert.equal(targetCreated.revision, 1);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections`, {
    method: 'POST', headers: { Authorization: 'Bearer test', 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Invalid', garment_ids: [] }),
  });
  assert.equal(response.status, 400, 'generic collection fields must not be silently accepted');

  const sourceId = sourceCreated.id as string;
  const targetId = targetCreated.id as string;

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}`, {
    method: 'PATCH', headers: { ...revisionHeaders(1), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: '  Summer   Essentials ', description: 'Warm weather' }),
  });
  assert.equal(response.status, 200);
  let source = await json(response);
  assert.equal(source.revision, 2);
  assert.equal(source.name, 'Summer Essentials');

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}`, {
    method: 'PATCH', headers: { ...revisionHeaders(2), 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Summer Essentials', description: 'Warm weather' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await json(response)).revision, 2, 'normalized no-op rename must preserve revision');

  const garment1 = await createGarment(garments, owner, 'Jacket');
  const garment2 = await createGarment(garments, owner, 'Jeans');
  const garment3 = await createGarment(garments, owner, 'Archived scarf');
  const deletedGarment = await createGarment(garments, owner, 'Deleted hat');
  const foreignGarment = await createGarment(garments, other, 'Foreign coat');

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment1.id}`, {
    method: 'POST', headers: revisionHeaders(2),
  });
  assert.equal(response.status, 200);
  source = await json(response);
  assert.equal(source.revision, 3);
  assert.deepEqual(source.garment_ids, [garment1.id]);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment1.id}`, {
    method: 'POST', headers: revisionHeaders(3),
  });
  assert.equal(response.status, 200);
  assert.equal((await json(response)).revision, 3, 'idempotent add at current revision must not bump');

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${targetId}/garments/${garment1.id}`, {
    method: 'POST', headers: revisionHeaders(1),
  });
  assert.equal(response.status, 200);
  let target = await json(response);
  assert.equal(target.revision, 2);
  assert.deepEqual(target.garment_ids, [garment1.id]);
  assert.deepEqual((await collections.get(owner, sourceId))?.garmentIds, [garment1.id], 'copy/add must keep source membership');

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${targetId}/garments/${garment1.id}`, {
    method: 'DELETE', headers: revisionHeaders(2),
  });
  assert.equal(response.status, 200);
  target = await json(response);
  assert.equal(target.revision, 3);
  assert.deepEqual(target.garment_ids, []);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/move/${targetId}/garments/${garment1.id}`, {
    method: 'POST', headers: moveHeaders(3, 3),
  });
  assert.equal(response.status, 200);
  let moved = await json(response);
  assert.equal(response.headers.get('x-source-collection-revision'), '4');
  assert.equal(response.headers.get('x-target-collection-revision'), '4');
  assert.equal(moved.target_changed, true);
  assert.deepEqual(moved.source.garment_ids, []);
  assert.deepEqual(moved.target.garment_ids, [garment1.id]);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment2.id}`, {
    method: 'POST', headers: revisionHeaders(4),
  });
  assert.equal(response.status, 200);
  assert.equal((await json(response)).revision, 5);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/move/${targetId}/garments/${garment2.id}`, {
    method: 'POST', headers: moveHeaders(4, 4),
  });
  assert.equal(response.status, 412, 'stale source revision must reject the whole move');
  source = await collections.get(owner, sourceId);
  target = await collections.get(owner, targetId);
  assert.equal(source?.revision, 5);
  assert.equal(target?.revision, 4);
  assert.equal(source?.garmentIds.includes(garment2.id), true);
  assert.equal(target?.garmentIds.includes(garment2.id), false, 'stale move must not partially add target membership');

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/move/${targetId}/garments/${garment2.id}`, {
    method: 'POST', headers: moveHeaders(5, 4),
  });
  assert.equal(response.status, 200);
  moved = await json(response);
  assert.equal(moved.source.revision, 6);
  assert.equal(moved.target.revision, 5);
  assert.deepEqual(new Set(moved.target.garment_ids), new Set([garment1.id, garment2.id]));

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment1.id}`, {
    method: 'POST', headers: revisionHeaders(6),
  });
  assert.equal(response.status, 200);
  assert.equal((await json(response)).revision, 7);
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/move/${targetId}/garments/${garment1.id}`, {
    method: 'POST', headers: moveHeaders(7, 5),
  });
  assert.equal(response.status, 200);
  moved = await json(response);
  assert.equal(moved.source.revision, 8);
  assert.equal(moved.target.revision, 5, 'target revision must not bump when membership already exists');
  assert.equal(moved.target_changed, false);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/move/${targetId}/garments/${garment1.id}`, {
    method: 'POST', headers: moveHeaders(8, 5),
  });
  assert.equal(response.status, 409, 'move requires actual source membership and cannot silently become copy');
  assert.equal((await collections.get(owner, sourceId))?.revision, 8);
  assert.equal((await collections.get(owner, targetId))?.revision, 5);

  const archived = await wardrobe.archive(owner, garment3.id, 1);
  assert.equal(archived.status, 'ARCHIVED');
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment3.id}`, {
    method: 'POST', headers: revisionHeaders(8),
  });
  assert.equal(response.status, 200, 'archived Garments remain valid durable collection references');
  assert.equal((await json(response)).revision, 9);

  await wardrobe.delete(owner, deletedGarment.id, 1);
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${deletedGarment.id}`, {
    method: 'POST', headers: revisionHeaders(9),
  });
  assert.equal(response.status, 404, 'terminally deleted Garments cannot be added');
  assert.equal((await collections.get(owner, sourceId))?.revision, 9);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${foreignGarment.id}`, {
    method: 'POST', headers: revisionHeaders(9),
  });
  assert.equal(response.status, 404, 'foreign Garment substitution must not disclose ownership or revision');
  assert.equal((await collections.get(owner, sourceId))?.revision, 9);

  server.setPrincipal(other);
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}`, { headers: { Authorization: 'Bearer test' } });
  assert.equal(response.status, 404, 'foreign Collection is non-disclosing');
  server.setPrincipal(owner);

  await assert.rejects(
    () => pool.query(`INSERT INTO canonical_garment_collection_members
      (collection_id,garment_id,tenant_id,user_id) VALUES ($1,$2,$3,$4)`,
    [sourceId, foreignGarment.id, owner.tenantId, owner.userId]),
    (error: unknown) => (error as any)?.code === '23503',
  );

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment2.id}`, {
    method: 'POST', headers: { ...revisionHeaders(9), Origin: 'https://evil.example' },
  });
  assert.equal(response.status, 403);
  assert.equal((await collections.get(owner, sourceId))?.revision, 9, 'denied Origin must not mutate membership');

  server.setAccepting(false);
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment2.id}`, {
    method: 'POST', headers: revisionHeaders(9),
  });
  assert.equal(response.status, 503);
  server.setAccepting(true);
  assert.equal((await collections.get(owner, sourceId))?.revision, 9, 'shutdown admission must precede mutation');

  const garment5 = await createGarment(garments, owner, 'Concurrent one');
  const garment6 = await createGarment(garments, owner, 'Concurrent two');
  const concurrent = await Promise.all([
    fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment5.id}`, { method: 'POST', headers: revisionHeaders(9) }),
    fetch(`${server.baseUrl}/api/core/wardrobe/collections/${sourceId}/garments/${garment6.id}`, { method: 'POST', headers: revisionHeaders(9) }),
  ]);
  assert.deepEqual(concurrent.map(value => value.status).sort(), [200, 412]);
  source = await collections.get(owner, sourceId);
  assert.equal(source?.revision, 10);
  assert.equal([garment5.id, garment6.id].filter(id => source?.garmentIds.includes(id)).length, 1, 'same-revision adds serialize to one winner');

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${targetId}`, { method: 'DELETE', headers: { Authorization: 'Bearer test' } });
  assert.equal(response.status, 428);
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${targetId}`, { method: 'DELETE', headers: revisionHeaders(5) });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-collection-revision'), '6');
  assert.equal(await collections.get(owner, targetId), undefined);
  assert.notEqual(await garments.get(owner, garment1.id), undefined, 'deleting a collection must never delete Garments');
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/collections/${targetId}`, { method: 'DELETE', headers: revisionHeaders(6) });
  assert.equal(response.status, 404, 'deleted Collection revision is not disclosed');
});

test('F2b schema readiness rejects and repairs Collection column, PK, CHECK and FK drift', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await migrateGarmentSchema(pool);
    await truncate(pool);

    await pool.query('ALTER TABLE canonical_garment_collections DROP COLUMN description');
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    const description = await pool.query(`SELECT is_nullable,column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_garment_collections' AND column_name='description'`);
    assert.equal(description.rows[0]?.is_nullable, 'NO');
    assert.equal(description.rows[0]?.column_default, "''::text");

    await pool.query('ALTER TABLE canonical_garment_collections ALTER COLUMN revision SET DEFAULT 2');
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    const revision = await pool.query(`SELECT column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_garment_collections' AND column_name='revision'`);
    assert.equal(revision.rows[0]?.column_default, '1');

    await pool.query('ALTER TABLE canonical_garment_collections DROP CONSTRAINT canonical_garment_collections_name_check');
    await pool.query(`ALTER TABLE canonical_garment_collections ADD CONSTRAINT canonical_garment_collections_name_check CHECK (name IS NOT NULL)`);
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);

    await pool.query('ALTER TABLE canonical_garment_collection_members DROP COLUMN created_at');
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);

    await pool.query('ALTER TABLE canonical_garment_collection_members DROP CONSTRAINT canonical_garment_collection_members_pkey');
    await pool.query('ALTER TABLE canonical_garment_collection_members ADD CONSTRAINT canonical_garment_collection_members_pkey PRIMARY KEY (garment_id,collection_id)');
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    const pk = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collection_members') AND conname='canonical_garment_collection_members_pkey'`);
    assert.equal(pk.rows[0]?.definition, 'PRIMARY KEY (collection_id, garment_id)');

    await pool.query('ALTER TABLE canonical_garment_collection_members DROP CONSTRAINT canonical_garment_collection_members_garment_owner_fkey');
    await pool.query(`ALTER TABLE canonical_garment_collection_members ADD CONSTRAINT canonical_garment_collection_members_garment_owner_fkey
      FOREIGN KEY (garment_id,tenant_id,user_id) REFERENCES canonical_garments (garment_id,tenant_id,user_id) ON DELETE RESTRICT`);
    await assert.rejects(() => checkGarmentSchema(pool), /Collection schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    const fk = await pool.query(`SELECT confdeltype,convalidated FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_collection_members') AND conname='canonical_garment_collection_members_garment_owner_fkey'`);
    assert.equal(fk.rows[0]?.confdeltype, 'c');
    assert.equal(fk.rows[0]?.convalidated, true);
  } finally {
    await truncate(pool).catch(() => undefined);
    await pool.end();
  }
});
