import assert from 'node:assert/strict';
import test from 'node:test';

import {
  NOT_APPLICABLE_CLASSIFICATION,
  RELEVANT_CLASSIFICATION,
  classifyTinySdHeavyCi,
  isTinySdHeavyCiRelevant,
} from '../scripts/classify-tiny-sd-heavy-ci.mjs';

test('product-only changes are explicitly not applicable to heavyweight Tiny-SD acceptance', () => {
  const result = classifyTinySdHeavyCi([
    'src/pages/AssetLibrary.jsx',
    'src/pages/Editor.jsx',
    'server/core/projects/ProjectService.ts',
    '.github/workflows/security-audit.yml',
    'docs/product-readiness.md',
  ]);

  assert.equal(result.relevant, false);
  assert.equal(result.classification, NOT_APPLICABLE_CLASSIFICATION);
  assert.deepEqual(result.matchedPaths, []);
});

test('Tiny-SD model, runtime, workflow, script, test and dependency changes require heavyweight acceptance', () => {
  const relevantPaths = [
    'src/platform/creative/local-ai/browser/BrowserOnnxSessionFactory.ts',
    'src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json',
    'scripts/prepare-tiny-sd-d3-wasm-quantized.py',
    'scripts/tiny_sd_d2_common.py',
    'tests/tiny-sd-d4-policy.test.mjs',
    'tests/tiny-sd-heavy-ci-workflow-trust.test.mjs',
    '.github/workflows/sprint-6.42d1-tiny-sd-acquisition.yml',
    '.github/workflows/sprint-6.42d2-tiny-sd-components.yml',
    '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    '.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
    '.github/workflows/tiny-sd-d3-wasm-d2-prep.yml',
    '.github/workflows/tiny-sd-d3-wasm-strategy-phase.yml',
    '.github/workflows/tiny-sd-d3-wasm-browser-phase.yml',
    '.github/workflows/sprint-6.42d4-ort-conversion-smoke.yml',
    '.github/workflows/sprint-6.42d4-secure-threading.yml',
    '.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml',
    '.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml',
    'scripts/check-model-weight-tracking.mjs',
    'package.json',
    'package-lock.json',
    '.npmrc',
  ];

  for (const path of relevantPaths) {
    assert.equal(isTinySdHeavyCiRelevant(path), true, path);
    const result = classifyTinySdHeavyCi([path]);
    assert.equal(result.relevant, true, path);
    assert.equal(result.classification, RELEVANT_CLASSIFICATION, path);
    assert.deepEqual(result.matchedPaths, [path], path);
  }
});

test('one relevant path makes a mixed change set fail closed into heavyweight acceptance', () => {
  const result = classifyTinySdHeavyCi([
    'src/pages/Editor.jsx',
    'docs/readme.md',
    './src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json',
  ]);

  assert.equal(result.relevant, true);
  assert.equal(result.classification, RELEVANT_CLASSIFICATION);
  assert.deepEqual(result.matchedPaths, [
    'src/platform/creative/local-ai/models/tiny-sd-generation.manifest.json',
  ]);
});

test('path normalization prevents trivial slash variants from bypassing relevance', () => {
  assert.equal(
    isTinySdHeavyCiRelevant('.\\src\\platform\\creative\\local-ai\\BrowserOnnxSessionFactory.ts'),
    true,
  );
  assert.equal(isTinySdHeavyCiRelevant('/tests/tiny-sd-d3-policy.test.mjs'), true);
});

test('unrelated scripts and tests do not accidentally trigger the heavyweight model matrix', () => {
  assert.equal(isTinySdHeavyCiRelevant('scripts/build-core-server.mjs'), false);
  assert.equal(isTinySdHeavyCiRelevant('tests/editor-canonical-boundary.test.mjs'), false);
  assert.equal(isTinySdHeavyCiRelevant('.github/workflows/node.js.yml'), false);
});
