import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

import {
  loadProductionMigrationInventory,
  resolveProductionMigrations,
} from '../scripts/production-migration-inventory.mjs';
import { collectBundleMigrationReferences } from '../scripts/stage-bundle-migrations.mjs';

const F4B4_POSTGRES_ENTRYPOINTS = Object.freeze([
  'tests/f4b4-postgres-schema-bootstrap.test.ts',
  'tests/garment-mesh-warp-service-postgres.test.ts',
  'tests/local-execution-working-upload-retry-postgres.test.ts',
  'tests/garment-mesh-warp-production-composition-closed.test.ts',
]);

async function buildMetafile(entryPoint) {
  const result = await build({
    entryPoints: [entryPoint],
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    write: false,
    metafile: true,
    logLevel: 'silent',
    external: ['node:*', 'pg', 'sharp'],
  });
  return result.metafile;
}

test('full production migration inventory remains contiguous for release packaging', async () => {
  const migrations = await loadProductionMigrationInventory();
  assert.ok(migrations.length >= 35, `expected established production migration history, found ${migrations.length}`);
  assert.deepEqual(migrations.map((migration) => migration.number), migrations.map((_, index) => index + 1));
  assert.equal(new Set(migrations.map((migration) => migration.name)).size, migrations.length);
});

test('generic Core build and immutable production image retain full migration-packaging authority while F4b.4 vertical delegates it', async () => {
  const buildScript = await readFile('scripts/build-core-server.mjs', 'utf8');
  assert.match(buildScript, /loadProductionMigrationInventory\(\)/);
  assert.match(buildScript, /dist-server\/migrations/);

  const dockerfile = await readFile('Dockerfile', 'utf8');
  assert.match(
    dockerfile,
    /COPY scripts\/build-core-server\.mjs scripts\/production-migration-inventory\.mjs \.\/scripts\//,
    'production image build must carry every build-core-server module dependency',
  );

  const workflow = await readFile('.github/workflows/fashion-garment-mesh-warp-service-postgres-f4b4.yml', 'utf8');
  for (const forbidden of [
    "find server -type f -path '*/migrations/*.sql'",
    'npm run db:migrate:transactions',
    'npm run db:check:transactions',
    'npm run server:build',
  ]) {
    assert.equal(workflow.includes(forbidden), false, `F4b.4 specialized vertical regained global migration authority: ${forbidden}`);
  }
  assert.match(workflow, /node scripts\/stage-bundle-migrations\.mjs/);
  assert.match(workflow, /tests\/f4b4-postgres-schema-bootstrap\.test\.ts/);
  assert.match(workflow, /cd \.test-cache\/fashion-f4b4-service-postgres/);
});

test('F4b.4 PostgreSQL bundles derive a strict migration subset from actual repository inputs', async () => {
  const metafiles = await Promise.all(F4B4_POSTGRES_ENTRYPOINTS.map(buildMetafile));
  const closure = await collectBundleMigrationReferences(metafiles);
  const resolved = await resolveProductionMigrations(closure.migrationNames);
  const full = await loadProductionMigrationInventory();
  const names = resolved.map((migration) => migration.name);

  assert.deepEqual(names, [...closure.migrationNames].sort((left, right) => {
    const leftNumber = Number(left.slice(0, 3));
    const rightNumber = Number(right.slice(0, 3));
    return leftNumber - rightNumber || left.localeCompare(right);
  }));
  for (const required of [
    '001_transaction_store.sql',
    '012_local_execution_uploads.sql',
    '013_local_execution_ticket_ledger.sql',
    '016_local_execution_result_replay_binding.sql',
    '022_managed_garments_and_initial_views.sql',
    '028_project_body_anchor_sets.sql',
    '029_fashion_garment_warp_layers.sql',
    '030_fashion_garment_texture_final_lineage.sql',
  ]) {
    assert.ok(names.includes(required), `F4b.4 migration closure missing ${required}`);
  }

  assert.ok(full.some((migration) => migration.name === '032_fashion_garment_refinement_final_lineage.sql'));
  assert.equal(names.includes('032_fashion_garment_refinement_final_lineage.sql'), false, 'F5 refinement migration escaped into F4b.4 bundle closure');
  assert.ok(names.length < full.length, `expected strict F4b.4 subset, got ${names.length}/${full.length}`);
});

test('bundle migration discovery fails closed on a dynamic loader without literal SQL authority', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'bers-bundle-migration-dynamic-'));
  try {
    await writeFile(join(rootDir, 'dynamic-loader.mjs'), "import { readFile } from 'node:fs/promises';\nexport const load = (name) => readFile(new URL(`./migrations/${name}`, import.meta.url));\n", 'utf8');
    const metafile = { inputs: { 'dynamic-loader.mjs': { bytes: 1, imports: [] } }, outputs: {} };
    await assert.rejects(
      () => collectBundleMigrationReferences([metafile], { rootDir }),
      /accesses migrations without literal production SQL basenames/,
    );
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});

test('subset resolver ignores unrelated invalid migration files outside requested authority', async () => {
  const rootDir = await mkdtemp(join(tmpdir(), 'bers-bundle-migration-subset-'));
  try {
    const transactionDir = join(rootDir, 'server/transactions/infrastructure/postgres/migrations');
    const artifactDir = join(rootDir, 'server/core/artifacts/migrations');
    await mkdir(transactionDir, { recursive: true });
    await mkdir(artifactDir, { recursive: true });
    await writeFile(join(transactionDir, '001_transaction_store.sql'), 'BEGIN; SELECT 1; COMMIT;\n', 'utf8');
    await writeFile(join(artifactDir, 'unrelated-invalid-name.sql'), 'SELECT 1;\n', 'utf8');

    const resolved = await resolveProductionMigrations(['001_transaction_store.sql'], { rootDir });
    assert.deepEqual(resolved.map((migration) => migration.name), ['001_transaction_store.sql']);
  } finally {
    await rm(rootDir, { recursive: true, force: true });
  }
});
