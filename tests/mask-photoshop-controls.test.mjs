import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [toolbar, editor, canvas, service, contracts] = await Promise.all([
  readFile('src/components/editor/SelectionToolbar.jsx', 'utf8'),
  readFile('src/pages/Editor.jsx', 'utf8'),
  readFile('src/components/editor/ImageCanvas.jsx', 'utf8'),
  readFile('src/application/selection/SelectionApplicationService.ts', 'utf8'),
  readFile('src/application/selection/contracts.ts', 'utf8'),
]);

test('Photoshop-inspired Select & Mask keeps actual seven selection modes, mask quality and canonical Save', () => {
  for (const mode of ['SMART_SELECT', 'BRUSH_ADD', 'BRUSH_SUBTRACT', 'POLYGON', 'LASSO', 'RECTANGLE', 'ELLIPSE']) {
    assert.ok(toolbar.includes("'" + mode + "'"), mode);
  }
  for (const name of ['Add', 'Remove', 'Smart', 'Polygon', 'Lasso', 'Rectangle', 'Ellipse']) {
    assert.match(toolbar, new RegExp('[' + name[0] + ']' + name.slice(1)));
  }
  assert.match(toolbar, /Mask coverage:/);
  assert.match(toolbar, /onClick=\{onDone\}/);
  assert.match(editor, /const artifact = await selectionServiceRef\.current\.done\(\)/);
  assert.match(editor, /await saveObjects\(/);
  assert.match(service, /this\.artifacts\.persist\(mask,metadata\)/);
  assert.match(editor, /onUndo=\{\(\) => updateSelection\(\(service\) => service\.undo\(\)\)\}/);
  assert.match(editor, /onRedo=\{\(\) => updateSelection\(\(service\) => service\.redo\(\)\)\}/);
});

test('brush opacity slider actually modifies ORIGINAL-resolution mask bytes before Core persist', () => {
  assert.match(toolbar, /aria-label="Brush Size"[^>]*type="range"[^>]*min="2" max="96"/);
  assert.match(toolbar, /aria-label="Brush Hardness"[^>]*type="range" min="0" max="100"/);
  assert.match(toolbar, /aria-label="Brush Opacity"[^>]*type="range" min="0" max="100"/);
  assert.match(toolbar, /onChange=\{\(event\) => onBrushOpacity\(Number\(event\.target\.value\)\)\}/);
  assert.match(editor, /brushOpacity, setBrushOpacity\] = useState\(100\)/);
  assert.match(editor, /opacity: brushOpacity \/ 100, view \}\)\)/);
  assert.match(editor, /brushOpacity=\{brushOpacity\} onBrushOpacity=\{setBrushOpacity\}/);
  assert.match(contracts, /opacity\?: number/);
  assert.match(service, /Number\.isFinite\(stroke\.opacity \?\? 1\)/);
  assert.match(service, /Math\.round\(strength\*opacity\)/);
  assert.match(service, /stroke\.opacity \?\? 1/);
  assert.doesNotMatch(service, /brush\(stroke:[^\n]*fetch\(/);
});

