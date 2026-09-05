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

const POSTGRES = FASHION_EXECUTION_PROFILES.F4B4_POSTGRES_VERTICAL;
const ROOTS = Object.freeze([
  'tests/f4b4-postgres-schema-bootstrap.test.ts',
  'tests/garment-mesh-warp-service-postgres.test.ts',
  'tests/local-execution-working-upload-retry-postgres.test.ts',
  'tests/garment-mesh-warp-production-composition-closed.test.ts',
]);
const MANIFEST_PATH = 'scripts/f4b4-postgres-ci-closure.json';

async function readManifest() {
  return JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
}

async function buildMetafiles() {
  const metafiles = [];
  for (const root of ROOTS) {
    const result = await build({
      entryPoints: [root],
      bundle: true,
      write: false,
      metafile: true,
      platform: 'node',
      format: 'esm',
      target: 'node24',
      external: ['node:*', 'pg', 'sharp'],
      logLevel: 'silent',
    });
    metafiles.push(result.metafile);
  }
  return metafiles;
}

function repoInputs(metafiles) {
  const inputs = new Set();
  for (const metafile of metafiles) {
    for (const input of Object.keys(metafile?.inputs ?? {})) {
      const normalized = input.replaceAll('\\', '/').replace(/^\.\//, '');
      if (!normalized.startsWith('node_modules/')) inputs.add(normalized);
    }
  }
  return [...inputs].sort();
}

test('F4b.4 PostgreSQL closure manifest is exact, normalized and prefix-free', async () => {
  const manifest = await readManifest();
  assert.equal(manifest.version, 1);
  assert.equal(manifest.profile, POSTGRES);
  assert.equal(manifest.bundleInputs.length, 190);
  assert.equal(manifest.migrationPaths.length, 34);
  assert.equal(manifest.supportPaths.length, 17);

  const paths = [...manifest.bundleInputs, ...manifest.migrationPaths, ...manifest.supportPaths];
  assert.equal(new Set(paths).size, paths.length);
  for (const path of paths) {
    assert.equal(typeof path, 'string');
    assert.ok(path.length > 0);
    assert.equal(path.includes('\\'), false, path);
    assert.equal(/[*?\[\]]/.test(path), false, path);
  }
  assert.equal(manifest.migrationPaths.includes('server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql'), false);
});

test('accepted four-bundle runtime graph exactly equals PostgreSQL classifier bundle ownership', async () => {
  const manifest = await readManifest();
  const metafiles = await buildMetafiles();
  const actual = repoInputs(metafiles);
  assert.deepEqual(actual, [...manifest.bundleInputs].sort());
  for (const path of actual) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, path);
  console.log(`F4B4_POSTGRES_CLASSIFIER_BUNDLE_INPUTS=${actual.length}`);
});

test('bundle-derived migration authority exactly equals the 34-path classifier SQL set', async () => {
  const manifest = await readManifest();
  const metafiles = await buildMetafiles();
  const closure = await collectBundleMigrationReferences(metafiles);
  const resolved = await resolveProductionMigrations(closure.migrationNames);
  assert.deepEqual(resolved.map((migration) => migration.source), manifest.migrationPaths);
  for (const path of manifest.migrationPaths) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, path);
  assert.equal(isFashionExecutionCiRelevant('server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql', POSTGRES), false);
  console.log(`F4B4_POSTGRES_CLASSIFIER_MIGRATIONS=${resolved.length}`);
});

test('workflow and source-read support dependencies are relevant without widening unrelated domains', async () => {
  const manifest = await readManifest();
  for (const path of manifest.supportPaths) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, path);

  for (const path of [
    'server/core/fashion/garmentAppearanceRefinementFinalLineage.ts',
    'src/platform/creative/local-ai/models/interactive-segmentation.manifest.json',
    'src/platform/creative/providers/fal/FalProvider.ts',
  ]) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), true, `actual bundle dependency: ${path}`);

  for (const path of [
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'server/core/fashion/garmentAppearanceRefinementFinalLineageSchema.ts',
    'server/transactions/infrastructure/postgres/transactionSchemaCli.ts',
    'src/platform/creative/local-ai/tinySdPipeline.ts',
    '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    'scripts/check-model-weight-tracking.mjs',
    'tests/fashion-garment-refinement-final-lineage-postgres.test.ts',
    'docs/architecture.md',
  ]) assert.equal(isFashionExecutionCiRelevant(path, POSTGRES), false, `unrelated path widened PostgreSQL profile: ${path}`);
});

test('PostgreSQL profile classification is normalized deterministic and isolates matched paths', () => {
  const result = classifyFashionExecutionCi([
    './docs/readme.md',
    '\\server\\core\\composition\\createProductionCore.ts',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'server/core/composition/createProductionCore.ts',
  ], POSTGRES);
  assert.equal(result.relevant, true);
  assert.equal(result.classification, RELEVANT_CLASSIFICATION);
  assert.equal(result.changedPathCount, 3);
  assert.deepEqual(result.matchedPaths, ['server/core/composition/createProductionCore.ts']);

  const irrelevant = classifyFashionExecutionCi([
    'docs/readme.md',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
  ], POSTGRES);
  assert.equal(irrelevant.relevant, false);
  assert.equal(irrelevant.classification, NOT_APPLICABLE_CLASSIFICATION);
  assert.deepEqual(irrelevant.matchedPaths, []);
});

test('base-extracted classifier stays standalone for accepted profiles and fails closed for PostgreSQL without manifest', async () => {
  const root = await mkdtemp(join(tmpdir(), 'bers-f4b4-postgres-classifier-'));
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
      input: Buffer.from('Dockerfile\0'),
      encoding: 'utf8',
    });
    assert.notEqual(postgres.status, 0);
    assert.match(postgres.stderr, /f4b4-postgres-ci-closure\.json|ENOENT/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('Fashion execution policy owns the PostgreSQL trust root and CLI proof', async () => {
  const policy = await readFile('.github/workflows/fashion-execution-ci-policy.yml', 'utf8');
  for (const path of [
    '.github/workflows/fashion-garment-mesh-warp-service-postgres-f4b4.yml',
    'scripts/f4b4-postgres-ci-closure.json',
    'tests/fashion-f4b4-postgres-ci-relevance.test.mjs',
  ]) assert.ok(policy.includes(`      - '${path}'`), `policy trigger missing ${path}`);
  assert.match(
    policy,
    /node --test tests\/fashion-f4b4-execution-ci-relevance\.test\.mjs tests\/fashion-f4b4-postgres-ci-relevance\.test\.mjs/,
  );
  assert.match(policy, /--profile F4B4_POSTGRES_VERTICAL --stdin0 --github-output/);
});
