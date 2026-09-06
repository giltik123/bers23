import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import {
  FASHION_AUTHORITY_PROFILES,
  NOT_APPLICABLE_CLASSIFICATION,
  RELEVANT_CLASSIFICATION,
  classifyFashionAuthorityCi,
  isFashionAuthorityCiRelevant,
} from '../scripts/classify-fashion-authority-ci.mjs';
import { buildFashionF3cBrowserClosure } from '../scripts/build-fashion-f3c-browser-closure.mjs';

const PROFILE = FASHION_AUTHORITY_PROFILES.F3C_CANONICAL_OUTFIT_UI;
const MANIFEST_PATH = new URL('../scripts/f3c-canonical-outfit-ui-ci-closure.json', import.meta.url);
const CLASSIFIER_PATH = new URL('../scripts/classify-fashion-authority-ci.mjs', import.meta.url);

const CONTROL_PATHS = Object.freeze([
  '.github/workflows/fashion-authority-ci-policy.yml',
  'scripts/classify-fashion-authority-ci.mjs',
  'scripts/f3c-canonical-outfit-ui-ci-closure.json',
  'tests/fashion-f3c-ci-relevance.test.mjs',
  'tests/fashion-authority-ci-relevance.test.mjs',
  'tests/fashion-authority-ci-workflow-trust.test.mjs',
]);

function assertExactPathList(paths, label, expectedCount) {
  assert.equal(paths.length, expectedCount, `${label} cardinality`);
  assert.equal(new Set(paths).size, paths.length, `${label} must not contain duplicates`);
  for (const path of paths) {
    assert.equal(typeof path, 'string', `${label} path type`);
    assert.ok(path.length > 0, `${label} path must be non-empty`);
    assert.equal(path.startsWith('./'), false, `${label} must be repository-normalized: ${path}`);
    assert.equal(path.startsWith('/'), false, `${label} must be repository-relative: ${path}`);
    assert.equal(path.includes('\\'), false, `${label} must use slash separators: ${path}`);
    assert.equal(path.split('/').includes('..'), false, `${label} must not traverse: ${path}`);
    assert.equal(/[*?{}[\]]/.test(path), false, `${label} must not contain wildcard syntax: ${path}`);
  }
}

test('F3c manifest is exact, normalized and matches the accepted browser bundle graph', async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.profile, PROFILE);
  assertExactPathList(manifest.bundleInputs, 'bundleInputs', 11);
  assertExactPathList(manifest.supportPaths, 'supportPaths', 19);
  assert.equal(
    manifest.bundleInputs.some(path => manifest.supportPaths.includes(path)),
    false,
    'bundle and support authority must not overlap',
  );

  const actual = await buildFashionF3cBrowserClosure({
    runtimeDir: '.test-cache/fashion-f3c-classifier-trust',
  });
  assert.deepEqual(
    actual.inputs,
    manifest.bundleInputs,
    'accepted F3c esbuild graph must exactly equal the declarative classifier bundle closure',
  );
});

test('F3c profile owns every exact bundle, semantic support and control path', async () => {
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  for (const path of [...manifest.bundleInputs, ...manifest.supportPaths, ...CONTROL_PATHS]) {
    assert.equal(isFashionAuthorityCiRelevant(path, PROFILE), true, path);
  }
});

test('F3c profile stays separate from broad legacy Fashion authority and execution/model work', () => {
  for (const path of [
    'server/core/fashion/garmentSchema.ts',
    'server/core/fashion/postgresGarmentRepresentationStore.ts',
    'server/core/fashion/migrations/032_fashion_garment_refinement_final_lineage.sql',
    'server/core/localExecution/productionLocalExecutorPolicy.ts',
    'server/core/providers/productionExecutionCapabilities.ts',
    'src/platform/creative/deterministic/DeterministicToolRegistry.ts',
    'src/platform/creative/local-ai/tinySdPipeline.ts',
    'tests/tiny-sd-d3-wasm-browser.test.mjs',
    'docs/architecture.md',
  ]) {
    assert.equal(isFashionAuthorityCiRelevant(path, PROFILE), false, path);
  }

  assert.equal(isFashionAuthorityCiRelevant('server/core/fashion/garmentSchema.ts'), true, 'legacy union remains broad by design');
  assert.equal(isFashionAuthorityCiRelevant('src/platform/creative/local-ai/tinySdPipeline.ts'), false);
});

test('F3c profile classification is deterministic for mixed changes', () => {
  const result = classifyFashionAuthorityCi([
    './docs/readme.md',
    '\\src\\application\\fashion\\canonicalOutfitViewModel.js',
    'src/application/fashion/canonicalOutfitViewModel.js',
    'server/core/fashion/garmentSchema.ts',
  ], PROFILE);
  assert.equal(result.relevant, true);
  assert.equal(result.classification, RELEVANT_CLASSIFICATION);
  assert.equal(result.changedPathCount, 3);
  assert.deepEqual(result.matchedPaths, ['src/application/fashion/canonicalOutfitViewModel.js']);

  const irrelevant = classifyFashionAuthorityCi([
    'server/core/fashion/garmentSchema.ts',
    'src/platform/creative/local-ai/tinySdPipeline.ts',
  ], PROFILE);
  assert.equal(irrelevant.relevant, false);
  assert.equal(irrelevant.classification, NOT_APPLICABLE_CLASSIFICATION);
  assert.deepEqual(irrelevant.matchedPaths, []);
});

test('standalone legacy classifier does not require the F3c manifest, while F3c profile fails closed without it', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'fashion-authority-classifier-'));
  try {
    const classifierCopy = join(directory, 'classify-fashion-authority-ci.mjs');
    await copyFile(CLASSIFIER_PATH, classifierCopy);
    const input = Buffer.from('server/core/fashion/garmentSchema.ts\0', 'utf8');

    const legacy = spawnSync(process.execPath, [classifierCopy, '--stdin0'], { input, encoding: 'utf8' });
    assert.equal(legacy.status, 0, legacy.stderr);
    const legacyResult = JSON.parse(legacy.stdout);
    assert.equal(legacyResult.relevant, true);
    assert.deepEqual(legacyResult.matchedPaths, ['server/core/fashion/garmentSchema.ts']);

    const profiled = spawnSync(
      process.execPath,
      [classifierCopy, '--profile', PROFILE, '--stdin0'],
      { input, encoding: 'utf8' },
    );
    assert.notEqual(profiled.status, 0, 'F3c profile must fail without its adjacent manifest');
    assert.match(profiled.stderr, /Unable to load adjacent F3c CI closure manifest/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('unknown Fashion authority profile fails closed', () => {
  assert.throws(
    () => classifyFashionAuthorityCi(['src/components/editor/outfits/OutfitPanel.jsx'], 'UNKNOWN_PROFILE'),
    /Unknown Fashion authority CI profile/,
  );
});
