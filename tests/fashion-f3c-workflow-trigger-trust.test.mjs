import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const WORKFLOW_PATH = new URL('../.github/workflows/fashion-canonical-outfit-ui-f3c.yml', import.meta.url);
const MANIFEST_PATH = new URL('../scripts/f3c-canonical-outfit-ui-ci-closure.json', import.meta.url);
const ACCEPTED_PRE_ALIGNMENT_WORKFLOW_BLOB = '5efb7dd37211bf48fad806da64c9183a37d8c2ab';

function parseSingleQuotedPathsBlock(source) {
  const lines = source.split('\n');
  const start = lines.findIndex(line => line === '    paths:');
  assert.notEqual(start, -1, 'workflow must contain pull_request paths block');

  const paths = [];
  let end = start + 1;
  for (; end < lines.length; end += 1) {
    const match = /^      - '([^']+)'$/.exec(lines[end]);
    if (!match) break;
    paths.push(match[1]);
  }

  assert.ok(paths.length > 0, 'workflow paths block must not be empty');
  return { lines, start, end, paths };
}

function replacePathsBlockWithSentinel(source) {
  const { lines, start, end } = parseSingleQuotedPathsBlock(source);
  return [
    ...lines.slice(0, start),
    '    paths:',
    "      - '__F3C_TRUSTED_PATHS__'",
    ...lines.slice(end),
  ].join('\n');
}

function readGitBlob(blobSha) {
  const result = spawnSync('git', ['cat-file', 'blob', blobSha], {
    encoding: 'utf8',
    maxBuffer: 2 * 1024 * 1024,
  });
  assert.equal(result.status, 0, `unable to read accepted workflow blob ${blobSha}: ${result.stderr}`);
  return result.stdout;
}

test('F3c pull-request trigger is exactly the accepted 11+19 authority manifest', async () => {
  const workflow = await readFile(WORKFLOW_PATH, 'utf8');
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));

  const expected = [...manifest.bundleInputs, ...manifest.supportPaths];
  assert.equal(manifest.bundleInputs.length, 11, 'bundle input cardinality');
  assert.equal(manifest.supportPaths.length, 19, 'support path cardinality');
  assert.equal(expected.length, 30, 'F3c trusted trigger cardinality');
  assert.equal(new Set(expected).size, expected.length, 'trusted trigger paths must remain unique');

  const { paths } = parseSingleQuotedPathsBlock(workflow);
  assert.equal(paths.length, 30, 'workflow must expose exactly 30 trusted paths');
  assert.deepEqual(paths, expected, 'workflow trigger order and content must exactly equal bundleInputs + supportPaths');
});

test('F3c trigger alignment preserves every accepted workflow byte outside paths', async () => {
  const workflow = await readFile(WORKFLOW_PATH, 'utf8');
  const accepted = readGitBlob(ACCEPTED_PRE_ALIGNMENT_WORKFLOW_BLOB);

  const acceptedPaths = parseSingleQuotedPathsBlock(accepted).paths;
  assert.equal(acceptedPaths.length, 9, 'pre-alignment workflow oracle should retain its accepted 9-path trigger');

  assert.equal(
    replacePathsBlockWithSentinel(workflow),
    replacePathsBlockWithSentinel(accepted),
    'only the pull_request paths list may differ from the accepted F3c workflow body',
  );
});
