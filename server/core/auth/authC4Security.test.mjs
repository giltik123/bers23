import { mkdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const cacheDir = resolve('.test-cache/c4-auth-security');
const securityOutfile = resolve(cacheDir, `authC4Security-${process.pid}.mjs`);
const oauthOutfile = resolve(cacheDir, `authC4OAuthRotation-${process.pid}.mjs`);
await mkdir(cacheDir, { recursive: true });

await build({
  entryPoints: [fileURLToPath(new URL('../../../tests/auth-c4-oauth-rotation-proof.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: oauthOutfile,
  external: ['pg', 'sharp', 'node:*'],
});
const oauthProof = await import(pathToFileURL(oauthOutfile).href);
await test('C4 OAuth reauthentication rotates the originating session without a callback cookie', oauthProof.proveOAuthReauthenticationRotation);

await build({
  entryPoints: [fileURLToPath(new URL('../../../tests/auth-c4-security-postgres.test.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: securityOutfile,
  external: ['pg', 'sharp', 'node:*'],
});
await import(pathToFileURL(securityOutfile).href);
