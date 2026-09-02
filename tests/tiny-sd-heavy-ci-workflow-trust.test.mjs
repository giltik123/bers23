import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const expectedGroupLine = 'group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.run_id }}';
const expectedCancelLine = "cancel-in-progress: ${{ github.event_name == 'pull_request' }}";

const workflows = [
  {
    url: '../.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    workflowName: 'Sprint 6.42D3 Tiny-SD precision tiers',
    finalGateMarker: '- name: Require D3 precision heavy acceptance when relevant',
  },
  {
    url: '../.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
    workflowName: 'Sprint 6.42D3 Tiny-SD WASM compact',
    finalGateMarker: '- name: Require D3 WASM heavy acceptance when relevant',
  },
  {
    url: '../.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml',
    workflowName: 'Sprint 6.42D4 Tiny-SD ORT memory and latency',
    finalGateMarker: '- name: Require D4 ORT heavy acceptance when relevant',
  },
  {
    url: '../.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml',
    workflowName: 'Sprint 6.42D5 Tiny-SD short pipeline composition',
    finalGateMarker: '- name: Require D5 heavy acceptance when relevant',
  },
];

function concurrencyGroup({ workflow, eventName, pullRequestNumber, runId }) {
  const runIdentity = eventName === 'pull_request' ? pullRequestNumber : runId;
  return `${workflow}-${runIdentity}`;
}

function cancelInProgress(eventName) {
  return eventName === 'pull_request';
}

test('heavy workflow concurrency keys cancel only obsolete runs for the same PR and workflow', () => {
  const [precision, wasm] = workflows;
  const firstHead = concurrencyGroup({
    workflow: precision.workflowName,
    eventName: 'pull_request',
    pullRequestNumber: 357,
    runId: 1001,
  });
  const newerHead = concurrencyGroup({
    workflow: precision.workflowName,
    eventName: 'pull_request',
    pullRequestNumber: 357,
    runId: 1002,
  });
  const anotherPr = concurrencyGroup({
    workflow: precision.workflowName,
    eventName: 'pull_request',
    pullRequestNumber: 358,
    runId: 1003,
  });
  const anotherWorkflow = concurrencyGroup({
    workflow: wasm.workflowName,
    eventName: 'pull_request',
    pullRequestNumber: 357,
    runId: 1004,
  });
  const manualA = concurrencyGroup({
    workflow: precision.workflowName,
    eventName: 'workflow_dispatch',
    runId: 2001,
  });
  const manualB = concurrencyGroup({
    workflow: precision.workflowName,
    eventName: 'workflow_dispatch',
    runId: 2002,
  });

  assert.equal(firstHead, newerHead, 'newer heads of the same PR/workflow must supersede the obsolete group');
  assert.notEqual(firstHead, anotherPr, 'different PRs must not cancel each other');
  assert.notEqual(firstHead, anotherWorkflow, 'different heavyweight workflows must not cancel each other');
  assert.notEqual(firstHead, manualA, 'manual evidence must not share the PR cancellation group');
  assert.notEqual(manualA, manualB, 'manual evidence runs must remain independently addressable');
  assert.equal(cancelInProgress('pull_request'), true);
  assert.equal(cancelInProgress('workflow_dispatch'), false);
});

test('heavy workflow names remain unique because github.workflow is part of the repository-wide concurrency key', () => {
  const names = workflows.map(({ workflowName }) => workflowName);
  assert.equal(new Set(names).size, workflows.length);
});

