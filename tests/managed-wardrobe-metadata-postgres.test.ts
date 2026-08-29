import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { once } from 'node:events';
import { Pool } from 'pg';
import sharp from 'sharp';
import { checkGarmentSchema, migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { createManagedWardrobeHttpAdapter } from '../server/core/http/managedWardrobeHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Wardrobe acceptance');

const owner = Object.freeze({ tenantId: 'wardrobe-f2a-tenant', userId: 'wardrobe-f2a-owner' });
const other = Object.freeze({ tenantId: 'wardrobe-f2a-tenant', userId: 'wardrobe-f2a-other' });
const limits = Object.freeze({ maxUploadBytes: 4 * 1024 * 1024, maxDimension: 1024, maxPixels: 1024 * 1024 });

async function jpeg(width = 640, height = 640): Promise<Uint8Array> {
  const rgba = Buffer.alloc(width * height * 4, 120);
  for (let index = 3; index < rgba.length; index += 4) rgba[index] = 255;
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).jpeg({ quality: 90 }).toBuffer());
}

function config() {
  return { allowedWebOrigins: ['https://editor.example.test'] } as any;
}

async function httpServer(wardrobe: PostgresGarmentWardrobeStore) {
  let principal: { tenantId: string; userId: string } = owner;
  const adapter = createManagedWardrobeHttpAdapter({
    wardrobe,
    auth: { verify: async () => principal as any },
    config: config(),
    accepting: () => true,
  });
  const server = createServer((request, response) => { void adapter(request, response); });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Wardrobe test server address is unavailable');
  return Object.freeze({
    baseUrl: `http://127.0.0.1:${address.port}`,
    setPrincipal(value: { tenantId: string; userId: string }) { principal = value; },
    close: () => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())),
  });
}

function headers(revision?: number): HeadersInit {
  return {
    Authorization: 'Bearer test',
    ...(revision === undefined ? {} : { 'X-Expected-Garment-Revision': String(revision) }),
  };
}

async function json(response: Response): Promise<any> { return response.json(); }

