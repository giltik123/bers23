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
test('Editor selection morphology stays service-bound and exposes bounded accessible controls', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const toolbar = await readFile('src/components/editor/SelectionToolbar.jsx', 'utf8');
  assert.match(editor, /selectionMorphologyRadius, setSelectionMorphologyRadius\] = useState\(2\)/);
  assert.match(editor, /onGrow=\{\(\) => updateSelection\(\(service\) => service\.grow\(selectionMorphologyRadius\)\)\}/);
  assert.match(editor, /onShrink=\{\(\) => updateSelection\(\(service\) => service\.shrink\(selectionMorphologyRadius\)\)\}/);
  assert.match(editor, /onOpen=\{\(\) => updateSelection\(\(service\) => service\.open\(selectionMorphologyRadius\)\)\}/);
  assert.match(editor, /onClose=\{\(\) => updateSelection\(\(service\) => service\.close\(selectionMorphologyRadius\)\)\}/);
  assert.match(editor, /onFeather=\{\(\) => updateSelection\(\(service\) => service\.feather\(selectionMorphologyRadius\)\)\}/);
  assert.match(toolbar, /aria-label="Selection edge radius"[^>]*min="1" max="32"/);
  assert.match(toolbar, /aria-label="Grow selection" disabled=\{busy \|\| !editable\}/);
  assert.match(toolbar, /aria-label="Shrink selection" disabled=\{busy \|\| !editable\}/);
  assert.match(toolbar, /aria-label="Open selection" disabled=\{busy \|\| !editable\}/);
  assert.match(toolbar, /aria-label="Close selection" disabled=\{busy \|\| !editable\}/);
  assert.match(toolbar, /aria-label="Feather selection" disabled=\{busy \|\| !editable\}/);
});

test('Editor polygon selection keeps raster authority in SelectionApplicationService and preview SVG-only', async () => {
  const [editor, toolbar, canvas] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/components/editor/ImageCanvas.jsx', 'utf8'),
  ]);
  assert.match(editor, /polygonComposition, setPolygonComposition\] = useState\('REPLACE'\)/);
  assert.match(editor, /service\.polygonVertex\(\{ displayPoint: point, view \}\)/);
  assert.match(editor, /service\.applyPolygon\(polygonComposition\)/);
  assert.match(editor, /service\.clearPolygon\(\)/);
  assert.match(toolbar, /\['POLYGON', 'Polygon'\]/);
  assert.match(toolbar, /aria-label="Polygon composition"/);
  assert.match(toolbar, /aria-label="Apply polygon selection"/);
  assert.match(toolbar, /aria-label="Clear polygon vertices"/);
  const previewStart = canvas.indexOf('function PolygonPreview');
  const previewEnd = canvas.indexOf('function CropOverlay', previewStart);
  assert(previewStart >= 0 && previewEnd > previewStart);
  const preview = canvas.slice(previewStart, previewEnd);
  assert.match(preview, /<svg/);
  assert.match(preview, /<polyline/);
  assert.doesNotMatch(preview, /getContext|putImageData|fetch\(|coreClient|persist/);
});

test('Editor lasso captures pointer path but reuses deterministic polygon raster authority', async () => {
  const [editor, toolbar, canvas] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/components/editor/ImageCanvas.jsx', 'utf8'),
  ]);
  assert.match(editor, /selection\.mode === 'LASSO'/);
  assert.match(editor, /phase === 'down'\) setSelection\(service\.lassoStart\(\{ displayPoint: point, view \}\)\)/);
  assert.match(editor, /phase === 'move'\) setSelection\(service\.lassoVertex\(\{ displayPoint: point, view \}\)\)/);
  assert.match(editor, /phase === 'up'\) setSelection\(service\.lassoVertex\(\{ displayPoint: point, view \}, true\)\)/);
  assert.match(editor, /phase === 'cancel'\) setSelection\(service\.clearLasso\(\)\)/);
  assert.match(editor, /service\.applyLasso\(polygonComposition\)/);
  assert.match(editor, /service\.clearLasso\(\)/);
  assert.match(toolbar, /\['LASSO', 'Lasso'\]/);
  assert.match(toolbar, /aria-label="Lasso composition"/);
  assert.match(toolbar, /aria-label="Apply lasso selection"/);
  assert.match(toolbar, /aria-label="Clear lasso points"/);
  assert.match(toolbar, /\{selection\.warning\}/);
  assert.match(canvas, /selection\?\.mode !== 'POLYGON' && selection\?\.mode !== 'LASSO'/);
  assert.match(canvas, /onPointerMove=\{pointer\('move'\)\}/);
  assert.match(canvas, /onPointerCancel=\{pointer\('cancel'\)\}/);
  assert.match(canvas, /interactive \? 'touch-none' : ''/);
  const previewStart = canvas.indexOf('function PolygonPreview');
  const previewEnd = canvas.indexOf('function CropOverlay', previewStart);
  const preview = canvas.slice(previewStart, previewEnd);
  assert.doesNotMatch(preview, /getContext|putImageData|fetch\(|coreClient|persist/);
});

