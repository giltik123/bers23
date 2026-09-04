import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { composeCanonicalTryOnProductRuntime } from '../src/application/fashion/canonicalTryOnProductRuntimeComposition.js';

const PROJECT = 'bbbbbbbb-2222-4222-8222-222222222222';
const ENTRY = 'aaaaaaaa-1111-4111-8111-111111111111';
const GARMENT = 'cccccccc-3333-4333-8333-333333333333';
const SELECTION = Object.freeze({
  projectId: PROJECT,
  sourceArtifactId: 'source-current',
  entryId: ENTRY,
  outfit: Object.freeze({
    status: 'ACTIVE',
    entries: Object.freeze([{ entryId: ENTRY, garmentId: GARMENT, referenceReadiness: 'READY' }]),
  }),
});

function methodObject(methods) {
  return Object.fromEntries(methods.map((method) => [method, () => undefined]));
}

function fixture() {
  const calls = [];
  const fashion = {
    garments: { get: async () => undefined },
    wardrobe: { get: async () => undefined },
  };
  const application = {
    checkReadiness: async () => undefined,
    begin: async () => undefined,
    resume: async () => undefined,
    recover: async () => undefined,
  };
  const readiness = { inspect: async () => undefined };
  const session = methodObject(['inspect', 'begin', 'resume', 'recover', 'retry', 'completeFinal', 'abandon', 'snapshot']);
  const manual = methodObject(['loadGarmentSource', 'saveContour', 'saveBodyAnchors']);

  const runtime = composeCanonicalTryOnProductRuntime({
    selection: SELECTION,
    fashion,
    randomUUID: () => '11111111-1111-4111-8111-111111111111',
    createBrowserApplication: (value) => { calls.push(['browser', value]); return application; },
    createReadinessSelection: (value) => { calls.push(['readiness', value]); return readiness; },
    createProductSession: (value) => { calls.push(['session', value]); return session; },
    createManualApplication: (value) => { calls.push(['manual', value]); return manual; },
    createClientRequestId: (randomUUID) => `fashion-tryon:${randomUUID()}`,
  });

  return { runtime, calls, fashion, application, readiness, session, manual };
}

test('composition returns only safe session/manual capabilities', () => {
  const { runtime, session, manual } = fixture();
  assert.deepEqual(Object.keys(runtime).sort(), ['manual', 'session']);
  assert.equal(runtime.session, session);
  assert.equal(runtime.manual, manual);
  assert.equal(Object.isFrozen(runtime), true);
  for (const forbidden of ['fashion', 'core', 'application', 'readiness', 'garments', 'wardrobe']) {
    assert.equal(Object.hasOwn(runtime, forbidden), false, forbidden);
  }
});

test('browser application is bound to the selected Project and raw Fashion client stays inside composition', () => {
  const { calls, fashion } = fixture();
  const browser = calls.find(([name]) => name === 'browser')[1];
  assert.deepEqual(browser, { projectId: PROJECT, fashion });
});

test('readiness uses exactly the canonical browser application checkReadiness function', () => {
  const { calls, application } = fixture();
  const readiness = calls.find(([name]) => name === 'readiness')[1];
  assert.deepEqual(readiness, { checkReadiness: application.checkReadiness });
});

test('product session receives selection, readiness, application and a deferred request-id allocator', () => {
  const { calls, application, readiness } = fixture();
  const value = calls.find(([name]) => name === 'session')[1];
  assert.equal(value.selection, SELECTION);
  assert.equal(value.application, application);
  assert.equal(value.readiness, readiness);
  assert.equal(typeof value.createClientRequestId, 'function');
  assert.equal(value.createClientRequestId(), 'fashion-tryon:11111111-1111-4111-8111-111111111111');
});

test('manual application receives canonical managed clients but runtime does not expose them', () => {
  const { runtime, calls, fashion } = fixture();
  const value = calls.find(([name]) => name === 'manual')[1];
  assert.deepEqual(value, {
    garments: fashion.garments,
    wardrobe: fashion.wardrobe,
    fashion,
  });
  assert.equal(JSON.stringify(Object.keys(runtime)).includes('fashion'), false);
});

test('composition fails closed when any returned capability is incomplete', () => {
  const base = {
    selection: SELECTION,
    fashion: { garments: {}, wardrobe: {} },
    createReadinessSelection: () => ({ inspect() {} }),
    createProductSession: () => methodObject(['inspect', 'begin', 'resume', 'recover', 'retry', 'completeFinal', 'abandon', 'snapshot']),
    createManualApplication: () => methodObject(['loadGarmentSource', 'saveContour', 'saveBodyAnchors']),
    createClientRequestId: () => 'fashion-tryon:x',
  };
  assert.throws(() => composeCanonicalTryOnProductRuntime({
    ...base,
    createBrowserApplication: () => ({ checkReadiness() {}, begin() {}, resume() {} }),
  }), /canonical browser application\.recover/);
  assert.throws(() => composeCanonicalTryOnProductRuntime({
    ...base,
    createBrowserApplication: () => ({ checkReadiness() {}, begin() {}, resume() {}, recover() {} }),
    createManualApplication: () => ({ loadGarmentSource() {}, saveContour() {} }),
  }), /manual prerequisite application\.saveBodyAnchors/);
});

test('production root wires only accepted canonical factories', async () => {
  const source = await readFile('src/application/fashion/createCanonicalTryOnProductRuntime.js', 'utf8');
  for (const expected of [
    'createCanonicalTryOnBrowserApplication',
    'createCanonicalTryOnReadinessSelection',
    'createCanonicalTryOnProductSession',
    'createCanonicalTryOnManualPrerequisiteApplication',
    'createFashionTryOnClientRequestId',
    'composeCanonicalTryOnProductRuntime',
    'fashion = coreClient.fashion',
  ]) assert.equal(source.includes(expected), true, expected);

  assert.match(source, /createBrowserApplication: createCanonicalTryOnBrowserApplication/);
  assert.match(source, /createReadinessSelection: createCanonicalTryOnReadinessSelection/);
  assert.match(source, /createProductSession: createCanonicalTryOnProductSession/);
  assert.match(source, /createManualApplication: createCanonicalTryOnManualPrerequisiteApplication/);
  assert.match(source, /createClientRequestId: createFashionTryOnClientRequestId/);

  for (const forbidden of [
    'TryOnPanel', 'OutfitBuilderView', 'outfitManager', 'pushEdit', 'finalizeAcceptedResult',
    'FASHN', 'Billing', 'credits', 'ticketId', 'representationId', 'anchorSetId', 'storageId',
    'contentSha256', 'destinationMesh', 'localStorage', 'sessionStorage', 'indexedDB',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});