test('F2a owns typed wardrobe metadata and lifecycle on the same canonical Garment revision', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 });
  await migrateGarmentSchema(pool);
  await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE');
  const garments = new PostgresGarmentStore(pool);
  const wardrobe = new PostgresGarmentWardrobeStore(pool);
  const server = await httpServer(wardrobe);
  t.after(async () => {
    await server.close().catch(() => undefined);
    await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE').catch(() => undefined);
    await pool.end();
  });

  const initial = await garments.createWithInitialView(owner, {
    name: '  Navy   Coat  ',
    viewKind: 'FRONT',
    sourceContentType: 'image/jpeg',
    bytes: await jpeg(),
  }, limits);
  assert.equal(initial.revision, 1);

  let response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, { headers: headers() });
  assert.equal(response.status, 200);
  let body = await json(response);
  assert.equal(response.headers.get('x-garment-revision'), '1');
  assert.deepEqual({ category: body.category, seasons: body.seasons, materials: body.materials, tags: body.tags, favorite: body.favorite }, {
    category: 'UNSPECIFIED', seasons: [], materials: [], tags: [], favorite: false,
  });

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, {
    method: 'PATCH',
    headers: { ...headers(1), 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: '  Navy   Wool Coat ',
      category: 'outerwear',
      seasons: ['winter', 'AUTUMN', 'winter'],
      materials: [' Wool ', 'wool', ' Recycled   Polyester '],
      tags: [' Office ', 'navy', 'office'],
      favorite: true,
    }),
  });
  assert.equal(response.status, 200);
  body = await json(response);
  assert.equal(body.revision, 2);
  assert.equal(response.headers.get('x-garment-revision'), '2');
  assert.equal(body.name, 'Navy Wool Coat');
  assert.equal(body.category, 'OUTERWEAR');
  assert.deepEqual(body.seasons, ['AUTUMN', 'WINTER']);
  assert.deepEqual(body.materials, ['recycled polyester', 'wool']);
  assert.deepEqual(body.tags, ['navy', 'office']);
  assert.equal(body.favorite, true);

  const sharedRevision = await garments.get(owner, initial.id);
  assert.equal(sharedRevision?.revision, 2, 'F1 image authority must observe the same Garment revision changed by Wardrobe metadata');
  const staleCaptureBytes = await jpeg();
  await assert.rejects(
    () => garments.appendView(owner, initial.id, 1, { viewKind: 'BACK', sourceContentType: 'image/jpeg', bytes: staleCaptureBytes }, limits),
    (error: unknown) => (error as any)?.status === 412,
  );

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, {
    method: 'PATCH',
    headers: { ...headers(2), 'Content-Type': 'application/json' },
    body: JSON.stringify({ seasons: ['AUTUMN', 'WINTER'], materials: ['recycled polyester', 'wool'], tags: ['navy', 'office'], favorite: true, name: 'Navy Wool Coat', category: 'OUTERWEAR' }),
  });
  assert.equal(response.status, 200);
  assert.equal((await json(response)).revision, 2, 'normalized no-op patch must not create a new revision');

  const concurrent = await Promise.all([
    fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, {
      method: 'PATCH', headers: { ...headers(2), 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: false }),
    }),
    fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, {
      method: 'PATCH', headers: { ...headers(2), 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: ['navy', 'travel'] }),
    }),
  ]);
  assert.deepEqual(concurrent.map(value => value.status).sort(), [200, 412]);
  const afterConcurrent = await wardrobe.get(owner, initial.id);
  assert.equal(afterConcurrent?.revision, 3);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}/archive`, { method: 'POST', headers: headers(3) });
  assert.equal(response.status, 200);
  body = await json(response);
  assert.equal(body.status, 'ARCHIVED');
  assert.equal(body.revision, 4);
  const archivedCaptureBytes = await jpeg();
  await assert.rejects(
    () => garments.appendView(owner, initial.id, 4, { viewKind: 'BACK', sourceContentType: 'image/jpeg', bytes: archivedCaptureBytes }, limits),
    (error: unknown) => (error as any)?.status === 409 && (error as any)?.code === 'garment_not_active',
  );

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, {
    method: 'PATCH', headers: { ...headers(4), 'Content-Type': 'application/json' }, body: JSON.stringify({ tags: ['archived', 'navy'] }),
  });
  assert.equal(response.status, 200, 'archived Garment metadata remains editable while new image capture stays blocked');
  assert.equal((await json(response)).revision, 5);

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}/restore`, { method: 'POST', headers: headers(5) });
  assert.equal(response.status, 200);
  body = await json(response);
  assert.equal(body.status, 'ACTIVE');
  assert.equal(body.revision, 6);

  server.setPrincipal(other);
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, {
    method: 'PATCH', headers: { ...headers(6), 'Content-Type': 'application/json' }, body: JSON.stringify({ favorite: false }),
  });
  assert.equal(response.status, 404, 'foreign owner must not learn the current garment revision');
  server.setPrincipal(owner);

  await assert.rejects(
    () => pool.query(`UPDATE canonical_garments SET category='FORGED' WHERE garment_id=$1`, [initial.id]),
    (error: unknown) => (error as any)?.code === '23514',
  );
  await assert.rejects(
    () => pool.query(`INSERT INTO canonical_garment_tags (garment_id,tenant_id,user_id,tag) VALUES ($1,$2,$3,'forged')`,
    [initial.id, owner.tenantId, other.userId]),
    (error: unknown) => (error as any)?.code === '23503',
  );

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, { method: 'DELETE', headers: headers() });
  assert.equal(response.status, 428, 'delete requires the shared Garment revision precondition');
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, { method: 'DELETE', headers: headers(6) });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('x-garment-revision'), '7');
  assert.equal(await wardrobe.get(owner, initial.id), undefined, 'deleted Garment must disappear from Wardrobe authority');
  assert.equal(await garments.get(owner, initial.id), undefined, 'F1 aggregate reads must observe the same tombstone');
  assert.equal(await garments.loadView(owner, initial.id, initial.primaryViewId), undefined, 'existing view capability resolution must fail after Garment deletion');

  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, { headers: headers() });
  assert.equal(response.status, 404);
  response = await fetch(`${server.baseUrl}/api/core/wardrobe/garments/${initial.id}`, { method: 'DELETE', headers: headers(7) });
  assert.equal(response.status, 404, 'terminal deletion must not disclose a tombstoned revision');
});

