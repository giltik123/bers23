import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;
const SHA256_RE = /^[0-9a-f]{64}$/u;
const RELEASE_TAG = 'v1.0.0';

export function validateV1ReleaseFinalization(input) {
  const finalization = input?.finalization;
  const readiness = input?.readiness;
  const classification = input?.classification;
  const pkg = input?.pkg;

  requireObject(finalization, 'finalization');
  requireObject(readiness, 'readiness');
  requireObject(classification, 'classification');
  requireObject(pkg, 'package');

  if (finalization.program !== 'BERS_V1_RELEASE_FINALIZATION') {
    throw new Error('finalization program mismatch');
  }
  if (readiness.program !== 'BERS_V1_RC_READINESS') {
    throw new Error('readiness program mismatch');
  }
  if (classification.program !== 'BERS_V1_CAPABILITY_CLASSIFICATION') {
    throw new Error('classification program mismatch');
  }
  if (finalization.targetVersion !== '1.0.0' || classification.targetVersion !== '1.0.0') {
    throw new Error('target version mismatch');
  }
  if (!Array.isArray(readiness.blockers)) throw new Error('readiness blockers must be an array');

  if (readiness.blockers.length > 0) {
    if (readiness.rcSelectable !== false) throw new Error('blocked readiness requires rcSelectable=false');
    if (readiness.rcCoordinate !== null) throw new Error('blocked readiness cannot declare readiness RC coordinate');
    if (readiness.status !== 'BERS_V1_RC_NOT_SELECTABLE') {
      throw new Error('blocked readiness requires BERS_V1_RC_NOT_SELECTABLE status');
    }
    if (finalization.status !== 'BLOCKED_BEFORE_RC') {
      throw new Error('blocked readiness requires BLOCKED_BEFORE_RC');
    }
    requireClassificationReleaseState(classification, 'BLOCKED_BEFORE_RC');
    if (finalization.rcCoordinate !== null || finalization.releaseSha !== null || finalization.releaseTag !== null) {
      throw new Error('blocked readiness cannot declare RC/release coordinate');
    }
    if (finalization.publicationEvidence !== null) {
      throw new Error('blocked readiness cannot declare publication evidence');
    }
    if (finalization.releaseGenerated !== false) throw new Error('blocked readiness cannot claim release artifact');
    if (pkg.version !== '0.0.0') throw new Error('pre-RC package version must remain 0.0.0');
    if (finalization.packageVersionExpected !== '0.0.0') {
      throw new Error('blocked readiness packageVersionExpected must remain 0.0.0');
    }
    return Object.freeze({
      marker: 'BERS_V1_RELEASE_FINALIZATION_BLOCKED',
      payload: Object.freeze({
        blockers: readiness.blockers.map(value => value.id),
        packageVersion: pkg.version,
        targetVersion: finalization.targetVersion,
      }),
    });
  }

  if (readiness.rcSelectable !== true) throw new Error('empty blockers require rcSelectable=true');
  if (readiness.status !== 'BERS_V1_RC_SELECTED') {
    throw new Error('empty blockers require BERS_V1_RC_SELECTED readiness status');
  }
  if (!EXACT_SHA_RE.test(readiness.rcCoordinate ?? '')) throw new Error('RC coordinate must be exact SHA');
  if (finalization.rcCoordinate !== readiness.rcCoordinate) throw new Error('finalization RC coordinate mismatch');

  if (finalization.status === 'RC_SELECTED') {
    requireClassificationReleaseState(classification, 'RC_SELECTED');
    if (finalization.releaseSha !== null || finalization.releaseTag !== null) {
      throw new Error('RC_SELECTED cannot declare final release SHA/tag');
    }
    if (finalization.publicationEvidence !== null) {
      throw new Error('RC_SELECTED cannot declare publication evidence');
    }
    if (finalization.releaseGenerated !== false) throw new Error('RC_SELECTED cannot claim release artifact');
    if (pkg.version !== '0.0.0') throw new Error('RC_SELECTED keeps package version pre-release until publication authorization');
    if (finalization.packageVersionExpected !== '0.0.0') {
      throw new Error('RC_SELECTED packageVersionExpected must remain 0.0.0');
    }
    return Object.freeze({
      marker: 'BERS_V1_RC_SELECTED',
      payload: readiness.rcCoordinate,
    });
  }

  if (finalization.status === 'RELEASE_AUTHORIZED') {
    requireClassificationReleaseState(classification, 'RELEASE_AUTHORIZED');
    if (finalization.releaseSha !== null) {
      throw new Error('RELEASE_AUTHORIZED cannot predeclare its own release SHA');
    }
    if (finalization.releaseTag !== RELEASE_TAG) {
      throw new Error('RELEASE_AUTHORIZED releaseTag must be v1.0.0');
    }
    if (finalization.publicationEvidence !== null) {
      throw new Error('RELEASE_AUTHORIZED cannot claim publication evidence before publish');
    }
    if (finalization.releaseGenerated !== false) {
      throw new Error('RELEASE_AUTHORIZED cannot claim releaseGenerated=true before publish');
    }
    if (pkg.version !== '1.0.0') {
      throw new Error('RELEASE_AUTHORIZED package version must be 1.0.0');
    }
    if (finalization.packageVersionExpected !== '1.0.0') {
      throw new Error('RELEASE_AUTHORIZED packageVersionExpected must be 1.0.0');
    }
    return Object.freeze({
      marker: 'BERS_V1_RELEASE_AUTHORIZED',
      payload: Object.freeze({
        rcCoordinate: readiness.rcCoordinate,
        tag: finalization.releaseTag,
      }),
    });
  }

  if (finalization.status === 'RELEASED') {
    requireClassificationReleaseState(classification, 'RELEASED');
    if (!EXACT_SHA_RE.test(finalization.releaseSha ?? '')) {
      throw new Error('RELEASED releaseSha must be one exact published SHA');
    }
    if (finalization.releaseTag !== RELEASE_TAG) throw new Error('releaseTag must be v1.0.0');
    if (pkg.version !== '1.0.0') throw new Error('released package version must be 1.0.0');
    if (finalization.packageVersionExpected !== '1.0.0') {
      throw new Error('RELEASED packageVersionExpected must be 1.0.0');
    }
    if (finalization.releaseGenerated !== true) throw new Error('released state requires releaseGenerated=true');
    requirePublicationEvidence(finalization.publicationEvidence);
    return Object.freeze({
      marker: 'BERS_V1_0_RELEASED',
      payload: Object.freeze({
        rcCoordinate: readiness.rcCoordinate,
        sha: finalization.releaseSha,
        tag: finalization.releaseTag,
      }),
    });
  }

  throw new Error('empty blockers require RC_SELECTED, RELEASE_AUTHORIZED or RELEASED finalization state');
}

