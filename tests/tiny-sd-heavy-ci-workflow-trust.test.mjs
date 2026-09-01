import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflows = [
  {
    url: '../.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
    finalGateMarker: '- name: Require D3 precision heavy acceptance when relevant',
  },
  {
    url: '../.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
    finalGateMarker: '- name: Require D3 WASM heavy acceptance when relevant',
  },
  {
    url: '../.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml',
    finalGateMarker: '- name: Require D4 ORT heavy acceptance when relevant',
  },
  {
    url: '../.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml',
    finalGateMarker: '- name: Require D5 heavy acceptance when relevant',
  },
];

for (const { url: relativeUrl, finalGateMarker } of workflows) {
  const source = await readFile(new URL(relativeUrl, import.meta.url), 'utf8');
  const name = relativeUrl.split('/').at(-1);

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

  test(`${name} final gate fails closed if the classifier job itself failed`, () => {
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
  });
}
