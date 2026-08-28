import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

test('Editor single-edit path crosses only an application boundary', async () => { const source = await readFile('src/pages/Editor.jsx', 'utf8'); for (const forbidden of ['editingEngine', 'creditsEngine', 'reveProvider', 'providers/fal', 'provider-runtime', 'server/transactions']) assert.equal(source.includes(forbidden), false, forbidden); assert.match(source, /creativeEditApplicationService\.execute/); });
test('application edit adapter sends no server-authoritative fields', async () => { const source = await readFile('src/application/creative/CreativeEditApplicationService.js', 'utf8'); assert.match(source, /coreClient\.creative\.execute/); for (const forbidden of ['walletBalance', 'reservationStatus', 'authorizationResult', 'retryCount', 'FAL_KEY', 'REVE_KEY']) assert.equal(source.includes(forbidden), false); });
test('browser source imports no transaction internals and canonical edit boundaries contain no provider secrets', async () => { for (const file of await collect('src')) { const source = await readFile(file, 'utf8'); assert.equal(/from ['"][^'"]*server\/transactions/.test(source), false, file); } for (const file of ['src/pages/Editor.jsx', 'src/application/creative/CreativeEditApplicationService.js', 'src/api/coreClient.js']) { const source = await readFile(file, 'utf8'); assert.equal(/\b(FAL_KEY|REVE_KEY|FASHN_KEY)\b/.test(source), false, file); } });
async function collect(directory) { const entries = await readdir(directory, { withFileTypes: true }); return (await Promise.all(entries.map((entry) => entry.isDirectory() ? collect(join(directory, entry.name)) : [join(directory, entry.name)]))).flat().filter((file) => /\.(js|jsx|ts|tsx)$/.test(file)); }
test('Editor selection uses the Core mask port and never manufactures a mask UUID', async () => { const source = await readFile('src/pages/Editor.jsx', 'utf8'); assert.match(source, /new CoreMaskArtifactPort\(project\.id\)/); assert.doesNotMatch(source, /persist:\s*async[\s\S]*randomUUID/); assert.match(source, /mask_artifact_id: artifact\.id/); });
test('Core mask port sends exact alpha and maps the server artifact identity', async () => { const source = await readFile('src/application/selection/CoreMaskArtifactPort.js', 'utf8'); assert.match(source, /alpha: mask\.alpha/); assert.match(source, /id: response\.artifactId/); assert.match(source, /ALPHA_8_LOSSLESS/); });
test('Editor invert stays bound to SelectionApplicationService and the toolbar exposes only stable editable states', async () => { const editor = await readFile('src/pages/Editor.jsx', 'utf8'); const toolbar = await readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'); assert.match(editor, /onInvert=\{\(\) => updateSelection\(\(service\) => service\.invert\(\)\)\}/); assert.match(toolbar, /aria-label="Invert selection"/); assert.match(toolbar, /const editable = selection\.state === 'SELECTED' \|\| selection\.state === 'REFINING'/); assert.match(toolbar, /disabled=\{!editable\} onClick=\{onInvert\}/); assert.match(toolbar, /const canDone = editable && !selection\.quality\?\.empty/); assert.match(toolbar, /disabled=\{!canDone\} onClick=\{onDone\}/); });
test('Editor Crop remains a Core-authorized preview then explicit canonical Accept flow', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const crop = await readFile('src/application/createCrop.ts', 'utf8');
  assert.match(editor, /const local = createCrop\(\{ projectId: project\.id \}\)/);
  assert.match(editor, /local\.run\(\{ requestId: globalThis\.crypto\.randomUUID\(\), sourceArtifactId, rect \}\)/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /kind: 'CROP'/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.doesNotMatch(editor, /crop[\s\S]{0,300}(persistFinal|issueStoredFinal|acceptFinal)/);
  assert.match(crop, /loadImage:[\s\S]*loadDelivered/);
  assert.match(crop, /prepareCrop:[\s\S]*activeTicketId = prepared\.ticket\.ticketId/);
});
test('Editor Crop UI is exact, accessible and fail-closed instead of clamping invalid numeric drafts', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const toolbar = await readFile('src/components/editor/CropToolbar.jsx', 'utf8');
  const canvas = await readFile('src/components/editor/ImageCanvas.jsx', 'utf8');
  assert.match(editor, /function exactCropRect\(draft, sourceWidth, sourceHeight\)/);
  assert.match(editor, /\[x, y, width, height\]\.every\(Number\.isSafeInteger\)/);
  assert.match(editor, /x \+ width > sourceWidth \|\| y \+ height > sourceHeight/);
  assert.match(toolbar, /aria-label="Crop controls"/);
  for (const field of ["{ key: 'x', label: 'X' }", "{ key: 'y', label: 'Y' }", "{ key: 'width', label: 'Width' }", "{ key: 'height', label: 'Height' }"]) assert.equal(toolbar.includes(field), true, field);
  assert.match(toolbar, /aria-label=\{`Crop \$\{label\.toLowerCase\(\)\}`\}/);
  assert.match(toolbar, /disabled=\{busy \|\| !valid\}/);
  assert.doesNotMatch(toolbar, /Math\.(round|floor|ceil)\(Number\(raw\)\)/);
  assert.match(canvas, /Math\.floor\(\(event\.clientX - rect\.left\) \/ rect\.width \* cropSource\.sourceWidth\)/);
  assert.match(canvas, /Math\.abs\(point\.x - anchor\.x\) \+ 1/);
});
test('Crop interaction cannot overlap selection and resets when canonical current image changes', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const selectionToolbar = await readFile('src/components/editor/SelectionToolbar.jsx', 'utf8');
  assert.match(editor, /setCropDraft\(null\); cropAnchorRef\.current = null; \}, \[project\?\.current_image_artifact_id\]\)/);
  assert.match(editor, /startDisabled=\{cropInteractionActive \|\| editorBusy \|\| Boolean\(pendingResult\)\}/);
  assert.match(editor, /if \(selection \|\| pendingResult \|\| editorBusy \|\| !project\?\.current_image_artifact_id\) return/);
  assert.match(selectionToolbar, /disabled=\{startDisabled\} onClick=\{onStart\}/);
});
