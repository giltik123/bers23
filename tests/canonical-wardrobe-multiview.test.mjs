import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanonicalWardrobeAppendOutcomeUncertainError,
  CanonicalWardrobeAppendReloadError,
  createCanonicalWardrobeViewModel,
} from '../src/application/fashion/canonicalWardrobeViewModel.js';

const ID = '11111111-1111-4111-8111-111111111111';
const V1 = '22222222-2222-4222-8222-222222222222';
const V2 = '33333333-3333-4333-8333-333333333333';

function imageAggregate(revision, viewCount = 1) {
  return Object.freeze({
    id: ID,
    name: 'Black tee',
    representationTier: 'BASIC',
    status: 'ACTIVE',
    revision,
    primaryViewId: V1,
    captureAssessment: Object.freeze({
      cardinalComplete: false,
      cardinalCoverageScore: viewCount / 4,
      nextCaptureRequests: Object.freeze([{ viewKind: 'BACK', reason: 'MISSING_CARDINAL_VIEW' }]),
    }),
    views: Object.freeze([
      Object.freeze({ id: V1, kind: 'FRONT', deliveryUrl: '/api/core/garments/delivery/a', deliveryExpiresAt: '2026-09-03T10:00:00.000Z' }),
      ...(viewCount > 1 ? [Object.freeze({ id: V2, kind: 'BACK', deliveryUrl: '/api/core/garments/delivery/b', deliveryExpiresAt: '2026-09-03T10:00:00.000Z' })] : []),
    ]),
    updatedAt: '2026-09-03T09:00:00.000Z',
  });
}

function metadataAggregate(revision) {
  return Object.freeze({
    garmentId: ID,
    name: 'Black tee',
    category: 'tshirts',
    categoryGroup: 'tops',
    season: 'all_season',
    material: 'cotton',
    tags: Object.freeze([]),
    favorite: false,
    status: 'ACTIVE',
    revision,
    updatedAt: '2026-09-03T09:00:01.000Z',
  });
}

const item = Object.freeze({ id: ID, revision: 1 });

test('appendView is one exact revision-bound side effect followed by coherent reload', async () => {
  const calls = [];
  const file = Object.freeze({ opaque: true });
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [],
      create: async () => imageAggregate(1),
      appendView: async (input) => { calls.push(['append', input]); return imageAggregate(2, 2); },
      get: async (id) => { calls.push(['get-image', id]); return imageAggregate(2, 2); },
    },
    wardrobe: {
      list: async () => [],
      get: async (id) => { calls.push(['get-meta', id]); return metadataAggregate(2); },
      updateMetadata: async () => metadataAggregate(2),
    },
  });

  const result = await vm.appendView(item, { viewKind: 'BACK', image: file });
  assert.equal(result.revision, 2);
  assert.equal(result.viewCount, 2);
  assert.deepEqual(calls[0], ['append', {
    garmentId: ID,
    expectedRevision: 1,
    viewKind: 'BACK',
    image: file,
  }]);
  assert.equal(calls.filter(([kind]) => kind === 'append').length, 1);
});

test('post-append snapshot race retries reads only and never repeats immutable append', async () => {
  let imageReads = 0;
  let metadataReads = 0;
  let appendCalls = 0;
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [],
      create: async () => imageAggregate(1),
      appendView: async () => { appendCalls += 1; return imageAggregate(2, 2); },
      get: async () => imageAggregate(++imageReads === 1 ? 2 : 3, 2),
    },
    wardrobe: {
      list: async () => [],
      get: async () => metadataAggregate(++metadataReads === 1 ? 3 : 3),
      updateMetadata: async () => metadataAggregate(3),
    },
  });

  const result = await vm.appendView(item, { viewKind: 'BACK', image: Object.freeze({}) });
  assert.equal(result.revision, 3);
  assert.equal(appendCalls, 1);
  assert.equal(imageReads, 2);
  assert.equal(metadataReads, 2);
});

test('unconfirmed append performs read-only recovery and never retries the immutable side effect', async () => {
  let appendCalls = 0;
  let imageReads = 0;
  let metadataReads = 0;
  const lostResponse = new Error('connection closed after upload');
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [],
      create: async () => imageAggregate(1),
      appendView: async () => { appendCalls += 1; throw lostResponse; },
      get: async () => { imageReads += 1; return imageAggregate(2, 2); },
    },
    wardrobe: {
      list: async () => [],
      get: async () => { metadataReads += 1; return metadataAggregate(2); },
      updateMetadata: async () => metadataAggregate(2),
    },
  });

  await assert.rejects(
    () => vm.appendView(item, { viewKind: 'BACK', image: Object.freeze({}) }),
    (error) => {
      assert.equal(error instanceof CanonicalWardrobeAppendOutcomeUncertainError, true);
      assert.equal(error.code, 'GARMENT_VIEW_APPEND_OUTCOME_UNCERTAIN');
      assert.equal(error.garmentId, ID);
      assert.equal(error.expectedRevision, 1);
      assert.equal(error.recoveredItem?.revision, 2);
      assert.equal(error.recoveredItem?.viewCount, 2);
      assert.equal(error.retryable, false);
      assert.equal(error.requiresInspection, true);
      assert.equal(error.cause, lostResponse);
      return true;
    },
  );
  assert.equal(appendCalls, 1);
  assert.equal(imageReads, 1);
  assert.equal(metadataReads, 1);
});

test('confirmed append with persistent snapshot mismatch reports saved-view reload pending and never re-appends', async () => {
  let appendCalls = 0;
  let imageReads = 0;
  let metadataReads = 0;
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [],
      create: async () => imageAggregate(1),
      appendView: async () => { appendCalls += 1; return imageAggregate(2, 2); },
      get: async () => { imageReads += 1; return imageAggregate(2, 2); },
    },
    wardrobe: {
      list: async () => [],
      get: async () => { metadataReads += 1; return metadataAggregate(3); },
      updateMetadata: async () => metadataAggregate(3),
    },
  });

  await assert.rejects(
    () => vm.appendView(item, { viewKind: 'BACK', image: Object.freeze({}) }),
    (error) => {
      assert.equal(error instanceof CanonicalWardrobeAppendReloadError, true);
      assert.equal(error.code, 'GARMENT_VIEW_APPENDED_RELOAD_PENDING');
      assert.equal(error.garmentId, ID);
      assert.equal(error.expectedRevision, 1);
      assert.equal(error.retryable, false);
      assert.equal(error.requiresReload, true);
      return true;
    },
  );
  assert.equal(appendCalls, 1);
  assert.equal(imageReads, 2);
  assert.equal(metadataReads, 2);
});

test('malformed garment revision fails before append side effect', async () => {
  let appendCalls = 0;
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [],
      create: async () => imageAggregate(1),
      appendView: async () => { appendCalls += 1; },
      get: async () => imageAggregate(1),
    },
    wardrobe: {
      list: async () => [],
      get: async () => metadataAggregate(1),
      updateMetadata: async () => metadataAggregate(1),
    },
  });

  await assert.rejects(
    () => vm.appendView({ id: ID, revision: 0 }, { viewKind: 'BACK', image: Object.freeze({}) }),
    /canonical garment item/,
  );
  assert.equal(appendCalls, 0);
});
