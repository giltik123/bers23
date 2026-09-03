import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CanonicalWardrobePartialCreateError,
  CanonicalWardrobeSnapshotError,
  createCanonicalWardrobeViewModel,
} from '../src/application/fashion/canonicalWardrobeViewModel.js';

const ID = '11111111-1111-1111-1111-111111111111';
const VIEW = '22222222-2222-2222-2222-222222222222';

function imageAggregate(revision = 1, overrides = {}) {
  return Object.freeze({
    id: ID,
    name: 'Black tee',
    representationTier: 'BASIC',
    status: 'ACTIVE',
    revision,
    primaryViewId: VIEW,
    captureAssessment: Object.freeze({ cardinalComplete: false, cardinalCoverageScore: 0 }),
    views: Object.freeze([Object.freeze({
      id: VIEW,
      kind: 'UNSPECIFIED',
      deliveryUrl: '/api/core/garments/delivery/token',
      deliveryExpiresAt: '2026-09-03T05:00:00.000Z',
    })]),
    createdAt: '2026-09-03T04:00:00.000Z',
    updatedAt: '2026-09-03T04:00:00.000Z',
    ...overrides,
  });
}

function metadataAggregate(revision = 1, overrides = {}) {
  return Object.freeze({
    garmentId: ID,
    name: 'Black tee',
    category: 'tshirts',
    categoryGroup: 'tops',
    season: 'all_season',
    material: 'cotton',
    tags: Object.freeze(['black']),
    favorite: false,
    status: 'ACTIVE',
    revision,
    updatedAt: '2026-09-03T04:00:01.000Z',
    ...overrides,
  });
}

function clients({ images = [imageAggregate()], metadata = [metadataAggregate()] } = {}) {
  return {
    garments: {
      list: async () => images,
      get: async () => images[0],
      create: async () => images[0],
    },
    wardrobe: {
      list: async () => metadata,
      get: async () => metadata[0],
      updateMetadata: async () => metadata[0],
      archive: async () => metadata[0],
      restore: async () => metadata[0],
    },
  };
}

test('joins F1 image evidence and F2 metadata only at one coherent revision', async () => {
  const vm = createCanonicalWardrobeViewModel(clients());
  const items = await vm.load();
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    id: ID,
    name: 'Black tee',
    revision: 1,
    status: 'ACTIVE',
    representationTier: 'BASIC',
    category: 'tshirts',
    categoryGroup: 'tops',
    season: 'all_season',
    material: 'cotton',
    tags: ['black'],
    favorite: false,
    imageUrl: '/api/core/garments/delivery/token',
    imageExpiresAt: '2026-09-03T05:00:00.000Z',
    primaryViewKind: 'UNSPECIFIED',
    viewCount: 1,
    captureAssessment: { cardinalComplete: false, cardinalCoverageScore: 0 },
    updatedAt: '2026-09-03T04:00:01.000Z',
  });
  assert.equal(Object.isFrozen(items), true);
  assert.equal(Object.isFrozen(items[0]), true);
});

test('retries one snapshot race and then succeeds without browser-owned repair', async () => {
  let imageCalls = 0;
  let metadataCalls = 0;
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [imageAggregate(++imageCalls === 1 ? 1 : 2)],
      get: async () => imageAggregate(2),
      create: async () => imageAggregate(1),
    },
    wardrobe: {
      list: async () => [metadataAggregate(++metadataCalls === 1 ? 2 : 2)],
      get: async () => metadataAggregate(2),
      updateMetadata: async () => metadataAggregate(2),
    },
  });
  const items = await vm.load();
  assert.equal(items[0].revision, 2);
  assert.equal(imageCalls, 2);
  assert.equal(metadataCalls, 2);
});

