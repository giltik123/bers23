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

test('recover is read-only and never advances or executes pixels', async () => {
  const { app, calls } = harness({
    core: {
      getTryOnResult: async (intent) => { calls.push(['result', intent]); return { status: 'TEXTURE_PENDING', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT }; },
    },
  });
  assert.deepEqual(await app.recover(INTENT), { status: 'TEXTURE_PENDING' });
  assert.deepEqual(calls.map((entry) => entry[0]), ['result']);
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

test('unknown Core fields are rejected rather than becoming browser state authority', async () => {
  const { app } = harness({
    core: {
      getTryOnResult: async () => ({ status: 'FINAL_READY', projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, artifactId: 'canonical-final', storageId: 'forbidden' }),
    },
  });
  await assert.rejects(() => app.recover(INTENT), /unknown or missing fields/);
});

test('client request IDs are purpose-prefixed and deterministic only from explicit UUID generation', () => {
  const generated = createFashionTryOnClientRequestId(() => 'ABCDEFAB-CDEF-4ABC-8DEF-ABCDEFABCDEF');
  assert.equal(generated, 'fashion-tryon:abcdefab-cdef-4abc-8def-abcdefabcdef');
  assert.throws(() => createFashionTryOnClientRequestId(() => 'not-a-uuid'), /must return a UUID/);
});
