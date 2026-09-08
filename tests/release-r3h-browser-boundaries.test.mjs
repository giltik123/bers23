import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const HARNESS = 'scripts/test-release-r3h-browser-e2e.mjs';
const WORKFLOW = '.github/workflows/release-r3a-browser-e2e.yml';

test('R3h product UI composes Managed Garment, revisioned Wardrobe and Collection authorities without generic upload fallback', async () => {
  const [dialog, fashion, wardrobeVm, garmentClient, wardrobeClient, collectionsView, collectionVm, collectionClient] = await Promise.all([
    readFile('src/components/editor/fashion/AddGarmentDialog.jsx', 'utf8'),
    readFile('src/components/editor/fashion/FashionPanel.jsx', 'utf8'),
    readFile('src/application/fashion/canonicalWardrobeViewModel.js', 'utf8'),
    readFile('src/api/managedGarmentClient.js', 'utf8'),
    readFile('src/api/managedWardrobeClient.js', 'utf8'),
    readFile('src/components/editor/fashion/CanonicalCollectionsView.jsx', 'utf8'),
    readFile('src/application/fashion/canonicalCollectionViewModel.js', 'utf8'),
    readFile('src/api/managedGarmentCollectionClient.js', 'utf8'),
  ]);

  assert.match(dialog, /input type="file" accept="image\/png,image\/jpeg,image\/webp"/);
  assert.match(dialog, /await onCreate\(\{[\s\S]*name: form\.name,[\s\S]*image,[\s\S]*viewKind: form\.viewKind,[\s\S]*category: form\.category,[\s\S]*season: form\.season,[\s\S]*material: form\.material,[\s\S]*tags:/);
  assert.match(fashion, /createCanonicalWardrobeViewModel\(\{[\s\S]*garments: coreClient\.fashion\.garments,[\s\S]*wardrobe: coreClient\.fashion\.wardrobe/);
  assert.match(fashion, /cause instanceof CanonicalWardrobePartialCreateError \|\| cause\?\.code === 'GARMENT_CREATED_METADATA_PENDING'/);
  assert.match(fashion, /await reload\(\{ quiet: true \}\)/);

  assert.match(wardrobeVm, /const created = await garments\.create\(\{ name, image, viewKind \}\)/);
  assert.match(wardrobeVm, /metadata = await wardrobe\.updateMetadata\(created\.id, created\.revision, patch\)/);
  assert.match(wardrobeVm, /throw new CanonicalWardrobePartialCreateError\(created\.id, cause\)/);
  assert.match(wardrobeVm, /wardrobe\.updateMetadata\(current\.id, current\.revision, \{ favorite: Boolean\(favorite\) \}\)/);
  assert.match(garmentClient, /import \{ resolveCoreResourceUrl \} from '\.\/coreResourceUrl\.js'/);
  assert.match(garmentClient, /const PREFIX = '\/garments'/);
  assert.match(garmentClient, /const SERVER_DELIVERY_PATH = \/\^\\\/api\\\/core\\\/garments\\\/delivery\\\/\[\^\/?#\]\+\$\//);
  assert.match(garmentClient, /value\.startsWith\(SERVER_DELIVERY_PREFIX\) \|\| !SERVER_DELIVERY_PATH\.test\(value\)/);
  assert.match(garmentClient, /return resolveCoreResourceUrl\(value, apiRoot\)/);
  assert.match(garmentClient, /headers: Object\.freeze\(\{ 'Content-Type': normalizedImage\.contentType \}\)/);
  assert.doesNotMatch(garmentClient, /UploadFile|\/assets|FASHN|provider|Billing|cloud/);
  assert.match(wardrobeClient, /X-Expected-Garment-Revision/);

  assert.match(collectionsView, /createCanonicalCollectionViewModel\(\{ collections: coreClient\.fashion\.collections \}\)/);
  assert.match(collectionsView, /model\.addGarment\(collection, addGarmentId\)/);
  assert.match(collectionVm, /collections\.addGarment\(current\.id, current\.revision, requiredId\(garmentId, 'garmentId'\)\)/);
  assert.match(collectionClient, /X-Expected-Collection-Revision/);
  assert.match(collectionClient, /mutationWithRevision\('POST', expectedRevision\)/);
  assert.doesNotMatch(collectionClient, /wardrobeManager|garmentManager|FASHN|provider|Billing|cloud/);
});

test('R3h browser is the product mutation actor while PostgreSQL remains a read-only correctness oracle', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.match(harness, /path\.resolve\('dist'\)/);
  assert.match(harness, /path\.resolve\('dist-server\/server\.mjs'\)/);
  assert.match(harness, /NODE_ENV: 'production'/);
  assert.match(harness, /PostgresAuthStore/);
  assert.match(harness, /chromium\.launch\(\{ channel: 'chrome', headless: true \}\)/);
  assert.match(harness, /getByRole\('button', \{ name: 'Fashion', exact: true \}\)/);
  assert.match(harness, /getByRole\('button', \{ name: 'Add garment', exact: true \}\)/);
  assert.match(harness, /getByRole\('button', \{ name: 'Save garment', exact: true \}\)/);
  assert.match(harness, /getByPlaceholder\('New collection'\)/);
  assert.match(harness, /getByRole\('button', \{ name: 'Create', exact: true \}\)/);
  assert.match(harness, /selectOption\(\{ label: garmentName \}\)/);
  assert.match(harness, /assert\.equal\(garmentImageUrl\.origin, coreOrigin\)/);
  assert.match(harness, /\/api\\\/core\\\/garments\\\/delivery\\\//);

  const sqlMutations = [...harness.matchAll(/pool\.query\(\s*`([^`]+)`/g)]
    .map(match => match[1].trim().split(/\s+/)[0].toUpperCase());
  assert.deepEqual([...new Set(sqlMutations)], ['SELECT'], 'direct PostgreSQL access in the browser evidence must be read-only');
  assert.doesNotMatch(harness, /page\.route|browserContext\.route|context\.route|route\.abort|route\.fulfill|route\.continue/);
  assert.doesNotMatch(harness, /InMemory|FakeProject|MockProject|FakeGarment|MockGarment|FakeCollection|MockCollection/);
});

test('R3h binds selected browser image pixels and revisions to durable Garment view metadata and Collection membership', async () => {
  const harness = await readFile(HARNESS, 'utf8');

  assert.doesNotMatch(harness, /\.postDataBuffer\(\)/, 'Playwright binary request-body introspection must not be treated as the byte oracle');
  assert.match(harness, /garmentSourcePixelSha256/);
  assert.match(harness, /storedPixelSha256/);
  assert.match(harness, /canonical Managed Garment bytes must preserve the exact decoded RGBA pixels selected in the browser/);
  assert.match(harness, /Managed Garment response hash must bind to durable PostgreSQL bytes/);
  assert.match(harness, /PostgreSQL content_sha256 must identify the exact canonical image_bytes/);
  assert.match(harness, /headerValue\('x-expected-garment-revision'\), '1'/);
  assert.match(harness, /headerValue\('x-expected-garment-revision'\), '2'/);
  assert.match(harness, /headerValue\('x-expected-collection-revision'\), '1'/);
  assert.match(harness, /createdGarment\.views\[0\]\.ordinal, 0/);
  assert.match(harness, /createdGarment\.views\[0\]\.encoding, 'PNG_RGBA8_LOSSLESS'/);
  assert.match(harness, /createdGarment\.views\[0\]\.storage_provenance, 'POSTGRES_BYTEA_V1'/);
  assert.match(harness, /canonical_garments/);
  assert.match(harness, /canonical_garment_views/);
  assert.match(harness, /canonical_garment_tags/);
  assert.match(harness, /canonical_garment_collections/);
  assert.match(harness, /canonical_garment_collection_members/);
  assert.match(harness, /createHash\('sha256'\)\.update\(durable\.view\.image_bytes\)/);
  assert.match(harness, /ensureAlpha\(\)\.raw\(\)\.toBuffer\(\{ resolveWithObject: true \}\)/);
  assert.match(harness, /Number\(durable\.garment\.revision\), 3/);
  assert.match(harness, /Number\(durable\.collection\.revision\), 2/);
  assert.match(harness, /Managed Wardrobe mutations must not mutate canonical Project state or objects/);
  assert.match(harness, /R3H_BROWSER_MANAGED_GARMENT_COLLECTION_ACCEPTED/);

  assert.match(harness, /diagnostics\.fashionMutations, \[/);
  assert.match(harness, /'POST \/api\/core\/garments'/);
  assert.match(harness, /`PATCH \/api\/core\/wardrobe\/garments\/\$\{garmentId\}`/);
  assert.match(harness, /'POST \/api\/core\/wardrobe\/collections'/);
  assert.match(harness, /`POST \/api\/core\/wardrobe\/collections\/\$\{collectionId\}\/garments\/\$\{garmentId\}`/);
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

test('R3 release workflow makes R3h cumulative evidence and Managed Garment split-origin regression exact-head merge gates', async () => {
  const workflow = await readFile(WORKFLOW, 'utf8');

  assert.match(workflow, /CANDIDATE_SHA: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
  assert.match(workflow, /Assert exact candidate SHA/);
  assert.match(workflow, /src\/components\/editor\/fashion\/\*\*/);
  assert.match(workflow, /server\/core\/fashion\/\*\*/);
  assert.match(workflow, /tests\/managed-garment-browser-client\.test\.mjs/);
  assert.match(workflow, /node --test tests\/managed-garment-browser-client\.test\.mjs/);
  assert.match(workflow, /tests\/release-r3h-browser-boundaries\.test\.mjs/);
  assert.match(workflow, /scripts\/test-release-r3h-browser-e2e\.mjs/);
  assert.match(workflow, /R3h managed garment create favorite collection membership journey/);
  assert.match(workflow, /R3H_BROWSER_MANAGED_GARMENT_COLLECTION_ACCEPTED/);
});