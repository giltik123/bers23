import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFashionTryOnProductHttpAdapter } from '../server/core/http/fashionTryOnProductHttpAdapter.ts';
import type { CoreServerConfig } from '../server/core/config.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const clientRequestId = '33333333-3333-4333-8333-333333333333';
const meshTicketId = '44444444-4444-4444-8444-444444444444';
const textureTicketId = '55555555-5555-4555-8555-555555555555';
const sourceArtifactId = 'signed-current-project-image';
const principal = Object.freeze({ tenantId: 'tenant-product-http', userId: 'user-product-http' });
const intent = Object.freeze({ projectId, sourceArtifactId, garmentId, clientRequestId });
const headers = Object.freeze({ Authorization: 'Bearer test.token.value' });
const config = {
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze(['http://app.test']),
  bodyLimitBytes: 8192,
  imageUploadLimitBytes: 1024 * 1024,
  authChallengeSecret: 'test-secret',
  authPublicOrigin: 'http://localhost',
  allowApiBearerAuth: true,
} as unknown as CoreServerConfig;

function product(calls: any) {
  return Object.freeze({
    prepare: async (command: any, auth: any) => {
      calls.push(['prepare', command, auth]);
      return Object.freeze({ status: 'WARP_PREPARED', projectId, sourceArtifactId, garmentId, categoryGroup: 'tops', preparedExecution: { ticketId: meshTicketId } });
    },
    continue: async (command: any, auth: any) => {
      calls.push(['continue', command, auth]);
      return Object.freeze({ status: 'TEXTURE_PREPARED', projectId, sourceArtifactId, garmentId, preparedExecution: { ticketId: textureTicketId } });
    },
    result: async (command: any, auth: any) => {
      calls.push(['result', command, auth]);
      return Object.freeze({ status: 'FINAL_READY', projectId, sourceArtifactId, garmentId, artifactId: 'final-artifact' });
    },
    loadGarmentWarpInput: async (lookup: any, auth: any) => {
      calls.push(['load-warp', lookup, auth]);
      return Uint8Array.from([1, 2, 3]);
    },
    loadTextureCompositeInput: async (lookup: any, auth: any) => {
      calls.push(['load-texture', lookup, auth]);
      return Uint8Array.from([4, 5]);
    },
    submitGarmentWarpCandidate: async (command: any, auth: any) => {
      calls.push(['submit-warp', { ...command, bytes: Array.from(command.bytes) }, auth]);
      return Object.freeze({ status: 'SUCCESS' });
    },
    submitTextureCompositeCandidate: async (command: any, auth: any) => {
      calls.push(['submit-texture', { ...command, bytes: Array.from(command.bytes) }, auth]);
      return Object.freeze({ status: 'FAILED' });
    },
  });
}

