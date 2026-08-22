import { cp, mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const migrationDirectories = Object.freeze([
  'server/transactions/infrastructure/postgres/migrations',
  'server/core/artifacts/migrations',
  'server/core/projects/migrations',
  'server/core/auth/migrations',
]);
const migrationNamePattern = /^(\d{3})_[a-z0-9_]+\.sql$/;
const rollbackNamePattern = /^\d{3}_[a-z0-9_]+\.down\.sql$/;

await rm('dist-server', { recursive: true, force: true });
await mkdir('dist-server/migrations', { recursive: true });
await build({ entryPoints: ['server/index.ts'], outfile: 'dist-server/server.mjs', bundle: true, platform: 'node', format: 'esm', target: 'node22', packages: 'external', sourcemap: false });

const migrations = [];
for (const directory of migrationDirectories) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
    if (entry.name.endsWith('.down.sql')) {
      if (!rollbackNamePattern.test(entry.name)) throw new Error(`Invalid rollback migration filename: ${join(directory, entry.name)}`);
      continue;
    }
    const match = migrationNamePattern.exec(entry.name);
    if (!match) throw new Error(`Invalid production migration filename: ${join(directory, entry.name)}`);
    migrations.push(Object.freeze({ number: Number(match[1]), name: entry.name, source: join(directory, entry.name) }));
  }
}

migrations.sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));
const names = new Set();
for (const [index, migration] of migrations.entries()) {
  const expectedNumber = index + 1;
  if (migration.number !== expectedNumber) {
    throw new Error(`Production migration sequence must be contiguous: expected ${String(expectedNumber).padStart(3, '0')}, found ${migration.name}`);
  }
  if (names.has(migration.name)) throw new Error(`Duplicate production migration filename: ${migration.name}`);
  names.add(migration.name);
  await cp(migration.source, join('dist-server/migrations', migration.name));
}

if (migrations.length === 0) throw new Error('No production migrations discovered');
