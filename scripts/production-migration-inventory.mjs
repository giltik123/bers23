import { readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';

export const PRODUCTION_MIGRATION_DIRECTORIES = Object.freeze([
  'server/transactions/infrastructure/postgres/migrations',
  'server/core/artifacts/migrations',
  'server/core/projects/migrations',
  'server/core/auth/migrations',
  'server/core/fashion/migrations',
  'server/core/execution/migrations',
]);

export const PRODUCTION_MIGRATION_NAME_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;
export const PRODUCTION_ROLLBACK_NAME_PATTERN = /^\d{3}_[a-z0-9_]+\.down\.sql$/;

const posix = (value) => value.replaceAll('\\', '/');

export async function listProductionMigrations({ rootDir = process.cwd() } = {}) {
  const migrations = [];
  for (const directory of PRODUCTION_MIGRATION_DIRECTORIES) {
    const absoluteDirectory = resolve(rootDir, directory);
    for (const entry of await readdir(absoluteDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith('.sql')) continue;
      if (entry.name.endsWith('.down.sql')) {
        if (!PRODUCTION_ROLLBACK_NAME_PATTERN.test(entry.name)) {
          throw new Error(`Invalid rollback migration filename: ${posix(join(directory, entry.name))}`);
        }
        continue;
      }
      const match = PRODUCTION_MIGRATION_NAME_PATTERN.exec(entry.name);
      if (!match) throw new Error(`Invalid production migration filename: ${posix(join(directory, entry.name))}`);
      migrations.push(Object.freeze({
        number: Number(match[1]),
        name: entry.name,
        source: posix(join(directory, entry.name)),
        absoluteSource: resolve(absoluteDirectory, entry.name),
      }));
    }
  }
  migrations.sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));
  return Object.freeze(migrations);
}

export function assertContiguousProductionMigrationInventory(migrations) {
  if (!Array.isArray(migrations) || migrations.length === 0) throw new Error('No production migrations discovered');
  const names = new Set();
  for (const [index, migration] of migrations.entries()) {
    const expectedNumber = index + 1;
    if (migration.number !== expectedNumber) {
      throw new Error(`Production migration sequence must be contiguous: expected ${String(expectedNumber).padStart(3, '0')}, found ${migration.name}`);
    }
    if (names.has(migration.name)) throw new Error(`Duplicate production migration filename: ${migration.name}`);
    names.add(migration.name);
  }
  return migrations;
}

export async function loadProductionMigrationInventory(options = {}) {
  return assertContiguousProductionMigrationInventory(await listProductionMigrations(options));
}

export async function resolveProductionMigrations(names, { rootDir = process.cwd() } = {}) {
  const requested = [...new Set(names)].sort();
  if (requested.length === 0) throw new Error('No bundle-referenced production migrations were requested');

  const resolvedMigrations = [];
  for (const name of requested) {
    const match = PRODUCTION_MIGRATION_NAME_PATTERN.exec(name);
    if (!match) throw new Error(`Invalid requested production migration filename: ${name}`);

    const matches = [];
    for (const directory of PRODUCTION_MIGRATION_DIRECTORIES) {
      const absoluteSource = resolve(rootDir, directory, name);
      try {
        const candidate = await stat(absoluteSource);
        if (!candidate.isFile()) continue;
        matches.push(Object.freeze({
          number: Number(match[1]),
          name,
          source: posix(join(directory, name)),
          absoluteSource,
        }));
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }

    if (matches.length === 0) throw new Error(`Bundle references unknown production migration: ${name}`);
    if (matches.length !== 1) {
      throw new Error(`Bundle migration basename is ambiguous across production directories: ${name} <= ${matches.map((entry) => entry.source).join(', ')}`);
    }
    resolvedMigrations.push(matches[0]);
  }

  resolvedMigrations.sort((left, right) => left.number - right.number || left.name.localeCompare(right.name));
  return Object.freeze(resolvedMigrations);
}
