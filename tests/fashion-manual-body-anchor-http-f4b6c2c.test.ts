import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import test from 'node:test';
import type { CoreServerConfig } from '../server/core/config.ts';
import { bodyAnchorPayloadSha256 } from '../server/core/fashion/bodyAnchorGeometry.ts';
import {
  MANUAL_BODY_ANCHOR_PRODUCER_ID,
  MANUAL_BODY_ANCHOR_PRODUCER_VERSION,
  ManualProjectBodyAnchorAcquisitionService,
} from '../server/core/fashion/ManualProjectBodyAnchorAcquisitionService.ts';
import { createManualProjectBodyAnchorHttpAdapter } from '../server/core/http/manualProjectBodyAnchorHttpAdapter.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const storageId = '22222222-2222-4222-8222-222222222222';
const anchorSetId = '33333333-3333-4333-8333-333333333333';
const sourceArtifactId = 'signed-current-project-image';
const sourceSha256 = 'a'.repeat(64);
const auth = Object.freeze({ tenantId: 'tenant-anchor-http', userId: 'user-anchor-http' });
const bearerHeaders = Object.freeze({ Authorization: 'Bearer test.token.value' });
const payload = Object.freeze({
  schemaVersion: 1,
  coordinateSpace: 'PROJECT_IMAGE_NORMALIZED',
  anchors: Object.freeze({
    leftShoulder: Object.freeze([0.2, 0.15] as const),
    rightShoulder: Object.freeze([0.8, 0.15] as const),
    leftHip: Object.freeze([0.28, 0.75] as const),
    rightHip: Object.freeze([0.72, 0.75] as const),
  }),
});
const payloadSha256 = bodyAnchorPayloadSha256(payload);
const config = {
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze(['http://app.test']),
  bodyLimitBytes: 8192,
  authChallengeSecret: 'manual-anchor-http-secret',
  authPublicOrigin: 'http://localhost',
  allowApiBearerAuth: true,
} as unknown as CoreServerConfig;

const storedAnchor = Object.freeze({
  id: anchorSetId,
  projectId,
  projectImageStorageId: storageId,
  projectImageSha256: sourceSha256,
  projectImageWidth: 640,
  projectImageHeight: 960,
  schemaId: 'BERS_BODY_ANCHORS_V1',
  coordinateSpace: 'PROJECT_IMAGE_NORMALIZED',
  payload,
  payloadSha256,
  producerId: MANUAL_BODY_ANCHOR_PRODUCER_ID,
  producerVersion: MANUAL_BODY_ANCHOR_PRODUCER_VERSION,
  acquisitionSequence: '42',
  createdAt: '2026-09-01T00:00:00.000Z',
  internalSecret: 'must-not-leak',
});

function resolvedSource() {
  return Object.freeze({
    artifactId: sourceArtifactId,
    projectId,
    storageId,
    role: 'COMPOSITE',
    lifecycle: 'FINAL',
    width: 640,
    height: 960,
    sha256: sourceSha256,
  }) as any;
}

test('F4b.6c.2c service resolves exact signed Project evidence fixes provenance and rebinds the returned immutable row', async () => {
  const calls: any = { resolve: [], create: [] };
  const service = new ManualProjectBodyAnchorAcquisitionService({
    artifacts: {
      resolveStoredImageEvidence: async (scope: any, artifactId: string) => {
        calls.resolve.push({ scope, artifactId });
        return resolvedSource();
      },
    },
    bodyAnchors: {
      createForExpectedImage: async (scope: any, requestedProjectId: string, expectedImage: any, input: any) => {
        calls.create.push({ scope, requestedProjectId, expectedImage, input });
        return storedAnchor as any;
      },
    },
  });
  const result = await service.acquire(auth as any, { projectId, sourceArtifactId, payload });
  assert.equal(result.anchorSet.id, anchorSetId);
  assert.deepEqual(calls.resolve, [{ scope: { ...auth, projectId }, artifactId: sourceArtifactId }]);
  assert.deepEqual(calls.create, [{
    scope: auth,
    requestedProjectId: projectId,
    expectedImage: { storageId, sha256: sourceSha256, width: 640, height: 960 },
    input: { payload, producerId: MANUAL_BODY_ANCHOR_PRODUCER_ID, producerVersion: MANUAL_BODY_ANCHOR_PRODUCER_VERSION },
  }]);
});

