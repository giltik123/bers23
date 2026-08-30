import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { migrateGarmentSchema } from '../server/core/fashion/garmentSchema.ts';
import { PostgresGarmentStore } from '../server/core/fashion/postgresGarmentStore.ts';
import { PostgresGarmentWardrobeStore } from '../server/core/fashion/postgresGarmentWardrobeStore.ts';
import { PostgresOutfitStore } from '../server/core/fashion/postgresOutfitStore.ts';
import { createManagedOutfitHttpAdapter } from '../server/core/http/managedOutfitHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Outfit HTTP acceptance');

const owner = Object.freeze({ tenantId: 'fashion-http-tenant', userId: 'fashion-http-user' });
const limits = Object.freeze({ maxUploadBytes: 1024 * 1024, maxDimension: 64, maxPixels: 4096 });

async function reset(pool: Pool): Promise<void> {
  await pool.query(`DROP TABLE IF EXISTS
    canonical_outfit_entries,canonical_outfits,
    canonical_garment_collection_members,canonical_garment_collections,
    canonical_garment_tags,canonical_garment_views,canonical_garments CASCADE`);
  await migrateGarmentSchema(pool);
}

async function listen(server: ReturnType<typeof createServer>): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Managed Outfit test server did not expose a TCP address');
  return `http://127.0.0.1:${address.port}`;
}

test('managed Outfit HTTP route exposes only narrow revision-safe authority', async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  let server: ReturnType<typeof createServer> | undefined;
  try {
    await reset(pool);
    const image = new Uint8Array(await sharp({
      create: { width: 2, height: 2, channels: 4, background: { r: 120, g: 80, b: 50, alpha: 1 } },
    }).png().toBuffer());
    const garments = new PostgresGarmentStore(pool);
    const wardrobe = new PostgresGarmentWardrobeStore(pool);
    const garment = await garments.createWithInitialView(owner, {
      name: 'HTTP tee', viewKind: 'FRONT', sourceContentType: 'image/png', bytes: image,
    }, limits);
    await wardrobe.updateMetadata(owner, garment.id, garment.revision, { category: 'tshirts' });

    const outfits = new PostgresOutfitStore(pool);
    const config = {
      nodeEnv: 'test',
      allowedWebOrigins: ['http://127.0.0.1:3000'],
      allowApiBearerAuth: true,
      authPublicOrigin: 'http://127.0.0.1:3000',
      authChallengeSecret: 'managed-outfit-http-test-secret',
    } as any;
    const auth = {
      verify: async (authorization: string | undefined) => {
        if (authorization !== 'Bearer managed-outfit-test') throw Object.assign(new Error('Unauthorized'), { status: 401, code: 'unauthorized' });
        return owner;
      },
    };
    const adapter = createManagedOutfitHttpAdapter({ outfits, auth, config, accepting: () => true });
    server = createServer((request, response) => { void adapter(request, response); });
    const origin = await listen(server);
    const headers = { authorization: 'Bearer managed-outfit-test', 'content-type': 'application/json' };

    const pollutedCreate = await fetch(`${origin}/api/core/wardrobe/outfits`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'Polluted', tenant_id: 'attacker' }),
    });
    assert.equal(pollutedCreate.status, 400);
    assert.equal((await pollutedCreate.json()).error, 'invalid_outfit_create');

    const create = await fetch(`${origin}/api/core/wardrobe/outfits`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'HTTP Outfit', style: 'casual' }),
    });
    assert.equal(create.status, 201);
    assert.equal(create.headers.get('x-outfit-revision'), '1');
    const created: any = await create.json();
    assert.equal(created.name, 'HTTP Outfit');
    assert.equal(created.revision, 1);
    assert.equal(created.reference_readiness, 'EMPTY');
    assert.equal(Object.hasOwn(created, 'tenant_id'), false);
    assert.equal(Object.hasOwn(created, 'user_id'), false);

    const missingPrecondition = await fetch(`${origin}/api/core/wardrobe/outfits/${created.id}`, {
      method: 'PATCH', headers, body: JSON.stringify({ favorite: true }),
    });
    assert.equal(missingPrecondition.status, 428);
    assert.equal((await missingPrecondition.json()).error, 'outfit_revision_precondition_required');

    const add = await fetch(`${origin}/api/core/wardrobe/outfits/${created.id}/entries`, {
      method: 'POST',
      headers: { ...headers, 'x-expected-outfit-revision': '1' },
      body: JSON.stringify({ garment_id: garment.id.toUpperCase(), layer_role: 'base_top' }),
    });
    assert.equal(add.status, 200);
    assert.equal(add.headers.get('x-outfit-revision'), '2');
    const added: any = await add.json();
    assert.equal(added.entries.length, 1);
    assert.equal(added.entries[0].garment_id, garment.id);
    assert.equal(added.entries[0].layer_role, 'BASE_TOP');
    assert.equal(added.entries[0].reference_readiness, 'READY');

    const stale = await fetch(`${origin}/api/core/wardrobe/outfits/${created.id}`, {
      method: 'PATCH',
      headers: { ...headers, 'x-expected-outfit-revision': '1' },
      body: JSON.stringify({ favorite: true }),
    });
    assert.equal(stale.status, 412);
    assert.equal((await stale.json()).error, 'outfit_revision_conflict');

    const duplicate = await fetch(`${origin}/api/core/wardrobe/outfits/${created.id}/duplicate`, {
      method: 'POST', headers, body: JSON.stringify({ name: 'HTTP Outfit Copy' }),
    });
    assert.equal(duplicate.status, 201);
    const copied: any = await duplicate.json();
    assert.equal(copied.revision, 1);
    assert.equal(copied.entries.length, 1);
    assert.notEqual(copied.entries[0].entry_id, added.entries[0].entry_id);

    const list = await fetch(`${origin}/api/core/wardrobe/outfits`, {
      headers: { authorization: 'Bearer managed-outfit-test' },
    });
    assert.equal(list.status, 200);
    const listed: any[] = await list.json();
    assert.equal(listed.length, 2);
    assert.ok(listed.every(item => !Object.hasOwn(item, 'tenant_id') && !Object.hasOwn(item, 'user_id')));
  } finally {
    if (server) await new Promise<void>((resolve, reject) => server!.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
