import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresAutomationDefinitionStore } from '../server/core/automation/PostgresAutomationDefinitionStore.ts';
import { PostgresAutomationScheduleStore } from '../server/core/automation/PostgresAutomationScheduleStore.ts';
import { createAutomationScheduleHttpAdapter } from '../server/core/http/automationScheduleHttpAdapter.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for C3d Automation schedule HTTP acceptance');
const LIMITS = Object.freeze({ maxDimension: 4096, maxPixels: 16_777_216 });

async function png() {
  return new Uint8Array(await sharp({
    create: { width: 3, height: 2, channels: 4, background: { r: 20, g: 30, b: 40, alpha: 1 } },
  }).png().toBuffer());
}

test('authenticated schedule HTTP exposes only bounded revision-safe configuration authority', async () => {
  const pool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-c3d-schedule-http' });
  const scope = Object.freeze({ tenantId: `tenant-http-${randomUUID()}`, userId: `user-http-${randomUUID()}` });
  const otherUserId = `other-${randomUUID()}`;
  const projects = new PostgresProjectStore(pool);
  const project = await projects.create(scope, 'C3d schedule HTTP', await png(), LIMITS);
  const definitions = new PostgresAutomationDefinitionStore(pool, LIMITS);
  const definition = await definitions.create(scope, Object.freeze({
    name: 'Recurring deterministic rotate',
    trigger: 'MANUAL',
    plan: Object.freeze({
      kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1',
      orthogonalMode: 'ROTATE_90_CW',
      targetWidth: 5,
      targetHeight: 7,
    }),
  }));
  const schedules = new PostgresAutomationScheduleStore(pool);
  const auth = {
    verify: async (authorization: string | undefined) => Object.freeze({
      tenantId: scope.tenantId,
      userId: authorization === 'Bearer other-user' ? otherUserId : scope.userId,
      sessionId: 'transport-session',
      scopes: [],
    }) as any,
  };
  const config = Object.freeze({
    nodeEnv: 'test',
    allowedWebOrigins: Object.freeze(['http://client.test']),
    authChallengeSecret: 'automation-schedule-csrf-secret',
    authPublicOrigin: 'http://localhost',
  }) as any;
  const adapter = createAutomationScheduleHttpAdapter({ schedules, auth, config, accepting: () => true });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('schedule HTTP test server did not expose a TCP address');
  const base = `http://127.0.0.1:${address.port}`;
  const request = (path: string, init: RequestInit = {}) => fetch(`${base}${path}`, {
    ...init,
    headers: { authorization: 'Bearer owner', ...(init.headers || {}) },
  });

  try {
    const hostile = await request('/api/core/automation-schedules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        automation_id: definition.id,
        definition_revision: definition.revision,
        project_id: project.project_id,
        interval_seconds: 60,
        lease_token: randomUUID(),
        provider: 'fal',
        billing: { credits: 1 },
      }),
    });
    assert.equal(hostile.status, 400);

    const createdResponse = await request('/api/core/automation-schedules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        automation_id: definition.id,
        definition_revision: definition.revision,
        project_id: project.project_id,
        interval_seconds: 60,
      }),
    });
    assert.equal(createdResponse.status, 201);
    assert.equal(createdResponse.headers.get('x-automation-schedule-revision'), '1');
    const created = await createdResponse.json() as any;
    assert.equal(created.automation_id, definition.id);
    assert.equal(created.definition_revision, definition.revision);
    assert.equal(created.project_id, String(project.project_id));
    assert.equal(created.interval_seconds, 60);
    assert.equal(created.status, 'ACTIVE');
    assert.equal(created.overlap_policy, 'SKIP_WHILE_ACTIVE');
    assert.equal(created.missed_run_policy, 'ONE_CATCH_UP');
    for (const forbidden of ['tenant_id','user_id','lease_token','lease_expires_at','occurrence_id','invocation_id','execution_id','provider','billing','credits']) {
      assert.equal(Object.hasOwn(created, forbidden), false, `${forbidden} must not cross browser schedule DTO boundary`);
    }

    const foreign = await fetch(`${base}/api/core/automation-schedules/${created.id}`, { headers: { authorization: 'Bearer other-user' } });
    assert.equal(foreign.status, 404);

    const stale = await request(`/api/core/automation-schedules/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-expected-automation-schedule-revision': '2' },
      body: JSON.stringify({ interval_seconds: 120 }),
    });
    assert.equal(stale.status, 409);

    const widened = await request(`/api/core/automation-schedules/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-expected-automation-schedule-revision': '1' },
      body: JSON.stringify({ interval_seconds: 120, definition_revision: 99, project_id: randomUUID(), execution_id: 'browser-owned' }),
    });
    assert.equal(widened.status, 400);

    const updatedResponse = await request(`/api/core/automation-schedules/${created.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'x-expected-automation-schedule-revision': '1' },
      body: JSON.stringify({ interval_seconds: 120 }),
    });
    assert.equal(updatedResponse.status, 200);
    assert.equal(updatedResponse.headers.get('x-automation-schedule-revision'), '2');
    assert.equal((await updatedResponse.json() as any).interval_seconds, 120);

    const paused = await request(`/api/core/automation-schedules/${created.id}/pause`, {
      method: 'POST', headers: { 'x-expected-automation-schedule-revision': '2' },
    });
    assert.equal(paused.status, 200);
    assert.equal((await paused.json() as any).status, 'PAUSED');

    const resumed = await request(`/api/core/automation-schedules/${created.id}/resume`, {
      method: 'POST', headers: { 'x-expected-automation-schedule-revision': '3' },
    });
    assert.equal(resumed.status, 200);
    assert.equal((await resumed.json() as any).status, 'ACTIVE');

    const archived = await request(`/api/core/automation-schedules/${created.id}/archive`, {
      method: 'POST', headers: { 'x-expected-automation-schedule-revision': '4' },
    });
    assert.equal(archived.status, 200);
    assert.equal((await archived.json() as any).status, 'ARCHIVED');

    const restoreArchived = await request(`/api/core/automation-schedules/${created.id}/resume`, {
      method: 'POST', headers: { 'x-expected-automation-schedule-revision': '5' },
    });
    assert.equal(restoreArchived.status, 409);

    const listed = await request('/api/core/automation-schedules');
    assert.equal(listed.status, 200);
    const items = await listed.json() as any[];
    assert.equal(items.some(item => item.id === created.id), true);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await pool.end();
  }
});