async function withServer(run: (base: string, calls: any[]) => Promise<void>) {
  const calls: any[] = [];
  const adapter = createFashionTryOnProductHttpAdapter({
    product: product(calls) as any,
    auth: {
      verify: async authorization => {
        assert.equal(authorization, 'Bearer test.token.value');
        return principal as any;
      },
    },
    config,
  });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    await run(`http://127.0.0.1:${address.port}`, calls);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

async function postJson(base: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

test('F4b.6b.4d product HTTP carries stable intent only through prepare/continue/result', async () => {
  await withServer(async (base, calls) => {
    const prepare = await postJson(base, '/api/core/fashion/try-on/prepare', intent);
    const continuation = await postJson(base, '/api/core/fashion/try-on/continue', intent);
    const result = await postJson(base, '/api/core/fashion/try-on/result', intent);
    assert.equal(prepare.status, 200);
    assert.equal(continuation.status, 200);
    assert.equal(result.status, 200);
    assert.equal((await prepare.json() as any).preparedExecution.ticketId, meshTicketId);
    assert.equal((await continuation.json() as any).preparedExecution.ticketId, textureTicketId);
    assert.equal((await result.json() as any).artifactId, 'final-artifact');
    assert.deepEqual(calls.map(call => call[0]), ['prepare', 'continue', 'result']);
    for (const call of calls) {
      assert.deepEqual(call[1], intent);
      assert.deepEqual(call[2], principal);
      assert.equal(JSON.stringify(call[1]).includes('representationId'), false);
      assert.equal(JSON.stringify(call[1]).includes('anchorSetId'), false);
    }
  });
});

test('F4b.6b.4d product HTTP serves phase-specific binary inputs with opaque lookup only', async () => {
  await withServer(async (base, calls) => {
    const warp = await fetch(`${base}/api/core/fashion/try-on/warp/${meshTicketId}/input?projectId=${projectId}`, { headers });
    const texture = await fetch(`${base}/api/core/fashion/try-on/texture/${textureTicketId}/input?projectId=${projectId}`, { headers });
    assert.equal(warp.status, 200);
    assert.equal(warp.headers.get('content-type'), 'application/octet-stream');
    assert.deepEqual(Array.from(new Uint8Array(await warp.arrayBuffer())), [1, 2, 3]);
    assert.deepEqual(Array.from(new Uint8Array(await texture.arrayBuffer())), [4, 5]);
    assert.deepEqual(calls, [
      ['load-warp', { ticketId: meshTicketId, projectId }, principal],
      ['load-texture', { ticketId: textureTicketId, projectId }, principal],
    ]);
  });
});

test('F4b.6b.4d product HTTP submits PNG candidate plus bounded latency without result authority metadata', async () => {
  await withServer(async (base, calls) => {
    const warp = await fetch(`${base}/api/core/fashion/try-on/warp/${meshTicketId}/candidate?projectId=${projectId}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'image/png', 'X-Bers-Local-Latency-Ms': '12.5' },
      body: Uint8Array.from([137, 80, 78, 71]),
    });
    const texture = await fetch(`${base}/api/core/fashion/try-on/texture/${textureTicketId}/candidate?projectId=${projectId}`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'image/png', 'X-Bers-Local-Latency-Ms': '14' },
      body: Uint8Array.from([1, 2]),
    });
    assert.deepEqual(await warp.json(), { status: 'SUCCESS' });
    assert.deepEqual(await texture.json(), { status: 'FAILED' });
    assert.deepEqual(calls[0], ['submit-warp', { ticketId: meshTicketId, projectId, bytes: [137, 80, 78, 71], latencyMs: 12.5 }, principal]);
    assert.deepEqual(calls[1], ['submit-texture', { ticketId: textureTicketId, projectId, bytes: [1, 2], latencyMs: 14 }, principal]);
    const serialized = JSON.stringify(calls);
    for (const forbidden of ['executionId','layerId','artifactId','storageId','sha256','nonce','managedInputs']) assert.equal(serialized.includes(forbidden), false, forbidden);
  });
});

test('F4b.6b.4d product HTTP fails closed on authority injection, query widening, media and latency before delegation', async () => {
  await withServer(async (base, calls) => {
    const authority = await postJson(base, '/api/core/fashion/try-on/prepare', { ...intent, representationId: '66666666-6666-4666-8666-666666666666' });
    assert.equal(authority.status, 400);
    assert.equal((await authority.json() as any).error, 'forbidden_client_authority');

    const widenedQuery = await fetch(`${base}/api/core/fashion/try-on/warp/${meshTicketId}/input?projectId=${projectId}&layerId=forbidden`, { headers });
    assert.equal(widenedQuery.status, 400);
    assert.equal((await widenedQuery.json() as any).error, 'forbidden_client_authority');

    const media = await fetch(`${base}/api/core/fashion/try-on/warp/${meshTicketId}/candidate?projectId=${projectId}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/json', 'X-Bers-Local-Latency-Ms': '1' }, body: '{}',
    });
    assert.equal(media.status, 415);

    const latency = await fetch(`${base}/api/core/fashion/try-on/warp/${meshTicketId}/candidate?projectId=${projectId}`, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'image/png', 'X-Bers-Local-Latency-Ms': 'NaN' }, body: Uint8Array.from([1]),
    });
    assert.equal(latency.status, 400);
    assert.equal(calls.length, 0);
  });
});