test('Editor rectangle and ellipse keep raster authority in SelectionApplicationService with SVG-only preview', async () => {
  const [editor, toolbar, canvas] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/components/editor/ImageCanvas.jsx', 'utf8'),
  ]);
  assert.match(editor, /selection\.mode === 'RECTANGLE' \|\| selection\.mode === 'ELLIPSE'/);
  assert.match(editor, /service\.shapeStart\(\{ displayPoint: point, view \}\)/);
  assert.match(editor, /service\.shapeVertex\(\{ displayPoint: point, view \}\)/);
  assert.match(editor, /service\.shapeHandle\(\{ handle, displayPoint: point, view \}\)/);
  assert.match(editor, /service\.nudgeShape\(deltaX, deltaY\)/);
  assert.match(editor, /service\.applyShape\(polygonComposition\)/);
  assert.match(editor, /onShapeHandlePointer=\{selectionShapeHandlePointer\}/);
  assert.match(toolbar, /\['RECTANGLE', 'Rectangle'\]/);
  assert.match(toolbar, /\['ELLIPSE', 'Ellipse'\]/);
  assert.match(toolbar, /aria-label="Shape composition"/);
  assert.match(toolbar, /aria-label="Shape keyboard nudging"/);
  assert.match(toolbar, /event\.shiftKey \? 10 : 1/);
  assert.match(toolbar, /Arrow keys move 1px · Shift\+Arrow 10px/);
  const start = canvas.indexOf('function ShapePreview');
  const end = canvas.indexOf('function CropOverlay', start);
  assert(start >= 0 && end > start);
  const preview = canvas.slice(start, end);
  assert.match(preview, /<rect/);
  assert.match(preview, /<ellipse/);
  for (const handle of ["['NW', x, y, 'northwest']", "['NE', x + width, y, 'northeast']", "['SW', x, y + height, 'southwest']", "['SE', x + width, y + height, 'southeast']"]) {
    assert.equal(preview.includes(handle), true, handle);
  }
  assert.equal(preview.includes('aria-label={`Resize selection from ${label} handle`}'), true);
  assert.match(preview, /onPointerDown=\{pointer\(handle, 'down'\)\}/);
  assert.match(preview, /onPointerMove=\{pointer\(handle, 'move'\)\}/);
  assert.match(preview, /onPointerUp=\{pointer\(handle, 'up'\)\}/);
  assert.doesNotMatch(preview, /getContext|putImageData|fetch\(|coreClient|persist/);
});

test('Editor Smart Select completion cannot resurrect a cancelled Selection service', async () => {
  const [editor, service] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/application/selection/SelectionApplicationService.ts', 'utf8'),
  ]);
  assert.match(service, /Promise<SelectionDraftSnapshot \| undefined>/);
  assert.match(service, /if \(this\.#draft !== d\) return undefined/);
  assert.match(editor, /const next = await service\.smartPoint/);
  assert.match(editor, /if \(next && selectionServiceRef\.current === service\) setSelection\(next\)/);
  assert.match(editor, /selectionServiceRef\.current\.cancel\(\); selectionServiceRef\.current = null; setSelection\(null\);/);
});

