import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  FASHION_EXECUTION_PROFILES,
  NOT_APPLICABLE_CLASSIFICATION,
  RELEVANT_CLASSIFICATION,
  classifyFashionExecutionCi,
  isFashionExecutionCiRelevant,
} from '../scripts/classify-fashion-execution-ci.mjs';

const F4B2 = FASHION_EXECUTION_PROFILES.F4B2_MANAGED_INPUT;
const F4B3 = FASHION_EXECUTION_PROFILES.F4B3_BODY_ANCHOR;

test('common Fashion execution mechanics are relevant to both profiles', () => {
  for (const candidate of [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'server/tsconfig.json',
    'scripts/build-core-server.mjs',
    'server/transactions/infrastructure/postgres/transactionSchemaCli.ts',
    'server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts',
    'server/core/localExecution/localExecutionLedgerSchema.ts',
    'server/core/localExecution/ManagedGarmentLocalExecutionInputAuthority.ts',
    'src/platform/creative/canonical/localExecution.ts',
    'server/core/fashion/garmentSchema.ts',
    'server/core/fashion/postgresGarmentRepresentationStore.ts',
    'server/core/fashion/glbExecutionSubsetValidator.ts',
    'server/core/fashion/manualParametricContour.ts',
    'src/platform/creative/deterministic/GarmentMeshWarp.ts',
    'src/platform/creative/deterministic/GarmentMeshWarpIdentity.js',
    'server/core/localExecution/productionLocalExecutorPolicy.ts',
    'server/core/providers/productionExecutionCapabilities.ts',
    'src/platform/creative/deterministic/DeterministicToolRegistry.ts',
    'src/lib/tryon/tryonEngine.js',
  ]) {
    assert.equal(isFashionExecutionCiRelevant(candidate, F4B2), true, `${F4B2}: ${candidate}`);
    assert.equal(isFashionExecutionCiRelevant(candidate, F4B3), true, `${F4B3}: ${candidate}`);
  }
});

test('F4b.2 owns managed-input ticket and durable-ledger authority without absorbing body-anchor-only work', () => {
  for (const candidate of [
    '.github/workflows/fashion-managed-garment-input-f4b2.yml',
    'server/core/localExecution/LocalExecutionAdmission.ts',
    'server/core/localExecution/LocalExecutionTicketAuthority.ts',
    'server/core/localExecution/PostgresLocalExecutionLedger.ts',
    'server/core/localExecution/LocalExecutionInputAdmission.ts',
    'server/core/localExecution/LocalExecutionInputDeliveryService.ts',
    'tests/managed-garment-local-execution-input-contract.test.ts',
    'tests/managed-garment-local-execution-boundary.test.ts',
    'tests/managed-garment-local-execution-input-postgres.test.ts',
  ]) assert.equal(isFashionExecutionCiRelevant(candidate, F4B2), true, candidate);

  for (const candidate of [
    '.github/workflows/fashion-body-anchor-destination-mesh-f4b3.yml',
    'server/core/fashion/bodyAnchorGeometry.ts',
    'server/core/fashion/postgresProjectBodyAnchorStore.ts',
    'server/core/projects/postgresProjectStore.ts',
    'server/core/artifacts/postgresImageArtifactStore.ts',
    'tests/fashion-body-anchor-destination-mesh-postgres.test.ts',
  ]) assert.equal(isFashionExecutionCiRelevant(candidate, F4B2), false, candidate);
});

test('F4b.3 owns Project/body-anchor evidence and exact canonical-image predecessor law', () => {
  for (const candidate of [
    '.github/workflows/fashion-body-anchor-destination-mesh-f4b3.yml',
    'server/core/fashion/bodyAnchorSchema.ts',
    'server/core/fashion/bodyAnchorGeometry.ts',
    'server/core/fashion/postgresProjectBodyAnchorStore.ts',
    'server/core/fashion/migrations/028_project_body_anchor_sets.sql',
    'server/core/fashion/migrations/031_project_body_anchor_acquisition_sequence.sql',
    'server/core/fashion/migrations/035_project_body_anchor_idempotency.sql',
    'server/core/projects/projectSchema.ts',
    'server/core/projects/postgresProjectStore.ts',
    'server/core/projects/migrations/004_canonical_projects_and_originals.sql',
    'server/core/artifacts/imageArtifactSchema.ts',
    'server/core/artifacts/postgresImageArtifactStore.ts',
    'server/core/artifacts/migrations/003_canonical_final_image_artifacts.sql',
    'server/core/artifacts/finalImageLineageSchema.ts',
    'server/core/artifacts/migrations/021_canonical_orthogonal_transform_final_lineage.sql',
    'server/core/fashion/garmentTextureFinalLineage.ts',
    'server/core/fashion/garmentAppearanceRefinementFinalLineage.ts',
    'src/platform/creative/deterministic/GarmentTextureCompositeParameters.ts',
    'src/platform/creative/deterministic/GarmentAppearanceRefinementIdentity.js',
    'server/core/fashion/migrations/030_fashion_garment_texture_final_lineage.sql',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'tests/fashion-body-anchor-destination-mesh-postgres.test.ts',
    'tests/fashion-body-anchor-schema-postgres.test.ts',
  ]) assert.equal(isFashionExecutionCiRelevant(candidate, F4B3), true, candidate);

  for (const candidate of [
    '.github/workflows/fashion-managed-garment-input-f4b2.yml',
    'server/core/localExecution/PostgresLocalExecutionLedger.ts',
    'server/core/localExecution/PostgresLocalExecutionLedgerV2.integration.test.mjs',
    'tests/managed-garment-local-execution-input-contract.test.ts',
  ]) assert.equal(isFashionExecutionCiRelevant(candidate, F4B3), false, candidate);
});

