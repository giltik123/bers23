import { cp, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

import { loadProductionMigrationInventory } from './production-migration-inventory.mjs';

await rm('dist-server', { recursive: true, force: true });
await mkdir('dist-server/migrations', { recursive: true });
const sharedBuild = Object.freeze({ bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false });
await build({ ...sharedBuild, entryPoints: ['server/index.ts'], outfile: 'dist-server/server.mjs' });
await build({
  ...sharedBuild,
  entryPoints: ['server/transactions/infrastructure/postgres/transactionSchemaCli.ts'],
  outfile: 'dist-server/migrate.mjs',
});

const migrations = await loadProductionMigrationInventory();
for (const migration of migrations) {
  await cp(migration.absoluteSource, join('dist-server/migrations', migration.name));
}
