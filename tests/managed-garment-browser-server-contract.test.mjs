import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const ROOT = path.resolve(import.meta.dirname, '..');

function matched(source, expression, label) {
  const match = source.match(expression);
  assert.ok(match, `Unable to extract ${label}`);
  return match[1];
}
function quoted(block) { return [...block.matchAll(/'([^']+)'/g)].map(match => match[1]); }
function sorted(values) { return [...values].sort(); }
function browserSet(source, name) {
  return quoted(matched(source, new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\);`), `browser ${name}`));
}
function browserArray(source, name) {
  return quoted(matched(source, new RegExp(`const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\);`), `browser ${name}`));
}
function serverArray(source, name) {
  return quoted(matched(source, new RegExp(`export const ${name} = Object\\.freeze\\(\\[([\\s\\S]*?)\\]\\s*as const\\);`), `server ${name}`));
}
function exactKeyCalls(source) {
  return [...source.matchAll(/assertExactKeys\(value,\s*\[([\s\S]*?)\],\s*([^\n;]+)\);/g)].map(match => Object.freeze({
    fields: quoted(match[1]),
    labelExpression: match[2].trim(),
  }));
}
function exactKeysForLabel(source, label) {
  const expression = `'${label}'`;
  const calls = exactKeyCalls(source).filter(call => call.labelExpression === expression);
  assert.equal(calls.length, 1, `Expected exactly one browser exact-key contract for ${label}`);
  return calls[0].fields;
}
function exactKeysForExpression(source, expression, label) {
  const calls = exactKeyCalls(source).filter(call => call.labelExpression === expression);
  assert.equal(calls.length, 1, `Expected exactly one browser exact-key contract for ${label}`);
  return calls[0].fields;
}
function topLevelDtoKeys(adapter) {
  const block = matched(adapter, /function dto\([\s\S]*?return Object\.freeze\(\{([\s\S]*?)\n  \}\);\n\}/, 'server Managed Garment DTO');
  return [...block.matchAll(/^    ([a-z_]+):/gm)].map(match => match[1]);
}
function sectionKeys(adapter, start, end, indent) {
  const startIndex = adapter.indexOf(start);
  assert.ok(startIndex >= 0, `Missing server section ${start}`);
  const endIndex = adapter.indexOf(end, startIndex + start.length);
  assert.ok(endIndex > startIndex, `Missing server section end ${end}`);
  const block = adapter.slice(startIndex, endIndex);
  const expression = new RegExp(`^${' '.repeat(indent)}([a-z_]+):`, 'gm');
  return [...block.matchAll(expression)].map(match => match[1]);
}

test('Managed Garment browser constants remain exact with canonical store and capture assessment', async () => {
  const [client, store, assessment] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src/api/managedGarmentClient.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'server/core/fashion/postgresGarmentStore.ts'), 'utf8'),
    fs.readFile(path.join(ROOT, 'server/core/fashion/garmentCaptureAssessment.ts'), 'utf8'),
  ]);
  assert.deepEqual(sorted(browserSet(client, 'VIEW_KINDS')), sorted(serverArray(store, 'GARMENT_VIEW_KINDS')));
  assert.deepEqual(browserArray(client, 'CARDINAL_VIEW_KINDS'), serverArray(assessment, 'CARDINAL_GARMENT_VIEW_KINDS'));
  assert.equal(
    Number(matched(client, /const MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX = (\d+);/, 'browser capture threshold')),
    Number(matched(assessment, /export const MIN_TECHNICAL_CAPTURE_SHORT_EDGE_PX = (\d+);/, 'server capture threshold')),
  );
});

test('Managed Garment browser route and optimistic revision header remain exact with HTTP adapter', async () => {
  const [client, adapter] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src/api/managedGarmentClient.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'server/core/http/managedGarmentHttpAdapter.ts'), 'utf8'),
  ]);
  assert.equal(
    matched(adapter, /const PREFIX = '([^']+)';/, 'server prefix'),
    `/api/core${matched(client, /const PREFIX = '([^']+)';/, 'browser prefix')}`,
  );
  assert.equal(
    matched(adapter, /const EXPECTED_GARMENT_REVISION_HEADER = '([^']+)';/, 'server revision header'),
    matched(client, /const EXPECTED_REVISION_HEADER = '([^']+)';/, 'browser revision header'),
  );
});

test('Managed Garment browser exact DTO surfaces remain bound to server DTO shape', async () => {
  const [client, adapter] = await Promise.all([
    fs.readFile(path.join(ROOT, 'src/api/managedGarmentClient.js'), 'utf8'),
    fs.readFile(path.join(ROOT, 'server/core/http/managedGarmentHttpAdapter.ts'), 'utf8'),
  ]);
  assert.deepEqual(sorted(exactKeysForLabel(client, 'Managed Garment response')), sorted(topLevelDtoKeys(adapter)));
  assert.deepEqual(
    sorted(exactKeysForLabel(client, 'capture_assessment')),
    sorted(sectionKeys(adapter, 'capture_assessment: Object.freeze({', 'views: garment.views.map', 6)),
  );
  assert.deepEqual(
    sorted(exactKeysForLabel(client, 'technical_resolution')),
    sorted(sectionKeys(adapter, 'technical_resolution: Object.freeze({', 'semantic_quality:', 8)),
  );
  assert.deepEqual(
    sorted(exactKeysForExpression(client, 'label', 'Managed Garment view')),
    sorted(sectionKeys(adapter, 'views: garment.views.map((view) => Object.freeze({', '})),', 6)),
  );
});
