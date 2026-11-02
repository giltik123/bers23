import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import englishCreative from '../src/lib/i18n/locales/en/creative.js';
import russian from '../src/lib/i18n/locales/ru/index.js';
import { projectReadyCreativeOutfits } from '../src/application/creative/creativeOutfitContext.js';

const OUTFIT_ID = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

function outfit(overrides = {}) {
  return {
    id: OUTFIT_ID,
    name: 'Studio capsule',
    style: 'smart_casual',
    season: 'all_season',
    occasion: 'business',
    status: 'ACTIVE',
    revision: 3,
    referenceReadiness: 'REFERENCES_READY',
    entries: [{ entryId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', garmentId: 'cccccccc-cccc-cccc-cccc-cccccccccccc' }],
    ...overrides,
  };
}

test('Creative Studio receives only active Outfit references that are ready for use', () => {
  const result = projectReadyCreativeOutfits([
    outfit(),
    outfit({ id: 'dddddddd-dddd-dddd-dddd-dddddddddddd', status: 'ARCHIVED' }),
    outfit({ id: 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', referenceReadiness: 'EMPTY', entries: [] }),
    outfit({ id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', referenceReadiness: 'GARMENT_UNAVAILABLE' }),
    outfit({ id: '11111111-1111-1111-1111-111111111111', referenceReadiness: 'ROLE_REVIEW_REQUIRED' }),
  ]);

  assert.deepEqual(result, [{
    id: OUTFIT_ID,
    name: 'Studio capsule',
    style: 'smart_casual',
    season: 'all_season',
    occasion: 'business',
    entryCount: 1,
  }]);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result[0]), true);
  assert.deepEqual(Object.keys(result[0]), ['id', 'name', 'style', 'season', 'occasion', 'entryCount']);
  assert.equal(result[0].entries, undefined);
  assert.equal(result[0].garmentId, undefined);
});

test('Creative Studio Outfit projection rejects malformed canonical ready references', () => {
  assert.throws(() => projectReadyCreativeOutfits(null), /must be an array/u);
  assert.throws(() => projectReadyCreativeOutfits([null]), /must be an object/u);
  assert.throws(() => projectReadyCreativeOutfits([outfit({ id: 'not-a-uuid' })]), /canonical UUID/u);
  assert.throws(() => projectReadyCreativeOutfits([outfit({ entries: [] })]), /1 to 32/u);
  assert.throws(() => projectReadyCreativeOutfits([outfit({ style: undefined })]), /style/u);
});

test('Creative Studio reads Outfit data only through the canonical read port and remains advisory', async () => {
  const panel = await readFile('src/components/editor/creative/CreativeStudioPanel.jsx', 'utf8');
  const summary = await readFile('src/components/editor/creative/CreativeStrategySummary.jsx', 'utf8');
  const workflow = await readFile('.github/workflows/fashion-canonical-outfit-ui-f3c.yml', 'utf8');

  assert.match(panel, /coreClient\.fashion\.outfits\.list\(\)/u);
  assert.match(panel, /projectReadyCreativeOutfits/u);
  assert.match(panel, /outfits: strategyOutfits/u);
  assert.match(panel, /outfitsStatus/u);
  assert.match(panel, /setOutfitsRetry/u);
  assert.match(panel, /useAuth\(\)/u);
  assert.match(panel, /principalKey/u);
  assert.match(panel, /isAuthenticated/u);
  assert.match(panel, /isLoadingAuth/u);
  assert.match(panel, /setSaved\(null\)/u);
  assert.match(panel, /setSavedStrategy\(null\)/u);
  assert.match(panel, /historyStrategy/u);
  assert.match(panel, /recommendations: Object\.freeze\(\{[\s\S]*outfits: EMPTY_OUTFITS/u);
  assert.match(panel, /creativeHistory\.save\(historyStrategy\)/u);
  assert.doesNotMatch(panel, /creativeHistory\.save\(strategy\)/u);
  assert.match(panel, /if \(!active\) return/u);
  assert.match(summary, /strategy\.recommendations\?\.outfits/u);
  assert.match(summary, /outfitsStatus === 'error'/u);
  assert.match(summary, /onRetryOutfits/u);

  for (const forbidden of [
    'outfitManager',
    'coreClient.entities',
    'coreClient.fashion.wardrobe',
    'coreClient.fashion.garments',
    'coreClient.fashion.collections',
    'coreClient.fashion.checkTryOnReadiness',
    'coreClient.fashion.admitManualParametricRepresentation',
    'coreClient.fashion.outfits.get',
    'coreClient.creative.execute',
    'Core.UploadFile',
    'integrations.Core',
    'compositeContinuations',
    'functions.invoke',
    'coreClient.fashion.outfits.create',
    'coreClient.fashion.outfits.updateMetadata',
    'coreClient.fashion.outfits.archive',
    'coreClient.fashion.outfits.restore',
    'coreClient.fashion.outfits.addEntry',
    'coreClient.fashion.outfits.removeEntry',
    'coreClient.fashion.outfits.setEntryRole',
    'coreClient.fashion.outfits.reorderEntries',
    'FASHN',
    'billing',
    'credits',
    'onCommit',
    'onRollback',
    'fetch(',
  ]) {
    assert.equal(panel.includes(forbidden), false, 'Creative Studio must not use ' + forbidden);
  }
  assert.match(workflow, /coreClient\.fashion\.outfits\.list/u);
  assert.ok(workflow.includes("coreClient\\.fashion\\.outfits\\.(create"));
});

test('Creative Studio Outfit status and summary strings have Russian and English translations', () => {
  const keys = [
    'description',
    'outfitContextHint',
    'strategyPreview',
    'strategyDescription',
    'estimatedCredits',
    'estimatedTime',
    'previewOnly',
    'saveStrategy',
    'favoriteStrategy',
    'availableOutfits',
    'loadingOutfits',
    'outfitsLoadFailed',
    'noReadyOutfits',
    'outfitItemCount',
  ];
  for (const key of keys) {
    assert.equal(typeof englishCreative[key], 'string', 'English creative.' + key);
    assert.equal(typeof russian.creative?.[key], 'string', 'Russian creative.' + key);
    assert.ok(englishCreative[key].trim());
    assert.ok(russian.creative[key].trim());
  }
});
