import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { GARMENT_CATEGORIES } from '../src/lib/fashion/garmentCategories.js';

const ADD = 'src/components/editor/fashion/AddGarmentDialog.jsx';
const WARDROBE_CLIENT = 'src/api/managedWardrobeClient.js';
const GARMENT_CLIENT = 'src/api/managedGarmentClient.js';

function namedDeclaration(source, name, terminator) {
  const marker = `const ${name} = `;
  const start = source.indexOf(marker);
  assert.ok(start >= 0, `${name} declaration must exist`);
  const end = source.indexOf(terminator, start);
  assert.ok(end > start, `${name} declaration must be closed`);
  return source.slice(start, end + terminator.length);
}

function quotedValues(source) {
  return [...source.matchAll(/'([^']+)'/g)].map((match) => match[1]);
}

test('Fashion category and season inputs exactly match the canonical Wardrobe browser contract', async () => {
  const [dialog, wardrobe] = await Promise.all([
    readFile(ADD, 'utf8'),
    readFile(WARDROBE_CLIENT, 'utf8'),
  ]);

  const canonicalCategories = quotedValues(namedDeclaration(wardrobe, 'CATEGORIES', ']);'));
  const canonicalSeasons = quotedValues(namedDeclaration(wardrobe, 'SEASONS', ');'));
  const dialogSeasons = quotedValues(namedDeclaration(dialog, 'SEASONS', ');'));
  const uiCategories = GARMENT_CATEGORIES.map((category) => category.id);

  assert.deepEqual(uiCategories, canonicalCategories, 'Fashion category picker must not drift from canonical Wardrobe categories');
  assert.deepEqual(dialogSeasons, canonicalSeasons, 'Fashion season picker must not drift from canonical Wardrobe seasons');
  assert.match(dialog, /aria-label="Material"[\s\S]{0,180}maxLength=\{50\}/, 'Material UI bound must match the canonical 50-character contract');
  assert.match(wardrobe, /normalized\.length > 50/);
});

test('initial garment view kinds exactly match the canonical Managed Garment contract', async () => {
  const [dialog, garment] = await Promise.all([
    readFile(ADD, 'utf8'),
    readFile(GARMENT_CLIENT, 'utf8'),
  ]);
  const canonicalKinds = quotedValues(namedDeclaration(garment, 'VIEW_KINDS', ');')).sort();
  const dialogDeclaration = namedDeclaration(dialog, 'VIEW_KINDS', ']);');
  const uiKinds = [...dialogDeclaration.matchAll(/^\s*\['([^']+)'/gm)].map((match) => match[1]).sort();
  assert.deepEqual(uiKinds, canonicalKinds, 'Initial garment photo view picker must not drift from Managed Garment view kinds');
});

test('new Fashion UI exposes only metadata that has canonical F2 mutation authority', async () => {
  const [dialog, wardrobe] = await Promise.all([
    readFile(ADD, 'utf8'),
    readFile(WARDROBE_CLIENT, 'utf8'),
  ]);
  assert.match(wardrobe, /const allowed = \['name','category','season','material','tags','favorite'\]/);
  for (const legacyField of ['brand:', 'size:', 'dominant_color:', 'source:', 'original_image_url']) {
    assert.equal(dialog.includes(legacyField), false, `Fashion create UI must not emit unsupported legacy field ${legacyField}`);
  }
  assert.match(dialog, /Brand, size and color are not shown here until they have a canonical server-owned metadata contract\./);
});
