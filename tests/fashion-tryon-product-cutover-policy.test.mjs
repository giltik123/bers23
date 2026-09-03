import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

const serverIndex = read('server/index.ts');
const coreClient = read('src/api/coreClient.js');
const composition = read('server/core/composition/createProductionCore.ts');
const tombstone = read('server/core/http/fashionTryOnLegacyPrepareTombstoneHttpAdapter.ts');
const tryOnEngine = read('src/lib/tryon/tryonEngine.js');

test('F4b.6b.5 public server routing has exactly one Fashion execution facade and no rich low-level adapters', () => {
  assert.match(serverIndex, /createFashionTryOnProductHttpAdapter/);
  assert.match(serverIndex, /production\.fashion\.tryOnProduct/);
  assert.match(serverIndex, /path\.startsWith\('\/api\/core\/fashion\/try-on\/'\)/);
  assert.doesNotMatch(serverIndex, /createGarmentMeshWarpHttpAdapter/);
  assert.doesNotMatch(serverIndex, /createGarmentTextureCompositeHttpAdapter/);
  assert.doesNotMatch(serverIndex, /garmentMeshWarpAdapter/);
  assert.doesNotMatch(serverIndex, /garmentTextureCompositeAdapter/);
});

test('F4b.6b.5 browser client exposes only product phase methods for Fashion execution', () => {
  for (const method of [
    'prepareTryOn', 'continueTryOn', 'getTryOnResult',
    'loadTryOnWarpInput', 'submitTryOnWarpCandidate',
    'loadTryOnTextureInput', 'submitTryOnTextureCandidate',
  ]) assert.match(coreClient, new RegExp(`\\b${method}\\b`), method);

  for (const forbidden of [
    'prepareGarmentMeshWarp', 'loadGarmentMeshWarpInput', 'uploadGarmentMeshWarpImage', 'submitGarmentMeshWarp',
    'prepareGarmentTextureComposite', 'loadGarmentTextureCompositeInput', 'uploadGarmentTextureCompositeImage', 'submitGarmentTextureComposite',
  ]) assert.doesNotMatch(coreClient, new RegExp(`\\b${forbidden}\\b`), forbidden);
});

test('F4b.6b.5 concrete deterministic authorities remain internal and product facade uses the same graph', () => {
  assert.match(composition, /garmentMeshWarp: garmentMeshWarp\.execution/);
  assert.match(composition, /garmentTextureComposite: garmentMeshWarp\.textureComposite\.execution/);
  assert.match(composition, /tryOnProduct: garmentMeshWarp\.tryOn\.product/);
});

test('F4b.6b.5 only the two former prepare paths receive explicit non-delegating 410 tombstones', () => {
  assert.match(tombstone, /\/api\/core\/local-execution\/garment-mesh-warp\/prepare/);
  assert.match(tombstone, /\/api\/core\/local-execution\/garment-texture-composite\/prepare/);
  assert.match(tombstone, /fashion_tryon_orchestration_required/);
  assert.doesNotMatch(tombstone, /GarmentMeshWarpExecutionService|GarmentTextureCompositeExecutionService|\.prepare\(/);
});

test('F4b.6b.5 cutover still does not wire product Try-On UI or generative/cloud fallback', () => {
  assert.match(tryOnEngine, /TRYON_EXECUTION_NOT_WIRED/);
  assert.doesNotMatch(tryOnEngine, /prepareTryOn|continueTryOn|submitTryOnWarpCandidate|submitTryOnTextureCandidate/);
});
