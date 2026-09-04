import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCanonicalTryOnEditorUiOwner } from '../src/application/fashion/createCanonicalTryOnEditorUiOwner.js';

const PROJECT = 'bbbbbbbb-2222-4222-8222-222222222222';
const ENTRY = 'aaaaaaaa-1111-4111-8111-111111111111';
const ENTRY_2 = 'dddddddd-4444-4444-8444-444444444444';
const GARMENT = 'cccccccc-3333-4333-8333-333333333333';
const GARMENT_2 = 'eeeeeeee-5555-4555-8555-555555555555';
const SOURCE = 'current-source-artifact';
const BEFORE = '/api/core/artifacts/results/before.token';
const OUTFIT = Object.freeze({
  id: 'ffffffff-6666-4666-8666-666666666666',
  revision: 7,
  status: 'ACTIVE',
  entries: Object.freeze([
    Object.freeze({ entryId: ENTRY, garmentId: GARMENT, referenceReadiness: 'READY' }),
    Object.freeze({ entryId: ENTRY_2, garmentId: GARMENT_2, referenceReadiness: 'READY' }),
  ]),
});

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function fixture({ actionResults = {}, publishImpl } = {}) {
  const calls = [];
  const disposedPreviews = [];
  const controllers = [];
  const project = {
    id: PROJECT,
    current_image_artifact_id: SOURCE,
    current_image_url: BEFORE,
  };

  const createController = (value) => {
    calls.push(['createController', value]);
    let phase = 'IDLE';
    let hasInFlight = false;
    let disposed = false;
    const invoke = async (name) => {
      calls.push([name, value.selection.entryId]);
      const configured = actionResults[name];
      const result = typeof configured === 'function' ? await configured(value.selection.entryId) : configured;
      const actual = result ?? (name === 'inspect'
        ? { status: 'READINESS', readiness: { entryId: value.selection.entryId, garmentId: value.selection.entryId === ENTRY ? GARMENT : GARMENT_2, status: 'READY', categoryGroup: 'tops' } }
        : { status: 'WARP_PENDING' });
      if (actual.status === 'FINAL_CANDIDATE') {
        phase = 'IDLE';
        hasInFlight = false;
      } else if (actual.status === 'READINESS' || actual.status === 'BLOCKED') {
        phase = actual.status === 'BLOCKED' ? 'BLOCKED' : 'IDLE';
        hasInFlight = false;
      } else {
        phase = actual.status;
        hasInFlight = true;
      }
      return actual;
    };
    const controller = {
      inspect: () => invoke('inspect'),
      run: () => invoke('run'),
      resume: () => invoke('resume'),
      recover: () => invoke('recover'),
      retry: () => invoke('retry'),
      abandon() { calls.push(['abandon', value.selection.entryId]); phase = 'IDLE'; hasInFlight = false; },
      dispose() { calls.push(['dispose', value.selection.entryId]); disposed = true; phase = 'IDLE'; hasInFlight = false; },
      snapshot: () => ({ busy: false, disposed, hasInFlight, phase }),
    };
    controllers.push(controller);
    return controller;
  };

  const owner = createCanonicalTryOnEditorUiOwner({
    getProject: () => project,
    createController,
    publishPendingResult: (pending) => {
      calls.push(['publish', pending]);
      if (publishImpl) return publishImpl(pending);
    },
    disposePendingPreview: (pending) => {
      calls.push(['disposePreview', pending]);
      disposedPreviews.push(pending);
    },
    onStateChange: (state) => calls.push(['state', state]),
    reportError: (error) => calls.push(['error', error.message]),
  });

  return { owner, calls, project, controllers, disposedPreviews };
}

const selection = (entryId = ENTRY) => ({ outfit: OUTFIT, entryId });

test('initial owner state is safe and contains no controller or request identity', () => {
  const { owner } = fixture();
  assert.deepEqual(owner.state(), {
    entryId: null,
    garmentId: null,
    phase: 'IDLE',
    hasInFlight: false,
    busy: false,
  });
  for (const forbidden of ['controller', 'session', 'runtime', 'clientRequestId']) {
    assert.equal(Object.hasOwn(owner, forbidden), false, forbidden);
  }
});

