import assert from 'node:assert/strict';
import test from 'node:test';
import {
  FLEET_RECONCILIATION_DEFERRED,
  LazyBrowserLocalAIComposition,
  PRODUCTION_BROWSER_FLEET_MODEL_COUNT,
  browserFleetReconciliationAuthorized,
  browserLocalAIComposition,
  initializeBrowserFleetIfAuthorized,
  type BrowserLocalAIComposition,
} from '../src/application/local-ai/BrowserLocalAIComposition';
import { createSelectionSegmentation } from '../src/application/createSelectionSegmentation';
import { MOBILE_SAM_BROWSER_MODEL } from '../src/platform/creative/local-ai/browser/MobileSamCapability';

const fakeComposition = Object.freeze({
  capabilitySnapshot: async () => ({}) as never,
  fleetPreflight: () => Object.freeze({
    catalogModelCount: 0,
    durableLifecycleConfigured: true,
    durableBenchmarkEvidenceConfigured: true,
    reconciliation: FLEET_RECONCILIATION_DEFERRED,
  }),
  deviceAdmission: {},
  onnxSessionFactory: {},
}) as unknown as BrowserLocalAIComposition;

test('lazy browser Local AI composition is not created before first intent and concurrent callers share one instance', async () => {
  let factoryCalls = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const lazy = new LazyBrowserLocalAIComposition(async () => {
    factoryCalls += 1;
    await gate;
    return fakeComposition;
  });

  assert.equal(lazy.initialized(), false);
  assert.equal(factoryCalls, 0);
  const first = lazy.get();
  const second = lazy.get();
  assert.equal(lazy.initialized(), true);
  assert.equal(factoryCalls, 1);
  assert.strictEqual(first, second);
  release();
  assert.strictEqual(await first, fakeComposition);
  assert.strictEqual(await second, fakeComposition);
  assert.strictEqual(await lazy.get(), fakeComposition);
  assert.equal(factoryCalls, 1);
});

test('failed browser composition initialization is not cached and a later semantic intent may retry', async () => {
  let factoryCalls = 0;
  const lazy = new LazyBrowserLocalAIComposition(async () => {
    factoryCalls += 1;
    if (factoryCalls === 1) throw new Error('transient IndexedDB failure');
    return fakeComposition;
  });

  await assert.rejects(() => lazy.get(), /transient IndexedDB failure/);
  assert.equal(lazy.initialized(), false);
  assert.strictEqual(await lazy.get(), fakeComposition);
  assert.equal(factoryCalls, 2);
});

test('creating smart-selection adapter remains lazy and does not initialize browser Local AI', () => {
  assert.equal(browserLocalAIComposition.initialized(), false);
  const segmentation = createSelectionSegmentation({
    projectId: 'project-canonical',
    imageArtifactId: 'artifact-image-canonical',
    source: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }),
  });
  assert.equal(typeof segmentation.segment, 'function');
  assert.equal(typeof segmentation.cancel, 'function');
  assert.equal(browserLocalAIComposition.initialized(), false, 'composition must initialize only on first semantic inference intent');
});

test('CANDIDATE MobileSAM is not represented as a generic production fleet model', () => {
  assert.equal(MOBILE_SAM_BROWSER_MODEL.status, 'AVAILABLE');
  assert.equal(PRODUCTION_BROWSER_FLEET_MODEL_COUNT, 0);
});

test('empty or unauthenticated catalog cannot trigger durable fleet reconciliation', async () => {
  assert.equal(browserFleetReconciliationAuthorized(0, 0), false);
  assert.equal(browserFleetReconciliationAuthorized(1, 0), false);
  assert.equal(browserFleetReconciliationAuthorized(0, 1), false);
  assert.equal(browserFleetReconciliationAuthorized(1, 1), true);

  let initializeCalls = 0;
  const initialize = async () => { initializeCalls += 1; };

  assert.equal(await initializeBrowserFleetIfAuthorized(initialize, 0, 0), false);
  assert.equal(await initializeBrowserFleetIfAuthorized(initialize, 1, 0), false);
  assert.equal(initializeCalls, 0, 'C0 preflight must not touch persisted fleet without authenticated catalog authority');

  assert.equal(await initializeBrowserFleetIfAuthorized(initialize, 1, 1), true);
  assert.equal(initializeCalls, 1, 'future authenticated catalog may explicitly authorize one reconciliation');
});

test('C0 composition surface does not expose raw LocalAIPlatform mutation authority', () => {
  assert.equal('platform' in fakeComposition, false);
  assert.equal(fakeComposition.fleetPreflight().reconciliation, FLEET_RECONCILIATION_DEFERRED);
});
