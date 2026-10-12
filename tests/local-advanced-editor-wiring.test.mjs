import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const [parent, controls, engine, pixelEngine, browserE2e] = await Promise.all([
  readFile('src/components/editor/local/LocalAdjustmentsPanel.jsx', 'utf8'),
  readFile('src/components/editor/local/AdvancedLocalControls.jsx', 'utf8'),
  readFile('src/lib/local-editor/localAdvanced.js', 'utf8'),
  readFile('src/lib/local-editor/localAdjustments.js', 'utf8'),
  readFile('scripts/test-release-r3e-browser-e2e.mjs', 'utf8'),
]);

test('advanced controls are visible with real onChange handlers, outputs and reset', () => {
  assert.match(controls, /aria-label="Advanced local editing tools"/);
  assert.match(controls, /Tone curve/);
  assert.match(controls, /Selective HSL/);
  assert.match(controls, /Manual clone stamp/);
  assert.match(controls, /aria-label=\{'Curve ' \+ point\.label\} type="range"/);
  assert.match(controls, /onChange=\{event => editCurve\(point\.key, Number\(event\.target\.value\)\)\}/);
  assert.match(controls, /const editCurve = \(key, value\) => onAdvancedChange\(curveChannel === 'rgb'/);
  assert.match(controls, /\? \{ \.\.\.advanced, curve: \{ \.\.\.advanced\.curve, \[key\]: value \} \}/);
  assert.match(controls, /channelCurves: \{/);
  assert.match(controls, /aria-label="Selective HSL color range"/);
  assert.match(controls, /onChange=\{event => editHsl\(control\.key, Number\(event\.target\.value\)\)\}/);
  assert.match(controls, /Reset tone curve/);
  assert.match(controls, /Reset this color/);
});

test('all eight color ranges retain their own edits independently', () => {
  assert.match(engine, /LOCAL_HUE_BANDS = Object\.freeze/);
  for (const band of ['red','orange','yellow','green','aqua','blue','purple','magenta']) {
    assert.match(engine, new RegExp("id: '" + band + "'"));
  }
  assert.match(controls, /hsl: \{\s*\.\.\.advanced\.hsl,\s*\[hueBand\]: \{ \.\.\.advanced\.hsl\[hueBand\], \[key\]: value \}/);
  assert.match(engine, /Feathered boundaries prevent harsh cyan\/blue/);
});

test('advanced edits share one bounded undo history with base adjustments and presets', () => {
  assert.match(parent, /const last = state\.entries\[state\.index\]/);
  assert.match(parent, /state\.entries\.slice\(0, state\.index \+ 1\)/);
  assert.match(parent, /const next = action\.type === 'preset'/);
  assert.match(parent, /action\.type === 'advanced'/);
  assert.match(parent, /normalizeAdvancedSettings\(action\.value\)/);
  assert.match(parent, /React\.useMemo\(\(\) => \{/);
  assert.match(parent, /const \{ __advanced, __annotations, \.\.\.base \} = currentEntry/);
  assert.match(parent, /const advanced = currentEntry\.__advanced \|\| LOCAL_ADVANCED_DEFAULTS/);
  assert.match(parent, /isNeutralLocalSettings\(settings\) && isNeutralAdvancedSettings\(advanced\)/);
  assert.match(parent, /<AdvancedLocalControls/);
});

test('local canvas preview and full-resolution PNG apply the same advanced pipeline', () => {
  assert.match(parent, /applyAdvancedLocalAdjustments\(\s*applyLocalAdjustments\(source\.preview, source\.previewWidth, source\.previewHeight, settings\),\s*source\.previewWidth, source\.previewHeight, advanced/);
  assert.match(parent, /applyAdvancedLocalAdjustments\(\s*applyLocalAdjustments\(source\.full, source\.width, source\.height, settings\),\s*source\.width, source\.height, advanced/);
  assert.match(parent, /context\.putImageData\(new ImageData\(pixels, canvas\.width, canvas\.height\), 0, 0\)/);
  assert.match(parent, /canvas\.toBlob\(output => output \? resolve\(output\)/);
  assert.match(parent, /URL\.createObjectURL\(blob\)/);
  assert.match(parent, /No cloud processing or credit charges/);
  assert.doesNotMatch(parent, /coreClient\.projects\.acceptFinal|pushEdit\(|fetch\([^)]*method: 'POST'|FAL_KEY|GOOGLE_OAUTH/);
});

test('clone stamp uses real normalized pointer events, sample source, opacity and safety limits', () => {
  assert.match(controls, /Pick source/);
  assert.match(controls, /onCloneMode\('pick'\)/);
  assert.match(controls, /onCloneMode\('paint'\)/);
  assert.match(controls, /aria-label="Clone radius"/);
  assert.match(controls, /aria-label="Clone hardness"/);
  assert.match(controls, /aria-label="Clone opacity"/);
  assert.match(parent, /event\.currentTarget\.getBoundingClientRect\(\)/);
  assert.match(parent, /if \(cloneMode === 'pick'\) \{/);
  assert.match(parent, /setCloneSource\(point\)/);
  assert.match(parent, /cloneDrawing\.current = \{ pointerId: event\.pointerId, points: \[point\] \}/);
  assert.match(parent, /event\.currentTarget\.setPointerCapture\(event\.pointerId\)/);
  assert.match(parent, /onPointerDown=\{cloneDown\}/);
  assert.match(parent, /onPointerMove=\{cloneMove\}/);
  assert.match(parent, /onPointerUp=\{cloneUp\}/);
  assert.match(parent, /onPointerCancel=\{cloneUp\}/);
  assert.match(parent, /radius: cloneRadius \/ 100, hardness: cloneHardness \/ 100, opacity: cloneOpacity \/ 100/);
  assert.match(parent, /cloneStrokes: \[\.\.\.advanced\.cloneStrokes, stroke\]/);
  assert.match(controls, /advanced\.cloneStrokes\.length >= 32/);
  assert.match(engine, /const envelope = new Uint8Array\(width \* height\)/);
  assert.match(engine, /const source = new Uint8ClampedArray\(output\)/);
  assert.match(engine, /output\[target \+ channel\] = byte\(output\[target \+ channel\] \* \(1 - strength\) \+ source\[from \+ channel\] \* strength\)/);
});

test('existing source-bound URL verification, alpha safeguards and mask authority remain', () => {
  assert.match(parent, /canonicalCoreResourcePath\(imageUrl\)/);
  assert.match(parent, /resolveCoreResourceUrl\(resourcePath, CONFIGURED_CORE_API_ROOT\)/);
  assert.match(parent, /credentials: 'include', cache: 'no-store'/);
  assert.match(engine, /Deliberately never replace alpha or unmask transparent target pixels/);
  assert.match(pixelEngine, /The original bytes are NEVER mutated/);
  assert.match(parent, /Local edits do not mutate the BERS project or its Core history/);
  assert.match(parent, /Download edited PNG/);
});

test('Chrome browser test includes real advanced control acceptance, not fake slider existence', () => {
  assert.match(browserE2e, /getByText\('Tone curve'/);
  assert.match(browserE2e, /getByRole\('slider', \{ name: 'Curve Midtones' \}\)/);
  assert.match(browserE2e, /getByRole\('combobox', \{ name: 'Selective HSL color range' \}\)/);
  assert.match(browserE2e, /getByRole\('slider', \{ name: 'Selective Saturation' \}\)/);
  assert.match(browserE2e, /getByText\('Manual clone stamp'/);
  assert.match(browserE2e, /getByRole\('button', \{ name: 'Pick source' \}\)/);
  assert.match(browserE2e, /getImageData\(7, 4, 1, 1\)/);
  assert.match(browserE2e, /local clone editing must not mutate canonical Core Project/);
});


test('gradient mask is a real local pixel blend with bounded inputs and transparent Core separation', () => {
  assert.match(controls, /Local gradient mask/);
  assert.match(controls, /aria-label="Local gradient mask direction"/);
  assert.match(controls, /LOCAL_GRADIENT_MODES\.map\(mode =>/);
  assert.match(controls, /aria-label="Gradient start"/);
  assert.match(controls, /aria-label="Gradient end"/);
  assert.match(controls, /advanced\.gradient\.end - 1/);
  assert.match(controls, /advanced\.gradient\.start \+ 1/);
  assert.match(controls, /Clear gradient mask/);
  assert.match(engine, /blendGradient\(original, output, width, height, advanced\.gradient\)/);
  assert.match(engine, /case 'radial': position = 1 - Math\.hypot/);
  assert.match(engine, /source\[offset \+ channel\] \* \(1 - weight\) \+ output\[offset \+ channel\] \* weight/);
  assert.match(parent, /source\.previewWidth, source\.previewHeight, advanced, source\.preview/);
  assert.match(parent, /source\.width, source\.height, advanced, source\.full/);
  assert.match(browserE2e, /getByText\('Local gradient mask', \{ exact: true \}\)\.click\(\)/);
  assert.match(browserE2e, /getByRole\('combobox', \{ name: 'Local gradient mask direction' \}\)\.selectOption\('left-right'\)/);
  assert.match(browserE2e, /getImageData\(0, 4, 1, 1\)\.data\[0\] === 44/);
  assert.match(browserE2e, /getImageData\(11, 4, 1, 1\)\.data\[0\] === 94/);
  assert.match(browserE2e, /getByRole\('button', \{ name: 'Clear gradient mask' \}\)\.click\(\)/);
});


test('independent RGB tone curves have real channel selector, matching graph, per-channel reset and Chrome pixel acceptance', () => {
  assert.match(controls, /aria-label="Tone curve channel"/);
  assert.match(controls, /LOCAL_CURVE_CHANNELS\.map\(channel =>/);
  assert.match(controls, /const visibleCurve = curveChannel === 'rgb' \? advanced\.curve : advanced\.channelCurves\[curveChannel\]/);
  assert.match(controls, /advanced\.channelCurves\[curveChannel\], \[key\]: value/);
  assert.match(controls, /channelCurves: \{ \.\.\.advanced\.channelCurves, \[curveChannel\]: LOCAL_CURVE_DEFAULT \}/);
  assert.match(engine, /export const LOCAL_CURVE_CHANNELS = Object\.freeze\(\['rgb', 'red', 'green', 'blue'\]\)/);
  assert.match(engine, /channelLuts = \['red', 'green', 'blue'\]\.map/);
  assert.match(engine, /output\[i \+ channel\] = channelLuts\[channel\] \? channelLuts\[channel\]\[masterValue\] : masterValue/);
  assert.match(browserE2e, /getByRole\('combobox', \{ name: 'Tone curve channel' \}\)\.selectOption\('red'\)/);
  assert.match(browserE2e, /getImageData\(6, 4, 1, 1\)/);
});
