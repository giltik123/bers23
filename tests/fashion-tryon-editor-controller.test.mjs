import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCanonicalTryOnEditorController } from '../src/application/fashion/createCanonicalTryOnEditorController.js';

const ENTRY = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROJECT = 'bbbbbbbb-2222-4222-8222-222222222222';
const GARMENT = 'cccccccc-3333-4333-8333-333333333333';
const SOURCE = 'source-artifact-current';
const BEFORE = '/api/core/artifacts/results/before.token';
const SELECTION = Object.freeze({
  entryId: ENTRY,
  projectId: PROJECT,
  sourceArtifactId: SOURCE,
  outfit: Object.freeze({ status: 'ACTIVE', entries: Object.freeze([]) }),
});
const FINAL = Object.freeze({
  status: 'FINAL_READY',
  artifactId: 'final-artifact',
  preview: '/api/core/artifacts/results/final.token',
  previewExpiresAt: 1_900_000_000_000,
});

function pendingCandidate(overrides = {}) {
  const { result: resultOverrides = {}, ...candidateOverrides } = overrides;
  return {
    kind: 'FASHION_TRYON',
    result: {
      finalArtifactId: 'final-artifact',
      preview_url: '/api/core/artifacts/results/final.token',
      image_url: '/api/core/artifacts/results/final.token',
      provider: 'Local deterministic',
      credits_used: 0,
      ...resultOverrides,
    },
    instruction: 'Try on garment',
    beforeUrl: BEFORE,
    context: { garmentId: GARMENT, sourceArtifactId: SOURCE },
    ...candidateOverrides,
  };
}

