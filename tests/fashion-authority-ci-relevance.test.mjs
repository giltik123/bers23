import assert from 'node:assert/strict';
import test from 'node:test';
import {
  NOT_APPLICABLE_CLASSIFICATION,
  RELEVANT_CLASSIFICATION,
  classifyFashionAuthorityCi,
  isFashionAuthorityCiRelevant,
} from '../scripts/classify-fashion-authority-ci.mjs';

test('Fashion authority classifier recognizes reviewed runtime, transport, workflow, dependency and Editor surfaces', () => {
  for (const path of [
    'server/core/fashion/postgresOutfitStore.ts',
    'server/core/fashion/migrations/025_managed_outfits.sql',
    'server/core/http/managedGarmentHttpAdapter.ts',
    'server/core/http/managedGarmentCollectionHttpAdapter.ts',
    'server/core/http/managedWardrobeHttpAdapter.ts',
    'server/core/http/managedOutfitHttpAdapter.ts',
    'server/core/http/browserSessionCookie.ts',
    'server/core/http/requestTarget.ts',
    '.github/workflows/managed-garment-f1a.yml',
    '.github/workflows/managed-garment-f1b.yml',
    '.github/workflows/managed-wardrobe-f2a.yml',
    '.github/workflows/managed-wardrobe-f2b.yml',
    '.github/workflows/managed-outfits-f3a.yml',
    '.github/workflows/managed-garment-representations-f4a.yml',
    '.github/workflows/managed-garment-glb-f4a1.yml',
    '.github/workflows/fashion-authority-ci-policy.yml',
    'package.json',
    'package-lock.json',
    'server/tsconfig.json',
    'scripts/build-core-server.mjs',
    'tests/managed-garment-collections-postgres.test.ts',
    'tests/managed-outfit-http-postgres.test.ts',
    'tests/editor-zero-object-navigation.test.mjs',
    'src/pages/Editor.jsx',
    'src/components/editor/fashion/FashionPanel.jsx',
    'src/components/editor/outfits/OutfitPanel.jsx',
  ]) {
    assert.equal(isFashionAuthorityCiRelevant(path), true, path);
  }
});

test('representation classifier boundary does not absorb F4b execution-only authority', () => {
  for (const path of [
    '.github/workflows/fashion-managed-garment-input-f4b2.yml',
    '.github/workflows/fashion-body-anchor-destination-mesh-f4b3.yml',
    'server/core/localExecution/productionLocalExecutorPolicy.ts',
    'server/core/providers/productionExecutionCapabilities.ts',
    'server/core/providers/productionExecutionRoute.ts',
    'server/core/providers/productionTargetSelection.ts',
    'src/platform/creative/deterministic/DeterministicToolRegistry.ts',
    'src/lib/tryon/tryonEngine.js',
  ]) {
    assert.equal(isFashionAuthorityCiRelevant(path), false, path);
  }
});

test('generic Core preflight does not turn unrelated server or Tiny-SD changes into Fashion semantic work', () => {
  for (const path of [
    'server/core/auth/hmacJwtVerifier.ts',
    'server/core/projects/postgresProjectStore.ts',
    'server/core/execution/postgresExecutionRunStore.ts',
    'server/core/config.ts',
    'src/platform/creative/local-ai/tinySdPipeline.ts',
    'tests/tiny-sd-d3-wasm-browser.test.mjs',
    '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    'docs/tiny-sd.md',
    'src/components/editor/crop/CropPanel.jsx',
  ]) {
    assert.equal(isFashionAuthorityCiRelevant(path), false, path);
  }
});

test('classification is deterministic, normalized and fail-closed for mixed changes', () => {
  const irrelevant = classifyFashionAuthorityCi([
    './src/platform/creative/local-ai/tinySdPipeline.ts',
    'server/core/auth/hmacJwtVerifier.ts',
    'docs/architecture.md',
  ]);
  assert.equal(irrelevant.relevant, false);
  assert.equal(irrelevant.classification, NOT_APPLICABLE_CLASSIFICATION);
  assert.deepEqual(irrelevant.matchedPaths, []);

  const mixed = classifyFashionAuthorityCi([
    'src/platform/creative/local-ai/tinySdPipeline.ts',
    '\\server\\core\\fashion\\postgresGarmentWardrobeStore.ts',
    'server/core/fashion/postgresGarmentWardrobeStore.ts',
  ]);
  assert.equal(mixed.relevant, true);
  assert.equal(mixed.classification, RELEVANT_CLASSIFICATION);
  assert.deepEqual(mixed.matchedPaths, ['server/core/fashion/postgresGarmentWardrobeStore.ts']);
});

test('classification reports stable path cardinality separately from matched paths', () => {
  const result = classifyFashionAuthorityCi([
    'docs/readme.md',
    'server/core/fashion/garmentSchema.ts',
  ]);
  assert.equal(result.relevant, true);
  assert.equal(result.classification, RELEVANT_CLASSIFICATION);
  assert.equal(result.changedPathCount, 2);
  assert.deepEqual(result.matchedPaths, ['server/core/fashion/garmentSchema.ts']);
});
