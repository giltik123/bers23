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

test('F3c pull-request trigger is exactly the accepted 12+19 authority manifest', async () => {
  const workflow = await readFile(WORKFLOW_PATH, 'utf8');
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));

  const expected = [...manifest.bundleInputs, ...manifest.supportPaths];
  assert.equal(manifest.bundleInputs.length, 12, 'bundle input cardinality');
  assert.equal(manifest.supportPaths.length, 19, 'support path cardinality');
  assert.equal(expected.length, 31, 'F3c trusted trigger cardinality');
  assert.equal(new Set(expected).size, expected.length, 'trusted trigger paths must remain unique');

  const { paths } = parseSingleQuotedPathsBlock(workflow);
  assert.equal(paths.length, 31, 'workflow must expose exactly 31 trusted paths');
  assert.deepEqual(paths, expected, 'workflow trigger order and content must exactly equal bundleInputs + supportPaths');
});

const CREATIVE_STUDIO_TEST_LINE = '          node --test tests/creative-outfit-context.test.mjs\n';

const CREATIVE_STUDIO_COMPILE_STEP = `      - name: Prove bounded Creative Studio browser compile
        run: |
          node --input-type=module <<'NODE'
          import { build } from 'esbuild';
          await build({
            absWorkingDir: process.cwd(),
            entryPoints: ['src/components/editor/creative/CreativeStudioPanel.jsx'],
            bundle: true,
            platform: 'browser',
            format: 'esm',
            target: ['es2022'],
            outfile: '.test-cache/fashion-f3c-browser/creative-studio.mjs',
            packages: 'external',
            alias: { '@': './src' },
            logLevel: 'silent',
          });
          NODE
`;

const CREATIVE_STUDIO_POLICY_STEP = `      - name: Allow only read-only canonical Outfit context in Creative Studio
        run: |
          set -euo pipefail
          FILE=src/components/editor/creative/CreativeStudioPanel.jsx
          grep -q 'coreClient.fashion.outfits.list' "$FILE"
          grep -q 'projectReadyCreativeOutfits' "$FILE"
          grep -q 'useAuth()' "$FILE"
          grep -q 'principalKey' "$FILE"
          grep -q 'creativeHistory.save(historyStrategy)' "$FILE"
          grep -q 'outfits: EMPTY_OUTFITS' "$FILE"
          ! grep -q 'creativeHistory.save(strategy)' "$FILE"
          ! grep -E -q 'outfitManager|coreClient\\.entities|coreClient\\.fashion\\.(garments|collections|wardrobe|checkTryOnReadiness|admitManualParametricRepresentation)|coreClient\\.fashion\\.outfits\\.(get|create|updateMetadata|duplicate|archive|restore|remove|addEntry|replaceEntry|removeEntry|setEntryRole|reorderEntries)|coreClient\\.creative\\.execute|Core\\.UploadFile|integrations\\.Core|compositeContinuations|functions\\.invoke|FASHN|billing|credits|provider|onCommit|onRollback|fetch\\(' "$FILE"
          ! grep -q 'outfits: \\[\\]' "$FILE"
`;

const ACCEPTED_CREATIVE_STUDIO_POLICY_STEP = `      - name: Keep Creative Studio disconnected from Outfit data
        run: |
          ! grep -E -q 'coreClient|outfitManager' src/components/editor/creative/CreativeStudioPanel.jsx
          grep -q 'outfits: \\[\\]' src/components/editor/creative/CreativeStudioPanel.jsx
`;

function replaceExactLine(source, line, replacement, label) {
  const occurrences = source.split(line).length - 1;
  assert.equal(occurrences, 1, label + ' must occur exactly once');
  return source.replace(line, replacement);
}

function replaceExactBlock(source, startMarker, endMarker, expectedBlock, replacementBlock, label) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, label + ' start marker');
  assert.equal(source.indexOf(startMarker, start + startMarker.length), -1, label + ' start marker uniqueness');
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, label + ' end marker');
  const actual = source.slice(start, end);
  assert.equal(actual, expectedBlock, label + ' must match the bounded reviewed extension');
  return source.slice(0, start) + replacementBlock + source.slice(end);
}

test('F3c trigger alignment preserves the accepted body except the bounded read-only Creative Studio extension', async () => {
  const workflow = await readFile(WORKFLOW_PATH, 'utf8');
  const accepted = readGitBlob(ACCEPTED_PRE_ALIGNMENT_WORKFLOW_BLOB);

  const acceptedPaths = parseSingleQuotedPathsBlock(accepted).paths;
  assert.equal(acceptedPaths.length, 9, 'pre-alignment workflow oracle should retain its accepted 9-path trigger');

  let normalized = replaceExactLine(
    workflow,
    CREATIVE_STUDIO_TEST_LINE,
    '',
    'Creative Studio context regression invocation',
  );
  normalized = replaceExactBlock(
    normalized,
    '      - name: Prove bounded Creative Studio browser compile\\n',
    '      - name: Reject legacy, execution and financial authority widening\\n',
    CREATIVE_STUDIO_COMPILE_STEP,
    '',
    'Creative Studio browser compile step',
  );
  normalized = replaceExactBlock(
    normalized,
    '      - name: Allow only read-only canonical Outfit context in Creative Studio\\n',
    '      - name: Check committed diff whitespace\\n',
    CREATIVE_STUDIO_POLICY_STEP,
    ACCEPTED_CREATIVE_STUDIO_POLICY_STEP,
    'Creative Studio read-only authority guard',
  );

  assert.equal(
    replacePathsBlockWithSentinel(normalized),
    replacePathsBlockWithSentinel(accepted),
    'only the pull_request paths list and the explicitly reviewed read-only Creative Studio extension may differ',
  );
});
