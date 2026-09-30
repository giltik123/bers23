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
  if (disposition.marker !== 'BERS_V1_RELEASE_AUTHORIZED') {
    throw new Error('release manifest generation requires RELEASE_AUTHORIZED finalization state');
  }

  const { finalization, readiness, classification, pkg } = inputs;
  if (finalization.releaseSha !== null) {
    throw new Error('release authorization must not predeclare releaseSha');
  }
  if (finalization.releaseTag !== RELEASE_TAG) {
    throw new Error('release manifest requires v1.0.0 releaseTag');
  }
  if (pkg.version !== '1.0.0') {
    throw new Error('release manifest requires package version 1.0.0');
  }
  if (!EXACT_SHA_RE.test(readiness.rcCoordinate ?? '')) {
    throw new Error('release manifest requires exact RC coordinate');
  }

  const requiredSources = [
    'config/v1-release-readiness.json',
    'config/v1-release-finalization.json',
    'config/v1-capability-classification.json',
    'config/v1-release-journey-matrix.json',
    'docs/v1-release-notes.md',
    'docs/v1-release-operations.md',
    'package.json',
    'package-lock.json',
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

  const journeyMatrix = JSON.parse(sourceContents['config/v1-release-journey-matrix.json']);
  const journey22 = journeyMatrix?.entries?.find?.(value => value?.id === 22);
  if (journey22?.disposition !== 'PROVEN') {
    throw new Error('release manifest requires journey 22 PROVEN');
  }
  if (journey22?.liveEvidence?.verifiedSha !== readiness.rcCoordinate) {
    throw new Error('journey 22 live evidence must bind the selected RC coordinate');
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
    schemaVersion: 2,
    program: 'BERS_V1_RELEASE_MANIFEST',
    targetVersion: '1.0.0',
    releaseTag: RELEASE_TAG,
    releaseSha,
    rcCoordinate: readiness.rcCoordinate,
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
      publicationEvidence: finalization.publicationEvidence,
    }),
    classification: Object.freeze({
      targetVersion: classification.targetVersion,
      releaseState: classification.releaseState,
    }),
    frontendDeploymentEvidence: Object.freeze({
      verifiedSha: journey22.liveEvidence.verifiedSha,
      frontendUrl: journey22.liveEvidence.frontendUrl,
      coreApiUrl: journey22.liveEvidence.coreApiUrl,
      htmlSha256: journey22.liveEvidence.htmlSha256,
      verifiedAt: journey22.liveEvidence.verifiedAt,
      workflowRunUrl: journey22.liveEvidence.workflowRunUrl,
      artifactName: journey22.liveEvidence.artifactName,
    }),
    sources: Object.freeze(sources),
  });
}

export async function loadV1ReleaseManifestSources() {
  const paths = [
    'config/v1-release-readiness.json',
    'config/v1-release-finalization.json',
    'config/v1-capability-classification.json',
    'config/v1-release-journey-matrix.json',
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
    const serialized = `${JSON.stringify(manifest, null, 2)}\n`;
    await mkdir(dirname(out), { recursive: true });
    await writeFile(out, serialized, 'utf8');
    console.log('BERS_V1_RELEASE_MANIFEST_GENERATED', JSON.stringify({
      rcCoordinate: manifest.rcCoordinate,
      releaseSha: manifest.releaseSha,
      releaseTag: manifest.releaseTag,
      out,
      sha256: sha256(serialized),
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
