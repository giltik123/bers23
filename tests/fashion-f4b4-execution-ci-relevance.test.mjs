import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import {
  FASHION_EXECUTION_PROFILES,
  NOT_APPLICABLE_CLASSIFICATION,
  RELEVANT_CLASSIFICATION,
  classifyFashionExecutionCi,
  isFashionExecutionCiRelevant,
} from '../scripts/classify-fashion-execution-ci.mjs';

const F4B2 = FASHION_EXECUTION_PROFILES.F4B2_MANAGED_INPUT;
const F4B3 = FASHION_EXECUTION_PROFILES.F4B3_BODY_ANCHOR;
const ADMISSION = FASHION_EXECUTION_PROFILES.F4B4_WARP_ADMISSION;
const LAYER = FASHION_EXECUTION_PROFILES.F4B4_WARP_LAYER;

const F4B4_LEAVES = Object.freeze([
  'src/platform/creative/deterministic/GarmentMeshWarpRegistryDefinition.js',
  'server/core/localExecution/productionGarmentMeshWarpExecutorPolicy.ts',
  'server/core/providers/productionGarmentMeshWarpExecutionPolicy.ts',
]);

const ADMISSION_ROOTS = Object.freeze([
  'tests/local-execution-managed-input-platform.test.ts',
  'tests/garment-mesh-warp-managed-input-limits.test.ts',
  'tests/garment-mesh-warp-registry-contract.test.ts',
  'tests/garment-mesh-warp-planner-contract.test.ts',
  'tests/garment-mesh-warp-ticket-contract.test.ts',
  'tests/artifact-authority-stored-image-evidence.test.ts',
  'tests/garment-mesh-warp-input-delivery.test.ts',
  'tests/garment-mesh-warp-execution-service.test.ts',
  'tests/garment-mesh-warp-workflow-verifier.test.ts',
  'tests/garment-mesh-warp-browser-executor.test.ts',
  'tests/garment-mesh-warp-http-adapter.test.ts',
  'tests/deterministic-garment-mesh-warp-admission-boundary.test.ts',
]);

const LAYER_ROOTS = Object.freeze([
  'tests/fashion-garment-warp-layer-postgres.test.ts',
  'tests/deterministic-garment-mesh-warp-admission-boundary.test.ts',
]);

test('new F4b.4 leaves do not widen accepted F4b.2/F4b.3 profiles', () => {
  for (const path of F4B4_LEAVES) {
    assert.equal(isFashionExecutionCiRelevant(path, F4B2), false, `${F4B2}: ${path}`);
    assert.equal(isFashionExecutionCiRelevant(path, F4B3), false, `${F4B3}: ${path}`);
    assert.equal(isFashionExecutionCiRelevant(path, ADMISSION), true, `${ADMISSION}: ${path}`);
    assert.equal(isFashionExecutionCiRelevant(path, LAYER), true, `${LAYER}: ${path}`);
  }
});

test('F4b.4 profiles remain purpose-separated instead of becoming one blanket F4b.4 classifier', () => {
  const admissionOnly = [
    '.github/workflows/fashion-garment-mesh-warp-admission-f4b4.yml',
    'server/core/http/garmentMeshWarpHttpAdapter.ts',
    'tests/garment-mesh-warp-http-adapter.test.ts',
    'tests/garment-mesh-warp-browser-executor.test.ts',
  ];
  for (const path of admissionOnly) {
    assert.equal(isFashionExecutionCiRelevant(path, ADMISSION), true, path);
    assert.equal(isFashionExecutionCiRelevant(path, LAYER), false, path);
  }

  const layerOnly = [
    '.github/workflows/fashion-garment-warp-layer-f4b4.yml',
    'server/core/fashion/garmentWarpLayerSchema.ts',
    'server/core/fashion/postgresGarmentWarpLayerStore.ts',
    'server/core/fashion/migrations/029_fashion_garment_warp_layers.sql',
    'tests/fashion-garment-warp-layer-postgres.test.ts',
  ];
  for (const path of layerOnly) {
    assert.equal(isFashionExecutionCiRelevant(path, LAYER), true, path);
    assert.equal(isFashionExecutionCiRelevant(path, ADMISSION), false, path);
  }

  for (const profile of [ADMISSION, LAYER]) {
    for (const unrelated of [
      '.github/workflows/fashion-garment-mesh-warp-service-postgres-f4b4.yml',
      'tests/garment-mesh-warp-service-postgres.test.ts',
      'src/platform/creative/local-ai/tinySdPipeline.ts',
      '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
      'server/core/auth/hmacJwtVerifier.ts',
      'server/core/providers/falProvider.ts',
      '.github/workflows/fashion-garment-refinement-lineage-f5a2-v2.yml',
      'docs/architecture.md',
    ]) assert.equal(isFashionExecutionCiRelevant(unrelated, profile), false, `${profile}: ${unrelated}`);
  }
});

