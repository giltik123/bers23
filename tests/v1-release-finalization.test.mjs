import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { validateV1ReleaseFinalization } from '../scripts/check-v1-release-finalization.mjs';

const finalization = JSON.parse(await readFile('config/v1-release-finalization.json','utf8'));
const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const classification = JSON.parse(await readFile('config/v1-capability-classification.json','utf8'));
const pkg = JSON.parse(await readFile('package.json','utf8'));

test('current release finalization matches its machine-readable state', () => {
  const disposition=validateV1ReleaseFinalization({finalization,readiness,classification,pkg});
  const expectedMarker={
    BLOCKED_BEFORE_RC:'BERS_V1_RELEASE_FINALIZATION_BLOCKED',
    RC_SELECTED:'BERS_V1_RC_SELECTED',
    RELEASED:'BERS_V1_0_RELEASED',
  }[finalization.status];
  assert.ok(expectedMarker,`unexpected finalization status: ${finalization.status}`);
  assert.equal(disposition.marker,expectedMarker);
});

test('current package and release metadata match the declared transition state', () => {
  assert.equal(finalization.targetVersion,'1.0.0');
  assert.equal(classification.targetVersion,'1.0.0');

  if (finalization.status === 'BLOCKED_BEFORE_RC') {
    assert.equal(readiness.rcSelectable,false);
    assert.ok(readiness.blockers.length > 0);
    assert.equal(pkg.version,'0.0.0');
    assert.equal(finalization.packageVersionExpected,'0.0.0');
    assert.equal(finalization.rcCoordinate,null);
    assert.equal(finalization.releaseSha,null);
    assert.equal(finalization.releaseTag,null);
    assert.equal(finalization.releaseGenerated,false);
  } else if (finalization.status === 'RC_SELECTED') {
    assert.equal(readiness.blockers.length,0);
    assert.equal(readiness.rcSelectable,true);
    assert.equal(pkg.version,'0.0.0');
    assert.equal(finalization.packageVersionExpected,'0.0.0');
    assert.equal(finalization.releaseSha,null);
    assert.equal(finalization.releaseTag,null);
    assert.equal(finalization.releaseGenerated,false);
  } else if (finalization.status === 'RELEASED') {
    assert.equal(readiness.blockers.length,0);
    assert.equal(readiness.rcSelectable,true);
    assert.equal(pkg.version,'1.0.0');
    assert.equal(finalization.packageVersionExpected,'1.0.0');
    assert.equal(finalization.releaseTag,'v1.0.0');
    assert.equal(finalization.releaseGenerated,true);
  } else {
    assert.fail(`unexpected finalization status: ${finalization.status}`);
  }
});

test('finalization checker emits exactly the disposition declared by the manifest', () => {
  const result=spawnSync(process.execPath,['scripts/check-v1-release-finalization.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const expectedMarker={
    BLOCKED_BEFORE_RC:'BERS_V1_RELEASE_FINALIZATION_BLOCKED',
    RC_SELECTED:'BERS_V1_RC_SELECTED',
    RELEASED:'BERS_V1_0_RELEASED',
  }[finalization.status];
  assert.ok(expectedMarker);
  assert.match(result.stdout,new RegExp(`^${expectedMarker}(?: |$)`,'m'));
  for (const marker of [
    'BERS_V1_RELEASE_FINALIZATION_BLOCKED',
    'BERS_V1_RC_SELECTED',
    'BERS_V1_0_RELEASED',
  ]) {
    if (marker !== expectedMarker) assert.doesNotMatch(result.stdout,new RegExp(marker));
  }
});

test('final release laws bind version tag and exact accepted SHA', () => {
  const laws=finalization.laws.join('\n');
  assert.match(laws,/package\.json version 1\.0\.0/);
  assert.match(laws,/releaseTag v1\.0\.0/);
  assert.match(laws,/releaseSha equal to the exact accepted release coordinate/);
  assert.match(laws,/release-affecting fix after RC moves the coordinate/);
});

test('finalization package points at accepted release-note classification and operations sources', async () => {
  for (const path of [
    finalization.readinessSource,
    finalization.classificationSource,
    finalization.releaseNotesSource,
    finalization.operationsSource,
  ]) {
    const content=await readFile(path,'utf8');
    assert.ok(content.trim(),path);
  }
});


test('release-finalization workflow accepts every manifest state and keeps diff hygiene PR-only', async () => {
  const workflow = await readFile('.github/workflows/v1-release-finalization.yml','utf8');

  assert.match(workflow,/Emit manifest-matched release finalization disposition/u);
  assert.match(workflow,/BLOCKED_BEFORE_RC\)/u);
  assert.match(workflow,/RC_SELECTED\)/u);
  assert.match(workflow,/RELEASED\)/u);
  assert.match(workflow,/BERS_V1_RELEASE_FINALIZATION_BLOCKED/u);
  assert.match(workflow,/BERS_V1_RC_SELECTED/u);
  assert.match(workflow,/BERS_V1_0_RELEASED/u);
  assert.match(workflow,/Check committed diff whitespace\s*\n\s*if:\s*github\.event_name == 'pull_request'/u);
});


