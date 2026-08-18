import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

await rm('dist-server', { recursive: true, force: true });
await mkdir('dist-server/migrations', { recursive: true });
await build({ entryPoints: ['server/index.ts'], outfile: 'dist-server/server.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false });
await cp('server/transactions/infrastructure/postgres/migrations/001_transaction_store.sql', 'dist-server/migrations/001_transaction_store.sql');
