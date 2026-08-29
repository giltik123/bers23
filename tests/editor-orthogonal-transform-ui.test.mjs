import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EDITOR = 'src/pages/Editor.jsx';
const TOOLBAR = 'src/components/editor/OrthogonalTransformToolbar.jsx';
const ADAPTER = 'src/application/createOrthogonalTransform.ts';
const IDENTITY = 'src/platform/creative/deterministic/OrthogonalTransformIdentity.js';

const MODES = Object.freeze([
  'FLIP_HORIZONTAL',
  'FLIP_VERTICAL',
  'ROTATE_90_CW',
  'ROTATE_180',
  'ROTATE_270_CW',
]);

test('Editor Rotate/Flip remains Core-authorized preview followed by explicit canonical Accept', async () => {
  const editor = await readFile(EDITOR, 'utf8');
  const adapter = await readFile(ADAPTER, 'utf8');

  assert.match(editor, /createOrthogonalTransform\(\{ projectId: project\.id \}\)/);
  assert.match(editor, /local\.run\(\{ requestId: globalThis\.crypto\.randomUUID\(\), sourceArtifactId, mode: normalizedMode \}\)/);
  assert.match(editor, /kind: 'ORTHOGONAL_TRANSFORM'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.doesNotMatch(editor, /applyOrthogonalTransform[\s\S]{0,2200}(persistFinal|issueStoredFinal|acceptFinal)/);

  assert.match(adapter, /prepareOrthogonalTransform:[\s\S]*activeTicketId = prepared\.ticket\.ticketId/);
  assert.match(adapter, /loadImage:[\s\S]*loadDelivered\(\)/);
  assert.match(adapter, /uploadOrthogonalTransformImage/);
  assert.match(adapter, /submitOrthogonalTransform/);
});

test('Rotate/Flip UI exposes only the accepted closed orthogonal-transform modes', async () => {
  const toolbar = await readFile(TOOLBAR, 'utf8');
  const identity = await readFile(IDENTITY, 'utf8');

  assert.match(toolbar, /aria-label="Rotate and flip controls"/);
  assert.match(toolbar, /ORTHOGONAL_TRANSFORM_MODES\.map\(\(mode\)/);
  assert.match(toolbar, /data-transform-mode=\{mode\}/);
  assert.match(toolbar, /Byte-exact local transform\. No interpolation or cloud call\./);

  for (const mode of MODES) {
    assert.equal(identity.includes(`'${mode}'`), true, `canonical mode missing: ${mode}`);
    assert.equal(toolbar.includes(`${mode}:`), true, `UI label missing: ${mode}`);
  }
  for (const forbidden of ['ROTATE_45', 'arbitrary angle', 'perspective', 'homography', 'affine']) {
    assert.equal(toolbar.toLowerCase().includes(forbidden.toLowerCase()), false, forbidden);
  }
});

test('Rotate/Flip is fail-closed against double submit and competing Editor interactions', async () => {
  const editor = await readFile(EDITOR, 'utf8');
  const toolbar = await readFile(TOOLBAR, 'utf8');

  assert.match(editor, /const orthogonalTransformInFlightRef = useRef\(false\)/);
  assert.match(editor, /if \(orthogonalTransformInFlightRef\.current\) return/);
  assert.match(editor, /orthogonalTransformInFlightRef\.current = true/);
  assert.match(editor, /orthogonalTransformInFlightRef\.current = false/);
  assert.match(editor, /const editorBusy = applying \|\| isolatingBackground \|\| upscaling \|\| cropping \|\| resizing \|\| Boolean\(orthogonalTransformingMode\)/);
  assert.match(editor, /if \(editorBusy \|\| detecting \|\| committing \|\| pendingResult \|\| cropInteractionActive \|\| resizeInteractionActive\) return/);
  assert.match(editor, /disabled=\{!project\.current_image_artifact_id \|\| editorBusy \|\| detecting \|\| committing \|\| Boolean\(selection\) \|\| Boolean\(pendingResult\) \|\| cropInteractionActive \|\| resizeInteractionActive\}/);
  assert.match(editor, /startDisabled=\{detecting \|\| committing \|\| cropInteractionActive \|\| resizeInteractionActive \|\| editorBusy \|\| Boolean\(pendingResult\)\}/);
  assert.match(toolbar, /const unavailable = Boolean\(disabled \|\| busy\)/);
  assert.match(toolbar, /disabled=\{unavailable\}/);
});

test('Rotate/Flip retry stays bound to the original canonical source and exact mode', async () => {
  const editor = await readFile(EDITOR, 'utf8');

  assert.match(editor, /const sourceArtifactId = retryContext\?\.sourceArtifactId \|\| project\?\.current_image_artifact_id/);
  assert.match(editor, /const beforeUrl = retryContext\?\.beforeUrl \|\| project\?\.current_image_url/);
  assert.match(editor, /context: \{ sourceArtifactId, mode: normalizedMode, beforeUrl \}/);
  assert.match(editor, /applyOrthogonalTransform\(pending\.context\?\.mode, pending\.context\)/);
});
