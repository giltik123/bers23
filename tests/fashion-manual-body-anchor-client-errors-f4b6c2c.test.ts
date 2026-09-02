import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { StoredProjectImageUnavailableError } from '../server/core/artifacts/artifactAuthority.ts';
import { ArtifactReferenceDeniedError } from '../server/core/artifacts/signedArtifactAuthority.ts';
import type { CoreServerConfig } from '../server/core/config.ts';
import { ManualProjectBodyAnchorAcquisitionService } from '../server/core/fashion/ManualProjectBodyAnchorAcquisitionService.ts';
import { createManualProjectBodyAnchorHttpAdapter } from '../server/core/http/manualProjectBodyAnchorHttpAdapter.ts';

const projectId = '11111111-1111-4111-8111-111111111111';
const sourceArtifactId = 'signed-current-project-image';
const auth = Object.freeze({ tenantId: 'tenant-anchor-errors', userId: 'user-anchor-errors' });
const validPayload = Object.freeze({
  schemaVersion: 1,
  coordinateSpace: 'PROJECT_IMAGE_NORMALIZED',
  anchors: Object.freeze({
    leftShoulder: Object.freeze([0.2, 0.15] as const),
    rightShoulder: Object.freeze([0.8, 0.15] as const),
    leftHip: Object.freeze([0.28, 0.75] as const),
    rightHip: Object.freeze([0.72, 0.75] as const),
  }),
});
const config = {
  nodeEnv: 'test',
  allowedWebOrigins: Object.freeze(['http://app.test']),
  bodyLimitBytes: 8192,
  authChallengeSecret: 'manual-anchor-client-error-secret',
  authPublicOrigin: 'http://localhost',
  allowApiBearerAuth: true,
} as unknown as CoreServerConfig;

async function withServer(
  service: ManualProjectBodyAnchorAcquisitionService,
  run: (base: string) => Promise<void>,
): Promise<void> {
  const adapter = createManualProjectBodyAnchorHttpAdapter({
    acquisition: service,
    auth: { verify: async () => auth as any },
    config,
    accepting: () => true,
  });
  const server = createServer((request, response) => { void adapter(request, response); });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

function post(base: string, payload: unknown) {
  return fetch(`${base}/api/core/fashion/projects/${projectId}/body-anchors`, {
    method: 'POST',
    headers: { Authorization: 'Bearer test.token.value', 'Content-Type': 'application/json' },
    body: JSON.stringify({ sourceArtifactId, payload }),
  });
}

test('F4b.6c.2c malformed anchor geometry is a 400 and is rejected before source resolution or persistence', async () => {
  let resolves = 0;
  let creates = 0;
  const service = new ManualProjectBodyAnchorAcquisitionService({
    artifacts: {
      resolveStoredImageEvidence: async () => {
        resolves += 1;
        throw new Error('must not resolve malformed geometry');
      },
    },
    bodyAnchors: {
      createForExpectedImage: async () => {
        creates += 1;
        throw new Error('must not persist malformed geometry');
      },
    },
  });

  await withServer(service, async base => {
    const response = await post(base, Object.freeze({
      schemaVersion: 1,
      coordinateSpace: 'PROJECT_IMAGE_NORMALIZED',
      anchors: Object.freeze({ leftShoulder: Object.freeze([2, 0.15]) }),
    }));
    assert.equal(response.status, 400);
    const body = await response.json() as any;
    assert.equal(body.error, 'invalid_body_anchor_payload');
    assert.match(body.message, /Body anchors|anchor/i);
  });
  assert.equal(resolves, 0);
  assert.equal(creates, 0);
});

test('F4b.6c.2c untrusted wrong-scope signed source is a uniform 404 and never reaches persistence', async () => {
  let creates = 0;
  const service = new ManualProjectBodyAnchorAcquisitionService({
    artifacts: {
      resolveStoredImageEvidence: async () => { throw new ArtifactReferenceDeniedError(); },
    },
    bodyAnchors: {
      createForExpectedImage: async () => {
        creates += 1;
        throw new Error('must not persist unresolved source');
      },
    },
  });

  await withServer(service, async base => {
    const response = await post(base, validPayload);
    assert.equal(response.status, 404);
    const body = await response.json() as any;
    assert.deepEqual(
      { error: body.error, message: body.message },
      {
        error: 'body_anchor_source_unavailable',
        message: 'Canonical Project source is unavailable for manual body-anchor acquisition',
      },
    );
    assert.ok(!JSON.stringify(body).includes('scope'));
  });
  assert.equal(creates, 0);
});

test('F4b.6c.2c trusted claim whose durable image is absent is the same non-oracular 404', async () => {
  let creates = 0;
  const service = new ManualProjectBodyAnchorAcquisitionService({
    artifacts: {
      resolveStoredImageEvidence: async () => { throw new StoredProjectImageUnavailableError(); },
    },
    bodyAnchors: {
      createForExpectedImage: async () => {
        creates += 1;
        throw new Error('must not persist missing source');
      },
    },
  });

  await withServer(service, async base => {
    const response = await post(base, validPayload);
    assert.equal(response.status, 404);
    const body = await response.json() as any;
    assert.equal(body.error, 'body_anchor_source_unavailable');
  });
  assert.equal(creates, 0);
});

test('F4b.6c.2c unexpected Artifact storage failure remains a 500 and is not disguised as client unavailability', async () => {
  let creates = 0;
  const service = new ManualProjectBodyAnchorAcquisitionService({
    artifacts: {
      resolveStoredImageEvidence: async () => { throw new Error('postgres connection terminated unexpectedly'); },
    },
    bodyAnchors: {
      createForExpectedImage: async () => {
        creates += 1;
        throw new Error('must not persist after infrastructure failure');
      },
    },
  });

  await withServer(service, async base => {
    const response = await post(base, validPayload);
    assert.equal(response.status, 500);
    const body = await response.json() as any;
    assert.equal(body.error, 'manual_body_anchor_failed');
    assert.equal(body.message, 'Manual body-anchor acquisition failed');
    assert.ok(!JSON.stringify(body).includes('postgres'));
  });
  assert.equal(creates, 0);
});
