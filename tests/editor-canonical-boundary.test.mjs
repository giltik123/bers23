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
test('Pending canonical results outrank empty-object CTA and geometry tools lock keyboard/history edit surfaces', async () => {
  const editor = await readFile('src/pages/Editor.jsx', 'utf8');
  const pendingIndex = editor.indexOf('{pendingResult ? (');
  const emptyIndex = editor.indexOf(') : objects.length === 0 ? (');
  assert.ok(pendingIndex >= 0 && emptyIndex > pendingIndex, 'pending ResultCompare must render before empty-object detection CTA');
  assert.match(editor, /if \(editorBusy \|\| detecting \|\| cropInteractionActive \|\| resizeInteractionActive \|\| pendingResult\) return/);
  assert.match(editor, /disabled=\{editorBusy \|\| detecting \|\| cropInteractionActive \|\| resizeInteractionActive \|\| Boolean\(pendingResult\)\}/);
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

test('Automation Studio remains preview-only until durable server execution authority exists', async () => {
  const page = await readFile('src/pages/AutomationStudio.jsx', 'utf8');
  const runner = await readFile('src/lib/automation/AutomationRunner.js', 'utf8');
  for (const forbidden of ['coreClient', 'automationManager', 'automationHistory', 'AutomationHistoryPanel']) assert.equal(page.includes(forbidden), false, forbidden);
  assert.match(page, /automationRunner\.plan\(/);
  assert.doesNotMatch(page, /automationRunner\.run\(/);
  assert.match(page, /previewOnly/);
  assert.match(runner, /status:\s*'PLANNED_NOT_EXECUTED'/);
  assert.match(runner, /conditionsEvaluated:\s*Boolean\(context\)/);
  assert.match(runner, /AUTOMATION_EXECUTION_NOT_WIRED/);
  for (const forbidden of ['jobManager', 'automationHistory', "status: 'completed'", 'credits_consumed']) assert.equal(runner.includes(forbidden), false, forbidden);
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

test('Agent image execution stays gated until canonical composite execution exists', async () => {
  const panel = await readFile('src/components/editor/agent/AgentPanel.jsx', 'utf8');
  const queue = await readFile('src/lib/agent/executionQueue.js', 'utf8');
  assert.match(panel, /Canonical Agent execution is not enabled yet/);
  assert.match(panel, /Use the Prompt tab for canonical single edits/);
  for (const forbidden of ['aiAgent', 'executionQueue', 'taskHistory', 'onCommit', 'onRollback']) assert.equal(panel.includes(forbidden), false, forbidden);
  assert.match(queue, /AGENT_EXECUTION_NOT_WIRED/);
  assert.match(queue, /async run\(\)/);
  for (const forbidden of ['editingEngine', 'recipeEngine', 'aiPlanner', 'taskHistory', 'result.image_url']) assert.equal(queue.includes(forbidden), false, forbidden);
});
