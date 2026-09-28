import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Editor Masked Exposure stays canonical MASK-bound Preview then explicit Accept', async () => {
  const [editor, toolbar, factory] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/application/createMaskedExposure.ts', 'utf8'),
  ]);

  assert.match(editor, /createMaskedExposure\(\{ projectId: project\.id \}\)/);
  assert.match(editor, /sourceArtifactId = retryContext\?\.sourceArtifactId \|\| project\?\.current_image_artifact_id/);
  assert.match(editor, /maskArtifactId = retryContext\?\.maskArtifactId \|\| selected\?\.mask_artifact_id/);
  assert.match(editor, /eighthStops < -32 \|\| eighthStops > 32 \|\| eighthStops === 0/);
  assert.match(editor, /eighthStops: exposureEighthStops|exposureEighthStops/);
  assert.match(editor, /kind: 'MASKED_EXPOSURE'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /credits_used: 0/);
  assert.match(editor, /pending\?\.kind === 'MASKED_EXPOSURE'/);
  assert.match(editor, /applyMaskedExposure\(pending\.context\)/);
  assert.doesNotMatch(editor, /acceptFinal[^\n]*MASKED_EXPOSURE/);

  assert.match(toolbar, /aria-label="Masked exposure"/);
  assert.match(toolbar, /min="-32"/);
  assert.match(toolbar, /max="32"/);
  assert.match(toolbar, /step="1"/);
  assert.match(toolbar, /aria-valuetext=\{formatExposure\(exposureEighthStops\)\}/);
  assert.match(toolbar, /aria-label="Preview masked exposure"/);
  assert.match(toolbar, /exposureEighthStops === 0/);
  assert.match(toolbar, /const ev = Number\(eighthStops\) \/ 8/);

  assert.match(factory, /activeTicketId/);
  assert.match(factory, /currentSourceArtifactId/);
  assert.match(factory, /currentMaskArtifactId/);
  assert.match(factory, /loadMaskedExposureInputs/);
  assert.doesNotMatch(factory, /fetch\(|provider|billing|credits/i);
});

test('Masked Exposure UI preserves accepted Selection refinement controls', async () => {
  const toolbar = await readFile('src/components/editor/SelectionToolbar.jsx', 'utf8');
  for (const required of [
    'Brush Hardness',
    'onOpen',
    'onClose',
    'onNudgeShape',
    'Apply Rectangle',
    'Apply Lasso',
  ]) assert.ok(toolbar.includes(required), `Selection regression: missing ${required}`);
});

test('Masked Exposure browser factory cannot load or hash identities outside its active Core ticket', async () => {
  const factory = await readFile('src/application/createMaskedExposure.ts', 'utf8');
  assert.match(factory, /Masked Exposure source identity does not match the active request/);
  assert.match(factory, /Masked Exposure MASK identity does not match the active request/);
  assert.match(factory, /Masked Exposure SHA-256 requested for an artifact outside the active ticket inputs/);
  assert.match(factory, /requires distinct canonical source and MASK identities/);
});
