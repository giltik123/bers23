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
  assert.match(controls, /aria-label=\{t\('localEditorUi\.advancedTools'\)\}/);
  assert.match(controls, /t\('localEditorUi\.toneCurve'\)/);
  assert.match(controls, /t\('localEditorUi\.selectiveHsl'\)/);
  assert.match(controls, /t\('localEditorUi\.manualCloneStamp'\)/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.curvePoint', \{ label: t\('localEditorUi\.' \+ point\.labelKey\) \}\)\} type="range"/);
  assert.match(controls, /onChange=\{event => editCurve\(point\.key, Number\(event\.target\.value\)\)\}/);
  assert.match(controls, /const editCurve = \(key, value\) => onAdvancedChange\(curveChannel === 'rgb'/);
  assert.match(controls, /\? \{ \.\.\.advanced, curve: \{ \.\.\.advanced\.curve, \[key\]: value \} \}/);
  assert.match(controls, /channelCurves: \{/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.colorRange'\)\}/);
  assert.match(controls, /onChange=\{event => editHsl\(control\.key, Number\(event\.target\.value\)\)\}/);
  assert.match(controls, /t\('localEditorUi\.resetToneCurve'\)/);
  assert.match(controls, /t\('localEditorUi\.resetThisColor'\)/);
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
  assert.match(controls, /t\('localEditorUi\.pickSource'\)/);
  assert.match(controls, /onCloneMode\('pick'\)/);
  assert.match(controls, /onCloneMode\('paint'\)/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.cloneRadius'\)\}/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.cloneHardness'\)\}/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.cloneOpacity'\)\}/);
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
  assert.match(engine, /const sampled = byte\(source\[from \+ channel\] \+ toneShift\[channel\]\)/);
  assert.match(engine, /output\[target \+ channel\] = byte\(output\[target \+ channel\] \* \(1 - strength\) \+ sampled \* strength\)/);
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
  assert.match(controls, /t\('localEditorUi\.gradientMask'\)/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.direction'\)\}/);
  assert.match(controls, /LOCAL_GRADIENT_MODES\.map\(mode =>/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.startTransition'\)\}/);
  assert.match(controls, /aria-label=\{t\('localEditorUi\.endTransition'\)\}/);
  assert.match(controls, /advanced\.gradient\.end - 1/);
  assert.match(controls, /advanced\.gradient\.start \+ 1/);
  assert.match(controls, /t\('localEditorUi\.clearGradient'\)/);
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
  assert.match(controls, /aria-label=\{t\('localEditorUi\.curveChannel'\)\}/);
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


test('manual clone can select honest color-matched repair with real pixel transfer and bounded tone estimates', () => {
  assert.match(controls, /aria-label=\{t\('localEditorUi\.retouchMethod'\)\}/);
  assert.match(controls, /t\('localEditorUi\.cloneExact'\)/);
  assert.match(controls, /t\('localEditorUi\.colorMatchedRepair'\)/);
  assert.match(controls, /t\('localEditorUi\.colorMatchNote'\)/);
  assert.match(parent, /cloneBlendMode, setCloneBlendMode\] = useState\('clone'\)/);
  assert.match(parent, /blendMode: cloneBlendMode/);
  assert.match(parent, /cloneBlendMode=\{cloneBlendMode\}/);
  assert.match(parent, /onCloneBlendMode=\{setCloneBlendMode\}/);
  assert.match(engine, /function localToneOffset\(snapshot, width, height, stroke\)/);
  assert.match(engine, /if \(samples < 3\) return \[0, 0, 0\]/);
  assert.match(engine, /clamp\(Math\.round\(value \/ samples\), -96, 96\)/);
  assert.match(browserE2e, /selectOption\('color-match'\)/);
  assert.match(browserE2e, /getImageData\(8, 3, 1, 1\)/);
  assert.match(browserE2e, /color-matched repair must transfer actual neighboring tone into full-resolution PNG/);
  assert.match(browserE2e, /manual tonal retouch must not mutate Core Project/);
});


test('local editing subpanels use a complete matching RU/EN catalog without changing execution authority', async () => {
  const [annotationControls, recipeControls, englishSource, russianSource] = await Promise.all([
    readFile('src/components/editor/local/LocalAnnotationControls.jsx', 'utf8'),
    readFile('src/components/editor/local/LocalRecipeControls.jsx', 'utf8'),
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  const englishBlock = englishSource.match(/const localEditorUi = \{([\\s\\S]*?)\\n\\};/u)?.[1];
  const russianBlock = russianSource.match(/localEditorUi: \{([\\s\\S]*?)\\n  \},/u)?.[1];
  assert.ok(englishBlock && russianBlock, 'both locale catalogs must define localEditorUi');
  const catalogKeys = block => [...block.matchAll(/([A-Za-z][A-Za-z0-9-]*):/gu)].map(match => match[1]).sort();
  assert.deepEqual(catalogKeys(russianBlock), catalogKeys(englishBlock), 'every local editing key needs both locales');
  const nestedKeys = (block, name) => {
    const nested = block.match(new RegExp(name + ': \\{([^}]*)\\}', 'u'))?.[1];
    assert.ok(nested, 'localEditorUi.' + name + ' must exist');
    return [...nested.matchAll(/([A-Za-z][A-Za-z0-9-]*):/gu)].map(match => match[1]).sort();
  };
  for (const name of ['channel', 'hue', 'gradient', 'annotationTool', 'annotationColor']) {
    assert.deepEqual(nestedKeys(russianBlock, name), nestedKeys(englishBlock, name), 'localEditorUi.' + name + ' needs matching keys');
  }
  assert.match(englishBlock, /devicePrivacy: ".*unencrypted/u);
  assert.match(englishBlock, /edits are NOT automatically saved/u);
  assert.match(russianBlock, /devicePrivacy: ".*без шифрования/u);
  assert.match(russianBlock, /изменения НЕ сохраняются автоматически/u);
  const englishKeys = new Set(catalogKeys(englishBlock));
  for (const source of [controls, annotationControls, recipeControls]) {
    assert.match(source, /useTranslation/);
    assert.match(source, /localEditorUi\./);
    for (const match of source.matchAll(/t\('localEditorUi\.([A-Za-z0-9-]+)/gu)) {
      assert.ok(englishKeys.has(match[1]), 'localEditorUi.' + match[1] + ' must exist in both locales');
    }
  }
  for (const key of [
    'toneCurve', 'selectiveHsl', 'gradientMask', 'manualCloneStamp',
    'annotationSection', 'annotationTool.off', 'annotationColor.red',
    'recipeSection', 'saveRecipe', 'restoreRecipe', 'devicePrivacy',
    'recipeSaved', 'browserDraftRestored',
  ]) {
    const value = key.split('.').reduce((current, part) => current?.[part], russian.localEditorUi);
    assert.equal(typeof value, 'string', 'Russian key localEditorUi.' + key + ' must be a string');
    assert.ok(value.trim(), 'Russian key localEditorUi.' + key + ' must not be empty');
  }
  assert.match(annotationControls, /localEditorUi\.annotationTool\./);
  assert.match(recipeControls, /NOTICE_KEYS/);
  assert.doesNotMatch(annotationControls, /coreClient|acceptFinal|provider|FAL_KEY/);
  assert.doesNotMatch(recipeControls, /coreClient|acceptFinal|provider|FAL_KEY/);
});
