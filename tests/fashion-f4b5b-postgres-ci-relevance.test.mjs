import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { build } from 'esbuild';

import {
  FASHION_EXECUTION_PROFILES,
  NOT_APPLICABLE_CLASSIFICATION,
  RELEVANT_CLASSIFICATION,
  classifyFashionExecutionCi,
  isFashionExecutionCiRelevant,
} from '../scripts/classify-fashion-execution-ci.mjs';
import { resolveProductionMigrations } from '../scripts/production-migration-inventory.mjs';
import { collectBundleMigrationReferences } from '../scripts/stage-bundle-migrations.mjs';

const POSTGRES = FASHION_EXECUTION_PROFILES.F4B5B_TEXTURE_POSTGRES_VERTICAL;
const ROOT = 'tests/garment-texture-composite-service-postgres.test.ts';
const MANIFEST_PATH = 'scripts/f4b5b-postgres-ci-closure.json';

async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}

async function buildMetafile() {
  const result = await build({
    entryPoints: [ROOT],
    bundle: true,
    write: false,
    metafile: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    external: ['node:*', 'pg', 'sharp'],
    logLevel: 'silent',
  });
  return result.metafile;
}

function repoInputs(metafile) {
  return [...new Set(Object.keys(metafile?.inputs ?? {})
    .map((input) => input.replaceAll('\\', '/').replace(/^\.\//, ''))
    .filter((input) => !input.startsWith('node_modules/')))].sort();
}

test('F4b.5b PostgreSQL closure manifest is exact, normalized and prefix-free', async () => {
  const manifest = await readManifest();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.profile, POSTGRES);
  assert.equal(manifest.bundleInputs.length, 81);
  assert.equal(manifest.migrationPaths.length, 27);
  assert.equal(manifest.supportPaths.length, 20);

  const paths = [...manifest.bundleInputs, ...manifest.migrationPaths, ...manifest.supportPaths];
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    assert.equal(typeof path, 'string');
    assert.ok(path.length > 0);
    assert.equal(path.includes('\\'), false, path);
    assert.equal(/[*?\[\]]/.test(path), false, path);
  }

  for (const excluded of [
    'server/transactions/infrastructure/postgres/migrations/001_transaction_store.sql',
    'server/core/auth/migrations/008_canonical_auth_identity_sessions.sql',
    'server/core/auth/migrations/009_auth_lifecycle_oauth.sql',
    'server/core/auth/migrations/010_registration_attempt_binding.sql',
    'server/core/auth/migrations/011_auth_abuse_session_controls.sql',
    'server/core/artifacts/migrations/015_workflow_continuations.sql',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'server/core/execution/migrations/034_execution_run_registry.sql',
  ]) assert.equal(manifest.migrationPaths.includes(excluded), false, excluded);
});

test('accepted F4b.5b service bundle exactly equals PostgreSQL classifier bundle ownership', async () => {
  const manifest = await readManifest();
  const metafile = await buildMetafile();
  const actual = repoInputs(metafile);
  assert.deepEqual(actual, [...manifest.bundleInputs].sort());
  for (const path of actual) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, path);
  console.log(`F4B5B_POSTGRES_CLASSIFIER_BUNDLE_INPUTS=${actual.length}`);
});

test('bundle-derived migration authority exactly equals the 27-path classifier SQL set', async () => {
  const manifest = await readManifest();
  const metafile = await buildMetafile();
  const closure = await collectBundleMigrationReferences([metafile]);
  const resolved = await resolveProductionMigrations(closure.migrationNames);
  assert.deepEqual(resolved.map((migration) => migration.source), manifest.migrationPaths);
  for (const path of manifest.migrationPaths) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, path);
  for (const unrelated of [
    'server/transactions/infrastructure/postgres/migrations/001_transaction_store.sql',
    'server/core/auth/migrations/008_canonical_auth_identity_sessions.sql',
    'server/core/artifacts/migrations/015_workflow_continuations.sql',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'server/core/execution/migrations/034_execution_run_registry.sql',
  ]) assert.equal(isFashionExecutionCiRelevant(unrelated, POSTGRES), false, unrelated);
  console.log(`F4B5B_POSTGRES_CLASSIFIER_MIGRATIONS=${resolved.length}`);
});