function fixture({ inspectResult, beginResult, retryResult, resumeResult, recoverResult, handoffImpl } = {}) {
  const calls = [];
  let phase = 'IDLE';
  let hasInFlight = false;
  const session = {
    inspect: async () => {
      calls.push(['inspect']);
      return inspectResult ?? { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'tops' };
    },
    begin: async () => {
      calls.push(['begin']);
      const result = beginResult ?? { status: 'WARP_PENDING' };
      phase = result.status === 'FINAL_READY' ? 'FINAL_READY' : result.status;
      hasInFlight = result.status !== 'BLOCKED';
      return result;
    },
    resume: async () => {
      calls.push(['resume']);
      const result = resumeResult ?? { status: 'TEXTURE_PENDING' };
      phase = result.status;
      return result;
    },
    recover: async () => {
      calls.push(['recover']);
      const result = recoverResult ?? { status: 'TEXTURE_PENDING' };
      phase = result.status;
      return result;
    },
    retry: async () => {
      calls.push(['retry']);
      const result = retryResult ?? { status: 'WARP_PENDING' };
      phase = result.status === 'FINAL_READY' ? 'FINAL_READY' : result.status;
      hasInFlight = result.status !== 'BLOCKED';
      return result;
    },
    completeFinal: () => {
      calls.push(['completeFinal']);
      phase = 'IDLE';
      hasInFlight = false;
    },
    abandon: () => {
      calls.push(['abandon']);
      phase = 'IDLE';
      hasInFlight = false;
    },
    snapshot: () => ({ hasInFlight, phase, busy: false }),
  };
  const manual = {
    loadGarmentSource() {},
    saveContour() {},
    saveBodyAnchors() {},
  };
  const runtime = Object.freeze({ session, manual });
  const handoff = async (value) => {
    calls.push(['handoff', value]);
    return handoffImpl ? handoffImpl(value) : pendingCandidate();
  };
  const controller = createCanonicalTryOnEditorController({
    selection: SELECTION,
    beforeUrl: BEFORE,
    createRuntime: (options) => {
      calls.push(['runtime', options]);
      return runtime;
    },
    handoff,
  });
  return { controller, calls, session, manual };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test('controller calls the production runtime root with the exact options shape and never exposes session/runtime', () => {
  const { controller, manual, calls } = fixture();
  assert.deepEqual(Object.keys(calls[0][1]), ['selection']);
  assert.deepEqual(calls[0][1].selection, SELECTION);
  assert.equal(Object.isFrozen(calls[0][1]), true);
  assert.equal(controller.manual, manual);
  for (const forbidden of ['session', 'runtime', 'fashion', 'application']) {
    assert.equal(Object.hasOwn(controller, forbidden), false, forbidden);
  }
  assert.deepEqual(controller.snapshot(), { busy: false, disposed: false, hasInFlight: false, phase: 'IDLE' });
});

test('inspect returns only fail-closed canonical readiness and does not begin execution', async () => {
  const { controller, calls } = fixture();
  assert.deepEqual(await controller.inspect(), {
    status: 'READINESS',
    readiness: { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'tops' },
  });
  assert.deepEqual(calls.map(([name]) => name), ['runtime', 'inspect']);
});

test('controller rejects drifted READY vocabulary and foreign entry identity at its own boundary', async () => {
  for (const inspectResult of [
    { entryId: ENTRY, garmentId: GARMENT, status: 'READY' },
    { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'accessories' },
    { entryId: ENTRY, garmentId: GARMENT, status: 'FALLBACK_TO_CLOUD', categoryGroup: 'tops' },
    { entryId: 'dddddddd-4444-4444-8444-444444444444', garmentId: GARMENT, status: 'READY', categoryGroup: 'tops' },
  ]) {
    const { controller, calls } = fixture({ inspectResult });
    await assert.rejects(() => controller.inspect());
    assert.deepEqual(calls.map(([name]) => name), ['runtime', 'inspect']);
  }
});

test('continuation states pass through without creating Editor pending results', async () => {
  const { controller, calls } = fixture();
  assert.deepEqual(await controller.run(), { status: 'WARP_PENDING' });
  assert.deepEqual(await controller.resume(), { status: 'TEXTURE_PENDING' });
  assert.deepEqual(calls.map(([name]) => name), ['runtime', 'begin', 'resume']);
});

test('FINAL is handed off, identity-bound, then session identity is cleared before candidate return', async () => {
  const finalResult = { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final: FINAL };
  const { controller, calls } = fixture({ beginResult: finalResult });
  const result = await controller.run();
  assert.deepEqual(result, { status: 'FINAL_CANDIDATE', pendingResult: pendingCandidate() });
  assert.deepEqual(calls.map(([name]) => name), ['runtime', 'begin', 'handoff', 'completeFinal']);
  assert.deepEqual(controller.snapshot(), { busy: false, disposed: false, hasInFlight: false, phase: 'IDLE' });
  assert.equal(JSON.stringify(result).includes('clientRequestId'), false);
  assert.equal(JSON.stringify(result).includes('ticketId'), false);
});

test('failed handoff never acknowledges FINAL or hides the failure behind an automatic retry', async () => {
  const finalResult = { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final: FINAL };
  const { controller, calls } = fixture({
    beginResult: finalResult,
    handoffImpl: async () => { throw new Error('PNG handoff failed'); },
  });
  await assert.rejects(() => controller.run(), /PNG handoff failed/);
  assert.deepEqual(calls.map(([name]) => name), ['runtime', 'begin', 'handoff']);
  assert.deepEqual(controller.snapshot(), { busy: false, disposed: false, hasInFlight: true, phase: 'FINAL_READY' });
});

test('pending candidate normalization rejects authority smuggling and FINAL identity substitution before completeFinal', async () => {
  const finalResult = { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final: FINAL };
  for (const candidate of [
    pendingCandidate({ requestIdentity: 'forbidden' }),
    pendingCandidate({ context: { garmentId: GARMENT, sourceArtifactId: SOURCE, ticketId: 'forbidden' } }),
    pendingCandidate({ result: { provider: 'Cloud provider' } }),
    pendingCandidate({ result: { credits_used: 1 } }),
    pendingCandidate({ result: { image_url: '/different' } }),
    pendingCandidate({ result: { finalArtifactId: 'different-final' } }),
  ]) {
    const { controller, calls } = fixture({ beginResult: finalResult, handoffImpl: async () => candidate });
    await assert.rejects(() => controller.run());
    assert.equal(calls.some(([name]) => name === 'completeFinal'), false);
  }
});

test('FINAL source mismatch and malformed FINAL identity fail before handoff acknowledgement', async () => {
  for (const finalResult of [
    { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: 'different-source', final: FINAL },
    { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final: { ...FINAL, artifactId: '' } },
    { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final: { ...FINAL, status: 'NOT_FINAL' } },
  ]) {
    const { controller, calls } = fixture({ beginResult: finalResult });
    await assert.rejects(() => controller.run());
    assert.equal(calls.some(([name]) => name === 'handoff'), false);
    assert.equal(calls.some(([name]) => name === 'completeFinal'), false);
  }
});

test('explicit ResultCompare retry delegates to fresh-run session semantics after FINAL acknowledgement', async () => {
  const firstFinal = { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final: FINAL };
  const secondFinal = {
    status: 'FINAL_READY',
    garmentId: GARMENT,
    sourceArtifactId: SOURCE,
    final: { ...FINAL, artifactId: 'retry-final' },
  };
  let handoffCount = 0;
  const { controller, calls } = fixture({
    beginResult: firstFinal,
    retryResult: secondFinal,
    handoffImpl: async () => {
      handoffCount += 1;
      return pendingCandidate({ result: { finalArtifactId: handoffCount === 1 ? 'final-artifact' : 'retry-final' } });
    },
  });
  assert.equal((await controller.run()).pendingResult.result.finalArtifactId, 'final-artifact');
  assert.equal((await controller.retry()).pendingResult.result.finalArtifactId, 'retry-final');
  assert.deepEqual(calls.map(([name]) => name), [
    'runtime', 'begin', 'handoff', 'completeFinal', 'retry', 'handoff', 'completeFinal',
  ]);
});

test('controller serializes handoff so Retry/dispose cannot race FINAL acknowledgement', async () => {
  const pending = deferred();
  const finalResult = { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final: FINAL };
  const { controller, calls } = fixture({
    beginResult: finalResult,
    handoffImpl: async () => pending.promise,
  });
  const run = controller.run();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(controller.snapshot(), { busy: true, disposed: false, hasInFlight: true, phase: 'FINAL_READY' });
  await assert.rejects(() => controller.retry(), /while run is in progress/);
  assert.throws(() => controller.dispose(), /while run is in progress/);
  assert.equal(calls.filter(([name]) => name === 'completeFinal').length, 0);
  pending.resolve(pendingCandidate());
  assert.equal((await run).status, 'FINAL_CANDIDATE');
  assert.equal(calls.filter(([name]) => name === 'completeFinal').length, 1);
});

test('dispose abandons ephemeral session and permanently rejects later actions', async () => {
  const { controller, calls } = fixture();
  controller.dispose();
  assert.deepEqual(controller.snapshot(), { busy: false, disposed: true, hasInFlight: false, phase: 'IDLE' });
  await assert.rejects(() => controller.run(), /controller is disposed/);
  await assert.rejects(() => controller.inspect(), /controller is disposed/);
  assert.throws(() => controller.abandon(), /controller is disposed/);
  assert.deepEqual(calls.map(([name]) => name), ['runtime', 'abandon']);
  controller.dispose();
  assert.deepEqual(calls.map(([name]) => name), ['runtime', 'abandon']);
});

test('controller source uses shared readiness and contains no Project Accept, persistence, provider or raw execution authority', async () => {
  const source = await readFile('src/application/fashion/createCanonicalTryOnEditorController.js', 'utf8');
  for (const forbidden of [
    'coreClient', 'fetch(', 'pushEdit', 'finalizeAcceptedResult', 'localStorage', 'sessionStorage', 'indexedDB',
    'FASHN', 'Billing', 'outfitManager', 'TryOnPanel', 'representationId', 'anchorSetId', 'storageId',
    'contentSha256', 'destinationMesh',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /normalizeCanonicalTryOnReadinessSummary/);
  assert.match(source, /createRuntime\(Object\.freeze\(\{ selection: stableSelection \}\)\)/);
  assert.match(source, /finalArtifactId !== expected\.finalArtifactId/);
  assert.match(source, /session\.completeFinal\(\)/);
  assert.match(source, /return invoke\('retry', \(\) => session\.retry\(\)\)/);
  assert.match(source, /return Object\.freeze\(\{ status: 'FINAL_CANDIDATE', pendingResult: pending \}\)/);
});
