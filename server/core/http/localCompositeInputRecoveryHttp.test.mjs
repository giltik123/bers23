import assert from 'node:assert/strict';
import test from 'node:test';
import { createServer } from 'node:http';
import { createLocalCompositeContinuationHttpAdapter } from './localCompositeContinuationHttpAdapter.ts';

const origin = 'https://app.example.test';
const sessionToken = 'aaa.bbb.ccc';
const cookie = `bers_session_dev=${sessionToken}`;
const principal = Object.freeze({ tenantId: 'tenant-recovery', userId: 'user-recovery', sessionId: 'session-recovery' });
const projectId = 'project-recovery';
const executionId = 'execution-recovery';
const sourceSha = 'a'.repeat(64);
const maskSha = 'b'.repeat(64);
const config = Object.freeze({
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze([origin]),
  authChallengeSecret: 'recovery-csrf-secret',
  authPublicOrigin: 'http://localhost',
  bodyLimitBytes: 64_000,
  maskUploadLimitBytes: 64_000,
  imageUploadLimitBytes: 256_000,
});

async function withServer(handler, fn) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function auth() {
  return Object.freeze({
    async verify(authorization) {
      assert.equal(authorization, `Bearer ${sessionToken}`);
      return principal;
    },
  });
}

function adapter(inputs) {
  let mutationCalls = 0;
  const continuation = Object.freeze({
    async start() { mutationCalls += 1; throw new Error('start must not run during input recovery'); },
    async resume() { mutationCalls += 1; throw new Error('resume must not run during input recovery'); },
    async submitLocalResult() { mutationCalls += 1; throw new Error('result submission must not run during input recovery'); },
  });
  const outputs = Object.freeze({ async upload() { mutationCalls += 1; throw new Error('output upload must not run during input recovery'); } });
  const startAdmission = Object.freeze({ assertStartAllowed() { mutationCalls += 1; throw new Error('start admission must not run during input recovery'); } });
  return {
    handler: createLocalCompositeContinuationHttpAdapter({ continuation, inputs, outputs, startAdmission, auth: auth(), config }),
    mutationCalls: () => mutationCalls,
  };
}

function assertCommonHeaders(response, step) {
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/octet-stream');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('access-control-allow-origin'), origin);
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');
  assert.equal(response.headers.get('x-bers-composite-input-step'), step);
  const exposed = response.headers.get('access-control-expose-headers') || '';
  for (const name of [
    'X-Bers-Composite-Input-Step',
    'X-Bers-Local-Input-Width',
    'X-Bers-Local-Input-Height',
    'X-Bers-Local-Source-Sha256',
    'X-Bers-Local-Mask-Sha256',
  ]) assert.match(exposed, new RegExp(name, 'i'));
}

test('workflow-owned SEGMENT recovery delivers exact Core-bound RGBA bytes without browser ticket authority', async () => {
  const calls = [];
  const source = new Uint8Array([10, 20, 30, 255, 40, 50, 60, 255]);
  const inputs = Object.freeze({
    async deliver(requestedExecutionId, scope) {
      calls.push([requestedExecutionId, scope]);
      return Object.freeze({
        step: 'SEGMENT', executionId, ticketId: 'server-ticket-segment', sourceArtifactId: 'source-artifact', sourceSha256: sourceSha,
        width: 2, height: 1, sourceRgba: source,
      });
    },
  });
  const runtime = adapter(inputs);

  await withServer(runtime.handler, async base => {
    const response = await fetch(`${base}/api/core/composite-continuations/${executionId}/input?projectId=${projectId}&ticketId=attacker-ticket&capability=attacker-capability`, {
      headers: { origin, cookie },
    });
    assertCommonHeaders(response, 'SEGMENT');
    assert.equal(response.headers.get('x-bers-local-input-width'), '2');
    assert.equal(response.headers.get('x-bers-local-input-height'), '1');
    assert.equal(response.headers.get('x-bers-local-source-sha256'), sourceSha);
    assert.equal(response.headers.get('x-bers-local-mask-sha256'), null);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...source]);
  });

  assert.deepEqual(calls, [[executionId, { tenantId: principal.tenantId, userId: principal.userId, projectId }]]);
  assert.equal(runtime.mutationCalls(), 0, 'read-only recovery must not start/resume/advance/upload any workflow state');
});

