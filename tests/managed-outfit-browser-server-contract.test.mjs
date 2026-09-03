import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');
const CLIENT = path.join(ROOT, 'src/api/managedOutfitClient.js');
const OUTFIT_STORE = path.join(ROOT, 'server/core/fashion/postgresOutfitStore.ts');
const WARDROBE_STORE = path.join(ROOT, 'server/core/fashion/postgresGarmentWardrobeStore.ts');
const HTTP_ADAPTER = path.join(ROOT, 'server/core/http/managedOutfitHttpAdapter.ts');

function quotedValues(block, label) {
  const values = [...block.matchAll(/'([^']+)'/g)].map(match => match[1]);
  assert.ok(values.length > 0, `${label} must contain quoted values`);
  return values;
}

function matched(source, expression, label) {
  const match = source.match(expression);
  assert.ok(match, `Unable to extract ${label}`);
  return match[1];
}

function browserSet(source, name) {
  return quotedValues(
    matched(source, new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`), `browser ${name}`),
    `browser ${name}`,
  );
}

function serverArray(source, name) {
  return quotedValues(
    matched(source, new RegExp(`export const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\s*as const\\);`), `server ${name}`),
    `server ${name}`,
  );
}

function serverUnion(source, name) {
  return quotedValues(
    matched(source, new RegExp(`export type ${name} = ([^;]+);`), `server ${name}`),
    `server ${name}`,
  );
}

function sorted(values) {
  return [...values].sort();
}

test('Managed Outfit browser contract stays byte-policy aligned with canonical server taxonomies', async () => {
  const [client, outfitStore, wardrobeStore] = await Promise.all([
    fs.readFile(CLIENT, 'utf8'),
    fs.readFile(OUTFIT_STORE, 'utf8'),
    fs.readFile(WARDROBE_STORE, 'utf8'),
  ]);

  assert.deepEqual(sorted(browserSet(client, 'STYLES')), sorted(serverArray(outfitStore, 'OUTFIT_STYLES')));
  assert.deepEqual(sorted(browserSet(client, 'SEASONS')), sorted(serverArray(outfitStore, 'OUTFIT_SEASONS')));
  assert.deepEqual(sorted(browserSet(client, 'OCCASIONS')), sorted(serverArray(outfitStore, 'OUTFIT_OCCASIONS')));
  assert.deepEqual(sorted(browserSet(client, 'LAYER_ROLES')), sorted(serverArray(outfitStore, 'OUTFIT_LAYER_ROLES')));
  assert.deepEqual(sorted(browserSet(client, 'GARMENT_CATEGORIES')), sorted(serverArray(wardrobeStore, 'GARMENT_CATEGORIES')));
  assert.deepEqual(sorted(browserSet(client, 'ENTRY_READINESS')), sorted(serverUnion(outfitStore, 'OutfitEntryReferenceReadiness')));
  assert.deepEqual(sorted(browserSet(client, 'OUTFIT_READINESS')), sorted(serverUnion(outfitStore, 'OutfitReferenceReadiness')));

  const browserMax = Number(matched(client, /const MAX_ENTRIES = (\d+);/, 'browser MAX_ENTRIES'));
  const serverMax = Number(matched(outfitStore, /const MAX_ENTRIES = (\d+);/, 'server MAX_ENTRIES'));
  assert.equal(browserMax, serverMax);
});

test('Managed Outfit browser transport stays aligned with the canonical server route and revision header', async () => {
  const [client, adapter] = await Promise.all([
    fs.readFile(CLIENT, 'utf8'),
    fs.readFile(HTTP_ADAPTER, 'utf8'),
  ]);
  const browserPrefix = matched(client, /const PREFIX = '([^']+)';/, 'browser PREFIX');
  const serverPrefix = matched(adapter, /const PREFIX = '([^']+)';/, 'server PREFIX');
  assert.equal(serverPrefix, `/api/core${browserPrefix}`);

  const browserHeader = matched(client, /const EXPECTED_REVISION_HEADER = '([^']+)';/, 'browser revision header');
  const serverHeader = matched(adapter, /const EXPECTED_OUTFIT_REVISION_HEADER = '([^']+)';/, 'server revision header');
  assert.equal(browserHeader, serverHeader);
});
