import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('runner selects exactly one canonical Outfit entry without automatic execution', async () => {
  const panel = await readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8');
  assert.match(panel, /createCanonicalOutfitViewModel/);
  assert.match(panel, /snapshot\.outfits\.filter/);
  assert.match(panel, /entryId: selectedEntry\.entryId/);
  assert.match(panel, /outfit: selectedOutfit/);
  assert.match(panel, /projectId: project\.id/);
  assert.match(panel, /sourceArtifactId: project\.current_image_artifact_id/);
  assert.match(panel, /beforeUrl: project\.current_image_url/);
  assert.match(panel, /onInspect=\{\(\) => action\('inspect'\)\}/);
  assert.match(panel, /onRun=\{\(\) => action\('run'\)\}/);
  assert.doesNotMatch(panel, /useEffect\([^)]*onAction/);
  assert.doesNotMatch(panel, /action\('run'\)[\s\S]{0,80}useEffect/);
});

test('active host locks selection and builder identity until explicit Close/Abandon', async () => {
  const panel = await readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8');
  const inlineHostLock = /selectionLocked = busy \|\| loading \|\| Boolean\(state\?\.host\?\.active\)/.test(panel);
  const boundHostLock = /const hostActive = Boolean\(state\?\.host\?\.active\)/.test(panel)
    && /selectionLocked = busy \|\| loading \|\| hostActive/.test(panel);
  assert.ok(inlineHostLock || boundHostLock, 'selection lock must include active host authority');
  assert.match(panel, /disabled=\{selectionLocked \|\| disabled\}/);
  assert.match(panel, /onAbandon=\{onAbandon\}/);
  assert.match(panel, /onClose=\{close\}/);
  assert.match(panel, /setSelectedOutfitId\(''\)/);
  assert.match(panel, /setSelectedEntryId\(''\)/);
});

test('runner has read-only Outfit authority and no execution/provider/Project mutation capability', async () => {
  const panel = await readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8');
  for (const forbidden of [
    '.create(', '.updateMetadata(', '.archive(', '.restore(', '.addEntry(', '.removeEntry(', '.setEntryRole(', '.reorderEntries(',
    'pushEdit', 'finalizeAcceptedResult', 'createCanonicalTryOnProductRuntime', 'clientRequestId', 'ticketId',
    'representationId', 'anchorSetId', 'storageId', 'destinationMesh', 'FASHN', 'Billing', 'tryonEngine',
  ]) assert.equal(panel.includes(forbidden), false, forbidden);
  assert.match(panel, /model\.load\(\)/);
});