test('fails closed after the bounded retry when revisions remain incoherent', async () => {
  const vm = createCanonicalWardrobeViewModel(clients({
    images: [imageAggregate(1)],
    metadata: [metadataAggregate(2)],
  }));
  await assert.rejects(() => vm.load(), error => {
    assert.ok(error instanceof CanonicalWardrobeSnapshotError);
    assert.equal(error.code, 'WARDROBE_SNAPSHOT_MISMATCH');
    return true;
  });
});

test('create writes image first, binds metadata to returned revision, then revalidates F1/F2', async () => {
  const calls = [];
  const created = imageAggregate(1);
  const metadata = metadataAggregate(2, { category: 'shirts', material: 'linen', tags: Object.freeze(['summer']) });
  const updatedImage = imageAggregate(2);
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [],
      create: async input => { calls.push(['create', input]); return created; },
      get: async id => { calls.push(['get', id]); return updatedImage; },
    },
    wardrobe: {
      list: async () => [],
      get: async () => metadata,
      updateMetadata: async (id, revision, patch) => { calls.push(['metadata', id, revision, patch]); return metadata; },
    },
  });
  const image = new Blob(['image'], { type: 'image/png' });
  const item = await vm.create({ name: 'Black tee', image, category: 'shirts', season: 'all_season', material: 'linen', tags: ['summer'] });
  assert.equal(item.revision, 2);
  assert.deepEqual(calls[0], ['create', { name: 'Black tee', image, viewKind: 'UNSPECIFIED' }]);
  assert.deepEqual(calls[1], ['metadata', ID, 1, { category: 'shirts', season: 'all_season', material: 'linen', tags: ['summer'] }]);
  assert.deepEqual(calls[2], ['get', ID]);
});

test('partial create is explicit and never attempts destructive browser rollback', async () => {
  let removeCalled = false;
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [],
      get: async () => imageAggregate(),
      create: async () => imageAggregate(),
      remove: async () => { removeCalled = true; },
    },
    wardrobe: {
      list: async () => [],
      get: async () => metadataAggregate(),
      updateMetadata: async () => { throw new Error('network unknown'); },
    },
  });
  await assert.rejects(() => vm.create({
    name: 'Black tee',
    image: new Blob(['image'], { type: 'image/png' }),
    category: 'tshirts',
  }), error => {
    assert.ok(error instanceof CanonicalWardrobePartialCreateError);
    assert.equal(error.code, 'GARMENT_CREATED_METADATA_PENDING');
    assert.equal(error.garmentId, ID);
    return true;
  });
  assert.equal(removeCalled, false);
});

test('favorite/archive/restore use the coherent item revision as optimistic concurrency input', async () => {
  const calls = [];
  let nextImage = imageAggregate(2);
  const vm = createCanonicalWardrobeViewModel({
    garments: {
      list: async () => [imageAggregate()],
      get: async () => nextImage,
      create: async () => imageAggregate(),
    },
    wardrobe: {
      list: async () => [metadataAggregate()],
      get: async () => metadataAggregate(2),
      updateMetadata: async (id, revision, patch) => {
        calls.push(['favorite', id, revision, patch]);
        return metadataAggregate(2, { favorite: true });
      },
      archive: async (id, revision) => {
        calls.push(['archive', id, revision]);
        nextImage = imageAggregate(3, { status: 'ARCHIVED' });
        return metadataAggregate(3, { favorite: true, status: 'ARCHIVED' });
      },
      restore: async (id, revision) => {
        calls.push(['restore', id, revision]);
        nextImage = imageAggregate(4, { status: 'ACTIVE' });
        return metadataAggregate(4, { favorite: true, status: 'ACTIVE' });
      },
    },
  });
  const initial = (await vm.load())[0];
  const favorite = await vm.setFavorite(initial, true);
  const archived = await vm.archive(favorite);
  const restored = await vm.restore(archived);
  assert.equal(restored.status, 'ACTIVE');
  assert.deepEqual(calls, [
    ['favorite', ID, 1, { favorite: true }],
    ['archive', ID, 2],
    ['restore', ID, 3],
  ]);
});
