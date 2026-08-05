import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';

await mkdir('node_modules/.cache', { recursive: true });
await build({ entryPoints: ['tests/application-gateway.test.ts'], bundle: true, platform: 'node', format: 'esm', target: 'node24', outfile: 'node_modules/.cache/application-gateway.test.mjs', external: ['node:*'], logLevel: 'silent' });
const child = spawn(process.execPath, ['node_modules/.cache/application-gateway.test.mjs'], { stdio: 'inherit' });
child.on('exit', (code) => process.exit(code ?? 1));