test('workflow-owned BACKGROUND_ISOLATION recovery returns exact RGBA || MASK alpha layout and both integrity hashes', async () => {
  const calls = [];
  const source = new Uint8Array([1, 2, 3, 255, 4, 5, 6, 255]);
  const mask = new Uint8Array([255, 0]);
  const inputs = Object.freeze({
    async deliver(requestedExecutionId, scope) {
      calls.push([requestedExecutionId, scope]);
      return Object.freeze({
        step: 'BACKGROUND_ISOLATION', executionId, ticketId: 'server-ticket-background', sourceArtifactId: 'source-artifact', maskArtifactId: 'mask-artifact',
        sourceSha256: sourceSha, maskSha256: maskSha, width: 2, height: 1, sourceRgba: source, maskAlpha: mask,
      });
    },
  });
  const runtime = adapter(inputs);

  await withServer(runtime.handler, async base => {
    const response = await fetch(`${base}/api/core/composite-continuations/${executionId}/input?projectId=${projectId}`, { headers: { origin, cookie } });
    assertCommonHeaders(response, 'BACKGROUND_ISOLATION');
    assert.equal(response.headers.get('x-bers-local-input-width'), '2');
    assert.equal(response.headers.get('x-bers-local-input-height'), '1');
    assert.equal(response.headers.get('x-bers-local-source-sha256'), sourceSha);
    assert.equal(response.headers.get('x-bers-local-mask-sha256'), maskSha);
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [...source, ...mask]);
  });

  assert.deepEqual(calls, [[executionId, { tenantId: principal.tenantId, userId: principal.userId, projectId }]]);
  assert.equal(runtime.mutationCalls(), 0);
});

test('input recovery requires authenticated project scope and fails closed when delivery authority is absent', async () => {
  let deliveries = 0;
  const inputs = Object.freeze({ async deliver() { deliveries += 1; throw new Error('must not deliver'); } });
  const runtime = adapter(inputs);
  await withServer(runtime.handler, async base => {
    const missingProject = await fetch(`${base}/api/core/composite-continuations/${executionId}/input`, { headers: { origin, cookie } });
    assert.equal(missingProject.status, 400);
    assert.equal((await missingProject.json()).error, 'invalid_project_id');
  });
  assert.equal(deliveries, 0);
  assert.equal(runtime.mutationCalls(), 0);

  const unavailable = adapter(undefined);
  await withServer(unavailable.handler, async base => {
    const response = await fetch(`${base}/api/core/composite-continuations/${executionId}/input?projectId=${projectId}`, { headers: { origin, cookie } });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'local_composite_input_delivery_unavailable');
  });
  assert.equal(unavailable.mutationCalls(), 0);
});

test('CORS preflight for recovery is side-effect free and never reaches authentication or delivery', async () => {
  let deliveries = 0;
  let authCalls = 0;
  const continuation = Object.freeze({
    async start() { throw new Error('not used'); }, async resume() { throw new Error('not used'); }, async submitLocalResult() { throw new Error('not used'); },
  });
  const inputs = Object.freeze({ async deliver() { deliveries += 1; throw new Error('must not deliver'); } });
  const outputs = Object.freeze({ async upload() { throw new Error('not used'); } });
  const startAdmission = Object.freeze({ assertStartAllowed() { throw new Error('not used'); } });
  const handler = createLocalCompositeContinuationHttpAdapter({
    continuation, inputs, outputs, startAdmission,
    auth: Object.freeze({ async verify() { authCalls += 1; throw new Error('must not authenticate OPTIONS'); } }),
    config,
  });

  await withServer(handler, async base => {
    const response = await fetch(`${base}/api/core/composite-continuations/${executionId}/input?projectId=${projectId}`, {
      method: 'OPTIONS',
      headers: { origin, 'access-control-request-method': 'GET' },
    });
    assert.equal(response.status, 204);
    assert.match(response.headers.get('access-control-allow-methods') || '', /GET/);
  });
  assert.equal(authCalls, 0);
  assert.equal(deliveries, 0);
});
