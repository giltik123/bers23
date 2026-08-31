import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFashionTryOnReadinessHttpAdapter } from '../server/core/http/fashionTryOnReadinessHttpAdapter.ts';
import type { CoreServerConfig } from '../server/core/config.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const sourceArtifactId = 'signed-current-project-image';
const auth = Object.freeze({ tenantId: 'tenant-readiness-http', userId: 'user-readiness-http' });
const headers = Object.freeze({ Authorization: 'Bearer test.token.value' });
const config = {
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze(['http://app.test']),
  bodyLimitBytes: 4096,
  authChallengeSecret: 'test-secret',
  authPublicOrigin: 'http://localhost',
  allowApiBearerAuth: true,
} as unknown as CoreServerConfig;

async function withServer(
  result: any,
  run: (base: string, calls: Readonly<{ checks: any[]; auth: string[] }>) => Promise<void>,
) {
  const calls = { checks: [] as any[], auth: [] as string[] };
  const readiness = Object.freeze({
    check: async (command: any, principal: any) => {
      calls.checks.push({ command, principal });
      return result;
    },
    resolve: async () => {
      throw new Error('HTTP adapter must never call internal readiness resolve()');
    },
  });
  const adapter = createFashionTryOnReadinessHttpAdapter({
    readiness: readiness as any,
    auth: {
      verify: async authorization => {
        calls.auth.push(String(authorization));
        assert.equal(authorization, 'Bearer test.token.value');
        return auth as any;
      },
    },
    config,
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

const readyResult = Object.freeze({
  status: 'READY',
  projectId,
  sourceArtifactId,
  garmentId,
  categoryGroup: 'tops',
  representationId: '33333333-3333-4333-8333-333333333333',
  anchorSetId: '44444444-4444-4444-8444-444444444444',
  source: Object.freeze({ storageId: '55555555-5555-4555-8555-555555555555', sha256: 'a'.repeat(64) }),
  destinationMesh: Object.freeze({ meshSha256: 'b'.repeat(64) }),
});

test('F4b.6 readiness HTTP accepts only intent and returns a second redacted public projection', async () => {
  await withServer(readyResult, async (base, calls) => {
    const response = await fetch(`${base}/api/core/fashion/try-on/readiness`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sourceArtifactId, garmentId }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const body = await response.json() as any;
    assert.deepEqual(body, { status: 'READY', projectId, sourceArtifactId, garmentId, categoryGroup: 'tops' });
    assert.equal('representationId' in body, false);
    assert.equal('anchorSetId' in body, false);
    assert.equal('source' in body, false);
    assert.equal('destinationMesh' in body, false);
    assert.equal(calls.checks.length, 1);
    assert.deepEqual(calls.checks[0].command, { projectId, sourceArtifactId, garmentId });
    assert.deepEqual(calls.checks[0].principal, auth);
    assert.deepEqual(calls.auth, ['Bearer test.token.value']);
  });
});

test('F4b.6 readiness HTTP rejects browser evidence claims before calling Core readiness', async () => {
  await withServer(readyResult, async (base, calls) => {
    const response = await fetch(`${base}/api/core/fashion/try-on/readiness`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId,
        sourceArtifactId,
        garmentId,
        representationId: '33333333-3333-4333-8333-333333333333',
        anchorSetId: '44444444-4444-4444-8444-444444444444',
      }),
    });
    assert.equal(response.status, 400);
    const body = await response.json() as any;
    assert.equal(body.error, 'forbidden_client_authority');
    assert.equal(calls.checks.length, 0);
  });
});

test('F4b.6 readiness HTTP is POST-only JSON and preserves fail-closed readiness states', async () => {
  const failure = Object.freeze({ status: 'BODY_ANCHORS_REQUIRED', projectId, sourceArtifactId, garmentId, categoryGroup: 'tops' });
  await withServer(failure, async (base, calls) => {
    const get = await fetch(`${base}/api/core/fashion/try-on/readiness`, { headers });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST, OPTIONS');

    const wrongMedia = await fetch(`${base}/api/core/fashion/try-on/readiness`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'text/plain' },
      body: JSON.stringify({ projectId, sourceArtifactId, garmentId }),
    });
    assert.equal(wrongMedia.status, 415);

    const accepted = await fetch(`${base}/api/core/fashion/try-on/readiness`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sourceArtifactId, garmentId }),
    });
    assert.equal(accepted.status, 200);
    assert.deepEqual(await accepted.json(), failure);
    assert.equal(calls.checks.length, 1);
  });
});

test('F4b.6 readiness HTTP applies browser origin policy and OPTIONS without invoking readiness', async () => {
  await withServer(readyResult, async (base, calls) => {
    const denied = await fetch(`${base}/api/core/fashion/try-on/readiness`, {
      method: 'POST',
      headers: { ...headers, Origin: 'http://evil.test', 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, sourceArtifactId, garmentId }),
    });
    assert.equal(denied.status, 403);
    assert.equal(calls.checks.length, 0);

    const preflight = await fetch(`${base}/api/core/fashion/try-on/readiness`, {
      method: 'OPTIONS',
      headers: { Origin: 'http://app.test' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://app.test');
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
    assert.equal(calls.checks.length, 0);
  });
});
