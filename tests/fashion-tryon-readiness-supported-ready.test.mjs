import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeCanonicalTryOnReadinessSummary } from '../src/application/fashion/canonicalTryOnReadinessContract.js';
import { createCanonicalTryOnApplication } from '../src/application/fashion/canonicalTryOnApplication.js';

const PROJECT = '11111111-1111-4111-8111-111111111111';
const GARMENT = '22222222-2222-4222-8222-222222222222';
const SOURCE = 'source-artifact';
const REQUEST = 'fashion-tryon:33333333-3333-4333-8333-333333333333';
const READINESS_INTENT = Object.freeze({ projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT });
const RUN_INTENT = Object.freeze({ ...READINESS_INTENT, clientRequestId: REQUEST });

function echoed(response) {
  return { projectId: PROJECT, sourceArtifactId: SOURCE, garmentId: GARMENT, ...response };
}

function application({ readiness = echoed({ status: 'READY', categoryGroup: 'tops' }), prepared } = {}) {
  const calls = [];
  const core = {
    checkTryOnReadiness: async (intent) => { calls.push(['readiness', intent]); return readiness; },
    prepareTryOn: async (intent) => {
      calls.push(['prepare', intent]);
      return prepared ?? echoed({ status: 'WARP_PREPARED', categoryGroup: 'tops', preparedExecution: {} });
    },
    continueTryOn: async (intent) => { calls.push(['continue', intent]); return echoed({ status: 'WARP_PENDING' }); },
    getTryOnResult: async (intent) => { calls.push(['result', intent]); return echoed({ status: 'TEXTURE_PENDING' }); },
    getTryOnPreview: async (intent) => { calls.push(['preview', intent]); return echoed({ status: 'TEXTURE_PENDING' }); },
  };
  const app = createCanonicalTryOnApplication({
    core,
    executeWarp: async () => { calls.push(['warp']); },
    executeTexture: async () => { calls.push(['texture']); return {}; },
  });
  return { app, calls };
}

test('shared readiness summary permits READY only for deterministic supported groups', () => {
  for (const categoryGroup of ['tops', 'bottoms', 'dresses', 'footwear']) {
    assert.deepEqual(
      normalizeCanonicalTryOnReadinessSummary({ status: 'READY', categoryGroup }),
      { status: 'READY', categoryGroup },
    );
  }
  for (const value of [
    { status: 'READY' },
    { status: 'READY', categoryGroup: 'accessories' },
    { status: 'READY', categoryGroup: 'other' },
  ]) {
    assert.throws(() => normalizeCanonicalTryOnReadinessSummary(value), /READY requires a supported category group/);
  }
});

test('shared readiness summary keeps known unsupported groups on failure states', () => {
  assert.deepEqual(
    normalizeCanonicalTryOnReadinessSummary({ status: 'GARMENT_UNSUPPORTED', categoryGroup: 'accessories' }),
    { status: 'GARMENT_UNSUPPORTED', categoryGroup: 'accessories' },
  );
  assert.deepEqual(
    normalizeCanonicalTryOnReadinessSummary({ status: 'GARMENT_UNSUPPORTED', categoryGroup: 'other' }),
    { status: 'GARMENT_UNSUPPORTED', categoryGroup: 'other' },
  );
});

test('canonical application checkReadiness rejects malformed or unsupported READY before product state', async () => {
  for (const response of [
    echoed({ status: 'READY' }),
    echoed({ status: 'READY', categoryGroup: 'accessories' }),
    echoed({ status: 'READY', categoryGroup: 'other' }),
  ]) {
    const { app, calls } = application({ readiness: response });
    await assert.rejects(() => app.checkReadiness(READINESS_INTENT), /READY requires a supported category group/);
    assert.deepEqual(calls.map(([name]) => name), ['readiness']);
  }
});

test('canonical application checkReadiness accepts every server-supported READY group', async () => {
  for (const categoryGroup of ['tops', 'bottoms', 'dresses', 'footwear']) {
    const { app } = application({ readiness: echoed({ status: 'READY', categoryGroup }) });
    assert.deepEqual(await app.checkReadiness(READINESS_INTENT), { status: 'READY', categoryGroup });
  }
});

test('PREREQUISITE cannot smuggle READY for an unsupported group into the run path', async () => {
  const prepared = {
    status: 'PREREQUISITE',
    readiness: echoed({ status: 'READY', categoryGroup: 'accessories' }),
  };
  const { app, calls } = application({ prepared });
  await assert.rejects(() => app.begin(RUN_INTENT), /READY requires a supported category group/);
  assert.deepEqual(calls.map(([name]) => name), ['prepare']);
});

test('failure prerequisite with unsupported group remains actionable and executes no pixels', async () => {
  const prepared = {
    status: 'PREREQUISITE',
    readiness: echoed({ status: 'GARMENT_UNSUPPORTED', categoryGroup: 'accessories' }),
  };
  const { app, calls } = application({ prepared });
  assert.deepEqual(await app.begin(RUN_INTENT), {
    status: 'PREREQUISITE',
    readiness: { status: 'GARMENT_UNSUPPORTED', categoryGroup: 'accessories' },
  });
  assert.deepEqual(calls.map(([name]) => name), ['prepare']);
});

test('WARP_PREPARED must also carry a supported deterministic category before pixel execution', async () => {
  for (const categoryGroup of ['accessories', 'other', undefined]) {
    const prepared = echoed({
      status: 'WARP_PREPARED',
      categoryGroup,
      preparedExecution: { phase: 'GARMENT_MESH_WARP', ticketId: 'opaque' },
    });
    const { app, calls } = application({ prepared });
    await assert.rejects(() => app.begin(RUN_INTENT), /WARP_PREPARED requires a supported category group/);
    assert.deepEqual(calls.map(([name]) => name), ['prepare']);
  }
});
