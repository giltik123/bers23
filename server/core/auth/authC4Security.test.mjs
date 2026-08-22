import { mkdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const cacheDir = resolve('.test-cache/c4-auth-security');
const outfile = resolve(cacheDir, `authC4Security-${process.pid}.mjs`);
await mkdir(cacheDir, { recursive: true });
await build({
  entryPoints: [fileURLToPath(new URL('./authC4Security.test.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile,
  external: ['pg', 'sharp', 'node:*'],
});
await import(pathToFileURL(outfile).href);