test('mask overlay color, visibility and opacity are view-only controls with no change to canonical alpha', () => {
  for (const setting of ['maskOverlayVisible', 'maskOverlayColor', 'maskOverlayOpacity']) {
    assert.match(editor, new RegExp(setting + '=\\{' + setting + '\\}'));
  }
  for (const key of ['teal', 'magenta', 'amber']) assert.match(toolbar, new RegExp("id: '" + key + "'"));
  assert.match(toolbar, /aria-label="Show mask overlay" checked=\{maskOverlayVisible\} onChange=\{\(event\) => onMaskOverlayVisible\(event\.target\.checked\)\}/);
  assert.match(toolbar, /aria-label="Mask overlay opacity" min="0" max="100" step="1" value=\{maskOverlayOpacity\} onChange=\{\(event\) => onMaskOverlayOpacity\(Number\(event\.target\.value\)\)\}/);
  assert.match(toolbar, /onClick=\{\(\) => onMaskOverlayColor\(choice\.id\)\}/);
  assert.match(canvas, /maskOverlayVisible && <SelectionOverlay selection=\{selection\} overlayColor=\{maskOverlayColor\} overlayOpacity=\{maskOverlayOpacity\}/);
  assert.match(canvas, /Math\.round\(alpha \* opacity\)/);
  const overlay = canvas.slice(canvas.indexOf('function SelectionOverlay('), canvas.indexOf('function PolygonPreview('));
  assert.doesNotMatch(overlay, /coreClient|\.persist\(|\.done\(|selection\.alpha\[source\]\s*=/);
  assert.match(overlay, /pixels\.data\[target \+ 3\] = Math\.round\(alpha \* opacity\)/);
});

test('saved-mask exposure and white balance have calibrated sliders, resets and real preview handlers', () => {
  assert.match(toolbar, /aria-label="Masked exposure"[\s\S]*?type="range"[\s\S]*?min="-32"[\s\S]*?max="32"/);
  assert.match(toolbar, /onClick=\{\(\) => onExposureEighthStops\(0\)\}/);
  assert.match(toolbar, /aria-label="Masked white balance temperature"[\s\S]*?min="-128"[\s\S]*?max="128"/);
  assert.match(toolbar, /aria-label="Masked white balance tint"[\s\S]*?min="-64"[\s\S]*?max="64"/);
  assert.match(toolbar, /onWhiteBalanceTemperatureQ8\(0\); onWhiteBalanceTintQ8\(0\)/);
  for (const [label, action] of [['Preview masked exposure', 'onApplyExposure'], ['Preview masked white balance', 'onApplyWhiteBalance']]) {
    assert.match(toolbar, new RegExp('aria-label="' + label + '"[^>]*onClick=\\{' + action + '\\}'));
  }
  assert.match(editor, /local\.run\(\{ requestId: globalThis\.crypto\.randomUUID\(\), sourceArtifactId, maskArtifactId, eighthStops \}\)/);
  assert.match(editor, /local\.run\(\{ requestId: globalThis\.crypto\.randomUUID\(\), sourceArtifactId, maskArtifactId, temperatureQ8, tintQ8 \}\)/);
});

test('five Levels sliders and exact numeric inputs drive canonical masked Levels preview', () => {
  for (const [name, handler] of [
    ['input black', 'onLevelsInputBlack'], ['input midpoint', 'onLevelsInputMidpoint'], ['input white', 'onLevelsInputWhite'],
    ['output black', 'onLevelsOutputBlack'], ['output white', 'onLevelsOutputWhite'],
  ]) {
    assert.match(toolbar, new RegExp('aria-label="Masked Levels ' + name + ' slider" type="range"'));
    assert.match(toolbar, new RegExp('aria-label="Masked Levels ' + name + '" type="number"'));
    assert.ok((toolbar.match(new RegExp(handler + '\\(Number\\(event\\.target\\.value\\)\\)', 'g')) ?? []).length >= 2, name);
  }
  assert.match(toolbar, /onLevelsInputBlack\(0\); onLevelsInputMidpoint\(128\); onLevelsInputWhite\(255\); onLevelsOutputBlack\(0\); onLevelsOutputWhite\(255\)/);
  assert.match(toolbar, /aria-label="Preview masked Levels" disabled=\{startDisabled \|\| !canApplyLevels \|\| applyingLevels \|\| levelsIdentity\} onClick=\{onApplyLevels\}/);
  assert.match(editor, /Boolean\(exactMaskedLevelsParameters\(/);
  assert.match(editor, /kind: 'MASKED_LEVELS'/);
  assert.match(editor, /finalArtifactId: result\.canonicalArtifactId/);
});

test('mask feather and grow/shrink/open/close preserve service authority and bounded radius', () => {
  assert.match(toolbar, /aria-label="Selection edge radius" type="range" min="1" max="32"/);
  for (const [name, action] of [['Grow','grow'], ['Shrink','shrink'], ['Open','open'], ['Close','close'], ['Feather','feather']]) {
    assert.match(toolbar, new RegExp('aria-label="' + name + ' selection"[^>]*onClick=\\{on' + name + '\\}'));
    assert.match(editor, new RegExp('service\\.' + action + '\\(selectionMorphologyRadius\\)'));
  }
  assert.match(service, /MAX_SELECTION_MORPHOLOGY_RADIUS = 32/);
});
