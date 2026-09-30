import { spawnSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;

export const V1_RELEASE_METADATA_PATHS = Object.freeze([
  'config/v1-release-readiness.json',
  'config/v1-release-finalization.json',
  'config/v1-capability-classification.json',
  'config/v1-release-journey-matrix.json',
  'docs/v1-release-readiness.md',
  'docs/v1-release-finalization.md',
  'docs/v1-release-journey-matrix.md',
  'docs/v1-release-notes.md',
  'docs/v1-release-operations.md',
  'docs/v1-external-release-evidence.md',
  'package.json',
  'package-lock.json',
]);

const ALLOWED = new Set(V1_RELEASE_METADATA_PATHS);

export function validateV1ReleaseDeltaPaths(paths) {
  if (!Array.isArray(paths)) throw new Error('release delta paths must be an array');
  const normalized = paths.map(normalizePath);
  if (new Set(normalized).size !== normalized.length) {
    throw new Error('release delta paths must not contain duplicates');
  }
  const forbidden = normalized.filter(path => !ALLOWED.has(path));
  if (forbidden.length) {
    throw new Error(`release authorization contains product/non-metadata drift: ${forbidden.join(', ')}`);
  }
  return Object.freeze([...normalized].sort());
}

export function verifyV1ReleaseDelta({
  rcSha,
  releaseSha,
  git = runGit,
}) {
  requireSha(rcSha, 'RC_SHA');
  requireSha(releaseSha, 'RELEASE_SHA');
  if (typeof git !== 'function') throw new Error('git runner is required');

  const ancestor = git(['merge-base', '--is-ancestor', rcSha, releaseSha], { allowExitOne: true });
  if (ancestor.status !== 0) {
    throw new Error('selected RC SHA must be an ancestor of the release authorization SHA');
  }

  const diff = git(['diff', '--name-only', '--no-renames', '-z', `${rcSha}..${releaseSha}`]);
  const paths = diff.stdout
    .split('\0')
    .filter(Boolean);
  const changedPaths = validateV1ReleaseDeltaPaths(paths);

  if (changedPaths.length === 0) {
    throw new Error('release authorization SHA must contain an explicit metadata transition after RC selection');
  }

  return Object.freeze({
    schemaVersion: 1,
    kind: 'BERS_V1_RELEASE_DELTA_EVIDENCE',
    rcSha,
    releaseSha,
    changedPaths,
  });
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, {
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  const status = result.status ?? 1;
  if (status !== 0 && !(options.allowExitOne && status === 1)) {
    throw new Error(`git ${args.join(' ')} failed with status ${status}: ${(result.stderr || '').trim()}`);
  }
  return Object.freeze({
    status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  });
}

function requireSha(value, field) {
  if (typeof value !== 'string' || !EXACT_SHA_RE.test(value)) {
    throw new Error(`${field} must be one exact lowercase 40-character Git SHA`);
  }
}

function normalizePath(value) {
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error('release delta path must be a non-empty string');
  }
  if (value.includes('\\') || value.startsWith('/') || value.includes('\0')) {
    throw new Error(`invalid release delta path: ${value}`);
  }
  const parts = value.split('/');
  if (parts.some(part => part === '' || part === '.' || part === '..')) {
    throw new Error(`invalid release delta path: ${value}`);
  }
  return value;
}

async function main() {
  try {
    const evidence = verifyV1ReleaseDelta({
      rcSha: process.env.RC_SHA ?? '',
      releaseSha: process.env.RELEASE_SHA ?? '',
    });
    const out = process.env.EVIDENCE_OUT?.trim() || null;
    if (out) {
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, `${JSON.stringify(evidence, null, 2)}\n`, {
        encoding: 'utf8',
        mode: 0o600,
      });
    }
    console.log('BERS_V1_RELEASE_DELTA_PASS', JSON.stringify({
      rcSha: evidence.rcSha,
      releaseSha: evidence.releaseSha,
      changedPaths: evidence.changedPaths,
      evidenceOut: out,
    }));
  } catch (error) {
    console.error(
      'BERS_V1_RELEASE_DELTA_INVALID',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) await main();