test('workflow and source-read support dependencies are relevant without widening unrelated domains', async () => {
  const manifest = await readManifest();
  for (const path of manifest.supportPaths) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, path);

  for (const path of [
    'server/core/fashion/garmentAppearanceRefinementFinalLineage.ts',
    'src/platform/creative/deterministic/GarmentTextureCompositeIdentity.js',
    'src/platform/creative/workflow-engine/WorkflowEngine.ts',
  ]) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, `actual bundle dependency: ${path}`);

  for (const path of [
    'server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts',
    'server/core/auth/authSchema.ts',
    'server/core/execution/executionRunSchema.ts',
    'src/platform/creative/local-ai/tinySdPipeline.ts',
    '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    'scripts/check-model-weight-tracking.mjs',
    'tests/fashion-garment-refinement-final-lineage-postgres.test.ts',
    'docs/architecture.md',
  ]) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), false, `unrelated path widened F4b.5b PostgreSQL profile: ${path}`);
});

test('F4b.5b PostgreSQL profile remains separate from F4b.4 PostgreSQL authority', () => {
  const f4b5bOnly = '.github/workflows/fashion-garment-texture-composite-service-postgres-f4b5b.yml';
  assert.equal(isFashionExecutionCiRelevant(f4b5bOnly, POSTGRES), true);
  assert.equal(isFashionExecutionCiRelevant(f4b5bOnly, FASHION_EXECUTION_PROFILES.F4B4_POSTGRES_VERTICAL), false);

  const f4b4Only = 'server/core/composition/createProductionCore.ts';
  assert.equal(isFashionExecutionCiRelevant(f4b4Only, FASHION_EXECUTION_PROFILES.F4B4_POSTGRES_VERTICAL), true);
  assert.equal(isFashionExecutionCiRelevant(f4b4Only, POSTGRES), false);
});

test('F4b.5b PostgreSQL profile classification is normalized deterministic and isolates matched paths', () => {
  const result = classifyFashionExecutionCi([
    './docs/readme.md',
    '\\server\\core\\fashion\\GarmentTextureCompositeEvidenceAuthority.ts',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'server/core/fashion/GarmentTextureCompositeEvidenceAuthority.ts',
  ], POSTGRES);
  assert.equal(result.relevant, true);
  assert.equal(result.classification, RELEVANT_CLASSIFICATION);
  assert.equal(result.changedPathCount, 3);
  assert.deepEqual(result.matchedPaths, ['server/core/fashion/GarmentTextureCompositeEvidenceAuthority.ts']);

  const irrelevant = classifyFashionExecutionCi([
    'docs/readme.md',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
  ], POSTGRES);
  assert.equal(irrelevant.relevant, false);
  assert.equal(irrelevant.classification, NOT_APPLICABLE_CLASSIFICATION);
  assert.deepEqual(irrelevant.matchedPaths, []);
});

test('base-extracted classifier stays standalone for accepted profiles and fails closed for F4b.5b PostgreSQL without manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bers-f4b5b-postgres-classifier-'));
  try {
    const classifier = join(root, 'classify-fashion-execution-ci.mjs');
    await copyFile('scripts/classify-fashion-execution-ci.mjs', classifier);

    const legacy = spawnSync(process.execPath, [
      classifier,
      '--profile', FASHION_EXECUTION_PROFILES.F4B4_WARP_LAYER,
      '--stdin0',
    ], {
      input: Buffer.from('server/core/fashion/garmentWarpLayerSchema.ts\0'),
      encoding: 'utf8',
    });
    assert.equal(legacy.status, 0, legacy.stderr);
    const legacyResult = JSON.parse(legacy.stdout);
    assert.equal(legacyResult.relevant, true);
    assert.deepEqual(legacyResult.matchedPaths, ['server/core/fashion/garmentWarpLayerSchema.ts']);

    const postgres = spawnSync(process.execPath, [classifier, '--profile', POSTGRES, '--stdin0'], {
      input: Buffer.from('.github/workflows/fashion-garment-texture-composite-service-postgres-f4b5b.yml\0'),
      encoding: 'utf8',
    });
    assert.notEqual(postgres.status, 0);
    assert.match(postgres.stderr, /f4b5b-postgres-ci-closure\.json|ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Fashion execution policy owns the F4b.5b PostgreSQL trust root and CLI proof', async () => {
  const policy = await readFile('.github/workflows/fashion-execution-ci-policy.yml', 'utf8');
  for (const path of [
    '.github/workflows/fashion-garment-texture-composite-service-postgres-f4b5b.yml',
    'scripts/f4b5b-postgres-ci-closure.json',
    'tests/fashion-f4b5b-postgres-ci-relevance.test.mjs',
  ]) assert.ok(policy.includes(`      - '${path}'`), `policy trigger missing ${path}`);
  assert.match(policy, /node --test tests\/fashion-f4b5b-postgres-ci-relevance\.test\.mjs/);
  assert.match(policy, /--profile F4B5B_TEXTURE_POSTGRES_VERTICAL --stdin0 --github-output/);
});