test('state machine accepts a clean RC_SELECTED fixture without final release claims', () => {
  const sha='a'.repeat(40);
  const result=validateV1ReleaseFinalization({
    readiness: { ...readiness, blockers: [], rcSelectable: true, rcCoordinate: sha },
    finalization: {
      ...finalization,
      status: 'RC_SELECTED',
      rcCoordinate: sha,
      releaseSha: null,
      releaseTag: null,
      releaseGenerated: false,
      packageVersionExpected: '0.0.0',
    },
    classification,
    pkg: { ...pkg, version: '0.0.0' },
  });
  assert.equal(result.marker,'BERS_V1_RC_SELECTED');
  assert.equal(result.payload,sha);
});

test('state machine accepts RELEASED only when version, tag and every coordinate converge', () => {
  const sha='b'.repeat(40);
  const result=validateV1ReleaseFinalization({
    readiness: { ...readiness, blockers: [], rcSelectable: true, rcCoordinate: sha },
    finalization: {
      ...finalization,
      status: 'RELEASED',
      rcCoordinate: sha,
      releaseSha: sha,
      releaseTag: 'v1.0.0',
      releaseGenerated: true,
      packageVersionExpected: '1.0.0',
    },
    classification,
    pkg: { ...pkg, version: '1.0.0' },
  });
  assert.equal(result.marker,'BERS_V1_0_RELEASED');
  assert.deepEqual(result.payload,{sha,tag:'v1.0.0'});
});

test('RC_SELECTED rejects leaked final release metadata and artifact claims', () => {
  const sha='c'.repeat(40);
  const base={
    readiness: { ...readiness, blockers: [], rcSelectable: true, rcCoordinate: sha },
    finalization: {
      ...finalization,
      status: 'RC_SELECTED',
      rcCoordinate: sha,
      releaseSha: null,
      releaseTag: null,
      releaseGenerated: false,
      packageVersionExpected: '0.0.0',
    },
    classification,
    pkg: { ...pkg, version: '0.0.0' },
  };

  assert.throws(
    () => validateV1ReleaseFinalization({
      ...base,
      finalization: { ...base.finalization, releaseTag: 'v1.0.0' },
    }),
    /cannot declare final release SHA\/tag/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      ...base,
      finalization: { ...base.finalization, releaseSha: sha },
    }),
    /cannot declare final release SHA\/tag/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      ...base,
      finalization: { ...base.finalization, releaseGenerated: true },
    }),
    /cannot claim release artifact/u,
  );
});

test('RELEASED rejects coordinate drift even when releaseSha itself looks valid', () => {
  const sha='d'.repeat(40);
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness: { ...readiness, blockers: [], rcSelectable: true, rcCoordinate: sha },
      finalization: {
        ...finalization,
        status: 'RELEASED',
        rcCoordinate: 'e'.repeat(40),
        releaseSha: sha,
        releaseTag: 'v1.0.0',
        releaseGenerated: true,
        packageVersionExpected: '1.0.0',
      },
      classification,
      pkg: { ...pkg, version: '1.0.0' },
    }),
    /finalization RC coordinate mismatch/u,
  );
});

test('blocked readiness cannot advertise RC selectability or a readiness coordinate', () => {
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness: { ...readiness, rcSelectable: true },
      finalization,
      classification,
      pkg,
    }),
    /blocked readiness requires rcSelectable=false/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness: { ...readiness, rcCoordinate: 'f'.repeat(40) },
      finalization,
      classification,
      pkg,
    }),
    /blocked readiness cannot declare readiness RC coordinate/u,
  );
});
