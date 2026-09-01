import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrls = [
  '../.github/workflows/sprint-6.42d3-tiny-sd-precision.yml',
  '../.github/workflows/sprint-6.42d3-tiny-sd-wasm-compact.yml',
  '../.github/workflows/sprint-6.42d4-tiny-sd-ort-memory.yml',
  '../.github/workflows/sprint-6.42d5-tiny-sd-pipeline.yml',
];

for (const relativeUrl of workflowUrls) {
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
}
