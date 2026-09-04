import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import {
  BODY_ANCHOR_NAMES,
} from '../src/application/fashion/canonicalTryOnManualAcquisition.js';
import {
  bodyAnchorLabel,
  normalizeManualBodyAnchorEditorSource,
  validateManualBodyAnchorDraft,
} from '../src/application/fashion/canonicalTryOnManualBodyAnchorDraft.js';

const TOP_ANCHORS = Object.freeze({
  leftShoulder: [0.3, 0.2],
  rightShoulder: [0.7, 0.2],
  leftHip: [0.35, 0.65],
  rightHip: [0.65, 0.65],
});

test('supported category requires only explicit accepted anchor names', () => {
  const before = JSON.stringify(TOP_ANCHORS);
  const result = validateManualBodyAnchorDraft('shirts', TOP_ANCHORS);
  assert.equal(result.canSave, true);
  assert.equal(result.code, 'ready');
  assert.equal(JSON.stringify(TOP_ANCHORS), before);

  assert.equal(validateManualBodyAnchorDraft('shirts', { ...TOP_ANCHORS, unknown: [0.5, 0.5] }).code, 'invalid_name');
  assert.equal(validateManualBodyAnchorDraft('shirts', { ...TOP_ANCHORS, leftHip: [1.01, 0.5] }).code, 'invalid_point');
});

test('too few and missing category-required anchors fail before Core submission', () => {
  assert.equal(validateManualBodyAnchorDraft('shirts', {
    leftShoulder: [0.3, 0.2],
    rightShoulder: [0.7, 0.2],
    leftHip: [0.35, 0.65],
  }).code, 'too_few_anchors');

  const result = validateManualBodyAnchorDraft('shirts', {
    leftShoulder: [0.3, 0.2],
    rightShoulder: [0.7, 0.2],
    leftWaist: [0.35, 0.5],
    rightWaist: [0.65, 0.5],
  });
  assert.equal(result.code, 'required_anchor_missing');
  assert.deepEqual(result.missing, ['leftHip', 'rightHip']);
});

test('unsupported category stays fail-closed without invented body geometry', () => {
  const result = validateManualBodyAnchorDraft('hats', TOP_ANCHORS);
  assert.equal(result.canSave, false);
  assert.equal(result.code, 'unsupported_category');
});

test('body-anchor source accepts only the product-safe readiness identity intersection', () => {
  const source = {
    projectId: '123e4567-e89b-12d3-a456-426614174000',
    sourceArtifactId: 'artifact-current-image',
    category: 'shirts',
    imageUrl: 'https://images.example.test/project/current.png',
  };
  const normalized = normalizeManualBodyAnchorEditorSource(source);
  assert.equal(normalized.projectId, source.projectId);
  assert.equal(normalized.sourceArtifactId, source.sourceArtifactId);
  assert.equal(normalized.category, 'shirts');
  assert.equal(normalized.imageUrl, source.imageUrl);
  assert.equal(normalized.supported, true);
  assert.deepEqual(normalized.requiredAnchors, ['leftShoulder', 'rightShoulder', 'leftHip', 'rightHip']);

  assert.equal(
    normalizeManualBodyAnchorEditorSource({ ...source, sourceArtifactId: 'a'.repeat(512) }).sourceArtifactId.length,
    512,
  );
  assert.throws(
    () => normalizeManualBodyAnchorEditorSource({ ...source, sourceArtifactId: 'a'.repeat(513) }),
    /identifier contract/,
  );
  assert.throws(() => normalizeManualBodyAnchorEditorSource({ ...source, storageId: 'x' }), /unknown or missing/);
  assert.throws(() => normalizeManualBodyAnchorEditorSource({ ...source, imageUrl: 'javascript:alert(1)' }), /display contract/);
});

test('all ten accepted body-anchor names retain stable explicit labels', () => {
  assert.equal(BODY_ANCHOR_NAMES.length, 10);
  assert.deepEqual(BODY_ANCHOR_NAMES.map(bodyAnchorLabel), [
    'left shoulder', 'right shoulder',
    'left waist', 'right waist',
    'left hip', 'right hip',
    'left ankle', 'right ankle',
    'left toe', 'right toe',
  ]);
});

test('React body-anchor pointer coordinates are measured against the actual project image box', async () => {
  const component = await readFile('src/components/editor/outfits/CanonicalTryOnBodyAnchorEditor.jsx', 'utf8');
  assert.match(component, /useRef/);
  assert.match(component, /const imageRef = useRef\(null\)/);
  assert.match(component, /ref=\{imageRef\}/);
  assert.match(component, /imageRef\.current\?\.getBoundingClientRect\(\)/);
  assert.doesNotMatch(component, /event\.currentTarget\.getBoundingClientRect\(\)/);
});

test('React body-anchor editor is explicit-point only, accessible and authority-minimized', async () => {
  const component = await readFile('src/components/editor/outfits/CanonicalTryOnBodyAnchorEditor.jsx', 'utf8');
  assert.match(component, /normalizeManualBodyAnchorEditorSource\(source\)/);
  assert.match(component, /validateManualBodyAnchorDraft\(safeSource\?\.category, anchors\)/);
  assert.match(component, /BODY_ANCHOR_NAMES\.map\(\(name\)/);
  assert.match(component, /onPointerDown=\{placeSelectedFromImage\}/);
  assert.match(component, /aria-label="Manual body-anchor editor"/);
  assert.match(component, /aria-label="Body anchor controls"/);
  assert.match(component, /aria-pressed=\{selectedName === name\}/);
  assert.match(component, /onSave\(\{\s*projectId: safeSource\.projectId,\s*sourceArtifactId: safeSource\.sourceArtifactId,\s*anchors,\s*\}\)/s);
  assert.match(component, /setLocked\(true\)/);
  assert.doesNotMatch(component, /Math\.(round|floor|ceil)\(/);
  for (const forbidden of [
    'coreClient', 'fetch(', 'representationId', 'anchorSetId', 'storageId', 'contentSha256',
    'ticketId', 'executionId', 'destinationMesh', 'FASHN', 'Billing', 'credits', 'outfitManager', 'tryonEngine',
  ]) assert.equal(component.includes(forbidden), false, forbidden);
});