function requireClassificationReleaseState(classification, finalizationStatus) {
  const expectedMap = Object.freeze({
    BLOCKED_BEFORE_RC: 'PRE_RC_EXTERNAL_BLOCKERS_REMAIN',
    RC_SELECTED: 'RC_SELECTED',
    RELEASE_AUTHORIZED: 'RELEASE_AUTHORIZED',
    RELEASED: 'RELEASED',
  });
  const configured = classification?.versioning?.releaseStateByFinalizationStatus;
  requireObject(configured, 'classification.versioning.releaseStateByFinalizationStatus');
  for (const [status, expected] of Object.entries(expectedMap)) {
    if (configured[status] !== expected) {
      throw new Error(`classification release-state mapping mismatch for ${status}`);
    }
  }
  const expected = expectedMap[finalizationStatus];
  if (!expected) throw new Error(`unsupported finalization status: ${finalizationStatus}`);
  if (classification.releaseState !== expected) {
    throw new Error(`classification releaseState must be ${expected} for ${finalizationStatus}`);
  }
}

function requirePublicationEvidence(value) {
  requireObject(value, 'publicationEvidence');
  if (!/^https:\/\/github\.com\/giltik123\/bers23\/actions\/runs\/\d+$/u.test(value.workflowRunUrl ?? '')) {
    throw new Error('publicationEvidence workflowRunUrl is invalid');
  }
  if (value.releaseUrl !== 'https://github.com/giltik123/bers23/releases/tag/v1.0.0') {
    throw new Error('publicationEvidence releaseUrl is invalid');
  }
  if (!SHA256_RE.test(value.releaseManifestSha256 ?? '')) {
    throw new Error('publicationEvidence releaseManifestSha256 is invalid');
  }
  if (!SHA256_RE.test(value.requiredChecksSha256 ?? '')) {
    throw new Error('publicationEvidence requiredChecksSha256 is invalid');
  }
  if (typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))) {
    throw new Error('publicationEvidence publishedAt is invalid');
  }
}

function requireObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

export async function loadV1ReleaseFinalizationInputs() {
  const [finalization, readiness, classification, pkg] = await Promise.all([
    readJson('config/v1-release-finalization.json'),
    readJson('config/v1-release-readiness.json'),
    readJson('config/v1-capability-classification.json'),
    readJson('package.json'),
  ]);
  return Object.freeze({ finalization, readiness, classification, pkg });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

async function main() {
  try {
    const result = validateV1ReleaseFinalization(await loadV1ReleaseFinalizationInputs());
    const suffix = typeof result.payload === 'string'
      ? result.payload
      : JSON.stringify(result.payload);
    console.log(result.marker, suffix);
  } catch (error) {
    console.error('BERS_V1_RELEASE_FINALIZATION_INVALID', error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : undefined;
if (invokedPath === import.meta.url) await main();
