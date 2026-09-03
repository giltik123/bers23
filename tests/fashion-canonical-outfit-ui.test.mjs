import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const panel = fs.readFileSync(new URL('../src/components/editor/outfits/OutfitPanel.jsx', import.meta.url), 'utf8');
const model = fs.readFileSync(new URL('../src/application/fashion/canonicalOutfitViewModel.js', import.meta.url), 'utf8');
const client = fs.readFileSync(new URL('../src/api/managedOutfitClient.js', import.meta.url), 'utf8');

test('Outfit panel uses only canonical F3 and Wardrobe browser authorities', () => {
  assert.match(panel, /coreClient\.fashion\.outfits/);
  assert.match(panel, /coreClient\.fashion\.wardrobe/);
  assert.match(panel, /createCanonicalOutfitViewModel/);
  assert.match(model, /outfits\.reorderEntries/);
  assert.match(model, /outfits\.setEntryRole/);
});

test('active Outfit UI cannot revive legacy entity or provider authority', () => {
  const active = `${panel}\n${model}`;
  for (const forbidden of [
    'outfitManager',
    'coreClient.entities',
    'FASHN',
    'billing',
    'credits',
    'onCommit',
    'onRollback',
  ]) {
    assert.equal(active.includes(forbidden), false, `active Outfit surface must not contain ${forbidden}`);
  }
});

test('UI role taxonomy matches the canonical Outfit client role set', () => {
  const uiRoles = [...panel.matchAll(/^\s+'(BASE_TOP|MID_TOP|OUTER_TOP|FULL_BODY|BOTTOM|FOOTWEAR|ACCESSORY)',?$/gm)].map((match) => match[1]);
  const clientMatch = client.match(/const LAYER_ROLES = new Set\(\[([^\]]+)\]\)/);
  assert.ok(clientMatch, 'Managed Outfit client layer role set must remain explicit');
  const clientRoles = [...clientMatch[1].matchAll(/'([^']+)'/g)].map((match) => match[1]);
  assert.deepEqual(uiRoles, clientRoles);
});

test('Wardrobe projection failure is explicitly non-authoritative', () => {
  assert.match(model, /wardrobeError/);
  assert.match(panel, /Outfit references remain canonical/);
  assert.match(panel, /Unavailable garment reference/);
});
