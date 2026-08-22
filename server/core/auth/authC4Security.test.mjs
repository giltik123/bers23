import { mkdir } from 'node:fs/promises';
import test from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { build } from 'esbuild';

const cacheDir = resolve('.test-cache/c4-auth-security');
const securityOutfile = resolve(cacheDir, `authC4Security-${process.pid}.mjs`);
const oauthOutfile = resolve(cacheDir, `authC4OAuthRotation-${process.pid}.mjs`);
const peerShortCircuitOutfile = resolve(cacheDir, `authC4PeerShortCircuit-${process.pid}.mjs`);
const retentionOutfile = resolve(cacheDir, `authRateLimitRetention-${process.pid}.mjs`);
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
  entryPoints: [fileURLToPath(new URL('../../../tests/auth-c4-peer-short-circuit-proof.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: peerShortCircuitOutfile,
  external: ['pg', 'sharp', 'node:*'],
});
const peerShortCircuitProof = await import(pathToFileURL(peerShortCircuitOutfile).href);
await test('C4 blocked peers cannot amplify subject rate-limit rows', peerShortCircuitProof.proveBlockedPeerShortCircuitsSubjectBudgets);

await build({
  entryPoints: [fileURLToPath(new URL('../../../tests/auth-rate-limit-retention-postgres.test.ts', import.meta.url))],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  outfile: retentionOutfile,
  external: ['pg', 'sharp', 'node:*'],
});
const retentionProof = await import(pathToFileURL(retentionOutfile).href);
await test('C4 auth rate-limit retention is bounded and multi-instance safe', retentionProof.proveAuthRateLimitRetention);

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
