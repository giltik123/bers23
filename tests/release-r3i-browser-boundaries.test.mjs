import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HARNESS = 'scripts/test-release-r3i-browser-e2e.mjs';
const WORKFLOW = '.github/workflows/release-r3a-browser-e2e.yml';

test('R3i product UI binds Outfit create add and visible reorder to revisioned Managed Outfit authority', async () => {
  const [panel, model, client] = await Promise.all([
    readFile('src/components/editor/outfits/OutfitPanel.jsx', 'utf8'),
    readFile('src/application/fashion/canonicalOutfitViewModel.js', 'utf8'),
    readFile('src/api/managedOutfitClient.js', 'utf8'),
  ]);

  assert.match(panel, /aria-label="Canonical Outfit builder"/);
  assert.match(panel, /placeholder="New outfit"/);
  assert.match(panel, /model\.create\(\{ name: newName \}\)/);
  assert.match(panel, /aria-label="Garment to add"/);
  assert.match(panel, /model\.addEntry\(outfit, addGarmentId, addRole\)/);
  assert.match(panel, /aria-label=\{`Move \$\{garment\?\.name \|\| entry\.garmentId\} up`\}/);
  assert.match(panel, /model\.moveEntry\(outfit, entry\.entryId, -1\)/);
  assert.match(panel, /model\.moveEntry\(outfit, entry\.entryId, 1\)/);
  assert.match(panel, /reconcileQuietly/);
  assert.doesNotMatch(panel, /setTimeout|retry.*mutation/i);

  assert.match(model, /return outfits\.create\(canonicalCreate\(input\)\)/);
  assert.match(model, /return outfits\.addEntry\(current\.id, current\.revision, Object\.freeze\(input\)\)/);
  assert.match(model, /const order = outfit\.entries\.map\(\(entry\) => entry\.entryId\)/);
  assert.match(model, /return outfits\.reorderEntries\(current\.id, current\.revision, Object\.freeze\(order\)\)/);
  assert.match(model, /entryId is not part of the Outfit snapshot/);

  assert.match(client, /const PREFIX = '\/wardrobe\/outfits'/);
  assert.match(client, /const EXPECTED_REVISION_HEADER = 'X-Expected-Outfit-Revision'/);
  assert.match(client, /reorderEntries: async \(outfitId, expectedRevision, entryIds\)/);
  assert.match(client, /entry_ids: canonicalEntryOrder\(entryIds\)/);
  assert.match(client, /jsonWithRevision\('POST', Object\.freeze\(\{ entry_ids:/);
  assert.doesNotMatch(client, /fetch\(|coreClient\.entities|UploadFile|FASHN|provider|Billing|cloud/);
});

test('R3i browser uses built SPA/Core, system Chrome and visible Fashion/Outfit mutation controls while PostgreSQL stays SELECT-only', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /path\.resolve\('dist'\)/);
  assert.match(harness, /path\.resolve\('dist-server\/server\.mjs'\)/);
  assert.match(harness, /NODE_ENV: 'production'/);
  assert.match(harness, /PostgresAuthStore/);
  assert.match(harness, /chromium\.launch\(\{ channel: 'chrome', headless: true \}\)/);
  assert.match(harness, /getByRole\('button', \{ name: 'Fashion', exact: true \}\)/);
  assert.match(harness, /getByRole\('button', \{ name: 'Outfits', exact: true \}\)/);
  assert.match(harness, /getByRole\('region', \{ name: 'Canonical Outfit builder', exact: true \}\)/);
  assert.match(harness, /getByPlaceholder\('New outfit'\)/);
  assert.match(harness, /getByLabel\('Garment to add'\)/);
  assert.match(harness, /Move \$\{pantsName\} up/);

  const sqlOperations = [...harness.matchAll(/pool\.query\(\s*`([^`]+)`/g)]
    .map(match => match[1].trim().split(/\s+/)[0].toUpperCase());
  assert.deepEqual([...new Set(sqlOperations)], ['SELECT'], 'direct PostgreSQL access in R3i evidence must be read-only');
  assert.doesNotMatch(harness, /page\.route|browserContext\.route|context\.route|route\.abort|route\.fulfill|route\.continue/);
  assert.doesNotMatch(harness, /InMemory|FakeProject|MockProject|FakeOutfit|MockOutfit|FakeGarment|MockGarment/);
});

test('R3i binds exact Outfit revision sequence and complete stable entry-ID permutation to durable positions', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /createdOutfit\.revision, 1/);
  assert.match(harness, /reference_readiness, 'EMPTY'/);
  assert.match(harness, /headerValue\('x-expected-outfit-revision'\), '1'/);
  assert.match(harness, /outfitWithJacket\.revision, 2/);
  assert.match(harness, /headerValue\('x-expected-outfit-revision'\), '2'/);
  assert.match(harness, /outfitWithBoth\.revision, 3/);
  assert.match(harness, /headerValue\('x-expected-outfit-revision'\), '3'/);
  assert.match(harness, /entry_ids: \[pantsEntryId, jacketEntryId\]/);
  assert.match(harness, /visible reorder must submit the complete stable entry-ID permutation/);
  assert.match(harness, /reordered\.revision, 4/);
  assert.match(harness, /reordered\.entries\.map\(entry => entry\.entry_id\), \[pantsEntryId, jacketEntryId\]/);
  assert.match(harness, /reordered\.entries\.map\(entry => entry\.garment_id\), \[pants\.id, jacket\.id\]/);
  assert.match(harness, /canonical_outfits/);
  assert.match(harness, /canonical_outfit_entries/);
  assert.match(harness, /Number\(durableOutfit\.outfit\.revision\), 4/);
  assert.match(harness, /durableOutfit\.entries\.map\(entry => entry\.entry_id\), \[pantsEntryId, jacketEntryId\]/);
  assert.match(harness, /Outfit remount must reconstruct canonical server-owned entry order/);
  assert.match(harness, /R3I_BROWSER_OUTFIT_REORDER_ACCEPTED/);

  assert.match(harness, /diagnostics\.fashionMutations, \[/);
  assert.match(harness, /'POST \/api\/core\/wardrobe\/outfits'/);
  assert.match(harness, /`POST \/api\/core\/wardrobe\/outfits\/\$\{outfitId\}\/entries`/);
  assert.match(harness, /`POST \/api\/core\/wardrobe\/outfits\/\$\{outfitId\}\/reorder`/);
  assert.match(harness, /providerCalls, 0/);
  assert.match(harness, /diagnostics\.localExecutionRequests, \[\]/);
  assert.match(harness, /diagnostics\.creativeRequests, \[\]/);
  assert.match(harness, /diagnostics\.financialRequests, \[\]/);
  assert.match(harness, /diagnostics\.maskRequests, \[\]/);
  assert.match(harness, /diagnostics\.genericAssetRequests, \[\]/);
  assert.match(harness, /diagnostics\.projectMutations, \[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests, \[\]/);
  assert.doesNotMatch(harness, /financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3 release workflow makes R3i cumulative evidence an exact-head merge gate', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');

  assert.match(workflow, /CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /src\/api\/managedOutfitClient\.js/);
  assert.match(workflow, /src\/components\/editor\/outfits\/\*\*/);
  assert.match(workflow, /tests\/release-r3i-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /scripts\/test-release-r3i-browser-e2e\.mjs/);
  assert.match(workflow, /R3i Outfit stable-identity reorder journey/);
  assert.match(workflow, /R3I_BROWSER_OUTFIT_REORDER_ACCEPTED/);
});
