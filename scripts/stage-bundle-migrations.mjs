import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

import { resolveProductionMigrations } from './production-migration-inventory.mjs';

const MIGRATION_NAME_PATTERN = /\b\d{3}_[a-z0-9_]+\.sql\b/g;
const MIGRATION_LOADER_PATTERN = /(?:new\s+URL|resolve|join|readFile|readdir)\s*\([\s\S]{0,240}?migrations(?:\/|['"`])/m;
const posix = (value) => value.replaceAll('\\', '/');

function normalizeRepositoryInput(input, rootDir) {
  if (typeof input !== 'string' || input.length === 0 || input.startsWith('<')) return null;
  const absolute = resolve(rootDir, input);
  const repositoryRelative = relative(rootDir, absolute);
  if (!repositoryRelative || isAbsolute(repositoryRelative) || repositoryRelative === '..' || repositoryRelative.startsWith(`..${sep}`)) return null;
  const normalized = posix(repositoryRelative);
  if (normalized === 'node_modules' || normalized.startsWith('node_modules/')) return null;
  return Object.freeze({ path: normalized, absolute });
}

export async function collectBundleMigrationReferences(metafiles, { rootDir = process.cwd() } = {}) {
  if (!Array.isArray(metafiles) || metafiles.length === 0) throw new Error('At least one esbuild metafile is required');

  const inputs = new Map();
  for (const metafile of metafiles) {
    if (!metafile || typeof metafile !== 'object' || !metafile.inputs || typeof metafile.inputs !== 'object') {
      throw new Error('Invalid esbuild metafile: expected an inputs object');
    }
    for (const input of Object.keys(metafile.inputs)) {
      const normalized = normalizeRepositoryInput(input, rootDir);
      if (normalized) inputs.set(normalized.path, normalized.absolute);
    }
  }
  if (inputs.size === 0) throw new Error('Bundle metafiles contained no repository inputs');

  const names = new Set();
  const owners = new Map();
  for (const [sourcePath, absoluteSource] of [...inputs.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const source = await readFile(absoluteSource, 'utf8');
    const sourceNames = [...new Set(source.match(MIGRATION_NAME_PATTERN) ?? [])].sort();
    if (MIGRATION_LOADER_PATTERN.test(source) && sourceNames.length === 0) {
      throw new Error(`Bundle input accesses migrations without literal production SQL basenames: ${sourcePath}`);
    }
    for (const name of sourceNames) {
      names.add(name);
      const currentOwners = owners.get(name) ?? [];
      currentOwners.push(sourcePath);
      owners.set(name, currentOwners);
    }
  }
  if (names.size === 0) throw new Error('Bundle graph references no production migrations');

  return Object.freeze({
    inputPaths: Object.freeze([...inputs.keys()].sort()),
    migrationNames: Object.freeze([...names].sort()),
    owners: Object.freeze(Object.fromEntries([...owners.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([name, paths]) => [name, Object.freeze([...paths].sort())]))),
  });
}

export async function stageBundleMigrations({ metafiles, destinations, rootDir = process.cwd() }) {
  if (!Array.isArray(destinations) || destinations.length === 0) throw new Error('At least one migration destination is required');
  const closure = await collectBundleMigrationReferences(metafiles, { rootDir });
  const migrations = await resolveProductionMigrations(closure.migrationNames, { rootDir });
  const uniqueDestinations = [...new Set(destinations.map((destination) => resolve(rootDir, destination)))];

  for (const destination of uniqueDestinations) {
    await rm(destination, { recursive: true, force: true });
    await mkdir(destination, { recursive: true });
    for (const migration of migrations) await cp(migration.absoluteSource, resolve(destination, migration.name));
  }

  return Object.freeze({
    inputCount: closure.inputPaths.length,
    migrationCount: migrations.length,
    migrations: Object.freeze(migrations.map((migration) => Object.freeze({
      number: migration.number,
      name: migration.name,
      source: migration.source,
      owners: closure.owners[migration.name] ?? Object.freeze([]),
    }))),
    destinations: Object.freeze(uniqueDestinations.map((destination) => posix(relative(rootDir, destination) || '.'))),
  });
}

function parseCliArgs(argv) {
  const metafilePaths = [];
  const destinations = [];
  let rootDir = process.cwd();
  let summaryPath = null;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const value = argv[index + 1];
    if (argument === '--metafile' || argument === '--destination' || argument === '--root' || argument === '--summary') {
      if (!value || value.startsWith('--')) throw new Error(`${argument} requires a value`);
      index += 1;
      if (argument === '--metafile') metafilePaths.push(value);
      else if (argument === '--destination') destinations.push(value);
      else if (argument === '--root') rootDir = resolve(value);
      else summaryPath = value;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }
  if (metafilePaths.length === 0) throw new Error('At least one --metafile is required');
  if (destinations.length === 0) throw new Error('At least one --destination is required');
  return Object.freeze({ metafilePaths, destinations, rootDir, summaryPath });
}

async function main(argv) {
  const { metafilePaths, destinations, rootDir, summaryPath } = parseCliArgs(argv);
  const metafiles = [];
  for (const metafilePath of metafilePaths) {
    metafiles.push(JSON.parse(await readFile(resolve(rootDir, metafilePath), 'utf8')));
  }
  const summary = await stageBundleMigrations({ metafiles, destinations, rootDir });
  const json = `${JSON.stringify(summary, null, 2)}\n`;
  if (summaryPath) await writeFile(resolve(rootDir, summaryPath), json, 'utf8');
  process.stdout.write(json);
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error instanceof Error ? error.stack : error);
    process.exitCode = 1;
  });
}
