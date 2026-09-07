import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HARNESS = 'scripts/test-release-r3g-browser-e2e.mjs';
const WORKFLOW = '.github/workflows/release-r3a-browser-e2e.yml';

test('R3g drives visible zero-object navigation into canonical Fashion and Outfits', async () => {
  const [harness, editor, fashion, outfits, tryOnRunner, navigation] = await Promise.all([
    readFile(HARNESS, 'utf8'),
    readFile('src/pages/Editor.jsx', 'utf8'),
    readFile('src/components/editor/fashion/FashionPanel.jsx', 'utf8'),
    readFile('src/components/editor/outfits/OutfitPanel.jsx', 'utf8'),
    readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8'),
    readFile('src/components/adaptive/AdaptiveNavigation.jsx', 'utf8'),
  ]);

  assert.match(editor, /<AdaptiveNavigation items=\{EDITOR_TABS\} active=\{editTab\}/);
  assert.match(editor, /editTab === 'fashion'[\s\S]*<FashionPanel \/>/);
  assert.match(editor, /editTab === 'outfits'[\s\S]*<CanonicalTryOnRunnerPanel[\s\S]*!tryOn\.state\.host\.active && <OutfitPanel \/>/);
  assert.match(navigation, /<button key=\{item\.id\} onClick=\{\(\) => onChange\(item\.id\)\}/);
  assert.match(fashion, /aria-label="Canonical fashion wardrobe"/);
  assert.match(outfits, /aria-label="Canonical Outfit builder"/);
  assert.match(tryOnRunner, /aria-label="Canonical deterministic Try-On runner"/);

  for (const text of [
    "getByRole('button', { name: 'Prompt', exact: true })",
    "getByRole('button', { name: 'Fashion', exact: true })",
    "getByRole('button', { name: 'Outfits', exact: true })",
    "getByRole('region', { name: 'Canonical fashion wardrobe', exact: true })",
    "getByRole('region', { name: 'Canonical Outfit builder', exact: true })",
  ]) assert.equal(harness.includes(text), true, `R3g harness must drive ${text}`);

  assert.match(harness, /new canonical Project must begin with zero detected\/selected objects/);
  assert.match(harness, /Fashion\/Outfits navigation must not mutate canonical Project state or objects/);
});

test('R3g uses built SPA built production Core and PostgreSQL only as correctness oracle', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /path\.resolve\('dist'\)/);
  assert.match(harness, /path\.resolve\('dist-server\/server\.mjs'\)/);
  assert.match(harness, /NODE_ENV: 'production'/);
  assert.match(harness, /PostgresAuthStore/);
  assert.match(harness, /chromium\.launch\(\{ channel: 'chrome', headless: true \}\)/);
  assert.match(harness, /canonical_projects/);
  assert.match(harness, /canonical_project_history/);
  assert.match(harness, /canonical_mask_artifacts/);
  assert.match(harness, /local_execution_tickets/);
  assert.match(harness, /p\.objects/);

  const sqlMutations = [...harness.matchAll(/pool\.query\(\s*`([^`]+)`/g)]
    .map(match => match[1].trim().split(/\s+/)[0].toUpperCase());
  assert.deepEqual([...new Set(sqlMutations)], ['SELECT'], 'browser must be the only product mutation actor; PostgreSQL is read-only oracle');
  assert.doesNotMatch(harness, /InMemory|FakeProject|MockProject|FakeArtifact|MockArtifact/);
});

test('R3g proves canonical Fashion and dual Outfit reads without Detect Object MASK or fallback authority', async () => {
  const [harness, fashion, outfits, tryOnRunner] = await Promise.all([
    readFile(HARNESS, 'utf8'),
    readFile('src/components/editor/fashion/FashionPanel.jsx', 'utf8'),
    readFile('src/components/editor/outfits/OutfitPanel.jsx', 'utf8'),
    readFile('src/components/editor/outfits/CanonicalTryOnRunnerPanel.jsx', 'utf8'),
  ]);

  assert.match(fashion, /coreClient\.fashion\.garments/);
  assert.match(fashion, /coreClient\.fashion\.wardrobe/);
  assert.match(outfits, /createCanonicalOutfitViewModel/);
  assert.match(outfits, /applySnapshot\(await model\.load\(\)\)/);
  assert.match(tryOnRunner, /createCanonicalOutfitViewModel/);
  assert.match(tryOnRunner, /const snapshot = await model\.load\(\)/);
  assert.match(harness, /countRequest\('GET \/api\/core\/wardrobe\/outfits'\), 4/);
  assert.match(harness, /countRequest\('GET \/api\/core\/wardrobe\/garments'\), 6/);
  assert.match(harness, /\/api\/core\/garments/);
  assert.match(harness, /\/api\/core\/wardrobe\/garments/);
  assert.match(harness, /\/api\/core\/wardrobe\/outfits/);
  assert.match(harness, /No managed garments yet/);
  assert.match(harness, /No managed outfits yet/);
  assert.match(harness, /providerCalls, 0/);
  assert.match(harness, /diagnostics\.localExecutionRequests, \[\]/);
  assert.match(harness, /diagnostics\.creativeRequests, \[\]/);
  assert.match(harness, /diagnostics\.financialRequests, \[\]/);
  assert.match(harness, /diagnostics\.maskRequests, \[\]/);
  assert.match(harness, /diagnostics\.projectMutations, \[\]/);
  assert.match(harness, /diagnostics\.externalBrowserRequests, \[\]/);
  assert.doesNotMatch(harness, /page\.route|browserContext\.route|context\.route|route\.abort|route\.fulfill|route\.continue/);
  assert.doesNotMatch(harness, /saveObjects|persistMask|smartPoint|selectionPointer|Start selection|Detect objects/);
  assert.doesNotMatch(harness, /financialAccount|financialTrial|credit_grants|credit_wallets/);
});

test('R3 release workflow makes R3g cumulative evidence an exact-head merge gate', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');

  assert.match(workflow, /CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /tests\/release-r3g-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /scripts\/test-release-r3g-browser-e2e\.mjs/);
  assert.match(workflow, /R3g zero-object Project Fashion Outfits journey/);
  assert.match(workflow, /R3G_BROWSER_ZERO_OBJECT_FASHION_OUTFITS_ACCEPTED/);
});
