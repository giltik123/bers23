import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');
const product = read('server/core/fashion/FashionTryOnProductService.ts');
const preview = read('server/core/fashion/FashionTryOnRecoveryPreviewService.ts');
const composition = read('server/core/composition/createProductionGarmentMeshWarp.ts');
const http = read('server/core/http/fashionTryOnProductHttpAdapter.ts');
const serverIndex = read('server/index.ts');
const coreClient = read('src/api/coreClient.js');
const tryOnEngine = read('src/lib/tryon/tryonEngine.js');

test('production graph wires preview through existing FINAL and signed delivery authorities', () => {
  assert.match(composition, /new FashionTryOnRecoveryPreviewService/);
  assert.match(composition, /result: tryOnResult/);
  assert.match(composition, /resolveStoredImageEvidence\(scope, artifactId\)/);
  assert.match(composition, /issueStoredFinalDelivery\(storageId, scope, expiresAt\)/);
  assert.match(composition, /\/api\/core\/artifacts\/results\//);
  assert.match(composition, /preview: tryOnPreview/);
  assert.match(preview, /FASHION_TRYON_RECOVERY_PREVIEW_TTL_MS = 120_000/);
});

test('product preview route accepts only the existing closed stable-intent body', () => {
  assert.match(product, /preview\(input: FashionTryOnOrchestrationIntentV1 \| unknown/);
  assert.match(http, /\| 'preview'/);
  assert.match(http, /url\.pathname === `\$\{ROOT\}\/preview` && request\.method === 'POST'/);
  assert.match(http, /input\.product\.preview\(exactIntent\(/);
  assert.match(http, /INTENT_KEYS = Object\.freeze\(\['clientRequestId', 'garmentId', 'projectId', 'sourceArtifactId'\]/);
  assert.match(http, /forbidden_client_authority/);
});

test('server reuses the one accepted Try-On product adapter instead of opening a second preview authority', () => {
  assert.match(serverIndex, /createFashionTryOnProductHttpAdapter/);
  assert.match(serverIndex, /production\.fashion\.tryOnProduct/);
  assert.match(serverIndex, /path\.startsWith\('\/api\/core\/fashion\/try-on\/'\)/);
  assert.doesNotMatch(serverIndex, /createFashionTryOnRecoveryPreviewHttpAdapter|fashionTryOnRecoveryPreviewAdapter/);
});

test('browser preview uses only the accepted product route while legacy execution remains tombstoned', () => {
  assert.match(coreClient, /getTryOnPreview: \(payload\) => request\('\/fashion\/try-on\/preview', json\('POST', payload\)\)/);
  assert.equal((coreClient.match(/\bgetTryOnPreview\b/g) || []).length, 1, 'browser client must expose exactly one Try-On preview method');
  assert.match(tryOnEngine, /TRYON_EXECUTION_NOT_WIRED/);
  for (const source of [product, preview, http]) {
    assert.doesNotMatch(source, /coreClient\.entities|FASHN|billing|credits|acceptFinal|pushEdit|localStorage/);
  }
});