test('F4b.6c.2c service rejects returned rows that escape exact source payload or server provenance authority', async () => {
  const mismatches = [
    { projectImageStorageId: '44444444-4444-4444-8444-444444444444' },
    { projectImageSha256: 'c'.repeat(64) },
    { projectImageWidth: 641 },
    { projectImageHeight: 961 },
    { schemaId: 'OTHER_SCHEMA' },
    { coordinateSpace: 'OTHER_SPACE' },
    { producerId: 'browser.claim' },
    { producerVersion: '999' },
    { acquisitionSequence: '0' },
    { payloadSha256: 'd'.repeat(64) },
    { payload: Object.freeze({ ...payload, anchors: Object.freeze({ ...payload.anchors, leftShoulder: Object.freeze([0.21, 0.15] as const) }) }) },
    { payload: Object.freeze({ schemaVersion: 2, coordinateSpace: 'PROJECT_IMAGE_NORMALIZED', anchors: Object.freeze({}) }) },
  ];
  for (const override of mismatches) {
    const service = new ManualProjectBodyAnchorAcquisitionService({
      artifacts: { resolveStoredImageEvidence: async () => resolvedSource() },
      bodyAnchors: { createForExpectedImage: async () => Object.freeze({ ...storedAnchor, ...override }) as any },
    });
    await assert.rejects(
      service.acquire(auth as any, { projectId, sourceArtifactId, payload }),
      (cause: any) => cause?.status === 409 && cause?.code === 'body_anchor_acquisition_authority_mismatch',
    );
  }
});

test('F4b.6c.2c service propagates stale expected-image rejection instead of rebinding', async () => {
  let creates = 0;
  const service = new ManualProjectBodyAnchorAcquisitionService({
    artifacts: {
      resolveStoredImageEvidence: async () => Object.freeze({
        artifactId: sourceArtifactId, projectId, storageId, role: 'ORIGINAL', lifecycle: 'IMMUTABLE', width: 640, height: 960, sha256: sourceSha256,
      }) as any,
    },
    bodyAnchors: {
      createForExpectedImage: async () => {
        creates += 1;
        throw Object.assign(new Error('Expected Project image changed before insert'), { status: 409, code: 'body_anchor_expected_project_image_stale' });
      },
    },
  });
  await assert.rejects(
    service.acquire(auth as any, { projectId, sourceArtifactId, payload }),
    (cause: any) => cause?.status === 409 && cause?.code === 'body_anchor_expected_project_image_stale',
  );
  assert.equal(creates, 1);
});

async function withHttpServer(
  result: any,
  run: (base: string, calls: Readonly<{ acquires: any[]; auth: (string | undefined)[] }>) => Promise<void>,
) {
  const calls = { acquires: [] as any[], auth: [] as (string | undefined)[] };
  const adapter = createManualProjectBodyAnchorHttpAdapter({
    acquisition: {
      acquire: async (principal: any, command: any) => {
        calls.acquires.push({ principal, command });
        if (result instanceof Error) throw result;
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
    accepting: () => true,
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

const acquisitionResult = Object.freeze({ projectId, sourceArtifactId, anchorSet: storedAnchor });

function body(extra: Record<string, unknown> = {}) {
  return JSON.stringify({ sourceArtifactId, payload, ...extra });
}

function csrfFor(sessionToken: string): string {
  return createHmac('sha256', config.authChallengeSecret)
    .update('bers-browser-csrf-v1\0')
    .update(sessionToken)
    .digest('base64url');
}

test('F4b.6c.2c HTTP returns only stable acquisition acknowledgement and redacts evidence identity and sequence', async () => {
  await withHttpServer(acquisitionResult, async (base, calls) => {
    const response = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'application/json' }, body: body(),
    });
    assert.equal(response.status, 201);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const publicBody = await response.json() as any;
    assert.deepEqual(publicBody, {
      projectId,
      sourceArtifactId,
      anchorSet: { schemaId: 'BERS_BODY_ANCHORS_V1', coordinateSpace: 'PROJECT_IMAGE_NORMALIZED' },
    });
    assert.equal(Object.hasOwn(publicBody.anchorSet, 'id'), false);
    assert.equal(Object.hasOwn(publicBody.anchorSet, 'acquisitionSequence'), false);
    assert.ok(!JSON.stringify(publicBody).includes(anchorSetId));
    assert.ok(!JSON.stringify(publicBody).includes('42'));
    assert.ok(!JSON.stringify(publicBody).includes(storageId));
    assert.ok(!JSON.stringify(publicBody).includes(sourceSha256));
    assert.equal(calls.acquires.length, 1);
    assert.deepEqual(calls.acquires[0], { principal: auth, command: { projectId, sourceArtifactId, payload } });
  });
});

test('F4b.6c.2c HTTP rejects browser storage hash sequence producer and evidence authority before service', async () => {
  await withHttpServer(acquisitionResult, async (base, calls) => {
    for (const extra of [
      { anchorSetId },
      { acquisitionSequence: '999' },
      { projectImageStorageId: storageId },
      { projectImageSha256: sourceSha256 },
      { producerId: 'browser.claim' },
      { producerVersion: '999' },
      { projectImageWidth: 640 },
      { projectImageHeight: 960 },
      { payloadSha256 },
      { projectCursor: 7 },
    ]) {
      const response = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
        method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'application/json' }, body: body(extra),
      });
      assert.equal(response.status, 400);
      assert.equal((await response.json() as any).error, 'forbidden_client_authority');
    }
    assert.equal(calls.acquires.length, 0);
  });
});

