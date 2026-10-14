import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const editor = await readFile('src/pages/Editor.jsx', 'utf8');
const selection = await readFile('src/components/editor/SelectionToolbar.jsx', 'utf8');

test('project canvas remains the primary surface; secondary panels require a deliberate disclosure', () => {
  const canvas = editor.indexOf('<ImageCanvas');
  const basicTools = editor.indexOf('aria-label="Image tools"');
  const prompt = editor.indexOf('<AdaptiveNavigation items={EDITOR_TABS}');
  const secondary = editor.indexOf('aria-label="Additional editor tools and status"');
  assert.ok(canvas >= 0 && basicTools > canvas && prompt > basicTools && secondary > prompt);
  assert.match(editor, /<summary[^>]*>More tools and activity<\/summary>/);
  for (const component of ['WorkspaceBar', 'JobQueuePanel', 'PipelineStatusBar', 'CreditsBar', 'SceneMemoryPanel', 'EditorStatusBar']) {
    assert.ok(editor.indexOf('<' + component, secondary) > secondary, component + ' must be in disclosed area');
  }
  assert.match(editor, /<details[^>]*>[\s\S]*?<summary[^>]*>Rotate or flip<\/summary>[\s\S]*?<OrthogonalTransformToolbar/);
  assert.match(editor, /<ResultCompare[\s\S]*?onAccept=\{acceptResult\}[\s\S]*?onDiscard=\{discardResult\}/);
});

test('unavailable Upscale candidate does not render as a permanently disabled primary action', () => {
  assert.match(editor, /\{SUPER_RESOLUTION_PRODUCTION_AVAILABLE && <Button/);
  assert.match(editor, /disabled=\{!SUPER_RESOLUTION_PRODUCTION_AVAILABLE[^}]*\}/);
  assert.match(editor, /Upscale x4 · Candidate/);
});

test('clicking an already-selected object clears selection safely', () => {
  assert.match(editor, /onSelect=\{\(obj\) => selectObject\(obj\?\.id \?\? null\)\}/);
  const handlers = editor.match(/onSelect=\{\(obj\) => selectObject\(obj\?\.id \?\? null\)\}/g) ?? [];
  assert.equal(handlers.length, 2, 'both the image canvas and the object list must support deselection');
});

test('masked exposure, white balance and levels appear only when a saved mask exists', () => {
  assert.match(editor, /hasSelectedMask=\{Boolean\(selected\?\.mask_artifact_id\)\}/);
  const noSelection = selection.slice(selection.indexOf('if (!selection) return ('), selection.indexOf('const busy ='));
  const maskGate = noSelection.indexOf('{hasSelectedMask ? (');
  const firstSlider = noSelection.indexOf('aria-label="Masked exposure"');
  assert.ok(maskGate >= 0 && firstSlider > maskGate);
  assert.match(noSelection, /<details[^>]*>[\s\S]*<summary[^>]*>Adjust selected area/);
  assert.match(noSelection, /Change a value, choose Preview, then Accept or Discard/);
  assert.match(noSelection, /aria-label="Masked exposure"[\s\S]*?onChange=\{\(event\) => onExposureEighthStops\(Number\(event\.target\.value\)\)\}/);
  assert.match(noSelection, /aria-label="Masked white balance temperature"[\s\S]*?onChange=\{\(event\) => onWhiteBalanceTemperatureQ8\(Number\(event\.target\.value\)\)\}/);
  assert.match(noSelection, /aria-label="Preview masked Levels"[^>]*onClick=\{onApplyLevels\}/);
  assert.match(noSelection, /Advanced sliders appear only when a saved mask exists/);
});

test('brush and edge controls are contextual but retain real edit callbacks', () => {
  assert.match(selection, /\{\(selection\.mode === 'BRUSH_ADD' \|\| selection\.mode === 'BRUSH_SUBTRACT'\) && <>/);
  assert.match(selection, /aria-label="Brush Size"[^>]*onChange=\{\(event\) => onBrushSize\(Number\(event\.target\.value\)\)\}/);
  assert.match(selection, /aria-label="Brush Hardness"[^>]*onChange=\{\(event\) => onBrushHardness\(Number\(event\.target\.value\)\)\}/);
  assert.match(selection, /<summary[^>]*>Refine selection edges<\/summary>/);
  for (const name of ['Grow', 'Shrink', 'Open', 'Close', 'Feather']) {
    assert.match(selection, new RegExp('aria-label="' + name + ' selection"[^>]*onClick=\\{on' + name + '\\}'));
  }
  assert.match(selection, /disabled=\{!canDone\} onClick=\{onDone\}/);
});


test('object eye controls update the actual canvas overlays, not just the list styling', async () => {
  const objectPanel = await readFile('src/components/editor/ObjectPanel.jsx', 'utf8');
  const canvas = await readFile('src/components/editor/ImageCanvas.jsx', 'utf8');
  assert.match(editor, /const \[hiddenObjectIds, setHiddenObjectIds\] = useState\(\(\) => new Set\(\)\)/);
  assert.match(editor, /const toggleHiddenObject = \(id\) => setHiddenObjectIds/);
  assert.match(editor, /hiddenObjectIds=\{hiddenObjectIds\}/);
  assert.match(editor, /hidden=\{hiddenObjectIds\} onToggleHidden=\{toggleHiddenObject\}/);
  assert.match(canvas, /objects\.filter\(\(obj\) => !hiddenObjectIds\.has\(obj\.id\)\)\.map/);
  assert.match(objectPanel, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); onToggleHidden\(obj\.id\); \}\}/);
  assert.match(objectPanel, /aria-label=\{isHidden \? "Show object overlay" : "Hide object overlay"\}/);
  assert.match(objectPanel, /onClick=\{\(\) => onSelect\(obj\.selected \? null : obj\)\}/);
  assert.match(objectPanel, /they do not edit the image/);
});
