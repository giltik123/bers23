import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Editor defers mask UI and the local selection runtime until explicit user initiation', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const lines = editor.split(String.fromCharCode(10));
  const deferredPanels = ['SelectionToolbar', 'AutoSceneMasksPanel', 'ObjectPanel', 'EditorStatusBar', 'SegmentationProgress', 'PipelineStatusBar', 'SceneMemoryPanel', 'WorkspaceBar', 'JobQueuePanel'];
  for (const moduleName of deferredPanels) {
    assert.ok(editor.includes(`const ${moduleName} = lazy(() => import(`), `${moduleName} must be a lazy boundary`);
    assert.ok(!lines.some((line) => line.trimStart().startsWith('import ') && line.includes(moduleName)), `${moduleName} must not be eagerly imported`);
  }
  for (const moduleName of ['SelectionApplicationService', 'createSelectionSegmentation', 'CoreMaskArtifactPort']) {
    assert.ok(!lines.some((line) => line.trimStart().startsWith('import ') && line.includes(moduleName)), `${moduleName} must load only after selection intent`);
  }
  assert.ok(editor.includes('const [maskToolsOpen, setMaskToolsOpen] = useState(false)'));
  assert.ok(editor.includes('const startSelection = async () =>'));
  assert.ok(editor.includes("import('@/application/createSelectionSegmentation')"));
  assert.ok(editor.includes('startGeneration !== selectionStartGenerationRef.current'));
  assert.ok(editor.includes('currentProject?.id !== requestedProjectId'));
  assert.ok(editor.includes('projectId: requestedProjectId,'), 'selection segmentation must use the captured canonical Project ID');
  assert.ok(editor.includes('currentProject?.current_image_artifact_id !== imageArtifactId'));
  assert.ok(editor.includes('onStart={startSelection}'));
  assert.ok(editor.includes('onManualSelect={startSelection}'));
  assert.ok(!editor.includes('startSelection()'), 'selection must not start automatically during render or mount');
  assert.ok(editor.includes("privacyMode: 'LOCAL_ONLY'"));
  for (const prop of ['exposureEighthStops={exposureEighthStops}', 'whiteBalanceTemperatureQ8={whiteBalanceTemperatureQ8}', 'levelsInputBlack={levelsInputBlack}', 'onApplyLevels={() => applyMaskedLevels()}']) {
    assert.ok(editor.includes(prop), `existing mask adjustment control must remain wired: ${prop}`);
  }
  assert.ok(editor.includes('editorBusy = localEditorBusy || tryOnActive || agentActive || selectionStarting'));
  assert.ok(editor.includes('{PRODUCTION_MASK_UI_ENABLED && !cropInteractionActive && !resizeInteractionActive && <SelectionToolbar'));
  assert.ok(editor.includes('{PRODUCTION_MASK_UI_ENABLED && <AutoSceneMasksPanel'));
  const toolbarTag = editor.indexOf('<SelectionToolbar');
  const autoSceneTag = editor.indexOf('<AutoSceneMasksPanel');
  const objectTag = editor.indexOf('<ObjectPanel');
  assert.ok(editor.slice(editor.lastIndexOf('<Suspense', toolbarTag), toolbarTag).includes('fallback'));
  assert.ok(editor.slice(editor.lastIndexOf('<Suspense', autoSceneTag), autoSceneTag).includes('fallback'));
  assert.ok(editor.slice(editor.lastIndexOf('<Suspense', objectTag), objectTag).includes('fallback'));
  assert.ok(editor.includes('new CoreMaskArtifactPort(project.id)'));
});

test('Editor defers secondary activity panels until first explicit open and scopes Job Center to the active Project', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  assert.ok(editor.includes('const [additionalToolsOpened, setAdditionalToolsOpened] = useState(false)'));
  assert.ok(editor.includes('onToggle={(event) => { if (event.currentTarget.open) setAdditionalToolsOpened(true); }}'));
  const detailsStart = editor.indexOf('<details className="rounded-2xl border border-border/60 p-3 text-sm" aria-label="Additional editor tools and status"');
  const detailsEnd = editor.indexOf('</details>', detailsStart);
  assert.ok(detailsStart >= 0 && detailsEnd > detailsStart);
  const details = editor.slice(detailsStart, detailsEnd);
  assert.ok(details.includes('{additionalToolsOpened && ('));
  assert.ok(details.indexOf('{additionalToolsOpened && (') < details.indexOf('<JobQueuePanel'));
  assert.ok(details.includes('<JobQueuePanel projectId={project.id} />'));
});