test('profile boundaries do not turn unrelated model, Auth, F1-F3, F5 provider or generic Core changes into execution work', () => {
  for (const profile of [F4B2, F4B3]) {
    for (const candidate of [
      'src/platform/creative/local-ai/tinySdPipeline.ts',
      '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
      'server/core/auth/hmacJwtVerifier.ts',
      'server/core/execution/postgresExecutionRunStore.ts',
      '.github/workflows/managed-outfits-f3a.yml',
      '.github/workflows/fashion-garment-refinement-lineage-f5a2-v2.yml',
      'server/core/providers/falProvider.ts',
      'src/platform/creative/deterministic/CropIdentity.js',
      'server/core/artifacts/migrations/014_canonical_mask_lineage.sql',
      'docs/architecture.md',
    ]) assert.equal(isFashionExecutionCiRelevant(candidate, profile), false, `${profile}: ${candidate}`);
  }

  assert.equal(isFashionExecutionCiRelevant('server/core/fashion/garmentAppearanceRefinementFinalLineage.ts', F4B2), false);
  assert.equal(isFashionExecutionCiRelevant('server/core/fashion/garmentAppearanceRefinementFinalLineage.ts', F4B3), true);
});

test('profile classification is deterministic, normalized and separates matched paths', () => {
  const f4b2 = classifyFashionExecutionCi([
    './docs/readme.md',
    '\\server\\core\\localExecution\\LocalExecutionTicketAuthority.ts',
    'server/core/fashion/bodyAnchorGeometry.ts',
    'server/core/localExecution/LocalExecutionTicketAuthority.ts',
  ], F4B2);
  assert.equal(f4b2.relevant, true);
  assert.equal(f4b2.classification, RELEVANT_CLASSIFICATION);
  assert.equal(f4b2.changedPathCount, 3);
  assert.deepEqual(f4b2.matchedPaths, ['server/core/localExecution/LocalExecutionTicketAuthority.ts']);

  const f4b3 = classifyFashionExecutionCi([
    'server/core/fashion/bodyAnchorGeometry.ts',
    'server/core/localExecution/PostgresLocalExecutionLedger.ts',
  ], F4B3);
  assert.equal(f4b3.relevant, true);
  assert.deepEqual(f4b3.matchedPaths, ['server/core/fashion/bodyAnchorGeometry.ts']);

  const irrelevant = classifyFashionExecutionCi(['docs/readme.md', 'server/core/auth/hmacJwtVerifier.ts'], F4B3);
  assert.equal(irrelevant.relevant, false);
  assert.equal(irrelevant.classification, NOT_APPLICABLE_CLASSIFICATION);
  assert.deepEqual(irrelevant.matchedPaths, []);
});

test('unsupported profiles fail closed', () => {
  assert.throws(() => classifyFashionExecutionCi(['package.json'], 'F4B4_UNKNOWN'), /Unsupported Fashion execution classifier profile/);
  assert.throws(() => isFashionExecutionCiRelevant('package.json', ''), /Unsupported Fashion execution classifier profile/);
});

const RUNTIME_ROOTS = Object.freeze({
  [F4B2]: Object.freeze([
    'tests/managed-garment-local-execution-input-contract.test.ts',
    'tests/managed-garment-local-execution-boundary.test.ts',
    'tests/managed-garment-local-execution-input-postgres.test.ts',
    'server/core/localExecution/PostgresLocalExecutionLedgerV2.integration.test.mjs',
  ]),
  [F4B3]: Object.freeze([
    'tests/fashion-body-anchor-destination-mesh-postgres.test.ts',
    'tests/fashion-body-anchor-schema-postgres.test.ts',
  ]),
});

test('executed relative runtime-import graphs remain closed inside their classifier profiles', async () => {
  for (const profile of [F4B2, F4B3]) {
    const graph = await collectRelativeRuntimeGraph(RUNTIME_ROOTS[profile]);
    for (const candidate of graph) {
      assert.equal(
        isFashionExecutionCiRelevant(candidate, profile),
        true,
        `${profile} runtime import escaped classifier ownership: ${candidate}`,
      );
    }
  }
});

async function collectRelativeRuntimeGraph(roots) {
  const seen = new Set();
  const queue = [...roots];
  while (queue.length) {
    const repoPath = queue.shift();
    if (seen.has(repoPath)) continue;
    seen.add(repoPath);
    const source = await readFile(repoPath, 'utf8');
    for (const specifier of runtimeRelativeImports(source)) {
      const resolved = await resolveRelativeImport(repoPath, specifier);
      assert.ok(resolved, `Could not resolve runtime import ${specifier} from ${repoPath}`);
      if (!seen.has(resolved)) queue.push(resolved);
    }
  }
  return [...seen].sort();
}

function runtimeRelativeImports(source) {
  const imports = [];
  const statementPattern = /^\s*import[\s\S]*?;\s*$/gm;
  for (const match of source.matchAll(statementPattern)) {
    const statement = match[0];
    if (/^\s*import\s+type\b/.test(statement)) continue;
    const from = statement.match(/\bfrom\s+['"]([^'"]+)['"]/);
    const sideEffect = statement.match(/^\s*import\s+['"]([^'"]+)['"]/);
    const specifier = from?.[1] ?? sideEffect?.[1];
    if (specifier?.startsWith('.')) imports.push(specifier);
  }
  return imports;
}

async function resolveRelativeImport(fromRepoPath, specifier) {
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRepoPath), specifier));
  const hasExtension = /\.[cm]?[jt]sx?$/.test(base);
  const candidates = hasExtension
    ? [base]
    : [base, `${base}.ts`, `${base}.js`, `${base}.mjs`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.js`];
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // Try the next exact source candidate.
    }
  }
  return undefined;
}