test('inspect creates the controller from current canonical Project identity and returns settled readiness', async () => {
  const { owner, calls } = fixture();
  const state = await owner.action('inspect', selection());
  assert.deepEqual(state, {
    entryId: ENTRY,
    garmentId: GARMENT,
    phase: 'IDLE',
    hasInFlight: false,
    busy: false,
    outcome: {
      status: 'READINESS',
      readiness: { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'tops' },
    },
  });
  const created = calls.find(([name]) => name === 'createController')[1];
  assert.deepEqual(created, {
    selection: { outfit: OUTFIT, entryId: ENTRY, projectId: PROJECT, sourceArtifactId: SOURCE },
    beforeUrl: BEFORE,
  });
  assert.equal(Object.isFrozen(created), true);
  assert.equal(Object.isFrozen(created.selection), true);
});

test('same entry reuses one controller while run and continuation keep only safe phase state', async () => {
  const { owner, calls } = fixture();
  await owner.action('inspect', selection());
  assert.deepEqual(await owner.action('run', selection()), {
    entryId: ENTRY, garmentId: GARMENT, phase: 'WARP_PENDING', hasInFlight: true, busy: false,
    outcome: { status: 'WARP_PENDING' },
  });
  assert.deepEqual(await owner.action('resume', { entryId: ENTRY }), {
    entryId: ENTRY, garmentId: GARMENT, phase: 'WARP_PENDING', hasInFlight: true, busy: false,
    outcome: { status: 'WARP_PENDING' },
  });
  assert.equal(calls.filter(([name]) => name === 'createController').length, 1);
});

test('switching Outfit entry is fail-closed while the current run is in flight', async () => {
  const { owner, calls } = fixture();
  await owner.action('run', selection());
  await assert.rejects(
    () => owner.action('inspect', selection(ENTRY_2)),
    /Abandon the active canonical Try-On run/,
  );
  assert.equal(calls.filter(([name]) => name === 'createController').length, 1);
  assert.equal(owner.state().entryId, ENTRY);
});

test('explicit abandon clears in-flight phase without silently replacing the controller', async () => {
  const { owner, calls } = fixture();
  await owner.action('run', selection());
  assert.deepEqual(await owner.action('abandon', { entryId: ENTRY }), {
    entryId: ENTRY, garmentId: GARMENT, phase: 'IDLE', hasInFlight: false, busy: false,
  });
  assert.equal(calls.filter(([name]) => name === 'abandon').length, 1);
  await owner.action('inspect', selection(ENTRY_2));
  assert.equal(owner.state().entryId, ENTRY_2);
  assert.equal(calls.filter(([name]) => name === 'dispose').length, 1);
});

test('FINAL candidate is published but never retained in safe owner state', async () => {
  const pending = Object.freeze({ kind: 'FASHION_TRYON', result: Object.freeze({ finalArtifactId: 'final' }) });
  const { owner, calls } = fixture({ actionResults: { run: { status: 'FINAL_CANDIDATE', pendingResult: pending } } });
  const state = await owner.action('run', selection());
  assert.deepEqual(state, {
    entryId: ENTRY, garmentId: GARMENT, phase: 'IDLE', hasInFlight: false, busy: false,
  });
  assert.deepEqual(calls.find(([name]) => name === 'publish')[1], pending);
  assert.equal(JSON.stringify(state).includes('finalArtifactId'), false);
});

test('failed pending publication disposes the unowned preview and reports the error', async () => {
  const pending = { kind: 'FASHION_TRYON', result: { preview_url: 'blob:orphan' } };
  const { owner, calls, disposedPreviews } = fixture({
    actionResults: { run: { status: 'FINAL_CANDIDATE', pendingResult: pending } },
    publishImpl: () => { throw new Error('Editor state publication failed'); },
  });
  await assert.rejects(() => owner.action('run', selection()), /Editor state publication failed/);
  assert.deepEqual(disposedPreviews, [pending]);
  assert.equal(calls.some(([name, message]) => name === 'error' && message === 'Editor state publication failed'), true);
});

