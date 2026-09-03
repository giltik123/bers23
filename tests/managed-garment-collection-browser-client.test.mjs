import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createManagedGarmentCollectionClient, normalizeManagedGarmentCollectionDto } from '../src/api/managedGarmentCollectionClient.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const SOURCE_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const TARGET_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GARMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function dto(overrides = {}) {
  return {
    id: SOURCE_ID,
    name: 'Business',
    description: 'Work rotation',
    revision: 3,
    garment_ids: [GARMENT_ID],
    created_at: '2026-09-03T00:00:00.000Z',
    updated_at: '2026-09-03T00:01:00.000Z',
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

test('Managed Collection client is transport-injected and contains no generic entity membership rewrite', async () => {
  const source = await fs.readFile(path.join(ROOT, 'src/api/managedGarmentCollectionClient.js'), 'utf8');
  for (const forbidden of ['fetch(', 'coreClient.entities', 'garmentCollections', 'wardrobeManager', 'FASHN', 'provider', 'Billing']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /X-Expected-Source-Collection-Revision/);
  assert.match(source, /X-Expected-Target-Collection-Revision/);
});

test('Managed Collection create canonicalizes only server-admitted metadata', async () => {
  const { calls, request } = recorder();
  const client = createManagedGarmentCollectionClient(request);
  await client.create({ name: '  Business   Travel ', description: '  Week   trips ' });
  assert.deepEqual(calls[0], {
    url: '/wardrobe/collections',
    options: { method: 'POST', body: JSON.stringify({ name: 'Business Travel', description: 'Week trips' }) },
  });
  await assert.rejects(() => client.create({ name: 'A', garment_ids: [] }), /forbidden fields/);
});

test('Managed Collection metadata and membership mutations carry one optimistic revision', async () => {
  const { calls, request } = recorder();
  const client = createManagedGarmentCollectionClient(request);
  await client.updateMetadata(SOURCE_ID.toUpperCase(), 3, { description: ' Rotation ' });
  assert.deepEqual(calls[0], {
    url: `/wardrobe/collections/${SOURCE_ID}`,
    options: {
      method: 'PATCH',
      headers: { 'X-Expected-Collection-Revision': '3' },
      body: JSON.stringify({ description: 'Rotation' }),
    },
  });
  await client.addGarment(SOURCE_ID, 3, GARMENT_ID.toUpperCase());
  assert.equal(calls[1].url, `/wardrobe/collections/${SOURCE_ID}/garments/${GARMENT_ID}`);
  assert.equal(calls[1].options.method, 'POST');
  assert.deepEqual(calls[1].options.headers, { 'X-Expected-Collection-Revision': '3' });
});

test('Collection move uses one atomic server operation with both revision preconditions', async () => {
  const moveResponse = {
    source: dto({ id: SOURCE_ID, garment_ids: [], revision: 4 }),
    target: dto({ id: TARGET_ID, name: 'Travel', garment_ids: [GARMENT_ID], revision: 8 }),
    target_changed: true,
  };
  const { calls, request } = recorder(moveResponse);
  const client = createManagedGarmentCollectionClient(request);
  const result = await client.moveGarment({
    sourceCollectionId: SOURCE_ID.toUpperCase(),
    targetCollectionId: TARGET_ID.toUpperCase(),
    garmentId: GARMENT_ID.toUpperCase(),
    expectedSourceRevision: 3,
    expectedTargetRevision: 7,
  });
  assert.equal(calls.length, 1, 'move must not degrade into browser remove + add');
  assert.deepEqual(calls[0], {
    url: `/wardrobe/collections/${SOURCE_ID}/move/${TARGET_ID}/garments/${GARMENT_ID}`,
    options: {
      method: 'POST',
      headers: {
        'X-Expected-Source-Collection-Revision': '3',
        'X-Expected-Target-Collection-Revision': '7',
      },
    },
  });
  assert.equal(result.targetChanged, true);
  assert.equal(result.source.revision, 4);
  assert.equal(result.target.revision, 8);
});

test('Collection invalid intent fails locally without transport', async () => {
  const { calls, request } = recorder();
  const client = createManagedGarmentCollectionClient(request);
  await assert.rejects(() => client.updateMetadata(SOURCE_ID, 3, {}), /at least one field/);
  await assert.rejects(() => client.updateMetadata(SOURCE_ID, 3, { name: undefined }), /name/);
  await assert.rejects(() => client.moveGarment({
    sourceCollectionId: SOURCE_ID,
    targetCollectionId: SOURCE_ID,
    garmentId: GARMENT_ID,
    expectedSourceRevision: 3,
    expectedTargetRevision: 3,
  }), /must be different/);
  await assert.rejects(() => client.addGarment(SOURCE_ID, 0, GARMENT_ID), /expectedRevision/);
  assert.equal(calls.length, 0);
});

test('Managed Collection response validator rejects server drift', () => {
  const normalized = normalizeManagedGarmentCollectionDto(dto());
  assert.equal(normalized.id, SOURCE_ID);
  assert.equal(Object.isFrozen(normalized.garmentIds), true);
  assert.throws(() => normalizeManagedGarmentCollectionDto(dto({ id: SOURCE_ID.toUpperCase() })), /canonical lowercase UUID/);
  assert.throws(() => normalizeManagedGarmentCollectionDto(dto({ garment_ids: [GARMENT_ID, GARMENT_ID] })), /duplicates/);
  assert.throws(() => normalizeManagedGarmentCollectionDto(dto({ name: '  Business' })), /name is not canonical/);
  assert.throws(() => normalizeManagedGarmentCollectionDto({ ...dto(), hidden: true }), /unexpected fields/);
});
