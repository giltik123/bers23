import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import type { CoreServerConfig } from '../server/core/config.ts';
import { createManualParametricGarmentAdmissionHttpAdapter } from '../server/core/http/manualParametricGarmentAdmissionHttpAdapter.ts';

const garmentId = '11111111-1111-4111-8111-111111111111';
const representationId = '22222222-2222-4222-8222-222222222222';
const primaryViewId = '33333333-3333-4333-8333-333333333333';
const auth = Object.freeze({ tenantId: 'tenant-manual-parametric-http', userId: 'user-manual-parametric-http' });
const bearerHeaders = Object.freeze({ Authorization: 'Bearer test.token.value' });
const contour = Object.freeze({
  schemaVersion: 1,
  coordinateSpace: 'PRIMARY_VIEW_NORMALIZED',
  contour: Object.freeze([
    Object.freeze([0.2, 0.2] as const),
    Object.freeze([0.8, 0.2] as const),
    Object.freeze([0.7, 0.8] as const),
    Object.freeze([0.3, 0.8] as const),
  ]),
});
const config = {
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze(['http://app.test']),
  bodyLimitBytes: 4096,
  authChallengeSecret: 'manual-parametric-http-secret',
  authPublicOrigin: 'http://localhost',
  allowApiBearerAuth: true,
} as unknown as CoreServerConfig;

const admittedResult = Object.freeze({
  garmentRevision: 8,
  representationTier: 'PARAMETRIC',
  replayed: false,
  representation: Object.freeze({
    id: representationId,
    garmentId,
    tier: 'PARAMETRIC',
    format: 'BERS_PARAMETRIC_V1',
    contentType: 'application/vnd.bers.garment-parametric+json',
    contentSha256: 'a'.repeat(64),
    byteSize: 321,
    storageBackend: 'POSTGRES_BYTEA_V1',
    basisViewId: primaryViewId,
    generatorId: 'bers.manual-parametric-contour',
    generatorVersion: '1',
    validatorId: 'bers.parametric-topology-validator',
    validatorVersion: '1',
    admissionState: 'ADMITTED',
    admittedAt: '2026-09-01T00:00:00.000Z',
    revokedAt: null,
    sources: Object.freeze([Object.freeze({ position: 0, viewId: primaryViewId, contentSha256: 'b'.repeat(64) })]),
    internalStorageKey: 'must-not-leak',
  }),
});

async function withServer(
  result: any,
  run: (base: string, calls: Readonly<{ admits: any[]; auth: (string | undefined)[] }>) => Promise<void>,
  accepting = true,
) {
  const calls = { admits: [] as any[], auth: [] as (string | undefined)[] };
  const adapter = createManualParametricGarmentAdmissionHttpAdapter({
    admission: {
      admit: async (principal: any, command: any) => {
        calls.admits.push({ principal, command });
        return result;
      },
    } as any,
    auth: {
      verify: async authorization => {
        calls.auth.push(authorization);
        if (!authorization) throw Object.assign(new Error('Authentication required'), { status: 401, code: 'unauthorized' });
        return auth as any;
      },
    },
    config,
    accepting: () => accepting,
  });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve());
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function requestBody(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ expectedRevision: 7, contour, ...extra });
}

function csrfFor(sessionToken: string): string {
  return createHmac('sha256', config.authChallengeSecret)
    .update('bers-browser-csrf-v1\0')
    .update(sessionToken)
    .digest('base64url');
}

test('F4b.6c.1b HTTP accepts revision plus contour only and returns a second redacted projection', async () => {
  await withServer(admittedResult, async (base, calls) => {
    const response = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'POST',
      headers: { ...bearerHeaders, 'Content-Type': 'application/json' },
      body: requestBody(),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as any;
    assert.deepEqual(body, {
      garmentId,
      garmentRevision: 8,
      representationTier: 'PARAMETRIC',
      representation: { id: representationId, tier: 'PARAMETRIC', format: 'BERS_PARAMETRIC_V1', admissionState: 'ADMITTED' },
      replayed: false,
    });
    assert.equal('contentSha256' in body.representation, false);
    assert.equal('basisViewId' in body.representation, false);
    assert.equal('generatorId' in body.representation, false);
    assert.equal('validatorId' in body.representation, false);
    assert.equal('sources' in body.representation, false);
    assert.equal('internalStorageKey' in body.representation, false);
    assert.equal(calls.admits.length, 1);
    assert.deepEqual(calls.admits[0].principal, auth);
    assert.deepEqual(calls.admits[0].command, { garmentId, expectedRevision: 7, contour });
    assert.deepEqual(calls.auth, ['Bearer test.token.value']);
  });
});

test('F4b.6c.1b HTTP exact replay is 200 and browser evidence/provenance claims are rejected before Core', async () => {
  await withServer(Object.freeze({ ...admittedResult, replayed: true }), async (base, calls) => {
    const replay = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'application/json' }, body: requestBody(),
    });
    assert.equal(replay.status, 200);
    assert.equal((await replay.json() as any).replayed, true);

    for (const forbidden of [
      { representationId },
      { sourceViewIds: [primaryViewId] },
      { sourceContentSha256: 'b'.repeat(64) },
      { generatorId: 'browser.claim' },
      { validatorVersion: '999' },
    ]) {
      const response = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
        method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'application/json' }, body: requestBody(forbidden),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json() as any).error, 'forbidden_client_authority');
    }
    assert.equal(calls.admits.length, 1, 'forbidden authority fields must never reach Core admission');
  });
});

test('F4b.6c.1b HTTP enforces method JSON shutdown and origin contracts', async () => {
  await withServer(admittedResult, async (base, calls) => {
    const get = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, { headers: bearerHeaders });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST, OPTIONS');

    const wrongMedia = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'text/plain' }, body: requestBody(),
    });
    assert.equal(wrongMedia.status, 415);

    const deniedOrigin = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'POST', headers: { ...bearerHeaders, Origin: 'http://evil.test', 'Content-Type': 'application/json' }, body: requestBody(),
    });
    assert.equal(deniedOrigin.status, 403);

    const preflight = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'OPTIONS', headers: { Origin: 'http://app.test' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://app.test');
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(calls.admits.length, 0);
  });

  await withServer(admittedResult, async (base, calls) => {
    const response = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'application/json' }, body: requestBody(),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json() as any).error, 'shutting_down');
    assert.equal(calls.admits.length, 0);
  }, false);
});

test('F4b.6c.1b HTTP requires session-bound CSRF for cookie-authenticated browser mutation', async () => {
  const sessionToken = 'session.header.signature';
  await withServer(admittedResult, async (base, calls) => {
    const missingCsrf = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'POST',
      headers: { Cookie: `bers_session_dev=${sessionToken}`, Origin: 'http://app.test', 'Content-Type': 'application/json' },
      body: requestBody(),
    });
    assert.equal(missingCsrf.status, 403);
    assert.equal((await missingCsrf.json() as any).error, 'csrf_denied');
    assert.equal(calls.admits.length, 0);
    assert.equal(calls.auth.length, 0);

    const accepted = await fetch(`${base}/api/core/fashion/garments/${garmentId}/parametric-representation`, {
      method: 'POST',
      headers: {
        Cookie: `bers_session_dev=${sessionToken}`,
        Origin: 'http://app.test',
        'X-Bers-CSRF-Token': csrfFor(sessionToken),
        'Content-Type': 'application/json',
      },
      body: requestBody(),
    });
    assert.equal(accepted.status, 201);
    assert.deepEqual(calls.auth, [`Bearer ${sessionToken}`]);
    assert.equal(calls.admits.length, 1);
  });
});
