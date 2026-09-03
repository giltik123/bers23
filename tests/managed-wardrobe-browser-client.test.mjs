import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createManagedWardrobeClient, normalizeManagedWardrobeDto } from '../src/api/managedWardrobeClient.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const GARMENT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function dto(overrides = {}) {
  return {
    garment_id: GARMENT_ID,
    name: 'Black Jacket',
    category: 'jackets',
    category_group: 'tops',
    season: 'all_season',
    material: 'wool',
    tags: ['black','formal'],
    favorite: false,
    status: 'ACTIVE',
    revision: 4,
    updated_at: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

function recorder(response = dto()) {
  const calls = [];
  return {
    calls,
    request: async (url, options) => {
      calls.push({ url, options });
      return typeof response === 'function' ? response(url, options) : structuredClone(response);
    },
  };
}

test('Managed Wardrobe client is transport-injected and contains no legacy generic entity authority', async () => {
  const source = await fs.readFile(path.join(ROOT, 'src/api/managedWardrobeClient.js'), 'utf8');
  for (const forbidden of ['fetch(', 'coreClient.entities', 'garmentManager', 'wardrobeManager', 'FASHN', 'provider', 'Billing']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /createManagedWardrobeClient\(request\)/);
  assert.match(source, /X-Expected-Garment-Revision/);
});

test('Managed Wardrobe list validates canonical metadata and derived category group', async () => {
  const { calls, request } = recorder([dto()]);
  const result = await createManagedWardrobeClient(request).list();
  assert.deepEqual(calls[0], { url: '/wardrobe/garments', options: undefined });
  assert.deepEqual(result[0], {
    garmentId: GARMENT_ID,
    name: 'Black Jacket',
    category: 'jackets',
    categoryGroup: 'tops',
    season: 'all_season',
    material: 'wool',
    tags: ['black','formal'],
    favorite: false,
    status: 'ACTIVE',
    revision: 4,
    updatedAt: '2026-09-03T00:00:00.000Z',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0].tags), true);
});

test('Wardrobe metadata patch canonicalizes intent and sends one optimistic revision', async () => {
  const { calls, request } = recorder();
  const client = createManagedWardrobeClient(request);
  await client.updateMetadata(GARMENT_ID.toUpperCase(), 4, {
    name: '  Black   Jacket  ',
    category: ' JACKETS ',
    season: ' WINTER ',
    material: ' Wool ',
    tags: [' Formal ', 'black', 'formal'],
    favorite: true,
  });
  assert.equal(calls[0].url, `/wardrobe/garments/${GARMENT_ID}`);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(calls[0].options.headers, { 'X-Expected-Garment-Revision': '4' });
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: 'Black Jacket',
    category: 'jackets',
    season: 'winter',
    material: 'wool',
    tags: ['black','formal'],
    favorite: true,
  });
});

test('Wardrobe invalid or empty patches fail before Core transport', async () => {
  const { calls, request } = recorder();
  const client = createManagedWardrobeClient(request);
  for (const patch of [{}, { season: undefined }, { unknown: true }, { tags: [''] }, { favorite: 'yes' }]) {
    await assert.rejects(() => client.updateMetadata(GARMENT_ID, 4, patch));
  }
  assert.equal(calls.length, 0);
});

test('Wardrobe lifecycle methods preserve canonical revision preconditions', async () => {
  const { calls, request } = recorder(dto({ status: 'ARCHIVED' }));
  const client = createManagedWardrobeClient(request);
  await client.archive(GARMENT_ID, 4);
  assert.deepEqual(calls[0], {
    url: `/wardrobe/garments/${GARMENT_ID}/archive`,
    options: { method: 'POST', headers: { 'X-Expected-Garment-Revision': '4' } },
  });
  await assert.rejects(() => client.restore(GARMENT_ID, 0), /expectedRevision/);
});

test('Wardrobe response validation rejects server drift and impossible metadata', () => {
  assert.throws(() => normalizeManagedWardrobeDto(dto({ category_group: 'outerwear' })), /category_group/);
  assert.throws(() => normalizeManagedWardrobeDto(dto({ tags: ['formal','black'] })), /canonical sorted unique/);
  assert.throws(() => normalizeManagedWardrobeDto(dto({ tags: ['black','black'] })), /canonical sorted unique/);
  assert.throws(() => normalizeManagedWardrobeDto(dto({ garment_id: GARMENT_ID.toUpperCase() })), /canonical lowercase UUID/);
  assert.throws(() => normalizeManagedWardrobeDto(dto({ material: ' Wool' })), /material is not canonical/);
  assert.throws(() => normalizeManagedWardrobeDto(dto({ status: 'DELETED' })), /status/);
  assert.throws(() => normalizeManagedWardrobeDto({ ...dto(), hidden: true }), /unexpected fields/);
});
