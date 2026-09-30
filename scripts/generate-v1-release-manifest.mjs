import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  loadV1ReleaseFinalizationInputs,
  validateV1ReleaseFinalization,
} from './check-v1-release-finalization.mjs';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const RELEASE_TAG = 'v1.0.0';
const DEFAULT_OUT = 'release-evidence/v1/bers-v1.0.0-release-manifest.json';

export function buildV1ReleaseManifest({
  inputs,
  releaseSha,
  sourceContents,
}) {
  if (!EXACT_SHA_RE.test(releaseSha ?? '')) {
    throw new Error('RELEASE_SHA must be one exact lowercase 40-character Git SHA');
  }

  const disposition = validateV1ReleaseFinalization(inputs);
  if (disposition.marker !== 'BERS_V1_0_RELEASED') {
    throw new Error('release manifest generation requires RELEASED finalization state');
  }

  const { finalization, readiness, classification, pkg } = inputs;
  if (finalization.releaseSha !== releaseSha || readiness.rcCoordinate !== releaseSha) {
    throw new Error('requested release SHA does not equal the accepted release coordinate');
  }
  if (finalization.releaseTag !== RELEASE_TAG) {
    throw new Error('release manifest requires v1.0.0 releaseTag');
  }
  if (pkg.version !== '1.0.0') {
    throw new Error('release manifest requires package version 1.0.0');
  }

  const requiredSources = [
    'config/v1-release-readiness.json',
    'config/v1-release-finalization.json',
    'config/v1-capability-classification.json',
    'docs/v1-release-notes.md',
    'docs/v1-release-operations.md',
    'package.json',
  ];
  for (const path of requiredSources) {
    const value = sourceContents?.[path];
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error(`missing release-manifest source: ${path}`);
    }
  }

  const releaseNotes = sourceContents['docs/v1-release-notes.md'];
  if (/pre-RC package/iu.test(releaseNotes)) {
    throw new Error('release notes still identify themselves as a pre-RC package');
  }
  if (/release evidence still required/iu.test(releaseNotes)) {
    throw new Error('release notes still claim mandatory release evidence is outstanding');
  }
  if (/no `BERS_V1_RC`, `v1\.0\.0` tag or release declaration is valid/iu.test(releaseNotes)) {
    throw new Error('release notes still contain the blocked pre-release declaration');
  }

  const sources = Object.fromEntries(
    requiredSources.map(path => [
      path,
      Object.freeze({
        sha256: sha256(sourceContents[path]),
        bytes: Buffer.byteLength(sourceContents[path], 'utf8'),
      }),
    ]),
  );

  return Object.freeze({
    schemaVersion: 1,
    program: 'BERS_V1_RELEASE_MANIFEST',
    targetVersion: '1.0.0',
    releaseTag: RELEASE_TAG,
    releaseSha,
    packageVersion: pkg.version,
    readiness: Object.freeze({
      status: readiness.status,
      rcSelectable: readiness.rcSelectable,
      rcCoordinate: readiness.rcCoordinate,
      blockerCount: readiness.blockers.length,
    }),
    finalization: Object.freeze({
      status: finalization.status,
      rcCoordinate: finalization.rcCoordinate,
      releaseSha: finalization.releaseSha,
      releaseTag: finalization.releaseTag,
      releaseGenerated: finalization.releaseGenerated,
    }),
    classification: Object.freeze({
      targetVersion: classification.targetVersion,
    }),
    sources: Object.freeze(sources),
  });
}

export async function loadV1ReleaseManifestSources() {
  const paths = [
    'config/v1-release-readiness.json',
    'config/v1-release-finalization.json',
    'config/v1-capability-classification.json',
    'docs/v1-release-notes.md',
    'docs/v1-release-operations.md',
    'package.json',
  ];
  const pairs = await Promise.all(
    paths.map(async path => [path, await readFile(path, 'utf8')]),
  );
  return Object.freeze(Object.fromEntries(pairs));
}

function sha256(value) {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

async function main() {
  try {
    const releaseSha = process.env.RELEASE_SHA ?? '';
    const out = process.env.EVIDENCE_OUT ?? DEFAULT_OUT;
    const manifest = buildV1ReleaseManifest({
      inputs: await loadV1ReleaseFinalizationInputs(),
      releaseSha,
      sourceContents: await loadV1ReleaseManifestSources(),
    });
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    console.log('BERS_V1_RELEASE_MANIFEST_GENERATED', JSON.stringify({
      releaseSha: manifest.releaseSha,
      releaseTag: manifest.releaseTag,
      out,
      sha256: sha256(`${JSON.stringify(manifest, null, 2)}\n`),
    }));
  } catch (error) {
    console.error(
      'BERS_V1_RELEASE_MANIFEST_INVALID',
      error instanceof Error ? error.message : String(error),
    );
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) await main();