test('Editor selection keyboard history and mode state are explicit without hijacking form inputs', async () => {
  const [editor, toolbar] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
  ]);
  assert.match(editor, /handleSelectionHistoryShortcut/);
  assert.match(editor, /event\.ctrlKey \|\| event\.metaKey/);
  assert.match(editor, /target\?\.isContentEditable \|\| tag === 'INPUT' \|\| tag === 'TEXTAREA' \|\| tag === 'SELECT'/);
  assert.match(editor, /selection\.state === 'DOWNLOADING' \|\| selection\.state === 'LOADING' \|\| selection\.state === 'SELECTING'/);
  assert.match(editor, /key === 'z' && event\.shiftKey/);
  assert.match(editor, /key === 'y' && !event\.shiftKey/);
  assert.match(editor, /window\.addEventListener\('keydown', handleSelectionHistoryShortcut\)/);
  assert.match(editor, /window\.removeEventListener\('keydown', handleSelectionHistoryShortcut\)/);

  assert.match(toolbar, /aria-pressed=\{selection\.mode === id\}/);
  assert.match(toolbar, /aria-label="Undo selection edit" aria-keyshortcuts="Control\+Z Meta\+Z"/);
  assert.match(toolbar, /aria-label="Redo selection edit" aria-keyshortcuts="Control\+Shift\+Z Meta\+Shift\+Z Control\+Y"/);
  assert.match(toolbar, /aria-label="Brush Size" aria-valuetext=\{\`\$\{brushSize\} pixels\`\}/);
  assert.match(toolbar, /\{brushSize\}px/);
});

test('Editor selection brush hardness is explicit and quality warnings are user-visible', async () => {
  const [editor, toolbar] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
  ]);

  assert.match(editor, /brushHardness, setBrushHardness\] = useState\(75\)/);
  assert.match(editor, /hardness: brushHardness \/ 100/);
  assert.doesNotMatch(editor, /hardness:\s*\.75/);
  assert.match(editor, /brushHardness=\{brushHardness\} onBrushHardness=\{setBrushHardness\}/);

  assert.match(toolbar, /aria-label="Brush Hardness"[^>]*min="0" max="100"/);
  assert.match(toolbar, /disabled=\{busy \|\| \(selection\.mode !== 'BRUSH_ADD' && selection\.mode !== 'BRUSH_SUBTRACT'\)\}/);
  assert.match(toolbar, /Selection is empty\. Add pixels before Done\./);
  assert.match(toolbar, /Selection is extremely small\. Zoom in and verify the mask before Done\./);
  assert.match(toolbar, /Selection covers almost the entire image\. Verify the mask before Done\./);
});

test('Editor Masked Exposure uses exact eighth-stops and remains preview-before-Accept', async () => {
  const [editor, toolbar, application] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/application/createMaskedExposure.ts', 'utf8'),
  ]);

  assert.match(editor, /createMaskedExposure/);
  assert.match(editor, /exposureEighthStops, setExposureEighthStops\] = useState\(8\)/);
  assert.match(editor, /const maskedExposureInFlightRef = useRef\(false\)/);
  assert.match(editor, /if \(maskedExposureInFlightRef\.current \|\| maskedWhiteBalanceInFlightRef\.current \|\| maskedLevelsInFlightRef\.current \|\| orthogonalTransformInFlightRef\.current\) return/);
  assert.match(editor, /maskedExposureInFlightRef\.current = true/);
  assert.match(editor, /maskedExposureInFlightRef\.current = false/);
  assert.match(editor, /const eighthStops = Number\.isSafeInteger\(retryContext\?\.eighthStops\) \? retryContext\.eighthStops : exposureEighthStops/);
  assert.match(editor, /eighthStops < -32 \|\| eighthStops > 32 \|\| eighthStops === 0/);
  assert.match(editor, /local\.run\(\{ requestId: globalThis\.crypto\.randomUUID\(\), sourceArtifactId, maskArtifactId, eighthStops \}\)/);
  assert.match(editor, /kind: 'MASKED_EXPOSURE'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /context: \{ sourceArtifactId, maskArtifactId, eighthStops \}/);
  assert.match(editor, /pending\?\.kind === 'MASKED_EXPOSURE'/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.doesNotMatch(editor, /quarterStops|exposureQuarterStops/);
  assert.doesNotMatch(editor, /applyMaskedExposure[\s\S]{0,900}(persistFinal|issueStoredFinal|acceptFinal)/);

  assert.match(toolbar, /aria-label="Masked exposure"/);
  assert.match(toolbar, /min="-32"/);
  assert.match(toolbar, /max="32"/);
  assert.match(toolbar, /step="1"/);
  assert.match(toolbar, /const ev = eighthStops \/ 8/);
  assert.match(toolbar, /aria-label="Preview masked exposure"/);
  assert.doesNotMatch(toolbar, /quarterStops|\/ 4/);

  assert.match(application, /prepareMaskedExposure/);
  assert.match(application, /loadMaskedExposureInputs/);
  assert.match(application, /uploadMaskedExposureImage/);
  assert.match(application, /submitMaskedExposure/);
  assert.doesNotMatch(application, /persistFinal|acceptFinal|pushEdit/);
});

test('Editor Masked White Balance uses exact signed Q8 controls and remains preview-before-Accept', async () => {
  const [editor, toolbar, application] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/application/createMaskedWhiteBalance.ts', 'utf8'),
  ]);

  assert.match(editor, /createMaskedWhiteBalance/);
  assert.match(editor, /whiteBalanceTemperatureQ8, setWhiteBalanceTemperatureQ8\] = useState\(64\)/);
  assert.match(editor, /whiteBalanceTintQ8, setWhiteBalanceTintQ8\] = useState\(0\)/);
  assert.match(editor, /const maskedWhiteBalanceInFlightRef = useRef\(false\)/);
  assert.match(editor, /if \(maskedExposureInFlightRef\.current \|\| maskedWhiteBalanceInFlightRef\.current \|\| maskedLevelsInFlightRef\.current \|\| orthogonalTransformInFlightRef\.current\) return/);
  assert.match(editor, /maskedWhiteBalanceInFlightRef\.current = true/);
  assert.match(editor, /maskedWhiteBalanceInFlightRef\.current = false/);
  assert.match(editor, /temperatureQ8 < -128 \|\| temperatureQ8 > 128/);
  assert.match(editor, /tintQ8 < -64 \|\| tintQ8 > 64/);
  assert.match(editor, /temperatureQ8 === 0 && tintQ8 === 0/);
  assert.match(editor, /local\.run\(\{ requestId: globalThis\.crypto\.randomUUID\(\), sourceArtifactId, maskArtifactId, temperatureQ8, tintQ8 \}\)/);
  assert.match(editor, /kind: 'MASKED_WHITE_BALANCE'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /context: \{ sourceArtifactId, maskArtifactId, temperatureQ8, tintQ8 \}/);
  assert.match(editor, /pending\?\.kind === 'MASKED_WHITE_BALANCE'/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.doesNotMatch(editor, /applyMaskedWhiteBalance[\s\S]{0,1200}(persistFinal|issueStoredFinal|acceptFinal)/);

  assert.match(toolbar, /aria-label="Masked white balance temperature"/);
  assert.match(toolbar, /min="-128"/);
  assert.match(toolbar, /max="128"/);
  assert.match(toolbar, /aria-label="Masked white balance tint"/);
  assert.match(toolbar, /min="-64"/);
  assert.match(toolbar, /max="64"/);
  assert.match(toolbar, /step="1"/);
  assert.match(toolbar, /aria-label="Preview masked white balance"/);
  assert.match(toolbar, /formatWhiteBalanceQ8/);

  assert.match(application, /prepareMaskedWhiteBalance/);
  assert.match(application, /loadMaskedWhiteBalanceInputs/);
  assert.match(application, /uploadMaskedWhiteBalanceImage/);
  assert.match(application, /submitMaskedWhiteBalance/);
  assert.doesNotMatch(application, /persistFinal|acceptFinal|pushEdit/);
});

test('Editor Masked Levels uses five exact integers and remains preview-before-Accept', async () => {
  const [editor, toolbar, application] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
    readFile('src/application/createMaskedLevels.ts', 'utf8'),
  ]);

  assert.match(editor, /createMaskedLevels/);
  assert.match(editor, /levelsInputBlack, setLevelsInputBlack\] = useState\(0\)/);
  assert.match(editor, /levelsInputMidpoint, setLevelsInputMidpoint\] = useState\(128\)/);
  assert.match(editor, /levelsInputWhite, setLevelsInputWhite\] = useState\(255\)/);
  assert.match(editor, /levelsOutputBlack, setLevelsOutputBlack\] = useState\(0\)/);
  assert.match(editor, /levelsOutputWhite, setLevelsOutputWhite\] = useState\(255\)/);
  assert.match(editor, /const maskedLevelsInFlightRef = useRef\(false\)/);
  assert.match(editor, /exactMaskedLevelsParameters/);
  assert.match(editor, /maskedLevelsInFlightRef\.current = true/);
  assert.match(editor, /maskedLevelsInFlightRef\.current = false/);
  assert.match(editor, /kind: 'MASKED_LEVELS'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /pending\?\.kind === 'MASKED_LEVELS'/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.doesNotMatch(editor, /applyMaskedLevels[\s\S]{0,1800}(persistFinal|issueStoredFinal|acceptFinal)/);

  for (const label of [
    'Masked Levels input black',
    'Masked Levels input midpoint',
    'Masked Levels input white',
    'Masked Levels output black',
    'Masked Levels output white',
    'Preview masked Levels',
  ]) assert.match(toolbar, new RegExp(`aria-label="${label}"`));
  assert.match(toolbar, /levelsIdentity/);
  assert.match(toolbar, /disabled=\{startDisabled \|\| !canApplyLevels \|\| applyingLevels \|\| levelsIdentity\}/);

  assert.match(application, /prepareMaskedLevels/);
  assert.match(application, /loadMaskedLevelsInputs/);
  assert.match(application, /uploadMaskedLevelsImage/);
  assert.match(application, /submitMaskedLevels/);
  assert.doesNotMatch(application, /persistFinal|acceptFinal|pushEdit/);
});

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
  assert.match(editor, /Math\.abs\(point\.x - anchor\.x\) \+ 1/);
  assert.match(editor, /Math\.abs\(point\.y - anchor\.y\) \+ 1/);
});
test('Editor Resize remains a Core-authorized preview then explicit canonical Accept flow', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const resize = await readFile('src/application/createResize.ts', 'utf8');
  assert.match(editor, /const local = createResize\(\{ projectId: project\.id \}\)/);
  assert.match(editor, /local\.run\(\{ requestId: globalThis\.crypto\.randomUUID\(\), sourceArtifactId, target \}\)/);
  assert.match(editor, /kind: 'RESIZE'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.doesNotMatch(editor, /resize[\s\S]{0,300}(persistFinal|issueStoredFinal|acceptFinal)/);
  assert.match(resize, /loadImage:[\s\S]*loadDelivered/);
  assert.match(resize, /prepareResize:[\s\S]*activeTicketId = prepared\.ticket\.ticketId/);
});
test('Editor Resize UI keeps exact integer bounds and explicit deterministic aspect locking', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const toolbar = await readFile('src/components/editor/ResizeToolbar.jsx', 'utf8');
  assert.match(editor, /function exactResizeTarget\(draft\)/);
  assert.match(editor, /width > RESIZE_MAX_DIMENSION \|\| height > RESIZE_MAX_DIMENSION/);
  assert.match(editor, /width \* height > RESIZE_MAX_OUTPUT_PIXELS/);
  assert.match(editor, /function proportionalResizeDimension\(value, sourceSame, sourceOther\)/);
  assert.match(editor, /const rounded = \(numerator \* 2n \+ same\) \/ \(same \* 2n\)/);
  assert.match(toolbar, /aria-label="Resize controls"/);
  assert.match(toolbar, /aria-label="Keep resize aspect ratio"/);
  assert.match(toolbar, /aria-label=\{`Resize \$\{label\.toLowerCase\(\)\}`\}/);
  assert.match(toolbar, /max=\{RESIZE_MAX_DIMENSION\}/);
  assert.match(toolbar, /disabled=\{busy \|\| !valid\}/);
  assert.doesNotMatch(toolbar, /Math\.(round|floor|ceil)\(Number\(raw\)\)/);
});
test('Crop, Resize and Selection interactions are mutually exclusive and reset on canonical image change', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const selectionToolbar = await readFile('src/components/editor/SelectionToolbar.jsx', 'utf8');
  assert.match(editor, /setCropDraft\(null\); cropAnchorRef\.current = null; setResizeDraft\(null\); setResizeAspectLocked\(true\); \}, \[project\?\.current_image_artifact_id\]\)/);
  assert.match(editor, /startDisabled=\{cropInteractionActive \|\| resizeInteractionActive \|\| editorBusy \|\| Boolean\(pendingResult\)\}/);
  assert.match(editor, /if \(selection \|\| pendingResult \|\| editorBusy \|\| resizeInteractionActive \|\| !project\?\.current_image_artifact_id\) return/);
  assert.match(editor, /if \(selection \|\| pendingResult \|\| editorBusy \|\| cropInteractionActive \|\| !project\?\.current_image_artifact_id\) return/);
  assert.match(editor, /busy=\{editorBusy \|\| Boolean\(selection\) \|\| Boolean\(pendingResult\) \|\| resizeInteractionActive\}/);
  assert.match(editor, /busy=\{editorBusy \|\| Boolean\(selection\) \|\| Boolean\(pendingResult\) \|\| cropInteractionActive\}/);
  assert.match(selectionToolbar, /disabled=\{startDisabled\} onClick=\{onStart\}/);
});
test('Pending canonical results outrank Editor navigation and geometry tools lock keyboard/history edit surfaces', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const pendingIndex = editor.indexOf('{pendingResult ? (');
  const navigationIndex = editor.indexOf('<AdaptiveNavigation items={EDITOR_TABS}');
  assert.ok(pendingIndex >= 0 && navigationIndex > pendingIndex, 'pending ResultCompare must render before normal Editor navigation');
  assert.match(editor, /if \(editorBusy \|\| cropInteractionActive \|\| resizeInteractionActive \|\| pendingResult\) return/);
  assert.match(editor, /disabled=\{editorBusy \|\| cropInteractionActive \|\| resizeInteractionActive \|\| Boolean\(pendingResult\)\}/);
  assert.match(editor, /\) : cropInteractionActive \? \(/);
  assert.match(editor, /\) : resizeInteractionActive \? \(/);
  assert.match(editor, /Adjust the crop rectangle above, then apply or cancel it before starting another edit\./);
  assert.match(editor, /Set the exact resize dimensions above, then apply or cancel them before starting another edit\./);
});

test('browser financial surfaces and legacy writers cannot mutate privileged authority', async () => {
  const subscriptionPage = await readFile('src/pages/Subscription.jsx', 'utf8');
  const settingsCard = await readFile('src/components/subscription/SubscriptionSettingsCard.jsx', 'utf8');
  const creditsBar = await readFile('src/components/editor/credits/CreditsBar.jsx', 'utf8');
  const projectService = await readFile('src/lib/projectService.js', 'utf8');
  const authority = await readFile('src/lib/financial/clientFinancialAuthority.js', 'utf8');
  const eslint = await readFile('eslint.config.js', 'utf8');

  for (const source of [subscriptionPage, settingsCard]) {
    for (const forbidden of ['subscriptionManager', 'creditsWallet', 'changePlan(', 'startTrial(', 'coreClient.entities']) assert.equal(source.includes(forbidden), false, forbidden);
  }
  assert.doesNotMatch(creditsBar, /creditsWallet|Balance:|Reserved:|After:/);
  assert.match(creditsBar, /Advisory only/);
  assert.doesNotMatch(projectService, /subscriptionValidator|subscriptionUsage/);
  assert.match(projectService, /coreClient\.projects\.createFromFile/);
  assert.match(authority, /CLIENT_FINANCIAL_AUTHORITY_DISABLED/);

  for (const file of [
    'src/lib/credits/creditsManager.js',
    'src/lib/credits/creditsReservation.js',
    'src/lib/credits/creditsWallet.js',
    'src/lib/subscriptions/subscriptionManager.js',
    'src/lib/subscriptions/subscriptionUsage.js',
  ]) {
    const source = await readFile(file, 'utf8');
    assert.match(source, /requireServerFinancialAuthority/);
    assert.doesNotMatch(source, /coreClient\.entities\.(CreditsWallet|CreditTransaction|UserSubscription|SubscriptionUsage)\.(create|update|delete|bulkCreate)/);
  }

  for (const legacyException of [
    'src/lib/credits/creditsManager.js',
    'src/lib/credits/creditsReservation.js',
    'src/lib/credits/creditsWallet.js',
    'src/lib/subscriptions/subscriptionManager.js',
    'src/lib/subscriptions/subscriptionUsage.js',
  ]) assert.equal(eslint.includes(`\"${legacyException}\"`), false, legacyException);
  assert.match(eslint, /callee\.object\.object\.object\.name='coreClient'/);
});

