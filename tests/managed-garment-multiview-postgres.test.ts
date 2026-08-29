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
if (!databaseUrl) throw new Error('DATABASE_URL is required for managed Garment multi-view acceptance');
const owner = Object.freeze({ tenantId: 'fashion-f1b-tenant', userId: 'fashion-f1b-owner' });
const otherUser = Object.freeze({ tenantId: 'fashion-f1b-tenant', userId: 'fashion-f1b-other' });
const limits = Object.freeze({ maxUploadBytes: 4 * 1024 * 1024, maxDimension: 1024, maxPixels: 1024 * 1024 });

async function jpeg(width: number, height: number, seed: number): Promise<Uint8Array> {
  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < rgba.length; index += 4) { rgba[index] = (seed + index) % 251; rgba[index + 1] = (seed * 3 + index) % 241; rgba[index + 2] = (seed * 7 + index) % 239; rgba[index + 3] = 255; }
  return new Uint8Array(await sharp(rgba, { raw: { width, height, channels: 4 } }).jpeg({ quality: 88 }).toBuffer());
}
async function listen(server: ReturnType<typeof createServer>): Promise<string> { await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); }); const address = server.address(); if (!address || typeof address === 'string') throw new Error('Managed garment F1b server did not expose a TCP address'); return `http://127.0.0.1:${address.port}`; }
async function closeServer(server: ReturnType<typeof createServer>): Promise<void> { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
function authHeaders(token: 'owner-token' | 'other-token', etag?: string) { return { authorization: `Bearer ${token}`, origin: 'http://client.test', ...(etag ? { 'if-match': etag } : {}) }; }

test('F1b appends immutable views to one garment with revision concurrency and truthful capture assessment', async t => {
  const pool = new Pool({ connectionString: databaseUrl, max: 6 }); await migrateGarmentSchema(pool); await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE');
  t.after(async () => { await pool.query('TRUNCATE canonical_garment_views,canonical_garments CASCADE').catch(() => undefined); await pool.end(); });
  const store = new PostgresGarmentStore(pool); const delivery = new GarmentDeliveryAuthority('managed-garment-f1b-delivery-secret', () => 100_000);
  const auth = Object.freeze({ verify: (authorization: string | undefined) => { if (authorization === 'Bearer owner-token') return owner as any; if (authorization === 'Bearer other-token') return otherUser as any; throw Object.assign(new Error('Authentication required'), { status: 401, code: 'unauthorized' }); } });
  const config = Object.freeze({ nodeEnv: 'test', allowApiBearerAuth: true, allowedWebOrigins: ['http://client.test'], authChallengeSecret: 'managed-garment-f1b-csrf', imageUploadLimitBytes: limits.maxUploadBytes, imageMaxDimension: limits.maxDimension, imageMaxPixels: limits.maxPixels }) as any;
  const adapter = createManagedGarmentHttpAdapter({ garments: store, delivery, auth, config, accepting: () => true, now: () => 100_000 });
  const server = createServer((request, response) => { void adapter(request, response).then(handled => { if (!handled && !response.writableEnded) { response.statusCode = 404; response.end(); } }); }); const origin = await listen(server); t.after(() => closeServer(server));

  const preflight = await fetch(`${origin}/api/core/garments/example/views`, { method: 'OPTIONS', headers: { origin: 'http://client.test', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,if-match' } });
  assert.equal(preflight.status, 204); assert.match(preflight.headers.get('access-control-allow-headers') ?? '', /If-Match/);

  const createdResponse = await fetch(`${origin}/api/core/garments?name=F1b%20jacket&view=FRONT`, { method: 'POST', headers: { ...authHeaders('owner-token'), 'content-type': 'image/jpeg' }, body: await jpeg(640, 640, 1) });
  assert.equal(createdResponse.status, 201); assert.equal(createdResponse.headers.get('etag'), '"garment-revision-1"'); const created = await createdResponse.json() as any;
  assert.equal(created.revision, 1); assert.equal(created.views.length, 1); assert.equal(created.views[0].kind, 'FRONT'); assert.equal(created.capture_assessment.cardinal_complete, false); assert.equal(created.capture_assessment.cardinal_coverage_score, 0.25);
  assert.deepEqual(created.capture_assessment.present_cardinal_view_kinds, ['FRONT']); assert.deepEqual(created.capture_assessment.missing_cardinal_view_kinds, ['BACK', 'LEFT', 'RIGHT']); assert.equal(created.capture_assessment.technical_resolution.status, 'ADEQUATE'); assert.equal(created.capture_assessment.semantic_quality, 'NOT_ASSESSED');
  const stableGarmentId = created.id; const stablePrimaryViewId = created.primary_view_id;

  const missingPrecondition = await fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=BACK`, { method: 'POST', headers: { ...authHeaders('owner-token'), 'content-type': 'image/jpeg' }, body: await jpeg(600, 600, 2) });
  assert.equal(missingPrecondition.status, 428); assert.equal((await missingPrecondition.json() as any).error, 'garment_revision_precondition_required'); assert.equal((await store.get(owner, stableGarmentId))?.revision, 1);
  const malformedPrecondition = await fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=BACK`, { method: 'POST', headers: { ...authHeaders('owner-token', 'garment-revision-1'), 'content-type': 'image/jpeg' }, body: await jpeg(600, 600, 3) });
  assert.equal(malformedPrecondition.status, 400); assert.equal((await malformedPrecondition.json() as any).error, 'invalid_garment_revision_precondition');

  const backResponse = await fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=BACK`, { method: 'POST', headers: { ...authHeaders('owner-token', '"garment-revision-1"'), 'content-type': 'image/jpeg' }, body: await jpeg(200, 700, 4) });
  assert.equal(backResponse.status, 201); assert.equal(backResponse.headers.get('etag'), '"garment-revision-2"'); const afterBack = await backResponse.json() as any;
  assert.equal(afterBack.id, stableGarmentId); assert.equal(afterBack.primary_view_id, stablePrimaryViewId); assert.equal(afterBack.revision, 2); assert.deepEqual(afterBack.views.map((view: any) => view.ordinal), [0, 1]); assert.deepEqual(afterBack.views.map((view: any) => view.kind), ['FRONT', 'BACK']);
  assert.deepEqual(afterBack.capture_assessment.missing_cardinal_view_kinds, ['LEFT', 'RIGHT']); assert.equal(afterBack.capture_assessment.technical_resolution.status, 'NEEDS_HIGHER_RESOLUTION'); assert.deepEqual(afterBack.capture_assessment.technical_resolution.low_resolution_cardinal_view_kinds, ['BACK']); assert.deepEqual(afterBack.capture_assessment.technical_resolution.low_resolution_view_ids, [afterBack.views[1].id]); assert.equal(afterBack.capture_assessment.semantic_quality, 'NOT_ASSESSED');

  const stale = await fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=LEFT`, { method: 'POST', headers: { ...authHeaders('owner-token', '"garment-revision-1"'), 'content-type': 'image/jpeg' }, body: await jpeg(620, 620, 5) });
  assert.equal(stale.status, 412); assert.equal((await stale.json() as any).error, 'garment_revision_conflict'); assert.equal((await store.get(owner, stableGarmentId))?.views.length, 2);
  const stolen = await fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=LEFT`, { method: 'POST', headers: { ...authHeaders('other-token', '"garment-revision-2"'), 'content-type': 'image/jpeg' }, body: await jpeg(620, 620, 6) });
  assert.equal(stolen.status, 404); assert.equal((await stolen.json() as any).error, 'garment_not_found');

  const leftBytes = await jpeg(620, 620, 7); const rightBytes = await jpeg(630, 630, 8);
  const [leftAttempt, rightAttempt] = await Promise.all([
    fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=LEFT`, { method: 'POST', headers: { ...authHeaders('owner-token', '"garment-revision-2"'), 'content-type': 'image/jpeg' }, body: leftBytes }),
    fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=RIGHT`, { method: 'POST', headers: { ...authHeaders('owner-token', '"garment-revision-2"'), 'content-type': 'image/jpeg' }, body: rightBytes }),
  ]);
  assert.deepEqual([leftAttempt.status, rightAttempt.status].sort((a, b) => a - b), [201, 412]); const winner = leftAttempt.status === 201 ? await leftAttempt.json() as any : await rightAttempt.json() as any; const loser = leftAttempt.status === 412 ? await leftAttempt.json() as any : await rightAttempt.json() as any;
  assert.equal(loser.error, 'garment_revision_conflict'); assert.equal(winner.revision, 3); assert.equal(winner.id, stableGarmentId); assert.equal(winner.views.length, 3);
  const winnerKinds = new Set(winner.views.map((view: any) => view.kind)); const remainingKind = winnerKinds.has('LEFT') ? 'RIGHT' : 'LEFT'; assert.deepEqual(winner.capture_assessment.missing_cardinal_view_kinds, [remainingKind]);

  const completedResponse = await fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=${remainingKind}`, { method: 'POST', headers: { ...authHeaders('owner-token', '"garment-revision-3"'), 'content-type': 'image/jpeg' }, body: await jpeg(640, 640, 9) });
  assert.equal(completedResponse.status, 201); assert.equal(completedResponse.headers.get('etag'), '"garment-revision-4"'); const completed = await completedResponse.json() as any;
  assert.equal(completed.id, stableGarmentId); assert.equal(completed.primary_view_id, stablePrimaryViewId); assert.equal(completed.revision, 4); assert.equal(completed.views.length, 4); assert.deepEqual(completed.views.map((view: any) => view.ordinal), [0, 1, 2, 3]); assert.equal(new Set(completed.views.map((view: any) => view.id)).size, 4);
  assert.equal(completed.capture_assessment.cardinal_complete, true); assert.equal(completed.capture_assessment.cardinal_coverage_score, 1); assert.deepEqual(completed.capture_assessment.missing_cardinal_view_kinds, []); assert.deepEqual(completed.capture_assessment.next_capture_requests, [{ view_kind: 'BACK', reason: 'LOW_RESOLUTION_CARDINAL_VIEW' }]); assert.equal(completed.capture_assessment.semantic_quality, 'NOT_ASSESSED'); assert.equal(completed.representation_tier, 'BASIC');

  const betterBackResponse = await fetch(`${origin}/api/core/garments/${stableGarmentId}/views?view=BACK`, { method: 'POST', headers: { ...authHeaders('owner-token', '"garment-revision-4"'), 'content-type': 'image/jpeg' }, body: await jpeg(700, 700, 10) });
  assert.equal(betterBackResponse.status, 201); assert.equal(betterBackResponse.headers.get('etag'), '"garment-revision-5"'); const improved = await betterBackResponse.json() as any;
  assert.equal(improved.id, stableGarmentId); assert.equal(improved.primary_view_id, stablePrimaryViewId); assert.equal(improved.revision, 5); assert.equal(improved.views.length, 5); assert.deepEqual(improved.views.filter((view: any) => view.kind === 'BACK').map((view: any) => view.ordinal), [1, 4]); assert.equal(improved.capture_assessment.technical_resolution.status, 'ADEQUATE'); assert.deepEqual(improved.capture_assessment.technical_resolution.low_resolution_cardinal_view_kinds, []); assert.deepEqual(improved.capture_assessment.technical_resolution.low_resolution_view_ids, []); assert.deepEqual(improved.capture_assessment.next_capture_requests, []); assert.equal(improved.capture_assessment.semantic_quality, 'NOT_ASSESSED'); assert.equal(improved.representation_tier, 'BASIC');

  const getResponse = await fetch(`${origin}/api/core/garments/${stableGarmentId}`, { headers: authHeaders('owner-token') }); assert.equal(getResponse.status, 200); assert.equal(getResponse.headers.get('etag'), '"garment-revision-5"'); const reloaded = await getResponse.json() as any; assert.equal(reloaded.revision, 5); assert.equal(reloaded.views.length, 5); assert.equal(reloaded.capture_assessment.cardinal_complete, true); assert.equal(reloaded.capture_assessment.technical_resolution.status, 'ADEQUATE');
  const invalidId = await fetch(`${origin}/api/core/garments/not-a-uuid/views?view=DETAIL`, { method: 'POST', headers: { ...authHeaders('owner-token', '"garment-revision-5"'), 'content-type': 'image/jpeg' }, body: await jpeg(600, 600, 11) }); assert.equal(invalidId.status, 404); assert.equal((await invalidId.json() as any).error, 'garment_not_found'); assert.equal((await store.get(owner, stableGarmentId))?.revision, 5);
});
