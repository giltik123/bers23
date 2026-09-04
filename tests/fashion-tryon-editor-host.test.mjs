import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCanonicalTryOnEditorHost } from '../src/application/fashion/createCanonicalTryOnEditorHost.js';

const PROJECT = 'aaaaaaaa-1111-4111-8111-111111111111';
const OUTFIT = 'bbbbbbbb-2222-4222-8222-222222222222';
const ENTRY = 'cccccccc-3333-4333-8333-333333333333';
const ENTRY_2 = 'dddddddd-4444-4444-8444-444444444444';
const SOURCE = 'source-current';
const BEFORE = '/api/core/artifacts/results/before.token';

function context(overrides = {}) {
  const outfit = Object.freeze({
    id: OUTFIT,
    revision: overrides.outfitRevision ?? 5,
    status: 'ACTIVE',
    entries: Object.freeze([]),
  });
  return {
    selection: {
      entryId: overrides.entryId ?? ENTRY,
      outfit,
      projectId: PROJECT,
      sourceArtifactId: overrides.sourceArtifactId ?? SOURCE,
    },
    beforeUrl: overrides.beforeUrl ?? BEFORE,
  };
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

function harness() {
  const created = [];
  const createController = (input) => {
    const calls = [];
    let busy = false;
    let disposed = false;
    let hasInFlight = false;
    let phase = 'IDLE';
    const manual = {
      loadGarmentSource() {},
      saveContour() {},
      saveBodyAnchors() {},
    };
    const controller = {
      manual,
      inspect: async () => { calls.push('inspect'); return { status: 'READINESS' }; },
      run: async () => { calls.push('run'); hasInFlight = true; phase = 'WARP_PENDING'; return { status: 'WARP_PENDING' }; },
      resume: async () => { calls.push('resume'); return { status: 'TEXTURE_PENDING' }; },
      recover: async () => { calls.push('recover'); return { status: 'TEXTURE_PENDING' }; },
      retry: async () => { calls.push('retry'); hasInFlight = true; phase = 'WARP_PENDING'; return { status: 'WARP_PENDING' }; },
      abandon: () => { calls.push('abandon'); hasInFlight = false; phase = 'IDLE'; },
      dispose: () => { calls.push('dispose'); hasInFlight = false; phase = 'IDLE'; disposed = true; },
      snapshot: () => ({ busy, disposed, hasInFlight, phase }),
      __set(next) {
        if (Object.hasOwn(next, 'busy')) busy = next.busy;
        if (Object.hasOwn(next, 'disposed')) disposed = next.disposed;
        if (Object.hasOwn(next, 'hasInFlight')) hasInFlight = next.hasInFlight;
        if (Object.hasOwn(next, 'phase')) phase = next.phase;
      },
      __calls: calls,
    };
    created.push({ input, controller });
    return controller;
  };
  return { host: createCanonicalTryOnEditorHost({ createController }), created };
}

test('same canonical selection reuses one private controller across inspect/run/manual access', async () => {
  const { host, created } = harness();
  const first = context();
  assert.deepEqual(await host.inspect(first), { status: 'READINESS' });
  const manual = host.manual(first);
  assert.equal(created.length, 1);
  assert.equal(manual, created[0].controller.manual);
  assert.deepEqual(await host.run(first), { status: 'WARP_PENDING' });
  assert.equal(created.length, 1);
  assert.deepEqual(host.snapshot(), { active: true, busy: false, disposed: false, hasInFlight: true, phase: 'WARP_PENDING' });
  assert.equal(Object.hasOwn(host, 'controller'), false);
  assert.equal(Object.hasOwn(host, 'session'), false);
});

test('idle Outfit revision/entry/source/before-url changes dispose old controller before replacement', async () => {
  for (const next of [
    context({ outfitRevision: 6 }),
    context({ entryId: ENTRY_2 }),
    context({ sourceArtifactId: 'source-next' }),
    context({ beforeUrl: '/api/core/artifacts/results/other.token' }),
  ]) {
    const { host, created } = harness();
    await host.inspect(context());
    await host.inspect(next);
    assert.equal(created.length, 2);
    assert.deepEqual(created[0].controller.__calls, ['inspect', 'dispose']);
    assert.deepEqual(created[1].controller.__calls, ['inspect']);
  }
});

test('selection replacement is fail-closed while current controller is busy or in flight', async () => {
  for (const state of [
    { busy: true, hasInFlight: false, phase: 'IDLE' },
    { busy: false, hasInFlight: true, phase: 'TEXTURE_PENDING' },
  ]) {
    const { host, created } = harness();
    await host.inspect(context());
    created[0].controller.__set(state);
    await assert.rejects(() => host.inspect(context({ outfitRevision: 6 })), /cannot change while the current run is busy or in flight/);
    assert.equal(created.length, 1);
    assert.equal(created[0].controller.__calls.includes('dispose'), false);
  }
});

test('new controllers must enter host idle and authority-complete', async () => {
  const badState = createCanonicalTryOnEditorHost({
    createController: () => {
      const manual = { loadGarmentSource() {}, saveContour() {}, saveBodyAnchors() {} };
      return {
        manual,
        inspect() {}, run() {}, resume() {}, recover() {}, retry() {}, abandon() {},
        dispose() {},
        snapshot: () => ({ busy: false, disposed: false, hasInFlight: true, phase: 'WARP_PENDING' }),
      };
    },
  });
  await assert.rejects(() => badState.inspect(context()), /must enter the Editor host in an idle state/);

  const missingMethod = createCanonicalTryOnEditorHost({
    createController: () => ({
      manual: { loadGarmentSource() {}, saveContour() {}, saveBodyAnchors() {} },
      inspect() {}, run() {}, resume() {}, recover() {}, abandon() {}, dispose() {}, snapshot() {},
    }),
  });
  await assert.rejects(() => missingMethod.inspect(context()), /requires Editor controller.retry/);
});

test('retry uses only the current private controller and release requires an idle controller', async () => {
  const { host, created } = harness();
  await host.inspect(context());
  assert.deepEqual(await host.retry(), { status: 'WARP_PENDING' });
  assert.deepEqual(created[0].controller.__calls, ['inspect', 'retry']);
  assert.throws(() => host.release(), /cannot release a busy or in-flight controller/);
  host.abandon();
  assert.deepEqual(created[0].controller.__calls, ['inspect', 'retry', 'abandon']);
  host.release();
  assert.deepEqual(created[0].controller.__calls, ['inspect', 'retry', 'abandon', 'dispose']);
  assert.deepEqual(host.snapshot(), { active: false, busy: false, disposed: false, hasInFlight: false, phase: 'IDLE' });
});

test('requestDispose defers synchronous React cleanup until a busy async operation settles', async () => {
  const pending = deferred();
  const calls = [];
  let busy = false;
  let disposed = false;
  const manual = { loadGarmentSource() {}, saveContour() {}, saveBodyAnchors() {} };
  const host = createCanonicalTryOnEditorHost({
    createController: () => ({
      manual,
      inspect: async () => ({ status: 'READINESS' }),
      run: async () => {
        calls.push('run');
        busy = true;
        try { return await pending.promise; } finally { busy = false; }
      },
      resume: async () => ({ status: 'TEXTURE_PENDING' }),
      recover: async () => ({ status: 'TEXTURE_PENDING' }),
      retry: async () => ({ status: 'WARP_PENDING' }),
      abandon() {},
      dispose: () => { calls.push('dispose'); disposed = true; },
      snapshot: () => ({ busy, disposed, hasInFlight: false, phase: busy ? 'BEGINNING' : 'IDLE' }),
    }),
  });

  const run = host.run(context());
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(host.requestDispose(), false);
  await assert.rejects(() => host.inspect(context()), /disposal was requested/);
  assert.equal(host.requestDispose(), false);
  pending.resolve({ status: 'WARP_PENDING' });
  assert.deepEqual(await run, { status: 'WARP_PENDING' });
  assert.deepEqual(calls, ['run', 'dispose']);
  assert.deepEqual(host.snapshot(), { active: false, busy: false, disposed: true, hasInFlight: false, phase: 'IDLE' });
});

test('explicit host dispose may abandon an idle continuation but strict dispose never races controller busy work', async () => {
  const { host, created } = harness();
  await host.inspect(context());
  created[0].controller.__set({ hasInFlight: true, phase: 'TEXTURE_PENDING' });
  host.dispose();
  assert.deepEqual(created[0].controller.__calls, ['inspect', 'dispose']);
  assert.deepEqual(host.snapshot(), { active: false, busy: false, disposed: true, hasInFlight: false, phase: 'IDLE' });
  await assert.rejects(() => host.inspect(context()), /host is disposed/);

  const second = harness();
  await second.host.inspect(context());
  second.created[0].controller.__set({ busy: true });
  assert.throws(() => second.host.dispose(), /cannot dispose while the controller is busy/);
  assert.deepEqual(second.host.snapshot(), { active: true, busy: true, disposed: false, hasInFlight: false, phase: 'IDLE' });
});

test('context key is strict and limited to canonical product identity', async () => {
  const { host } = harness();
  await assert.rejects(() => host.inspect({ ...context(), ticketId: 'forbidden' }), /unknown or missing fields/);
  await assert.rejects(() => host.inspect({ ...context(), selection: { ...context().selection, clientRequestId: 'forbidden' } }), /unknown or missing fields/);
  await assert.rejects(() => host.inspect(context({ outfitRevision: 0 })), /positive safe integer/);
  await assert.rejects(() => host.inspect(context({ sourceArtifactId: 'x'.repeat(513) })), /outside the accepted/);
});

test('host source has no Core, Project Accept, persistence, provider or execution identity authority', async () => {
  const source = await readFile('src/application/fashion/createCanonicalTryOnEditorHost.js', 'utf8');
  for (const forbidden of [
    'coreClient', 'fetch(', 'pushEdit', 'finalizeAcceptedResult', 'localStorage', 'sessionStorage', 'indexedDB',
    'FASHN', 'Billing', 'credits', 'ticketId', 'clientRequestId', 'representationId', 'anchorSetId', 'storageId',
    'contentSha256', 'destinationMesh', 'outfitManager', 'TryOnPanel',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /snapshot\.busy \|\| snapshot\.hasInFlight/);
  assert.match(source, /disposeRequested/);
  assert.match(source, /finishRequestedDispose/);
  assert.match(source, /requestDispose\(\)/);
  assert.match(source, /outfitRevision/);
  assert.match(source, /controller\.dispose\(\)/);
});