for (const { url: relativeUrl, workflowName, finalGateMarker } of workflows) {
  const source = await readFile(new URL(relativeUrl, import.meta.url), 'utf8');
  const name = relativeUrl.split('/').at(-1);

  test(`${name} uses the exact PR-only cancellation policy while preserving manual evidence`, () => {
    assert.ok(source.startsWith(`name: ${workflowName}\n`), `${name}: unexpected workflow identity`);
    assert.match(source, /\n  pull_request:\n/);
    assert.match(source, /\n  workflow_dispatch:\n/);

    const concurrencyStart = source.indexOf('\nconcurrency:\n');
    const envStart = source.indexOf('\nenv:\n');
    assert.ok(concurrencyStart >= 0, `${name}: top-level concurrency block missing`);
    assert.ok(envStart > concurrencyStart, `${name}: concurrency must be established before jobs/environment work`);
    assert.equal((source.match(/^concurrency:/gmu) ?? []).length, 1, `${name}: concurrency policy must have one owner`);

    const concurrencyBlock = source.slice(concurrencyStart, envStart);
    assert.equal(
      concurrencyBlock,
      `\nconcurrency:\n  ${expectedGroupLine}\n  ${expectedCancelLine}\n`,
      `${name}: concurrency contract drifted`,
    );
    assert.doesNotMatch(concurrencyBlock, /github\.(?:ref|sha|head_ref)/u, `${name}: commit/ref identity would defeat PR supersession`);
    assert.doesNotMatch(concurrencyBlock, /cancel-in-progress:\s*true/u, `${name}: manual evidence must never be unconditionally cancelled`);
  });

  test(`${name} decides Tiny-SD relevance from exact base code before PR-controlled tests`, () => {
    const stepsStart = source.indexOf('    steps:\n');
    const classifyStart = source.indexOf('- name: Classify heavyweight Tiny-SD relevance from trusted base');
    const proveStart = source.indexOf('- name: Prove Tiny-SD relevance classifier contract');
    assert.ok(stepsStart >= 0 && classifyStart > stepsStart, `${name}: classifier step missing`);
    assert.ok(proveStart > classifyStart, `${name}: PR-controlled policy tests must run after classification`);

    const preClassification = source.slice(stepsStart, classifyStart);
    assert.doesNotMatch(preClassification, /\n\s+run:/, `${name}: PR-controlled run step exists before trusted decision`);

    const classifyStep = source.slice(classifyStart, proveStart);
    assert.match(classifyStep, /\^\[0-9a-f\]\{40\}\$/);
    assert.match(classifyStep, /TRUSTED_CLASSIFIER=/);
    assert.match(classifyStep, /git show "\$\{BASE_SHA\}:scripts\/classify-tiny-sd-heavy-ci\.mjs"/);
    assert.match(classifyStep, /wc -c/);
    assert.match(classifyStep, /1048576/);
    assert.match(classifyStep, /GITHUB_ACTIONS=false node "\$\{TRUSTED_CLASSIFIER\}" --stdin0 --github-output "\$\{GITHUB_OUTPUT\}"/);
    assert.doesNotMatch(classifyStep, /node scripts\/classify-tiny-sd-heavy-ci\.mjs/);
  });

  test(`${name} final gate fails closed if the classifier or current relevant heavy job failed or was cancelled`, () => {
    const finalGateStart = source.indexOf(finalGateMarker);
    assert.ok(finalGateStart >= 0, `${name}: final gate marker missing`);
    const finalGate = source.slice(finalGateStart);
    assert.match(finalGate, /CLASSIFIER_RESULT: \$\{\{ needs\.classify_tiny_sd_relevance\.result \}\}/);
    const classifierGuard = finalGate.indexOf('test "${CLASSIFIER_RESULT}" = "success"');
    const relevantBranch = finalGate.indexOf('if [ "${RELEVANT}" = "true" ]');
    assert.ok(classifierGuard >= 0, `${name}: classifier-result guard missing`);
    assert.ok(relevantBranch > classifierGuard, `${name}: relevance branching happens before classifier-result guard`);
    assert.match(finalGate, /test "\$\{HEAVY_RESULT\}" = "success"/);
    assert.match(finalGate, /test "\$\{HEAVY_RESULT\}" = "skipped"/);
    assert.doesNotMatch(finalGate, /HEAVY_RESULT[^\n]*(?:cancelled|failure)/u, `${name}: cancellation/failure must never be accepted as a terminal success value`);
  });
}