test('F4b.6c.2c HTTP masks malformed internal acknowledgement instead of publishing inconsistent state', async () => {
  await withHttpServer(Object.freeze({ ...acquisitionResult, sourceArtifactId: 'different-source' }), async base => {
    const response = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'application/json' }, body: body(),
    });
    assert.equal(response.status, 500);
    const result = await response.json() as any;
    assert.equal(result.error, 'internal_error');
    assert.equal(result.message, 'Manual body-anchor acquisition request failed');
  });
});

test('F4b.6c.2c malformed raw request-target cannot escape the adapter', async () => {
  let acquires = 0;
  const adapter = createManualProjectBodyAnchorHttpAdapter({
    acquisition: { acquire: async () => { acquires += 1; throw new Error('must not execute'); } } as any,
    auth: { verify: async () => { throw new Error('must not authenticate'); } },
    config,
    accepting: () => true,
  });
  const handled = await adapter({ url: 'http://[', method: 'POST', headers: {} } as any, {} as any);
  assert.equal(handled, false);
  assert.equal(acquires, 0);
});

test('F4b.6c.2c HTTP enforces POST JSON origin OPTIONS body-size and session-bound CSRF', async () => {
  const sessionToken = 'session.header.signature';
  await withHttpServer(acquisitionResult, async (base, calls) => {
    const get = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, { headers: bearerHeaders });
    assert.equal(get.status, 405);
    assert.equal(get.headers.get('allow'), 'POST, OPTIONS');

    const wrongMedia = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'text/plain' }, body: body(),
    });
    assert.equal(wrongMedia.status, 415);

    const deniedOrigin = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'POST', headers: { ...bearerHeaders, Origin: 'http://evil.test', 'Content-Type': 'application/json' }, body: body(),
    });
    assert.equal(deniedOrigin.status, 403);

    const huge = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'POST', headers: { ...bearerHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sourceArtifactId, payload: 'x'.repeat(9000) }),
    });
    assert.equal(huge.status, 413);

    const preflight = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'OPTIONS', headers: { Origin: 'http://app.test' },
    });
    assert.equal(preflight.status, 204);

    const missingCsrf = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'POST',
      headers: { Cookie: `bers_session_dev=${sessionToken}`, Origin: 'http://app.test', 'Content-Type': 'application/json' },
      body: body(),
    });
    assert.equal(missingCsrf.status, 403);
    assert.equal((await missingCsrf.json() as any).error, 'csrf_denied');
    assert.deepEqual(calls.auth, [bearerHeaders.Authorization]);
    assert.equal(calls.acquires.length, 0);

    const accepted = await fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
      method: 'POST',
      headers: {
        Cookie: `bers_session_dev=${sessionToken}`,
        Origin: 'http://app.test',
        'X-Bers-CSRF-Token': csrfFor(sessionToken),
        'Content-Type': 'application/json',
      },
      body: body(),
    });
    assert.equal(accepted.status, 201);
    assert.deepEqual(calls.auth, [bearerHeaders.Authorization, `Bearer ${sessionToken}`]);
    assert.equal(calls.acquires.length, 1);
  });
});