test('non-bundle source-read and shell authority dependencies are explicitly relevant to both F4b.4 profiles', () => {
  for (const path of [
    'src/platform/creative/deterministic/DeterministicToolRegistry.ts',
    'server/core/localExecution/productionLocalExecutorPolicy.ts',
    'server/core/providers/productionExecutionCapabilities.ts',
    'server/core/providers/productionExecutionRoute.ts',
    'server/core/providers/productionTargetSelection.ts',
    'src/lib/tryon/tryonEngine.js',
    'tests/deterministic-garment-mesh-warp-admission-boundary.test.ts',
  ]) {
    assert.equal(isFashionExecutionCiRelevant(path, ADMISSION), true, `${ADMISSION}: ${path}`);
    assert.equal(isFashionExecutionCiRelevant(path, LAYER), true, `${LAYER}: ${path}`);
  }

  for (const path of [
    'server/core/fashion/migrations/028_project_body_anchor_sets.sql',
    'server/core/fashion/migrations/029_fashion_garment_warp_layers.sql',
    'server/core/artifacts/migrations/018_canonical_final_image_lineage.sql',
    'server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts',
  ]) assert.equal(isFashionExecutionCiRelevant(path, LAYER), true, path);
});

test('F4b.4 profile classification is normalized deterministic and separates matched paths', () => {
  const admission = classifyFashionExecutionCi([
    './docs/readme.md',
    '\\server\\core\\providers\\productionGarmentMeshWarpExecutionPolicy.ts',
    'server/core/fashion/garmentWarpLayerSchema.ts',
    'server/core/providers/productionGarmentMeshWarpExecutionPolicy.ts',
  ], ADMISSION);
  assert.equal(admission.relevant, true);
  assert.equal(admission.classification, RELEVANT_CLASSIFICATION);
  assert.equal(admission.changedPathCount, 3);
  assert.deepEqual(admission.matchedPaths, ['server/core/providers/productionGarmentMeshWarpExecutionPolicy.ts']);

  const layer = classifyFashionExecutionCi([
    'tests/garment-mesh-warp-http-adapter.test.ts',
    'server/core/fashion/garmentWarpLayerSchema.ts',
  ], LAYER);
  assert.equal(layer.relevant, true);
  assert.deepEqual(layer.matchedPaths, ['server/core/fashion/garmentWarpLayerSchema.ts']);

  const irrelevant = classifyFashionExecutionCi(['docs/readme.md', 'server/core/auth/hmacJwtVerifier.ts'], ADMISSION);
  assert.equal(irrelevant.relevant, false);
  assert.equal(irrelevant.classification, NOT_APPLICABLE_CLASSIFICATION);
  assert.deepEqual(irrelevant.matchedPaths, []);
});

for (const [profile, roots] of [
  [ADMISSION, ADMISSION_ROOTS],
  [LAYER, LAYER_ROOTS],
]) {
  test(`${profile} actual esbuild runtime inputs stay inside classifier ownership`, async () => {
    const inputs = await collectBundledRepoInputs(roots);
    const escaped = inputs.filter(path => !isFashionExecutionCiRelevant(path, profile));
    assert.deepEqual(
      escaped,
      [],
      `${profile} actual bundle inputs escaped classifier ownership:\n${escaped.join('\n')}`,
    );
    for (const root of roots) assert.ok(inputs.includes(root), `${profile} missing root ${root}`);
    console.log(`${profile}_BUNDLE_INPUTS=${inputs.length}`);
  });
}

async function collectBundledRepoInputs(roots) {
  const inputs = new Set();
  for (const root of roots) {
    const result = await build({
      entryPoints: [root],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      packages: 'external',
      external: ['node:*'],
      logLevel: 'silent',
    });
    for (const input of Object.keys(result.metafile?.inputs ?? {})) {
      const normalized = input.replaceAll('\\', '/').replace(/^\.\//, '');
      if (!normalized.startsWith('node_modules/')) inputs.add(normalized);
    }
  }
  return [...inputs].sort();
}
