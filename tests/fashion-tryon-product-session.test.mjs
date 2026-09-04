import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createCanonicalTryOnProductSession } from '../src/application/fashion/createCanonicalTryOnProductSession.js';

const ENTRY = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROJECT = 'bbbbbbbb-2222-4222-8222-222222222222';
const GARMENT = 'cccccccc-3333-4333-8333-333333333333';
const SOURCE = 'source-artifact-current';
const OUTFIT = Object.freeze({ status: 'ACTIVE', entries: Object.freeze([{ entryId: ENTRY, garmentId: GARMENT, referenceReadiness: 'READY' }]) });

function fixture({ readinessStatus = 'READY', readinessResponse, requestIds = ['fashion-tryon:11111111-1111-4111-8111-111111111111'], beginResult, resumeResult, recoverResult } = {}) {
  const calls = [];
  const ids = [...requestIds];
  const readiness = {
    inspect: async (selection) => {
      calls.push(['inspect', selection]);
      return readinessResponse ?? { entryId: ENTRY, garmentId: GARMENT, status: readinessStatus, categoryGroup: 'tops' };
    },
  };
  const application = {
    begin: async (intent) => {
      calls.push(['begin', intent]);
      if (beginResult instanceof Error) throw beginResult;
      return beginResult ?? { status: 'WARP_PENDING' };
    },
    resume: async (intent) => {
      calls.push(['resume', intent]);
      if (resumeResult instanceof Error) throw resumeResult;
      return resumeResult ?? { status: 'TEXTURE_PENDING' };
    },
    recover: async (intent) => {
      calls.push(['recover', intent]);
      if (recoverResult instanceof Error) throw recoverResult;
      return recoverResult ?? { status: 'TEXTURE_PENDING' };
    },
  };
  const session = createCanonicalTryOnProductSession({
    selection: { entryId: ENTRY, outfit: OUTFIT, projectId: PROJECT, sourceArtifactId: SOURCE },
    readiness,
    application,
    createClientRequestId: () => ids.shift(),
  });
  return { session, calls };
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

const idle = (phase = 'IDLE', hasInFlight = false) => ({ hasInFlight, phase, busy: false });

test('inspect is read-only and never allocates or executes a request', async () => {
  const { session, calls } = fixture();
  assert.deepEqual(await session.inspect(), {
    entryId: ENTRY,
    garmentId: GARMENT,
    status: 'READY',
    categoryGroup: 'tops',
  });
  assert.deepEqual(calls.map(([name]) => name), ['inspect']);
  assert.deepEqual(session.snapshot(), idle());
});

test('blocked readiness never allocates or begins execution', async () => {
  const { session, calls } = fixture({ readinessStatus: 'REPRESENTATION_REQUIRED', requestIds: [] });
  const result = await session.begin();
  assert.equal(result.status, 'BLOCKED');
  assert.equal(result.readiness.status, 'REPRESENTATION_REQUIRED');
  assert.deepEqual(calls.map(([name]) => name), ['inspect']);
  assert.deepEqual(session.snapshot(), idle('BLOCKED'));
});

test('malformed READY never reaches request allocation or application begin', async () => {
  for (const readinessResponse of [
    { entryId: ENTRY, garmentId: GARMENT, status: 'READY' },
    { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'accessories' },
    { entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'other' },
  ]) {
    const { session, calls } = fixture({ readinessResponse, requestIds: [] });
    await assert.rejects(() => session.begin(), /READY requires a supported category group/);
    assert.deepEqual(calls.map(([name]) => name), ['inspect']);
    assert.deepEqual(session.snapshot(), idle());
  }
});

test('explicit Run allocates one request and never exposes its identity', async () => {
  const requestId = 'fashion-tryon:11111111-1111-4111-8111-111111111111';
  const { session, calls } = fixture({ requestIds: [requestId] });
  const result = await session.begin();
  assert.deepEqual(result, { status: 'WARP_PENDING' });
  const begin = calls.find(([name]) => name === 'begin')[1];
  assert.deepEqual(begin, {
    projectId: PROJECT,
    sourceArtifactId: SOURCE,
    garmentId: GARMENT,
    clientRequestId: requestId,
  });
  assert.equal(JSON.stringify(result).includes('clientRequestId'), false);
  assert.deepEqual(session.snapshot(), idle('WARP_PENDING', true));
  await assert.rejects(() => session.begin(), /already has an in-flight run/);
});

test('mutating actions are serialized while begin is unresolved', async () => {
  const pending = deferred();
  const { session, calls } = fixture({ beginResult: pending.promise });
  const begin = session.begin();
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(session.snapshot(), { hasInFlight: true, phase: 'BEGINNING', busy: true });
  await assert.rejects(() => session.resume(), /while begin is in progress/);
  await assert.rejects(() => session.recover(), /while begin is in progress/);
  await assert.rejects(() => session.retry(), /while begin is in progress/);
  assert.throws(() => session.abandon(), /while begin is in progress/);
  assert.throws(() => session.completeFinal(), /while begin is in progress/);
  assert.deepEqual(calls.map(([name]) => name), ['inspect', 'begin']);

  pending.resolve({ status: 'WARP_PENDING' });
  assert.deepEqual(await begin, { status: 'WARP_PENDING' });
  assert.deepEqual(session.snapshot(), idle('WARP_PENDING', true));
});

test('ambiguous begin preserves exact identity only for explicit Recover/Resume', async () => {
  const requestId = 'fashion-tryon:22222222-2222-4222-8222-222222222222';
  const failure = Object.assign(new Error('network outcome unknown'), { code: 'OUTCOME_UNKNOWN' });
  const { session, calls } = fixture({ requestIds: [requestId], beginResult: failure, recoverResult: { status: 'TEXTURE_PENDING' } });
  await assert.rejects(() => session.begin(), /network outcome unknown/);
  assert.deepEqual(session.snapshot(), idle('UNCERTAIN', true));
  const recovered = await session.recover();
  assert.deepEqual(recovered, { status: 'TEXTURE_PENDING' });
  const beginIntent = calls.find(([name]) => name === 'begin')[1];
  const recoverIntent = calls.find(([name]) => name === 'recover')[1];
  assert.equal(beginIntent, recoverIntent, 'Recover must reuse the exact frozen in-flight intent object');
  assert.equal(recoverIntent.clientRequestId, requestId);
  assert.equal(JSON.stringify(recovered).includes(requestId), false);
  assert.deepEqual(session.snapshot(), idle('TEXTURE_PENDING', true));
});

test('explicit Retry abandons the old in-flight identity and allocates a fresh one', async () => {
  const first = 'fashion-tryon:33333333-3333-4333-8333-333333333333';
  const second = 'fashion-tryon:44444444-4444-4444-8444-444444444444';
  const { session, calls } = fixture({ requestIds: [first, second] });
  assert.deepEqual(await session.begin(), { status: 'WARP_PENDING' });
  assert.deepEqual(await session.retry(), { status: 'WARP_PENDING' });
  const begins = calls.filter(([name]) => name === 'begin').map(([, intent]) => intent.clientRequestId);
  assert.deepEqual(begins, [first, second]);
});

test('request-id collisions are rejected instead of silently reusing an old run', async () => {
  const reused = 'fashion-tryon:55555555-5555-4555-8555-555555555555';
  const { session } = fixture({ requestIds: [reused, reused] });
  await session.begin();
  await assert.rejects(() => session.retry(), /reused an explicit-run identity/);
  assert.deepEqual(session.snapshot(), idle());
});

test('application prerequisite clears the request and projects stable selected-entry readiness', async () => {
  const first = 'fashion-tryon:66666666-6666-4666-8666-666666666666';
  const second = 'fashion-tryon:77777777-7777-4777-8777-777777777777';
  let readinessStatus = 'READY';
  const calls = [];
  const requestIds = [first, second];
  const readiness = {
    inspect: async () => ({ entryId: ENTRY, garmentId: GARMENT, status: readinessStatus, categoryGroup: 'tops' }),
  };
  const application = {
    begin: async (intent) => {
      calls.push(intent.clientRequestId);
      if (calls.length === 1) return { status: 'PREREQUISITE', readiness: { status: 'BODY_ANCHORS_REQUIRED', categoryGroup: 'tops' } };
      return { status: 'WARP_PENDING' };
    },
    resume: async () => ({ status: 'TEXTURE_PENDING' }),
    recover: async () => ({ status: 'TEXTURE_PENDING' }),
  };
  const session = createCanonicalTryOnProductSession({
    selection: { entryId: ENTRY, outfit: OUTFIT, projectId: PROJECT, sourceArtifactId: SOURCE },
    readiness,
    application,
    createClientRequestId: () => requestIds.shift(),
  });
  const blocked = await session.begin();
  assert.deepEqual(blocked, {
    status: 'BLOCKED',
    readiness: { entryId: ENTRY, garmentId: GARMENT, status: 'BODY_ANCHORS_REQUIRED', categoryGroup: 'tops' },
  });
  assert.deepEqual(session.snapshot(), idle('BLOCKED'));
  readinessStatus = 'READY';
  assert.deepEqual(await session.begin(), { status: 'WARP_PENDING' });
  assert.deepEqual(calls, [first, second]);
});

test('FINAL projects only safe Editor-handoff input and freezes continuation until handoff acknowledgement', async () => {
  const final = {
    status: 'FINAL_READY',
    artifactId: 'final-artifact',
    preview: '/api/core/artifacts/results/final.token',
    previewExpiresAt: 1700000000000,
  };
  const { session, calls } = fixture({ beginResult: final });
  const result = await session.begin();
  assert.deepEqual(result, { status: 'FINAL_READY', garmentId: GARMENT, sourceArtifactId: SOURCE, final });
  assert.equal(JSON.stringify(result).includes('clientRequestId'), false);
  assert.deepEqual(session.snapshot(), idle('FINAL_READY', true));
  await assert.rejects(() => session.resume(), /blocked after FINAL_READY/);
  await assert.rejects(() => session.recover(), /blocked after FINAL_READY/);
  assert.deepEqual(calls.map(([name]) => name), ['inspect', 'begin']);
  session.completeFinal();
  assert.deepEqual(session.snapshot(), idle());
  assert.throws(() => session.completeFinal(), /only after a successful Editor handoff/);
});

test('selection identity uses the canonical 512-character source intersection and rejects authority extras', () => {
  const base = {
    entryId: ENTRY,
    outfit: OUTFIT,
    projectId: PROJECT,
    sourceArtifactId: 'a'.repeat(512),
  };
  const dependencies = {
    readiness: { inspect: async () => ({ entryId: ENTRY, garmentId: GARMENT, status: 'READY', categoryGroup: 'tops' }) },
    application: { begin: async () => ({ status: 'WARP_PENDING' }), resume: async () => ({ status: 'WARP_PENDING' }), recover: async () => ({ status: 'WARP_PENDING' }) },
    createClientRequestId: () => 'fashion-tryon:88888888-8888-4888-8888-888888888888',
  };
  assert.doesNotThrow(() => createCanonicalTryOnProductSession({ selection: base, ...dependencies }));
  assert.throws(() => createCanonicalTryOnProductSession({ selection: { ...base, sourceArtifactId: 'a'.repeat(513) }, ...dependencies }), /sourceArtifactId/);
  assert.throws(() => createCanonicalTryOnProductSession({ selection: { ...base, ticketId: 'nope' }, ...dependencies }), /unknown or missing/);
});

test('product session is ephemeral, serialized and contains no provider or Project-Accept authority', async () => {
  const source = await readFile('src/application/fashion/createCanonicalTryOnProductSession.js', 'utf8');
  for (const forbidden of [
    'localStorage', 'sessionStorage', 'indexedDB', 'fetch(', 'coreClient', 'ticketId', 'representationId',
    'anchorSetId', 'storageId', 'contentSha256', 'destinationMesh', 'FASHN', 'provider', 'Billing', 'credits',
    'pushEdit', 'finalizeAcceptedResult', 'outfitManager', 'TryOnPanel',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
  assert.match(source, /normalizeCanonicalTryOnReadinessSummary/);
  assert.match(source, /usedRequestIds = new Set\(\)/);
  assert.match(source, /let operation = null/);
  assert.match(source, /return exclusive\('resume', \(\) => invokeInFlight\('resume'\)\)/);
  assert.match(source, /return exclusive\('recover', \(\) => invokeInFlight\('recover'\)\)/);
  assert.match(source, /phase === 'FINAL_READY'/);
});
