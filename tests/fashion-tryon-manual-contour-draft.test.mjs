import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { normalizeManualContourEditorSource, validateManualContourDraft } from '../src/application/fashion/canonicalTryOnManualContourDraft.js';

test('valid simple polygon is saveable without rewriting explicit points', () => {
  const points = [[0.1, 0.1], [0.8, 0.1], [0.8, 0.8], [0.1, 0.8]];
  const before = JSON.stringify(points);
  const result = validateManualContourDraft(points);
  assert.equal(result.canSave, true);
  assert.equal(result.code, 'ready');
  assert.equal(JSON.stringify(points), before);
});

test('too few, duplicate, degenerate and crossing contours fail locally', () => {
  assert.equal(validateManualContourDraft([[0, 0], [1, 1]]).code, 'too_few_points');
  assert.equal(validateManualContourDraft([[0, 0], [1, 0], [1, 1], [0, 0]]).code, 'duplicate_point');
  assert.equal(validateManualContourDraft([[0, 0], [0.5, 0], [1, 0], [1, 1], [0, 1]]).code, 'degenerate');
  assert.equal(validateManualContourDraft([[0, 0], [1, 1], [0, 1], [1, 0]]).code, 'self_intersection');
});

test('invalid coordinates and excessive complexity fail before Core submission', () => {
  assert.equal(validateManualContourDraft([[0, 0], [1, 0], [1.01, 1]]).code, 'invalid_point');
  const points = Array.from({ length: 257 }, (_, index) => [index / 256, (index % 2) * 0.5]);
  assert.equal(validateManualContourDraft(points).code, 'too_complex');
});

test('editor source accepts only the minimized 9a projection', () => {
  const source = {
    garmentId: '123e4567-e89b-12d3-a456-426614174000',
    expectedRevision: 3,
    category: 'shirts',
    imageUrl: '/api/core/garments/delivery/token',
    imageExpiresAt: '2026-09-04T06:00:00.000Z',
  };
  assert.deepEqual(normalizeManualContourEditorSource(source), source);
  assert.throws(() => normalizeManualContourEditorSource({ ...source, contentSha256: 'x' }), /unknown or missing/);
  assert.throws(() => normalizeManualContourEditorSource({ ...source, imageUrl: 'https://example.com/garment.png' }), /delivery is invalid/);
});

test('React contour editor maps pointer coordinates to the actual image box', async () => {
  const component = await readFile('src/components/editor/outfits/CanonicalTryOnContourEditor.jsx', 'utf8');
  assert.match(component, /useRef/);
  assert.match(component, /const imageRef = useRef\(null\)/);
  assert.match(component, /ref=\{imageRef\}/);
  assert.match(component, /imageRef\.current\?\.getBoundingClientRect\(\)/);
  assert.doesNotMatch(component, /event\.currentTarget\.getBoundingClientRect\(\)/);
});

test('existing point coordinates can be replaced through an unconstrained draft before commit', async () => {
  const component = await readFile('src/components/editor/outfits/CanonicalTryOnContourEditor.jsx', 'utf8');
  assert.match(component, /defaultValue=\{point\[0\]\}/);
  assert.match(component, /defaultValue=\{point\[1\]\}/);
  assert.match(component, /onBlur=\{\(event\) => commitCoordinate\(index, 0, event\.currentTarget\)\}/);
  assert.match(component, /onBlur=\{\(event\) => commitCoordinate\(index, 1, event\.currentTarget\)\}/);
  assert.match(component, /if \(event\.key === 'Enter'\) event\.currentTarget\.blur\(\)/);
  assert.match(component, /input\.value = Number\.isFinite\(currentValue\) \? String\(currentValue\) : ''/);
});

test('React contour editor is explicit-point only, accessible and authority-minimized', async () => {
  const component = await readFile('src/components/editor/outfits/CanonicalTryOnContourEditor.jsx', 'utf8');
  assert.match(component, /normalizeManualContourEditorSource\(source\)/);
  assert.match(component, /validateManualContourDraft\(points\)/);
  assert.match(component, /current\.length >= MANUAL_PARAMETRIC_MAX_POINTS/);
  assert.match(component, /aria-label="Manual garment contour editor"/);
  assert.match(component, /aria-label="Add contour point by coordinates"/);
  assert.match(component, /aria-label=\{`Contour point \$\{index \+ 1\} x`\}/);
  assert.match(component, /aria-label=\{`Contour point \$\{index \+ 1\} y`\}/);
  assert.match(component, /Move contour point \$\{index \+ 1\} earlier/);
  assert.match(component, /Move contour point \$\{index \+ 1\} later/);
  assert.match(component, /Remove contour point \$\{index \+ 1\}/);
  assert.match(component, /onSave\(\{\s*garmentId: safeSource\.garmentId,\s*expectedRevision: safeSource\.expectedRevision,\s*points,\s*\}\)/s);
  assert.match(component, /TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING/);
  assert.match(component, /setLocked\(true\)/);
  assert.doesNotMatch(component, /Math\.(round|floor|ceil)\(/);
  for (const forbidden of [
    'coreClient', 'fetch(', 'representationId', 'anchorSetId', 'storageId', 'contentSha256',
    'ticketId', 'executionId', 'destinationMesh', 'FASHN', 'Billing', 'credits', 'outfitManager', 'tryonEngine',
  ]) assert.equal(component.includes(forbidden), false, forbidden);
});