test('source invalidation during unresolved work suppresses stale FINAL publication and revokes its preview', async () => {
  const pendingAction = deferred();
  const stalePending = { kind: 'FASHION_TRYON', result: { preview_url: 'blob:stale' } };
  const { owner, calls, disposedPreviews } = fixture({
    actionResults: { run: () => pendingAction.promise },
  });
  const run = owner.action('run', selection());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(owner.state().busy, true);
  owner.reset();
  assert.deepEqual(owner.state(), { entryId: null, garmentId: null, phase: 'IDLE', hasInFlight: false, busy: false });
  pendingAction.resolve({ status: 'FINAL_CANDIDATE', pendingResult: stalePending });
  assert.deepEqual(await run, { entryId: null, garmentId: null, phase: 'IDLE', hasInFlight: false, busy: false });
  assert.deepEqual(disposedPreviews, [stalePending]);
  assert.equal(calls.some(([name]) => name === 'publish'), false);
});

test('old async completion cannot clear the busy token of a newer selection action', async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const { owner } = fixture({
    actionResults: {
      inspect: () => {
        calls += 1;
        return calls === 1 ? first.promise : second.promise;
      },
    },
  });
  const old = owner.action('inspect', selection());
  await new Promise((resolve) => setImmediate(resolve));
  owner.reset();
  const current = owner.action('inspect', selection(ENTRY_2));
  await new Promise((resolve) => setImmediate(resolve));
  first.resolve({ status: 'READINESS', readiness: { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'tops' } });
  await old;
  assert.equal(owner.state().busy, true, 'stale finally must not clear the current operation token');
  second.resolve({ status: 'READINESS', readiness: { entryId: ENTRY_2, garmentId: GARMENT_2, status: 'READY', categoryGroup: 'tops' } });
  const settled = await current;
  assert.equal(settled.busy, false);
  assert.equal(settled.entryId, ENTRY_2);
});

test('concurrent UI action is rejected before a second controller mutation can start', async () => {
  const pending = deferred();
  const { owner, calls } = fixture({ actionResults: { run: () => pending.promise } });
  const run = owner.action('run', selection());
  await new Promise((resolve) => setImmediate(resolve));
  await assert.rejects(() => owner.action('resume', { entryId: ENTRY }), /another action is in progress/);
  assert.equal(calls.filter(([name]) => name === 'resume').length, 0);
  pending.resolve({ status: 'WARP_PENDING' });
  await run;
});

test('malformed or unknown controller outcomes fail closed instead of becoming UI state', async () => {
  for (const run of [
    { status: 'FINAL_READY' },
    { status: 'FALLBACK_TO_CLOUD' },
    { status: 'READINESS', readiness: {}, extra: true },
  ]) {
    const { owner, calls } = fixture({ actionResults: { run } });
    await assert.rejects(() => owner.action('run', selection()));
    assert.equal(calls.some(([name]) => name === 'error'), true);
    assert.equal(Object.hasOwn(owner.state(), 'outcome'), false);
  }
});

test('dispose permanently closes the owner and invalidates controller capabilities', async () => {
  const { owner, calls } = fixture();
  await owner.action('inspect', selection());
  owner.dispose();
  assert.deepEqual(owner.state(), { entryId: null, garmentId: null, phase: 'IDLE', hasInFlight: false, busy: false });
  await assert.rejects(() => owner.action('inspect', selection()), /owner is disposed/);
  assert.throws(() => owner.reset(), /owner is disposed/);
  owner.dispose();
  assert.equal(calls.filter(([name]) => name === 'dispose').length, 1);
});

test('owner source keeps controller/runtime private and contains no Project mutation, billing or legacy execution authority', async () => {
  const source = await readFile('src/application/fashion/createCanonicalTryOnEditorUiOwner.js', 'utf8');
  for (const forbidden of [
    'pushEdit', 'finalizeAcceptedResult', 'outfitManager', 'TryOnPanel', 'FASHN', 'Billing',
    'localStorage', 'sessionStorage', 'indexedDB', 'representationId', 'anchorSetId', 'storageId',
    'contentSha256', 'destinationMesh', 'clientRequestId',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /createCanonicalTryOnEditorController/);
  assert.match(source, /createCanonicalTryOnProductRuntime/);
  assert.match(source, /createTryOnEditorFinalHandoff/);
  assert.match(source, /controller !== target \|\| epoch !== actionEpoch/);
  assert.match(source, /disposePendingPreview\(result\.pendingResult\)/);
  assert.match(source, /if \(operation === token\) operation = null/);
});
