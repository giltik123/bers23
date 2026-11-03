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


test('runner copy is complete in English and Russian and Voice remains advisory', async () => {
  const [panel, englishSource, russianSource] = await Promise.all([
    readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8'),
    readFile('src/lib/i18n/locales/en/index.js', 'utf8'),
    readFile('src/lib/i18n/locales/ru/index.js', 'utf8'),
  ]);
  const extractFashionUi = (source) => {
    const match = source.match(/fashionUi:\s*(\{[\s\S]*?\n\}),\n  assetUi:/);
    assert.ok(match, 'fashionUi catalog exists');
    return JSON.parse(match[1]);
  };
  const english = extractFashionUi(englishSource);
  const russian = extractFashionUi(russianSource);
  const keys = [
    'runnerLabel', 'voiceQuery', 'voiceQuerySingleMatch', 'voiceQueryNoMatches',
    'voiceQueryManualChoice', 'voiceQueryNoAutoRun', 'entryNotReady',
    'manualContourSourceUnavailable', 'manualContourSaveUnavailable',
    'manualBodyAnchorsSaveUnavailable', 'manualContourInvalid', 'manualBodyAnchorsInvalid',
  ];
  for (const key of keys) {
    assert.equal(typeof english[key], 'string', `English fashionUi.${key}`);
    assert.equal(typeof russian[key], 'string', `Russian fashionUi.${key}`);
    assert.ok(english[key].trim(), `English fashionUi.${key} is non-empty`);
    assert.ok(russian[key].trim(), `Russian fashionUi.${key} is non-empty`);
  }
  for (const [locale, catalog, categories] of [
    ['English', english, ['one', 'other']],
    ['Russian', russian, ['one', 'few', 'many', 'other']],
  ]) {
    assert.equal(typeof catalog.voiceQueryMatches, 'object', `${locale} voiceQueryMatches`);
    for (const category of categories) {
      assert.equal(typeof catalog.voiceQueryMatches[category], 'string', `${locale} voiceQueryMatches.${category}`);
      assert.ok(catalog.voiceQueryMatches[category].trim(), `${locale} voiceQueryMatches.${category} is non-empty`);
    }
  }

  for (const key of [
    ...keys,
    'tryOn', 'tryOnHint', 'reloadOutfits', 'chooseOutfit', 'chooseGarment',
    'outfitForTryon', 'garmentForTryon', 'locked', 'refreshError', 'selectionInvalid',
  ]) assert.ok(panel.includes(`fashionUi.${key}`), `runner uses fashionUi.${key}`);

  assert.match(panel, /plural\('fashionUi\.voiceQueryMatches', voiceMatches\.length\)/);
  assert.match(panel, /role="status" aria-live="polite"/);
  assert.match(panel, /aria-label=\{t\('fashionUi\.runnerLabel'\)\}/);
  assert.match(panel, /aria-busy=\{loading\}/);
  assert.doesNotMatch(panel, /Голосовой запрос|Голосовой поиск|Try one managed garment|Choose one canonical Outfit entry|Reload Try-On Outfit choices|Choose Outfit…|Choose garment…|Locked selection:/);
  assert.doesNotMatch(panel, /cause\?\.message/);
  assert.doesNotMatch(panel, /setSelectedOutfitId\(voiceMatches/);
});
