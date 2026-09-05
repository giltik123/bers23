import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const expectedConcurrency = `\nconcurrency:\n  group: \${{ github.workflow }}-\${{ github.event.pull_request.number || github.run_id }}\n  cancel-in-progress: \${{ github.event_name == 'pull_request' }}\n`;

async function source(path) {
  return readFile(new URL(path, import.meta.url), 'utf8');
}

function triggerBlock(workflow) {
  const start = workflow.indexOf('on:\n');
  const jobs = workflow.indexOf('\njobs:\n');
  assert.ok(start >= 0 && jobs > start, 'workflow trigger/jobs boundary missing');
  return workflow.slice(start, jobs);
}

test('EfficientSAM C4 runs only for reviewed acquisition/release dependency surfaces', async () => {
  const workflow = await source('../.github/workflows/sprint-6.42c4-efficientsam-acquisition.yml');
  const trigger = triggerBlock(workflow);

  assert.match(trigger, /pull_request:\n\s+branches: \[ "main" \]/);
  assert.match(trigger, /workflow_dispatch:/);
  for (const required of [
    '.github/workflows/sprint-6.42c4-efficientsam-acquisition.yml',
    '.github/workflows/efficientsam-release.yml',
    'scripts/inspect-efficientsam-ti-release.py',
    'scripts/check-model-weight-tracking.mjs',
    'tests/efficientsam-release-policy.test.ts',
    'tests/efficientsam-release-workflow.test.mjs',
    'tests/local-model-candidate-catalog.test.ts',
    'tests/ci-domain-fanout-wave3a.test.mjs',
    'src/platform/creative/local-ai/**',
    'server/core/localExecution/productionLocalModelPolicy.ts',
    'server/core/localExecution/productionLocalExecutorPolicy.ts',
    'package.json',
    'package-lock.json',
    '.npmrc',
  ]) {
    assert.ok(trigger.includes(`- "${required}"`), `C4 missing fail-closed dependency path: ${required}`);
  }
  assert.doesNotMatch(trigger, /server\/core\/fashion\/\*\*/);
  assert.doesNotMatch(trigger, /scripts\/\*tiny-sd/);
  assert.ok(workflow.includes(expectedConcurrency), 'C4 PR-scoped concurrency contract drifted');
});

test('Fashion F4b.5b.1 FINAL lineage is main-only and isolated from local-AI model work', async () => {
  const workflow = await source('../.github/workflows/fashion-garment-texture-final-lineage-f4b5b1.yml');
  const trigger = triggerBlock(workflow);

  assert.match(trigger, /pull_request:\n\s+branches: \[ "main" \]/);
  assert.doesNotMatch(trigger, /fashion-garment-texture-composite-kernels-f4b5a/);
  assert.match(trigger, /workflow_dispatch:/);
  for (const required of [
    '.github/workflows/fashion-garment-texture-final-lineage-f4b5b1.yml',
    'tests/ci-domain-fanout-wave3a.test.mjs',
    'tests/fashion-garment-texture-final-lineage-postgres.test.ts',
    'server/core/fashion/**',
    'server/core/artifacts/**',
    'server/transactions/**',
    'src/platform/creative/deterministic/**',
    'src/lib/tryon/tryonEngine.js',
    'scripts/build-core-server.mjs',
    'jsconfig.json',
    'server/tsconfig.json',
    'package.json',
    'package-lock.json',
    '.npmrc',
  ]) {
    assert.ok(trigger.includes(`- "${required}"`), `Fashion FINAL missing fail-closed dependency path: ${required}`);
  }
  assert.doesNotMatch(trigger, /src\/platform\/creative\/local-ai\/\*\*/);
  assert.doesNotMatch(trigger, /scripts\/\*tiny-sd/);
  assert.ok(workflow.includes(expectedConcurrency), 'Fashion FINAL PR-scoped concurrency contract drifted');
});
