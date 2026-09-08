import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';
import { migrateAutomationDefinitionSchema } from '../server/core/automation/automationDefinitionSchema.ts';
import { PostgresAutomationDefinitionStore } from '../server/core/automation/PostgresAutomationDefinitionStore.ts';
import { createAutomationDefinitionHttpAdapter } from '../server/core/http/automationDefinitionHttpAdapter.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for Automation HTTP acceptance');
const limits = Object.freeze({ maxDimension: 4096, maxPixels: 16_777_216 });
const id = '22222222-2222-4222-8222-222222222222';

test('Automation HTTP exposes only revision-safe definition authority and rejects browser widening', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 2 });
  await pool.query('DROP TABLE IF EXISTS canonical_automation_definitions CASCADE');
  await migrateAutomationDefinitionSchema(pool);
  const definitions = new PostgresAutomationDefinitionStore(pool, limits, () => id);
  const auth = { verify: async (authorization: string | undefined) => Object.freeze({ tenantId: 'tenant-a', userId: authorization === 'Bearer user-b' ? 'user-b' : 'user-a', sessionId: 'transport-session', scopes: [] }) as any };
  const config = Object.freeze({ nodeEnv: 'test', allowedWebOrigins: Object.freeze(['http://client.test']), authChallengeSecret: 'automation-csrf-test-secret', authPublicOrigin: 'http://localhost' }) as any;
  const adapter = createAutomationDefinitionHttpAdapter({ definitions, auth, config, accepting: () => true });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('test server did not expose a TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, { ...init, headers: { authorization: 'Bearer user-a', ...(init.headers || {}) } });
  try {
    const hostile = await request('/api/core/automations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, name: 'Hostile', trigger: 'MANUAL', plan: { kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1', orthogonal_mode: 'ROTATE_180', target_width: 640, target_height: 480 }, provider: 'fal', credits: 100 }) });
    assert.equal(hostile.status, 400);

    const createdResponse = await request('/api/core/automations', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Manual deterministic cleanup', trigger: 'MANUAL', plan: { kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1', orthogonal_mode: 'ROTATE_180', target_width: 640, target_height: 480 } }) });
    assert.equal(createdResponse.status, 201);
    assert.equal(createdResponse.headers.get('x-automation-revision'), '1');
    const created = await createdResponse.json() as any;
    assert.equal(created.id, id);
    assert.equal(created.plan.orthogonal_mode, 'ROTATE_180');
    assert.equal(Object.hasOwn(created, 'actions'), false);
    assert.equal(Object.hasOwn(created, 'credits'), false);

    const foreign = await fetch(`${base}/api/core/automations/${id}`, { headers: { authorization: 'Bearer user-b' } });
    assert.equal(foreign.status, 404);
    const stale = await request(`/api/core/automations/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-expected-automation-revision': '2' }, body: JSON.stringify({ name: 'stale' }) });
    assert.equal(stale.status, 409);
    const widened = await request(`/api/core/automations/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json', 'x-expected-automation-revision': '1' }, body: JSON.stringify({ plan: { kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1', orthogonal_mode: 'ROTATE_90_CW', target_width: 320, target_height: 240, model: 'candidate' } }) });
    assert.equal(widened.status, 400);
    const archived = await request(`/api/core/automations/${id}/archive`, { method: 'POST', headers: { 'x-expected-automation-revision': '1' } });
    assert.equal(archived.status, 200);
    assert.equal(archived.headers.get('x-automation-revision'), '2');
    assert.equal((await archived.json() as any).status, 'ARCHIVED');
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
