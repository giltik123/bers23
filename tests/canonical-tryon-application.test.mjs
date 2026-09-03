import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCanonicalTryOnApplication,
  createFashionTryOnClientRequestId,
} from '../src/application/fashion/canonicalTryOnApplication.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const GARMENT = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'stored-final-source';
const REQUEST = 'fashion-tryon:33333333-3333-4333-8333-333333333333';
const INTENT = Object.freeze({ projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, clientRequestId: REQUEST });
const READY = Object.freeze({ status: 'READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, categoryGroup: 'tops' });
const PREVIEW_URL = '/api/core/artifacts/results/opaque-preview-token';
const PREVIEW_EXPIRES_AT = 1_900_000_000_000;

function harness(overrides = {}) {
  const calls = [];
  const core = {
    checkTryOnReadiness: async (intent) => { calls.push(['readiness', intent]); return READY; },
    prepareTryOn: async (intent) => {
      calls.push(['prepare', intent]);
      return { ...READY, status: 'WARP_PREPARED', preparedExecution: { phase: 'GARMENT_MESH_WARP', ticketId: 'opaque-warp' } };
    },
    continueTryOn: async (intent) => {
      calls.push(['continue', intent]);
      return { status: 'TEXTURE_PREPARED', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, preparedExecution: { phase: 'GARMENT_TEXTURE_COMPOSITE', ticketId: 'opaque-texture' } };
    },
    getTryOnResult: async (intent) => {
      calls.push(['result', intent]);
      return { status: 'FINAL_READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, artifactId: 'canonical-final' };
    },
    getTryOnPreview: async (intent) => {
      calls.push(['preview', intent]);
      return {
        status: 'PREVIEW_READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT,
        artifactId: 'canonical-final', previewUrl: PREVIEW_URL, previewExpiresAt: PREVIEW_EXPIRES_AT,
      };
    },
    ...overrides.core,
  };
  const executeWarp = overrides.executeWarp ?? (async (value) => { calls.push(['warp', value]); return { preview: 'warp-preview' }; });
  const executeTexture = overrides.executeTexture ?? (async (value) => { calls.push(['texture', value]); return { preview: 'texture-preview' }; });
  return { app: createCanonicalTryOnApplication({ core, executeWarp, executeTexture }), calls };
}

test('readiness uses stable intent only and executes no pixel phase', async () => {
  const { app, calls } = harness();
  assert.deepEqual(await app.checkReadiness({ projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT }), {
    status: 'READY', categoryGroup: 'tops',
  });
  assert.deepEqual(calls, [['readiness', { projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT }]]);
});

test('begin executes each available deterministic phase once and returns canonical FINAL identity', async () => {
  const { app, calls } = harness();
  const result = await app.begin(INTENT);
  assert.deepEqual(result, { status: 'FINAL_READY', artifactId: 'canonical-final', preview: 'texture-preview' });
  assert.deepEqual(calls.map((entry) => entry[0]), ['prepare', 'warp', 'continue', 'texture', 'result']);
  assert.equal(calls[1][1].preparedExecution.ticketId, 'opaque-warp');
  assert.equal(calls[3][1].preparedExecution.ticketId, 'opaque-texture');
});

test('prepare prerequisite stops before any browser execution', async () => {
  const prerequisite = { status: 'REPRESENTATION_REQUIRED', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, categoryGroup: 'tops' };
  const { app, calls } = harness({
    core: {
      prepareTryOn: async (intent) => { calls.push(['prepare', intent]); return { status: 'PREREQUISITE', readiness: prerequisite }; },
    },
  });
  assert.deepEqual(await app.begin(INTENT), { status: 'PREREQUISITE', readiness: { status: 'REPRESENTATION_REQUIRED', categoryGroup: 'tops' } });
  assert.deepEqual(calls.map((entry) => entry[0]), ['prepare']);
});

test('WARP_PENDING is surfaced without polling, texture execution or result lookup', async () => {
  const { app, calls } = harness({
    core: {
      continueTryOn: async (intent) => { calls.push(['continue', intent]); return { status: 'WARP_PENDING', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT }; },
    },
  });
  assert.deepEqual(await app.begin(INTENT), { status: 'WARP_PENDING' });
  assert.deepEqual(calls.map((entry) => entry[0]), ['prepare', 'warp', 'continue']);
});

test('resume never prepares or re-runs warp', async () => {
  const { app, calls } = harness();
  assert.deepEqual(await app.resume(INTENT), { status: 'FINAL_READY', artifactId: 'canonical-final', preview: 'texture-preview' });
  assert.deepEqual(calls.map((entry) => entry[0]), ['continue', 'texture', 'result']);
});

test('recover obtains a short-lived preview through stable intent and executes no pixels', async () => {
  const { app, calls } = harness();
  assert.deepEqual(await app.recover(INTENT), {
    status: 'FINAL_READY', artifactId: 'canonical-final', preview: PREVIEW_URL, previewExpiresAt: PREVIEW_EXPIRES_AT,
  });
  assert.deepEqual(calls.map((entry) => entry[0]), ['preview']);
});

test('recover preserves non-terminal Core state without advancing execution', async () => {
  const { app, calls } = harness({
    core: {
      getTryOnPreview: async (intent) => { calls.push(['preview', intent]); return { status: 'TEXTURE_PENDING', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT }; },
    },
  });
  assert.deepEqual(await app.recover(INTENT), { status: 'TEXTURE_PENDING' });
  assert.deepEqual(calls.map((entry) => entry[0]), ['preview']);
});

test('recovery preview rejects unstable echo, foreign delivery URL and malformed expiry', async () => {
  for (const response of [
    { status: 'PREVIEW_READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', artifactId: 'canonical-final', previewUrl: PREVIEW_URL, previewExpiresAt: PREVIEW_EXPIRES_AT },
    { status: 'PREVIEW_READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, artifactId: 'canonical-final', previewUrl: 'https://example.test/forbidden', previewExpiresAt: PREVIEW_EXPIRES_AT },
    { status: 'PREVIEW_READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, artifactId: 'canonical-final', previewUrl: PREVIEW_URL, previewExpiresAt: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    const { app } = harness({ core: { getTryOnPreview: async () => response } });
    await assert.rejects(() => app.recover(INTENT));
  }
});

test('stable intent mismatch and authority-shaped client fields fail closed', async () => {
  const { app, calls } = harness({
    core: {
      prepareTryOn: async (intent) => { calls.push(['prepare', intent]); return { status: 'WARP_PREPARED', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', categoryGroup: 'tops', preparedExecution: {} }; },
    },
  });
  await assert.rejects(() => app.begin(INTENT), /stable product intent/);
  calls.length = 0;
  await assert.rejects(() => app.begin({ ...INTENT, representationId: 'browser-evidence' }), /unknown or missing fields/);
  assert.deepEqual(calls, []);
});

test('unknown Core preview fields are rejected rather than becoming browser state authority', async () => {
  const { app } = harness({
    core: {
      getTryOnPreview: async () => ({
        status: 'PREVIEW_READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT,
        artifactId: 'canonical-final', previewUrl: PREVIEW_URL, previewExpiresAt: PREVIEW_EXPIRES_AT, storageId: 'forbidden',
      }),
    },
  });
  await assert.rejects(() => app.recover(INTENT), /unknown or missing fields/);
});

test('client request IDs are purpose-prefixed and deterministic only from explicit UUID generation', () => {
  const generated = createFashionTryOnClientRequestId(() => 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF');
  assert.equal(generated, 'fashion-tryon:abcdefab-cdef-4abc-8def-abcdefabcdef');
  assert.throws(() => createFashionTryOnClientRequestId(() => 'not-a-uuid'), /must return a UUID/);
});
