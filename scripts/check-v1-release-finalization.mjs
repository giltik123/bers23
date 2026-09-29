import { readFile } from 'node:fs/promises';

const finalization = JSON.parse(await readFile('config/v1-release-finalization.json','utf8'));
const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const classification = JSON.parse(await readFile('config/v1-capability-classification.json','utf8'));
const pkg = JSON.parse(await readFile('package.json','utf8'));

const fail = message => {
  console.error('BERS_V1_RELEASE_FINALIZATION_INVALID', message);
  process.exitCode = 1;
};

if (finalization.targetVersion !== '1.0.0' || classification.targetVersion !== '1.0.0') {
  fail('target version mismatch');
} else if (readiness.blockers.length > 0) {
  if (finalization.status !== 'BLOCKED_BEFORE_RC') fail('blocked readiness requires BLOCKED_BEFORE_RC');
  else if (finalization.rcCoordinate !== null || finalization.releaseSha !== null || finalization.releaseTag !== null) fail('blocked readiness cannot declare RC/release coordinate');
  else if (finalization.releaseGenerated !== false) fail('blocked readiness cannot claim release artifact');
  else if (pkg.version !== '0.0.0') fail('pre-RC package version must remain 0.0.0');
  else console.log('BERS_V1_RELEASE_FINALIZATION_BLOCKED', JSON.stringify({
    blockers: readiness.blockers.map(value=>value.id),
    packageVersion: pkg.version,
    targetVersion: finalization.targetVersion,
  }));
} else {
  if (!readiness.rcSelectable) fail('empty blockers require rcSelectable=true');
  else if (!/^[0-9a-f]{40}$/.test(readiness.rcCoordinate ?? '')) fail('RC coordinate must be exact SHA');
  else if (finalization.status === 'RC_SELECTED') {
    if (finalization.rcCoordinate !== readiness.rcCoordinate) fail('finalization RC coordinate mismatch');
    else if (pkg.version !== '0.0.0') fail('RC_SELECTED keeps package version pre-release until final evidence closes');
    else console.log('BERS_V1_RC_SELECTED', readiness.rcCoordinate);
  } else if (finalization.status === 'RELEASED') {
    if (finalization.releaseSha !== readiness.rcCoordinate) fail('releaseSha must equal accepted release coordinate');
    else if (finalization.releaseTag !== 'v1.0.0') fail('releaseTag must be v1.0.0');
    else if (pkg.version !== '1.0.0') fail('released package version must be 1.0.0');
    else if (finalization.releaseGenerated !== true) fail('released state requires releaseGenerated=true');
    else console.log('BERS_V1_0_RELEASED', JSON.stringify({sha:finalization.releaseSha,tag:finalization.releaseTag}));
  } else {
    fail('empty blockers require RC_SELECTED or RELEASED finalization state');
  }
}
