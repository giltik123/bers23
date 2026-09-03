import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

function quoted(block) {
  return [...block.matchAll(/'([^']+)'/g)].map(match => match[1]);
}
function matched(source, expression, label) {
  const match = source.match(expression);
  assert.ok(match, `Unable to extract ${label}`);
  return match[1];
}
function sorted(values) { return [...values].sort(); }
function browserSet(source, name) {
  return quoted(matched(source, new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`), `browser ${name}`));
}
function serverArray(source, name) {
  return quoted(matched(source, new RegExp(`export const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\s*as const\\);`), `server ${name}`));
}
function objectPairs(source, expression, label) {
  const block = matched(source, expression, label);
  return Object.fromEntries([...block.matchAll(/([a-z_]+):\s*'([^']+)'/g)].map(match => [match[1], match[2]]));
}
function dtoKeys(source, expression, label) {
  const block = matched(source, expression, label);
  return [...block.matchAll(/^\s+([a-z_]+):/gm)].map(match => match[1]);
}
function browserExactKeys(source, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const block = matched(source, new RegExp(`assertExactKeys\\(value, \\[([\\s\\S]*?)\\], '${escaped}'\\)`), `browser ${label} keys`);
  return quoted(block);
}

test('Wardrobe browser taxonomy and DTO contract remain exact with canonical server source', async () => {
  const [client, store, adapter] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src/api/managedWardrobeClient.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'server/core/fashion/postgresGarmentWardrobeStore.ts'), 'utf8'),
    fs.readFile(path.join(ROOT, 'server/core/http/managedWardrobeHttpAdapter.ts'), 'utf8'),
  ]);
  assert.deepEqual(sorted(browserSet(client, 'CATEGORIES')), sorted(serverArray(store, 'GARMENT_CATEGORIES')));
  assert.deepEqual(sorted(browserSet(client, 'SEASONS')), sorted(serverArray(store, 'GARMENT_SEASONS')));
  assert.deepEqual(
    objectPairs(client, /const CATEGORY_GROUP = Object\.freeze\(\{([\s\S]*?)\}\);/, 'browser category groups'),
    objectPairs(store, /const CATEGORY_GROUPS:[\s\S]*?= Object\.freeze\(\{([\s\S]*?)\}\);/, 'server category groups'),
  );
  assert.equal(Number(matched(client, /const MAX_TAGS = (\d+);/, 'browser MAX_TAGS')), Number(matched(store, /const MAX_TAGS = (\d+);/, 'server MAX_TAGS')));

  const browserPrefix = matched(client, /const PREFIX = '([^']+)';/, 'browser Wardrobe PREFIX');
  const serverPrefix = matched(adapter, /const PREFIX = '([^']+)';/, 'server Wardrobe PREFIX');
  assert.equal(serverPrefix, `/api/core${browserPrefix}`);
  assert.equal(
    matched(client, /const EXPECTED_REVISION_HEADER = '([^']+)';/, 'browser Wardrobe revision header'),
    matched(adapter, /const EXPECTED_GARMENT_REVISION_HEADER = '([^']+)';/, 'server Wardrobe revision header'),
  );
  assert.deepEqual(
    sorted(browserExactKeys(client, 'Managed Wardrobe response')),
    sorted(dtoKeys(adapter, /function dto\(garment:[\s\S]*?return Object\.freeze\(\{([\s\S]*?)\}\);\n\}/, 'server Wardrobe DTO')),
  );
});

test('Collection browser routes, revision headers and DTO contract remain exact with canonical server source', async () => {
  const [client, adapter] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src/api/managedGarmentCollectionClient.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'server/core/http/managedGarmentCollectionHttpAdapter.ts'), 'utf8'),
  ]);
  const browserPrefix = matched(client, /const PREFIX = '([^']+)';/, 'browser Collection PREFIX');
  const serverPrefix = matched(adapter, /const PREFIX = '([^']+)';/, 'server Collection PREFIX');
  assert.equal(serverPrefix, `/api/core${browserPrefix}`);
  for (const [browserName, serverName] of [
    ['EXPECTED_REVISION_HEADER','EXPECTED_COLLECTION_REVISION_HEADER'],
    ['EXPECTED_SOURCE_REVISION_HEADER','EXPECTED_SOURCE_COLLECTION_REVISION_HEADER'],
    ['EXPECTED_TARGET_REVISION_HEADER','EXPECTED_TARGET_COLLECTION_REVISION_HEADER'],
  ]) {
    assert.equal(
      matched(client, new RegExp(`const ${browserName} = '([^']+)';`), `browser ${browserName}`),
      matched(adapter, new RegExp(`const ${serverName} = '([^']+)';`), `server ${serverName}`),
    );
  }
  assert.deepEqual(
    sorted(browserExactKeys(client, 'Managed Garment Collection response')),
    sorted(dtoKeys(adapter, /function dto\(collection:[\s\S]*?return Object\.freeze\(\{([\s\S]*?)\}\);\n\}/, 'server Collection DTO')),
  );
});
