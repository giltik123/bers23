import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { GarmentDeliveryAuthority } from '../server/core/fashion/garmentDeliveryAuthority.ts';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { createManagedGarmentHttpAdapter } from '../server/core/http/managedGarmentHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Garment acceptance');

const owner = Object.freeze({ tenantId: 'fashion-tenant-a', userId: 'fashion-user-a' });
const otherUser = Object.freeze({ tenantId: 'fashion-tenant-a', userId: 'fashion-user-b' });
const otherTenant = Object.freeze({ tenantId: 'fashion-tenant-b', userId: 'fashion-user-a' });
const limits = Object.freeze({ maxUploadBytes: 1024 * 1024, maxDimension: 64, maxPixels: 4096 });

async function jpeg(width: number, height: number): Promise<Uint8Array> {
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) {
    rgba[index] = 32 + (index % 191);
    rgba[index + 1] = 80;
    rgba[index + 2] = 140;
    rgba[index + 3] = 255;
  }
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).jpeg({ quality: 90 }).toBuffer());
}

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Managed garment test server did not expose a TCP address');
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createServer>): Promise<void> {
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
}

test('managed Garment creation owns canonical bytes and fails closed across user/tenant boundaries', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4 });
  await migrateGarmentSchema(pool);
  await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE');
  t.after(async () => {
    await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE').catch(() => undefined);
    await pool.end();
  });

  const store = new PostgresGarmentStore(pool);
  const first = await store.createWithInitialView(owner, {
    name: 'Blue jacket',
    viewKind: 'FRONT',
    sourceContentType: 'image/jpeg',
    bytes: await jpeg(4, 3),
  }, limits);

  assert.equal(first.name, 'Blue jacket');
  assert.equal(first.representationTier, 'BASIC');
  assert.equal(first.status, 'ACTIVE');
  assert.equal(first.revision, 1);
  assert.equal(first.views.length, 1);
  assert.equal(first.views[0].kind, 'FRONT');
  assert.equal(first.views[0].sourceContentType, 'image/jpeg');
  assert.equal(first.views[0].encoding, 'PNG_RGBA8_LOSSLESS');
  assert.equal(first.views[0].contentType, 'image/png');
  assert.equal(first.views[0].storageBackend, 'POSTGRES_BYTEA_V1');
  assert.match(first.views[0].contentSha256, /^[0-9a-f]{64}$/);
  assert.equal(first.primaryViewId, first.views[0].id);

  const canonical = await store.loadView(owner, first.id, first.primaryViewId);
  assert.ok(canonical);
  assert.deepEqual([...canonical.bytes.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10], 'stored managed view must be canonical PNG, not source JPEG bytes');
  assert.equal(canonical.contentSha256, first.views[0].contentSha256);

  assert.deepEqual((await store.list(owner)).map(item => item.id), [first.id]);
  assert.equal(await store.get(otherUser, first.id), undefined);
  assert.equal(await store.get(otherTenant, first.id), undefined);
  assert.equal(await store.loadView(otherUser, first.id, first.primaryViewId), undefined);
  assert.equal(await store.loadView(otherTenant, first.id, first.primaryViewId), undefined);

  const second = await store.createWithInitialView(otherUser, {
    name: 'Other user shirt',
    viewKind: 'FRONT',
    sourceContentType: 'image/jpeg',
    bytes: await jpeg(3, 2),
  }, limits);
  assert.notEqual(second.id, first.id);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('UPDATE canonical_garments SET primary_view_id=$1 WHERE garment_id=$2 AND tenant_id=$3 AND user_id=$4', [second.primaryViewId, first.id, owner.tenantId, owner.userId]);
    await assert.rejects(() => client.query('COMMIT'), (error: any) => error?.code === '23503');
    await client.query('ROLLBACK').catch(() => undefined);
  } finally { client.release(); }
  assert.equal((await store.get(owner, first.id))?.primaryViewId, first.primaryViewId, 'cross-owner primary-view substitution must not mutate the aggregate');

  await assert.rejects(
    () => store.createWithInitialView(owner, { name: 'Broken', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: new Uint8Array([1, 2, 3]) }, limits),
    (error: any) => error?.status === 400 && error?.code === 'invalid_garment_image',
  );
  assert.equal((await store.list(owner)).length, 1, 'failed decode must not create a partial Garment row');

  let now = 10_000;
  const delivery = new GarmentDeliveryAuthority('managed-garment-http-delivery-secret', () => now);
  const auth = Object.freeze({
    verify: (authorization: string | undefined) => {
      if (authorization === 'Bearer owner-token') return owner as any;
      if (authorization === 'Bearer other-token') return otherUser as any;
      throw Object.assign(new Error('Authentication required'), { status: 401, code: 'unauthorized' });
    },
  });
  const config = Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: ['http://client.test'],
    authChallengeSecret: 'managed-garment-http-csrf-secret',
    imageUploadLimitBytes: limits.maxUploadBytes,
    imageMaxDimension: limits.maxDimension,
    imageMaxPixels: limits.maxPixels,
  }) as any;
  const httpAdapter = createManagedGarmentHttpAdapter({ garments: store, delivery, auth, config, now: () => now });
  const server = createServer((request, response) => {
    void httpAdapter(request, response).then(handled => {
      if (!handled && !response.writableEnded) { response.statusCode = 404; response.end(); }
    });
  });
  const origin = await listen(server);
  t.after(() => closeServer(server));

  const httpImage = await jpeg(5, 4);
  const createResponse = await fetch(`${origin}/api/core/garments?name=${encodeURIComponent('HTTP coat')}&view=FRONT`, {
    method: 'POST',
    headers: { authorization: 'Bearer owner-token', 'content-type': 'image/jpeg', origin: 'http://client.test' },
    body: httpImage,
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json() as any;
  assert.equal(created.name, 'HTTP coat');
  assert.equal(created.representation_tier, 'BASIC');
  assert.equal(created.views.length, 1);
  assert.equal(created.views[0].storage_provenance, 'POSTGRES_BYTEA_V1');
  assert.equal(typeof created.views[0].delivery_url, 'string');
  assert.match(created.views[0].delivery_url, /^\/api\/core\/garments\/delivery\//);
  assert.equal('original_image_url' in created, false);
  assert.equal('image_url' in created, false);
  assert.equal('delivery_url' in created, false, 'delivery capability belongs to a view and must not become garment identity');

  const itemResponse = await fetch(`${origin}/api/core/garments/${encodeURIComponent(created.id)}`, { headers: { authorization: 'Bearer owner-token' } });
  assert.equal(itemResponse.status, 200);
  assert.equal((await itemResponse.json() as any).id, created.id);

  const otherItemResponse = await fetch(`${origin}/api/core/garments/${encodeURIComponent(created.id)}`, { headers: { authorization: 'Bearer other-token' } });
  assert.equal(otherItemResponse.status, 404);
  assert.equal((await otherItemResponse.json() as any).error, 'garment_not_found');

  const listResponse = await fetch(`${origin}/api/core/garments`, { headers: { authorization: 'Bearer owner-token' } });
  assert.equal(listResponse.status, 200);
  const ownerList = await listResponse.json() as any[];
  assert.deepEqual(new Set(ownerList.map(item => item.id)), new Set([first.id, created.id]));
  assert.equal(ownerList.some(item => item.id === second.id), false, 'owner list must not include another user garment');

  const deliveryResponse = await fetch(`${origin}${created.views[0].delivery_url}`, { headers: { authorization: 'Bearer owner-token' } });
  assert.equal(deliveryResponse.status, 200);
  assert.equal(deliveryResponse.headers.get('content-type'), 'image/png');
  assert.equal(deliveryResponse.headers.get('etag'), `"sha256-${created.views[0].content_sha256}"`);
  const delivered = new Uint8Array(await deliveryResponse.arrayBuffer());
  assert.deepEqual([...delivered.slice(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);

  const stolenDelivery = await fetch(`${origin}${created.views[0].delivery_url}`, { headers: { authorization: 'Bearer other-token' } });
  assert.equal(stolenDelivery.status, 404);
  assert.equal((await stolenDelivery.json() as any).error, 'garment_view_not_found');

  const beforeDenied = (await store.list(owner)).length;
  const deniedOrigin = await fetch(`${origin}/api/core/garments?name=Denied&view=FRONT`, {
    method: 'POST',
    headers: { authorization: 'Bearer owner-token', 'content-type': 'image/jpeg', origin: 'http://evil.test' },
    body: httpImage,
  });
  assert.equal(deniedOrigin.status, 403);
  assert.equal((await deniedOrigin.json() as any).error, 'origin_denied');
  assert.equal((await store.list(owner)).length, beforeDenied, 'denied Origin must not create a partial Garment');

  now += 5 * 60_000;
  const expiredDelivery = await fetch(`${origin}${created.views[0].delivery_url}`, { headers: { authorization: 'Bearer owner-token' } });
  assert.equal(expiredDelivery.status, 404);
  assert.equal((await expiredDelivery.json() as any).error, 'garment_view_not_found');
});

test('garment delivery capabilities are owner-bound and expire without changing durable garment/view identity', () => {
  let now = 1_000;
  const authority = new GarmentDeliveryAuthority('managed-garment-test-secret', () => now);
  const token = authority.issue(owner, 'garment-id', 'view-id', 2_000);
  const resolved = authority.resolve(token, owner);
  assert.equal(resolved.garmentId, 'garment-id');
  assert.equal(resolved.viewId, 'view-id');
  assert.equal(resolved.expiresAt, 2_000);

  assert.throws(() => authority.resolve(token, otherUser), (error: any) => error?.status === 404 && error?.code === 'garment_view_not_found');
  assert.throws(() => authority.resolve(token, otherTenant), (error: any) => error?.status === 404 && error?.code === 'garment_view_not_found');

  now = 2_000;
  assert.throws(() => authority.resolve(token, owner), (error: any) => error?.status === 404 && error?.code === 'garment_view_not_found');
});
