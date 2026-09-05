import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import {
  F3C_BROWSER_ENTRY,
  buildFashionF3cBrowserClosure,
} from '../scripts/build-fashion-f3c-browser-closure.mjs';

const REQUIRED_INPUTS = Object.freeze([
  'src/components/editor/outfits/OutfitPanel.jsx',
  'src/application/fashion/canonicalOutfitViewModel.js',
  'src/api/coreClient.js',
  'src/api/managedOutfitClient.js',
  'src/api/managedWardrobeClient.js',
]);

const FORBIDDEN_EXACT_INPUTS = Object.freeze([
  'src/main.jsx',
  'src/components/editor/creative/CreativeStudioPanel.jsx',
]);

const FORBIDDEN_PREFIXES = Object.freeze([
  'server/',
  'src/platform/creative/',
  'src/lib/creative/',
  'src/lib/tryon/',
]);

test('F3c browser build compiles the real Outfit UI inside a bounded repository closure', async () => {
  const result = await buildFashionF3cBrowserClosure();
  assert.equal(result.entryPoint, F3C_BROWSER_ENTRY);
  assert.ok(result.inputs.length > 0, 'F3c browser closure must contain repository inputs');
  assert.equal(new Set(result.inputs).size, result.inputs.length, 'F3c browser closure inputs must be unique');

  for (const required of REQUIRED_INPUTS) {
    assert.ok(result.inputs.includes(required), `F3c browser closure missing ${required}`);
  }
  for (const forbidden of FORBIDDEN_EXACT_INPUTS) {
    assert.equal(result.inputs.includes(forbidden), false, `F3c browser closure must exclude ${forbidden}`);
  }
  for (const prefix of FORBIDDEN_PREFIXES) {
    assert.equal(
      result.inputs.some((input) => input.startsWith(prefix)),
      false,
      `F3c browser closure must exclude ${prefix}*`,
    );
  }
  assert.equal(
    result.inputs.some((input) => input.startsWith('node_modules/')),
    false,
    'npm package internals must remain external to repository closure ownership',
  );

  const output = await readFile(result.outfile);
  assert.ok(output.byteLength > 0, 'bounded F3c browser build must emit a non-empty module');
  const metafile = JSON.parse(await readFile(result.metafilePath, 'utf8'));
  assert.ok(metafile.inputs && typeof metafile.inputs === 'object', 'F3c esbuild metafile must record inputs');

  console.log(`F3C_BROWSER_BUNDLE_INPUTS=${result.inputs.length}`);
  console.log(`F3C_BROWSER_BUNDLE_INPUT_NAMES=${result.inputs.join(',')}`);
});

test('F3c workflow delegates browser compilation to the bounded closure and never the global Vite build', async () => {
  const workflow = await readFile('.github/workflows/fashion-canonical-outfit-ui-f3c.yml', 'utf8');
  assert.equal(workflow.includes('run: npm run build'), false, 'F3c workflow must not invoke the global production frontend build');
  assert.ok(
    workflow.includes('run: node --test tests/fashion-f3c-browser-build-closure.test.mjs'),
    'F3c workflow must execute the bounded browser closure proof',
  );
});