test('Automation Studio uses canonical C3a/C3b authority while legacy arbitrary Automation execution remains gated', async () => {
  const [page, studio, client, invocationRunner, legacyRunner] = await Promise.all([
    readFile('src/pages/AutomationStudio.jsx', 'utf8'),
    readFile('src/components/automation/CanonicalAutomationStudio.jsx', 'utf8'),
    readFile('src/api/automationClient.js', 'utf8'),
    readFile('src/application/automation/createAutomationInvocationRunner.ts', 'utf8'),
    readFile('src/lib/automation/AutomationRunner.js', 'utf8'),
  ]);
  assert.match(page, /CanonicalAutomationStudio/);
  assert.doesNotMatch(page, /automationRunner|AutomationBuilder|previewOnly/);
  assert.match(studio, /automationClient\.definitions\.list/);
  assert.match(studio, /createAutomationInvocationRunner/);
  assert.match(studio, /coreClient\.projects\.acceptFinal/);
  assert.match(studio, /loadOrCreateStartIntent/);
  assert.match(client, /X-Expected-Automation-Revision/);
  assert.match(client, /\/automation-invocations\//);
  assert.doesNotMatch(client, /\/agent\/bounded-deterministic\//);
  assert.match(invocationRunner, /policy !== 'LOCAL_ONLY'/);
  assert.match(invocationRunner, /providerCalls !== 0/);
  assert.match(invocationRunner, /paidCloudCredits !== 0/);
  assert.doesNotMatch(invocationRunner, /\/agent\/bounded-deterministic\//);
  assert.match(legacyRunner, /status:\s*'PLANNED_NOT_EXECUTED'/);
  assert.match(legacyRunner, /conditionsEvaluated:\s*Boolean\(context\)/);
  assert.match(legacyRunner, /AUTOMATION_EXECUTION_NOT_WIRED/);
  for (const forbidden of ['jobManager', 'automationHistory', "status: 'completed'", 'credits_consumed']) assert.equal(legacyRunner.includes(forbidden), false, forbidden);
});

test('Asset Library indexes canonical Project artifacts without generic asset CRUD', async () => {
  const source = await readFile('src/pages/AssetLibrary.jsx', 'utf8');
  assert.match(source, /coreClient\.projects\.list\(\)/);
  assert.match(source, /current_image_artifact_id/);
  assert.match(source, /canonical_artifact_id:\s*artifactId/);
  assert.match(source, /coreClient\.projects\.update\(asset\.project_id, \{ favorite:/);
  assert.match(source, /only indexes canonical Project artifacts/);
  for (const forbidden of [
    'coreClient.entities',
    'assetLibrary',
    'assetCollections',
    'assetFavorites',
    'assetHistory',
    'Garment.list',
    'Outfit.list',
  ]) assert.equal(source.includes(forbidden), false, forbidden);
});

test('bounded deterministic Agent uses canonical Core actions while arbitrary legacy Agent execution stays gated', async () => {
  const [editor, panel, hook, runner, queue] = await Promise.all([
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/agent/AgentPanel.jsx', 'utf8'),
    readFile('src/components/editor/agent/useBoundedAgentEditor.js', 'utf8'),
    readFile('src/application/agent/createBoundedAgentRunner.ts', 'utf8'),
    readFile('src/lib/agent/executionQueue.js', 'utf8'),
  ]);
  assert.match(panel, /AI Agent · Bounded deterministic v1/);
  assert.match(panel, /Core owns sequencing, tickets, lineage and recovery/);
  assert.match(panel, /No provider selection, paid cloud calls, generic tools or browser-owned step reordering/);
  for (const forbidden of ['aiAgent', 'executionQueue', 'taskHistory', 'onCommit', 'onRollback']) assert.equal(panel.includes(forbidden), false, forbidden);

  assert.match(editor, /useBoundedAgentEditor\(/);
  assert.match(editor, /state=\{boundedAgent\.state\}/);
  assert.match(editor, /onStart=\{boundedAgent\.start\}/);
  assert.match(editor, /onRetry=\{boundedAgent\.retry\}/);
  assert.match(editor, /onCancel=\{boundedAgent\.cancel\}/);
  assert.match(editor, /kind === 'BOUNDED_AGENT'/);
  assert.match(editor, /await pushEdit\(result\.finalArtifactId, used\)/);
  assert.doesNotMatch(editor, /executionQueue|agent[\s\S]{0,200}(acceptFinal|pushEdit)/i);

  assert.match(hook, /createBoundedAgentRunner/);
  assert.match(hook, /terminalImageUrl/);
  assert.match(hook, /resolveCoreResourceUrl/);
  assert.match(hook, /sourceArtifactId !== project\.current_image_artifact_id/);
  assert.match(runner, /action\.operation !== 'ORTHOGONAL_TRANSFORM' && action\.operation !== 'RESIZE'/);
  assert.match(runner, /ticket\.cost\?\.providerCalls !== 0 \|\| ticket\.cost\?\.paidCloudCredits !== 0/);
  assert.match(runner, /Bounded Agent must not prepare a second orthogonal ticket/);
  assert.match(runner, /Bounded Agent must not finalize through standalone Resize transport/);

  assert.match(queue, /AGENT_EXECUTION_NOT_WIRED/);
  assert.match(queue, /async run\(\)/);
  for (const forbidden of ['editingEngine', 'recipeEngine', 'aiPlanner', 'taskHistory', 'result.image_url']) assert.equal(queue.includes(forbidden), false, forbidden);
});

test('Virtual Try-On cannot use the legacy direct provider execution path', async () => {
  const panel = await readFile('src/components/editor/outfits/TryOnPanel.jsx', 'utf8');
  const engine = await readFile('src/lib/tryon/tryonEngine.js', 'utf8');
  assert.match(panel, /Canonical Try-On execution is not enabled yet/);
  assert.match(panel, /legacy browser FASHN execution path is disabled/);
  for (const forbidden of ['tryonEngine', 'ResultCompare', 'onCommit', 'garmentManager', 'outfitManager']) assert.equal(panel.includes(forbidden), false, forbidden);
  assert.match(engine, /TRYON_EXECUTION_NOT_WIRED/);
  assert.match(engine, /retryable = false/);
  for (const forbidden of ['fashnProvider', 'imagePipeline', 'qualityValidator', 'composer', 'resultManager', 'original_image_url', 'currentUrl']) assert.equal(engine.includes(forbidden), false, forbidden);
});

test('recipe templates remain canonical Prompt inputs while multi-step execution stays locked down', async () => {
  const panel = await readFile('src/components/editor/recipes/RecipePanel.jsx', 'utf8');
  const detail = await readFile('src/components/editor/recipes/RecipeDetail.jsx', 'utf8');
  const studio = await readFile('src/components/editor/creative/CreativeStudioPanel.jsx', 'utf8');
  const summary = await readFile('src/components/editor/creative/CreativeStrategySummary.jsx', 'utf8');
  const adapter = await readFile('src/application/creative/LegacyRecipeExecutionAdapter.js', 'utf8');

  assert.match(panel, /Individual recipes remain available as prompt templates/);
  for (const forbidden of ['RECIPE_CHAINS', 'onRunChain', 'Apply strategy']) assert.equal(panel.includes(forbidden), false, forbidden);
  assert.match(detail, /onUse\(prompt, recipe\)/);
  assert.match(detail, /recipeEngine\.compile/);
  assert.doesNotMatch(studio, /onApply|strategy_applied/);
  assert.doesNotMatch(summary, /Apply strategy|onApply/);
  assert.match(summary, /Preview only/);
  assert.match(adapter, /RECIPE_CHAIN_EXECUTION_NOT_WIRED/);
  assert.match(adapter, /retryable = false/);
  for (const forbidden of ['chainRunner', 'creditsEngine', 'editingEngine']) assert.equal(adapter.includes(forbidden), false, forbidden);
});

test('Editor removes dead recipe-chain execution wiring and uses planner advisory credits', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  for (const forbidden of [
    'legacyRecipeExecutionAdapter',
    'ChainProgress',
    'chainState',
    'runChain',
    'onRunChain=',
    'onApply={runChain}',
    'creditsCalculator',
  ]) assert.equal(editor.includes(forbidden), false, forbidden);
  assert.match(editor, /<CreditsBar estimate=\{!pendingResult && plan\?\.status === 'ready' \? \(plan\.credits\?\.credits \?\? 0\) : 0\} \/>/);
  assert.doesNotMatch(editor, /jobManager\.submit|segmentationService\.start/);
});

test('zero-object projects expose canonical whole-image Prompt without an unbacked detector', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const bar = await readFile('src/components/editor/InstructionBar.jsx', 'utf8');
  const resolver = await readFile('src/lib/planner/objectResolver.js', 'utf8');

  assert.match(editor, /\{objects\.length === 0 && !pendingResult && !cropInteractionActive && !resizeInteractionActive && \(/);
  assert.match(editor, /Automatic object detection is not available in this version\./);
  assert.doesNotMatch(editor, /segmentationService|jobManager\.submit|onClick=\{detect\}/);
  assert.match(editor, /<AdaptiveNavigation items=\{EDITOR_TABS\} active=\{editTab\}/);
  assert.match(editor, /onChange=\{\(next\) => \{\s*if \(!tryOnActive && !agentActive\) setEditTab\(next\);\s*\}\}/);
  assert.match(editor, /allowWholeImage=\{objects\.length === 0\}/);
  assert.match(editor, /applying=\{editorBusy \|\| committing\}/);
  assert.doesNotMatch(editor, /\) : objects\.length === 0 \? \(/);
  // A user-approved AI Studio scope is strict; zero-object legacy mode
  // preserves old whole-image selection semantics when there is no scope.
  assert.match(editor, /selectedObjectIds: guardedScope\s*\?\s*guardedScope\.selectedObjectIds\s*:\s*objects\.filter\(\(object\) => object\.selected\)\.map\(\(object\) => object\.id\)/);
  assert.match(editor, /maskArtifactIds: guardedScope\s*\?\s*guardedScope\.maskArtifactIds\s*:\s*objects\.filter\(\(object\) => object\.selected && object\.mask_artifact_id\)\.map\(\(object\) => object\.mask_artifact_id\)/);
  assert.match(editor, /bindGenerativeScope\(/);

  assert.match(bar, /allowWholeImage = false/);
  assert.match(bar, /const canEdit = Boolean\(selectedObject \|\| allowWholeImage\)/);
  assert.match(bar, /const wholeImage = !selectedObject && allowWholeImage/);
  assert.match(bar, /disabled=\{!canEdit \|\| applying\}/);
  assert.match(bar, /disabled=\{!canEdit \|\| !instruction\.trim\(\) \|\| applying\}/);
  assert.match(bar, /e\.key === 'Enter' && canEdit && !applying && instruction\.trim\(\) && onApply\(\)/);
  assert.match(bar, /Editing the whole image/);

  assert.match(resolver, /if \(intent\?\.scope === 'whole_image'\)/);
  assert.match(resolver, /strategy: 'whole_image', needsClarification: false/);
});