test('F2a schema readiness rejects scalar, CHECK, PK and FK drift and migration repairs canonical semantics', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  try {
    await migrateGarmentSchema(pool);

    await pool.query('ALTER TABLE canonical_garments DROP COLUMN favorite');
    await assert.rejects(() => checkGarmentSchema(pool), /wardrobe schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);

    await pool.query('ALTER TABLE canonical_garments ALTER COLUMN favorite SET DEFAULT TRUE');
    await assert.rejects(() => checkGarmentSchema(pool), /wardrobe schema is incomplete/);
    await migrateGarmentSchema(pool);
    const favorite = await pool.query(`SELECT is_nullable,column_default FROM information_schema.columns
      WHERE table_schema=current_schema() AND table_name='canonical_garments' AND column_name='favorite'`);
    assert.equal(favorite.rows[0]?.is_nullable, 'NO');
    assert.equal(favorite.rows[0]?.column_default, 'false');

    await pool.query('ALTER TABLE canonical_garments DROP CONSTRAINT canonical_garments_category_check');
    await pool.query(`ALTER TABLE canonical_garments ADD CONSTRAINT canonical_garments_category_check CHECK (category IS NOT NULL)`);
    await assert.rejects(() => checkGarmentSchema(pool), /wardrobe schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    const categoryCheck = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garments') AND conname='canonical_garments_category_check'`);
    assert.match(String(categoryCheck.rows[0]?.definition), /UNSPECIFIED/);
    assert.match(String(categoryCheck.rows[0]?.definition), /OUTERWEAR/);
    assert.doesNotMatch(String(categoryCheck.rows[0]?.definition), /category IS NOT NULL/);

    await pool.query('ALTER TABLE canonical_garment_tags DROP CONSTRAINT canonical_garment_tags_pkey');
    await pool.query('ALTER TABLE canonical_garment_tags ADD CONSTRAINT canonical_garment_tags_pkey PRIMARY KEY (tenant_id,user_id,garment_id,tag)');
    await assert.rejects(() => checkGarmentSchema(pool), /wardrobe schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    const tagPk = await pool.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags') AND conname='canonical_garment_tags_pkey'`);
    assert.equal(tagPk.rows[0]?.definition, 'PRIMARY KEY (garment_id, tenant_id, user_id, tag)');

    await pool.query('ALTER TABLE canonical_garment_tags DROP CONSTRAINT canonical_garment_tags_owner_fkey');
    await pool.query(`ALTER TABLE canonical_garment_tags ADD CONSTRAINT canonical_garment_tags_owner_fkey
      FOREIGN KEY (garment_id,tenant_id,user_id) REFERENCES canonical_garments (garment_id,tenant_id,user_id) ON DELETE RESTRICT`);
    await assert.rejects(() => checkGarmentSchema(pool), /wardrobe schema is incomplete/);
    await migrateGarmentSchema(pool);
    await checkGarmentSchema(pool);
    const fk = await pool.query(`SELECT confdeltype,convalidated FROM pg_constraint
      WHERE conrelid=to_regclass('canonical_garment_tags') AND conname='canonical_garment_tags_owner_fkey'`);
    assert.equal(fk.rows[0]?.confdeltype, 'c');
    assert.equal(fk.rows[0]?.convalidated, true);
  } finally {
    await pool.end();
  }
});
