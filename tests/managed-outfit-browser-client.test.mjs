import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { createManagedOutfitClient, normalizeManagedOutfitDto } from '../src/api/managedOutfitClient.js';

const ROOT = path.resolve(import.meta.dirname, '..');
const OUTFIT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ENTRY_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
const GARMENT_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

function entry(overrides = {}) {
  return {
    entry_id: ENTRY_ID,
    garment_id: GARMENT_ID,
    position: 0,
    layer_role: 'BASE_TOP',
    garment_category: 'tshirts',
    reference_readiness: 'READY',
    ...overrides,
  };
}

function dto(overrides = {}) {
  return {
    id: OUTFIT_ID,
    name: 'Release Outfit',
    style: 'smart_casual',
    season: 'all_season',
    occasion: 'casual',
    favorite: false,
    status: 'ACTIVE',
    revision: 7,
    reference_readiness: 'REFERENCES_READY',
    entries: [entry()],
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

test('Managed Outfit client uses only injected canonical transport and has no legacy/fetch dependency', async () => {
  const source = await fs.readFile(path.join(ROOT, 'src/api/managedOutfitClient.js'), 'utf8');
  for (const forbidden of ['fetch(', 'coreClient.entities', 'outfitManager', 'FASHN', 'provider']) {
    assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.match(source, /createManagedOutfitClient\(request\)/);
  assert.match(source, /X-Expected-Outfit-Revision/);
});

test('Managed Outfit list normalizes the exact canonical F3 DTO without inventing local state', async () => {
  const { calls, request } = recorder([dto()]);
  const client = createManagedOutfitClient(request);
  const result = await client.list();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { url: '/wardrobe/outfits', options: undefined });
  assert.equal(result.length, 1);
  assert.equal(result[0].id, OUTFIT_ID);
  assert.equal(result[0].referenceReadiness, 'REFERENCES_READY');
  assert.deepEqual(result[0].entries[0], {
    entryId: ENTRY_ID,
    garmentId: GARMENT_ID,
    position: 0,
    layerRole: 'BASE_TOP',
    garmentCategory: 'tshirts',
    referenceReadiness: 'READY',
  });
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
  assert.equal(Object.isFrozen(result[0].entries), true);
});

test('Outfit create canonicalizes user intent to the same F3 name and taxonomy law', async () => {
  const { calls, request } = recorder();
  const client = createManagedOutfitClient(request);
  await client.create({
    name: '  My   Outfit  ',
    style: ' SMART_CASUAL ',
    season: ' Summer ',
    occasion: ' NIGHT_OUT ',
    favorite: true,
  });
  assert.equal(calls[0].url, '/wardrobe/outfits');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    name: 'My Outfit',
    style: 'smart_casual',
    season: 'summer',
    occasion: 'night_out',
    favorite: true,
  });
});

test('Outfit mutations carry one canonical optimistic revision precondition and reject empty serialized patches locally', async () => {
  const { calls, request } = recorder();
  const client = createManagedOutfitClient(request);
  await client.updateMetadata(OUTFIT_ID.toUpperCase(), 7, { style: 'Classic' });
  assert.equal(calls[0].url, `/wardrobe/outfits/${OUTFIT_ID}`);
  assert.equal(calls[0].options.method, 'PATCH');
  assert.deepEqual(calls[0].options.headers, { 'X-Expected-Outfit-Revision': '7' });
  assert.deepEqual(JSON.parse(calls[0].options.body), { style: 'classic' });

  const beforeInvalid = calls.length;
  await assert.rejects(() => client.updateMetadata(OUTFIT_ID, 7, {}), /at least one field/);
  await assert.rejects(() => client.updateMetadata(OUTFIT_ID, 7, { style: undefined }), /style/);
  assert.equal(calls.length, beforeInvalid, 'invalid metadata patches must not reach Core transport');
  await assert.rejects(() => client.updateMetadata(OUTFIT_ID, 0, { style: 'classic' }), /expectedRevision/);
  await assert.rejects(() => client.updateMetadata(OUTFIT_ID, Number.MAX_SAFE_INTEGER + 1, { style: 'classic' }), /expectedRevision/);
});

