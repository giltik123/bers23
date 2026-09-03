import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFashionTryOnProductHttpAdapter } from '../server/core/http/fashionTryOnProductHttpAdapter.ts';
import type { CoreServerConfig } from '../server/core/config.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const garmentId = '22222222-2222-4222-8222-222222222222';
const clientRequestId = '33333333-3333-4333-8333-333333333333';
const sourceArtifactId = 'signed-current-project-image';
const principal = Object.freeze({ tenantId: 'tenant-preview-http', userId: 'user-preview-http' });
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

function product(calls: any[], previewResult: unknown) {
  const unexpected = async (name: string) => { calls.push([name]); throw new Error(`${name} must not run`); };
  return Object.freeze({
    prepare: () => unexpected('prepare'),
    continue: () => unexpected('continue'),
    result: () => unexpected('result'),
    preview: async (command: any, auth: any) => {
      calls.push(['preview', command, auth]);
      return previewResult;
    },
    loadGarmentWarpInput: () => unexpected('load-warp'),
    loadTextureCompositeInput: () => unexpected('load-texture'),
    submitGarmentWarpCandidate: () => unexpected('submit-warp'),
    submitTextureCompositeCandidate: () => unexpected('submit-texture'),
  });
}

async function withServer(previewResult: unknown, run: (base: string, calls: any[]) => Promise<void>) {
  const calls: any[] = [];
  const adapter = createFashionTryOnProductHttpAdapter({
    product: product(calls, previewResult) as any,
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

function postJson(base: string, body: unknown, contentType = 'application/json') {
  return fetch(`${base}/api/core/fashion/try-on/preview`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': contentType },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

test('F4b.6d.2 preview transport delegates exact stable intent once and returns PREVIEW_READY', async () => {
  const preview = Object.freeze({
    status: 'PREVIEW_READY', projectId, sourceArtifactId, garmentId,
    artifactId: 'stable-final-artifact',
    previewUrl: '/api/core/artifacts/results/opaque-delivery-token',
    previewExpiresAt: 123456,
  });
  await withServer(preview, async (base, calls) => {
    const response = await postJson(base, intent);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), preview);
    assert.deepEqual(calls, [['preview', intent, principal]]);
  });
});

test('F4b.6d.2 preview transport passes non-final recovery state without widening the intent', async () => {
  const pending = Object.freeze({ status: 'TEXTURE_PENDING', projectId, sourceArtifactId, garmentId });
  await withServer(pending, async (base, calls) => {
    const response = await postJson(base, intent);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), pending);
    assert.deepEqual(calls, [['preview', intent, principal]]);
  });
});

test('F4b.6d.2 preview transport rejects artifact/evidence/execution authority before delegation', async () => {
  await withServer(Object.freeze({ status: 'TEXTURE_PENDING', projectId, sourceArtifactId, garmentId }), async (base, calls) => {
    for (const extra of [
      { artifactId: 'forbidden-final' },
      { storageId: 'forbidden-storage' },
      { ticketId: 'forbidden-ticket' },
      { executionId: 'forbidden-execution' },
      { representationId: 'forbidden-representation' },
      { anchorSetId: 'forbidden-anchor' },
    ]) {
      const response = await postJson(base, { ...intent, ...extra });
      assert.equal(response.status, 400);
      assert.equal((await response.json() as any).error, 'forbidden_client_authority');
    }
    assert.equal(calls.length, 0);
  });
});

test('F4b.6d.2 preview transport fails closed on media, malformed JSON and unsupported method', async () => {
  await withServer(Object.freeze({ status: 'TEXTURE_PENDING', projectId, sourceArtifactId, garmentId }), async (base, calls) => {
    const media = await postJson(base, intent, 'text/plain');
    assert.equal(media.status, 415);

    const malformed = await postJson(base, '{', 'application/json');
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json() as any).error, 'invalid_json');

    const method = await fetch(`${base}/api/core/fashion/try-on/preview`, { method: 'GET', headers });
    assert.equal(method.status, 404);
    assert.equal(calls.length, 0);
  });
});
