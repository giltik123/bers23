import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { build } from 'esbuild';

test('Sprint 6.41C2 production runtime verification acceptance is mandatory', async () => {
  await mkdir('.test-cache/6.41c2', { recursive: true });
  const outfile = '.test-cache/6.41c2/runtime-verification.test.mjs';
  await build({
    entryPoints: ['tests/creative-runtime-verification.test.ts'],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node20',
    outfile,
    external: ['node:*'],
  });
  const result = spawnSync(process.execPath, [outfile], { encoding: 'utf8' });
  assert.equal(result.status, 0, `6.41C2 bundled acceptance failed\nSTDOUT:\n${result.stdout}\nSTDERR:\n${result.stderr}`);
});
