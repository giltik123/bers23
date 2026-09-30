import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const EXACT_SHA_RE = /^[0-9a-f]{40}$/u;

export function validateV1ReleaseFinalization(input) {
  const finalization = input?.finalization;
  const readiness = input?.readiness;
  const classification = input?.classification;
  const pkg = input?.pkg;

  requireObject(finalization, 'finalization');
  requireObject(readiness, 'readiness');
  requireObject(classification, 'classification');
  requireObject(pkg, 'package');

  if (finalization.targetVersion !== '1.0.0' || classification.targetVersion !== '1.0.0') {
    throw new Error('target version mismatch');
  }
  if (!Array.isArray(readiness.blockers)) throw new Error('readiness blockers must be an array');

  if (readiness.blockers.length > 0) {
    if (readiness.rcSelectable !== false) throw new Error('blocked readiness requires rcSelectable=false');
    if (readiness.rcCoordinate !== null) throw new Error('blocked readiness cannot declare readiness RC coordinate');
    if (finalization.status !== 'BLOCKED_BEFORE_RC') throw new Error('blocked readiness requires BLOCKED_BEFORE_RC');
    if (finalization.rcCoordinate !== null || finalization.releaseSha !== null || finalization.releaseTag !== null) {
      throw new Error('blocked readiness cannot declare RC/release coordinate');
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
  if (!EXACT_SHA_RE.test(readiness.rcCoordinate ?? '')) throw new Error('RC coordinate must be exact SHA');
  if (finalization.rcCoordinate !== readiness.rcCoordinate) throw new Error('finalization RC coordinate mismatch');

  if (finalization.status === 'RC_SELECTED') {
    if (finalization.releaseSha !== null || finalization.releaseTag !== null) {
      throw new Error('RC_SELECTED cannot declare final release SHA/tag');
    }
    if (finalization.releaseGenerated !== false) throw new Error('RC_SELECTED cannot claim release artifact');
    if (pkg.version !== '0.0.0') throw new Error('RC_SELECTED keeps package version pre-release until final evidence closes');
    if (finalization.packageVersionExpected !== '0.0.0') {
      throw new Error('RC_SELECTED packageVersionExpected must remain 0.0.0');
    }
    return Object.freeze({
      marker: 'BERS_V1_RC_SELECTED',
      payload: readiness.rcCoordinate,
    });
  }

  if (finalization.status === 'RELEASED') {
    if (finalization.releaseSha !== readiness.rcCoordinate) {
      throw new Error('releaseSha must equal accepted release coordinate');
    }
    if (finalization.releaseTag !== 'v1.0.0') throw new Error('releaseTag must be v1.0.0');
    if (pkg.version !== '1.0.0') throw new Error('released package version must be 1.0.0');
    if (finalization.packageVersionExpected !== '1.0.0') {
      throw new Error('RELEASED packageVersionExpected must be 1.0.0');
    }
    if (finalization.releaseGenerated !== true) throw new Error('released state requires releaseGenerated=true');
    return Object.freeze({
      marker: 'BERS_V1_0_RELEASED',
      payload: Object.freeze({ sha: finalization.releaseSha, tag: finalization.releaseTag }),
    });
  }

  throw new Error('empty blockers require RC_SELECTED or RELEASED finalization state');
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