test('Outfit entry intent uses canonical garment UUID and exact server layer roles', async () => {
  const { calls, request } = recorder();
  const client = createManagedOutfitClient(request);
  await client.addEntry(OUTFIT_ID, 7, { garmentId: GARMENT_ID.toUpperCase(), layerRole: ' outer_top ' });
  assert.equal(calls[0].url, `/wardrobe/outfits/${OUTFIT_ID}/entries`);
  assert.deepEqual(JSON.parse(calls[0].options.body), { garment_id: GARMENT_ID, layer_role: 'OUTER_TOP' });
  assert.deepEqual(calls[0].options.headers, { 'X-Expected-Outfit-Revision': '7' });
  await assert.rejects(() => client.addEntry(OUTFIT_ID, 7, { garmentId: GARMENT_ID, layerRole: 'OUTER' }), /layerRole/);
  await assert.rejects(() => client.addEntry(OUTFIT_ID, 7, { garmentId: GARMENT_ID, layerRole: undefined }), /layerRole/);
});

test('Outfit reorder permits the canonical empty permutation, caps 32, normalizes UUIDs and rejects duplicates', async () => {
  const { calls, request } = recorder(dto({ entries: [], reference_readiness: 'EMPTY' }));
  const client = createManagedOutfitClient(request);
  await client.reorderEntries(OUTFIT_ID, 7, []);
  assert.deepEqual(JSON.parse(calls[0].options.body), { entry_ids: [] });

  await assert.rejects(() => client.reorderEntries(OUTFIT_ID, 7, [ENTRY_ID, ENTRY_ID.toUpperCase()]), /duplicates/);
  const tooMany = Array.from({ length: 33 }, (_, index) => `${index.toString(16).padStart(8, '0')}-aaaa-aaaa-aaaa-aaaaaaaaaaaa`);
  await assert.rejects(() => client.reorderEntries(OUTFIT_ID, 7, tooMany), /at most 32/);
});

test('Managed Outfit response validator accepts only semantically consistent aggregate readiness', () => {
  const cases = [
    ['REFERENCES_READY', [entry()]],
    ['EMPTY', []],
    ['GARMENT_UNAVAILABLE', [entry({ reference_readiness: 'GARMENT_UNAVAILABLE' })]],
    ['ROLE_REVIEW_REQUIRED', [entry({ reference_readiness: 'ROLE_REVIEW_REQUIRED' })]],
  ];
  for (const [reference_readiness, entries] of cases) {
    assert.equal(normalizeManagedOutfitDto(dto({ reference_readiness, entries })).referenceReadiness, reference_readiness);
  }

  assert.throws(() => normalizeManagedOutfitDto(dto({ reference_readiness: 'READY' })), /reference_readiness/);
  assert.throws(() => normalizeManagedOutfitDto(dto({ reference_readiness: 'EMPTY', entries: [entry()] })), /does not match canonical entries/);
  assert.throws(() => normalizeManagedOutfitDto(dto({ reference_readiness: 'REFERENCES_READY', entries: [entry({ reference_readiness: 'GARMENT_UNAVAILABLE' })] })), /does not match canonical entries/);
  assert.throws(() => normalizeManagedOutfitDto(dto({ reference_readiness: 'GARMENT_UNAVAILABLE', entries: [entry({ reference_readiness: 'ROLE_REVIEW_REQUIRED' })] })), /does not match canonical entries/);

  const badRole = dto();
  badRole.entries[0].layer_role = 'OUTER';
  assert.throws(() => normalizeManagedOutfitDto(badRole), /layer_role/);
  const badCategory = dto();
  badCategory.entries[0].garment_category = 'coat';
  assert.throws(() => normalizeManagedOutfitDto(badCategory), /garment_category/);
  assert.throws(() => normalizeManagedOutfitDto(dto({ name: '  Release Outfit' })), /name is not canonical/);
  assert.throws(() => normalizeManagedOutfitDto(dto({ id: OUTFIT_ID.toUpperCase() })), /canonical lowercase UUID/);
  assert.throws(() => normalizeManagedOutfitDto({ ...dto(), unexpected: true }), /unexpected fields/);
});

test('Outfit taxonomy rejects browser-created values outside the server-owned closed enums', async () => {
  const client = createManagedOutfitClient(recorder().request);
  for (const [field, value] of [
    ['style', 'cyberpunk'],
    ['season', 'monsoon'],
    ['occasion', 'anything'],
  ]) {
    await assert.rejects(() => client.create({ name: 'A', [field]: value }), new RegExp(field));
  }
  await assert.rejects(() => client.create({ name: 'A', style: undefined }), /style/);
  await assert.rejects(() => client.create({ name: 'A', metadata: {} }), /forbidden fields/);
  await assert.rejects(() => client.create({ name: '\u0000bad' }), /printable/);
});
