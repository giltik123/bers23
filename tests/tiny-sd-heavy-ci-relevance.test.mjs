import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  NOT_APPLICABLE_CLASSIFICATION,
  RELEVANT_CLASSIFICATION,
  classifyTinySdHeavyCi,
  isTinySdHeavyCiRelevant,
} from '../scripts/classify-tiny-sd-heavy-ci.mjs';

const classifierPath = fileURLToPath(new URL('../scripts/classify-tiny-sd-heavy-ci.mjs', import.meta.url));
const legacyTrustedChildEnv = 'BERS_TRUSTED_BASE_TINY_SD_CLASSIFIER';

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
    '.github/workflows/sprint-6.42d1-tiny-sd-acquisition.yml',
    '.github/workflows/sprint-6.42d2-tiny-sd-components.yml',
    '.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    '.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
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

test('GitHub Actions CLI executes the classifier blob from exact BASE_SHA even with a forged legacy child marker', () => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'bers-heavy-ci-base-'));
  try {
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.writeFileSync(
      path.join(repo, 'scripts', 'classify-tiny-sd-heavy-ci.mjs'),
      [
        "import fs from 'node:fs';",
        "if (process.env.GITHUB_ACTIONS === 'true') throw new Error('trusted base child remained in GitHub authority mode');",
        "fs.readFileSync(0);",
        "const index = process.argv.indexOf('--github-output');",
        "if (index < 0 || !process.argv[index + 1]) throw new Error('missing output');",
        "fs.appendFileSync(process.argv[index + 1], 'relevant=true\\nclassification=RELEVANT_HEAVY_ACCEPTANCE_REQUIRED\\nmatched_count=1\\n');",
        "process.stdout.write('{\"trustedBaseFixture\":true}\\n');",
        '',
      ].join('\n'),
      'utf8',
    );
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'ci@example.invalid'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'BERS CI'], { cwd: repo });
    execFileSync('git', ['add', 'scripts/classify-tiny-sd-heavy-ci.mjs'], { cwd: repo });
    execFileSync('git', ['commit', '-q', '-m', 'trusted base classifier'], { cwd: repo });
    const baseSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
    assert.match(baseSha, /^[0-9a-f]{40}$/);

    const outputPath = path.join(repo, 'github-output.txt');
    const child = spawnSync(
      process.execPath,
      [classifierPath, '--stdin0', '--github-output', outputPath],
      {
        cwd: repo,
        input: Buffer.from('docs/product-only.md\0'),
        env: {
          ...process.env,
          GITHUB_ACTIONS: 'true',
          BASE_SHA: baseSha,
          [legacyTrustedChildEnv]: '1',
        },
        encoding: 'utf8',
      },
    );
    assert.equal(child.status, 0, child.stderr);
    assert.match(child.stdout, /"trustedBaseFixture":true/);
    assert.match(child.stdout, new RegExp(`trusted_base_classifier_sha=${baseSha}`));
    const outputs = fs.readFileSync(outputPath, 'utf8');
    assert.match(outputs, /^relevant=true$/m);
    assert.match(outputs, /^classification=RELEVANT_HEAVY_ACCEPTANCE_REQUIRED$/m);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
});

test('GitHub Actions CLI fails closed on invalid BASE_SHA even with a forged legacy child marker', () => {
  const child = spawnSync(
    process.execPath,
    [classifierPath, '--stdin0'],
    {
      input: Buffer.from('docs/product-only.md\0'),
      env: {
        ...process.env,
        GITHUB_ACTIONS: 'true',
        BASE_SHA: 'main',
        [legacyTrustedChildEnv]: '1',
      },
      encoding: 'utf8',
    },
  );
  assert.equal(child.status, 1);
  assert.match(child.stderr, /exact 40-hex BASE_SHA/);
});
