import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { validateV1ReleaseFinalization } from '../scripts/check-v1-release-finalization.mjs';

const finalization = JSON.parse(await readFile('config/v1-release-finalization.json','utf8'));
const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const classification = JSON.parse(await readFile('config/v1-capability-classification.json','utf8'));
const pkg = JSON.parse(await readFile('package.json','utf8'));

function selectedReadiness(sha) {
  return {
    ...readiness,
    blockers: [],
    rcSelectable: true,
    rcCoordinate: sha,
    status: 'BERS_V1_RC_SELECTED',
  };
}

function classificationFor(releaseState) {
  return { ...classification, releaseState };
}

function publicationEvidence(rcCoordinate='c'.repeat(40), releaseSha='d'.repeat(40)) {
  return {
    kind:'BERS_V1_PUBLICATION_EVIDENCE',
    rcCoordinate,
    releaseSha,
    releaseTag:'v1.0.0',
    workflowRunUrl:'https://github.com/giltik123/bers23/actions/runs/123456789',
    releaseUrl:'https://github.com/giltik123/bers23/releases/tag/v1.0.0',
    releaseManifestSha256:'1'.repeat(64),
    requiredChecksSha256:'2'.repeat(64),
    releaseDeltaSha256:'3'.repeat(64),
    publishedAt:'2026-09-30T12:00:00.000Z',
  };
}

test('current release finalization matches its machine-readable state', () => {
  const disposition=validateV1ReleaseFinalization({finalization,readiness,classification,pkg});
  const expectedMarker={
    BLOCKED_BEFORE_RC:'BERS_V1_RELEASE_FINALIZATION_BLOCKED',
    RC_SELECTED:'BERS_V1_RC_SELECTED',
    RELEASE_AUTHORIZED:'BERS_V1_RELEASE_AUTHORIZED',
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
    assert.equal(readiness.status,'BERS_V1_RC_NOT_SELECTABLE');
    assert.equal(pkg.version,'0.0.0');
    assert.equal(finalization.packageVersionExpected,'0.0.0');
    assert.equal(finalization.rcCoordinate,null);
    assert.equal(finalization.releaseSha,null);
    assert.equal(finalization.releaseTag,null);
    assert.equal(finalization.publicationEvidence,null);
    assert.equal(finalization.releaseGenerated,false);
  } else if (finalization.status === 'RC_SELECTED') {
    assert.equal(readiness.blockers.length,0);
    assert.equal(readiness.rcSelectable,true);
    assert.equal(readiness.status,'BERS_V1_RC_SELECTED');
    assert.equal(pkg.version,'0.0.0');
    assert.equal(finalization.packageVersionExpected,'0.0.0');
    assert.equal(finalization.releaseSha,null);
    assert.equal(finalization.releaseTag,null);
    assert.equal(finalization.publicationEvidence,null);
    assert.equal(finalization.releaseGenerated,false);
  } else if (finalization.status === 'RELEASE_AUTHORIZED') {
    assert.equal(readiness.blockers.length,0);
    assert.equal(readiness.rcSelectable,true);
    assert.equal(readiness.status,'BERS_V1_RC_SELECTED');
    assert.equal(pkg.version,'1.0.0');
    assert.equal(finalization.packageVersionExpected,'1.0.0');
    assert.equal(finalization.releaseSha,null);
    assert.equal(finalization.releaseTag,'v1.0.0');
    assert.equal(finalization.publicationEvidence,null);
    assert.equal(finalization.releaseGenerated,false);
  } else if (finalization.status === 'RELEASED') {
    assert.equal(readiness.blockers.length,0);
    assert.equal(readiness.rcSelectable,true);
    assert.equal(readiness.status,'BERS_V1_RC_SELECTED');
    assert.equal(pkg.version,'1.0.0');
    assert.equal(finalization.packageVersionExpected,'1.0.0');
    assert.match(finalization.releaseSha,/^[0-9a-f]{40}$/u);
    assert.equal(finalization.releaseTag,'v1.0.0');
    assert.ok(finalization.publicationEvidence);
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
    RELEASE_AUTHORIZED:'BERS_V1_RELEASE_AUTHORIZED',
    RELEASED:'BERS_V1_0_RELEASED',
  }[finalization.status];
  assert.ok(expectedMarker);
  assert.match(result.stdout,new RegExp(`^${expectedMarker}(?: |$)`,'m'));
  for (const marker of [
    'BERS_V1_RELEASE_FINALIZATION_BLOCKED',
    'BERS_V1_RC_SELECTED',
    'BERS_V1_RELEASE_AUTHORIZED',
    'BERS_V1_0_RELEASED',
  ]) {
    if (marker !== expectedMarker) assert.doesNotMatch(result.stdout,new RegExp(marker));
  }
});

test('final release laws make publication self-reference safe', () => {
  const laws=finalization.laws.join('\n');
  assert.match(laws,/RELEASE_AUTHORIZED/);
  assert.match(laws,/runtime SHA/);
  assert.match(laws,/no commit is required to contain its own SHA/);
  assert.match(laws,/RELEASED is a post-publication ledger state/);
  assert.match(laws,/release-affecting product fix after RC moves the RC coordinate/);
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
  const workflow=await readFile('.github/workflows/v1-release-finalization.yml','utf8');
  assert.match(workflow,/Emit manifest-matched release finalization disposition/u);
  assert.match(workflow,/BLOCKED_BEFORE_RC\)/u);
  assert.match(workflow,/RC_SELECTED\)/u);
  assert.match(workflow,/RELEASE_AUTHORIZED\)/u);
  assert.match(workflow,/RELEASED\)/u);
  assert.match(workflow,/BERS_V1_RELEASE_FINALIZATION_BLOCKED/u);
  assert.match(workflow,/BERS_V1_RC_SELECTED/u);
  assert.match(workflow,/BERS_V1_RELEASE_AUTHORIZED/u);
  assert.match(workflow,/BERS_V1_0_RELEASED/u);
  assert.match(workflow,/Check committed diff whitespace\s*\n\s*if:\s*github\.event_name == 'pull_request'/u);
});

test('state machine accepts a clean RC_SELECTED fixture without publication claims', () => {
  const sha='a'.repeat(40);
  const result=validateV1ReleaseFinalization({
    readiness:selectedReadiness(sha),
    finalization:{
      ...finalization,
      status:'RC_SELECTED',
      rcCoordinate:sha,
      releaseSha:null,
      releaseTag:null,
      releaseGenerated:false,
      publicationEvidence:null,
      packageVersionExpected:'0.0.0',
    },
    classification:classificationFor('RC_SELECTED'),
    pkg:{...pkg,version:'0.0.0'},
  });
  assert.equal(result.marker,'BERS_V1_RC_SELECTED');
  assert.equal(result.payload,sha);
});

test('state machine accepts RELEASE_AUTHORIZED without predeclaring the release SHA', () => {
  const sha='b'.repeat(40);
  const result=validateV1ReleaseFinalization({
    readiness:selectedReadiness(sha),
    finalization:{
      ...finalization,
      status:'RELEASE_AUTHORIZED',
      rcCoordinate:sha,
      releaseSha:null,
      releaseTag:'v1.0.0',
      releaseGenerated:false,
      publicationEvidence:null,
      packageVersionExpected:'1.0.0',
    },
    classification:classificationFor('RELEASE_AUTHORIZED'),
    pkg:{...pkg,version:'1.0.0'},
  });
  assert.equal(result.marker,'BERS_V1_RELEASE_AUTHORIZED');
  assert.deepEqual(result.payload,{rcCoordinate:sha,tag:'v1.0.0'});
});

test('state machine accepts post-publication RELEASED with a distinct published SHA', () => {
  const rcSha='c'.repeat(40);
  const releaseSha='d'.repeat(40);
  const result=validateV1ReleaseFinalization({
    readiness:selectedReadiness(rcSha),
    finalization:{
      ...finalization,
      status:'RELEASED',
      rcCoordinate:rcSha,
      releaseSha,
      releaseTag:'v1.0.0',
      releaseGenerated:true,
      publicationEvidence:publicationEvidence(rcSha,releaseSha),
      packageVersionExpected:'1.0.0',
    },
    classification:classificationFor('RELEASED'),
    pkg:{...pkg,version:'1.0.0'},
  });
  assert.equal(result.marker,'BERS_V1_0_RELEASED');
  assert.deepEqual(result.payload,{rcCoordinate:rcSha,sha:releaseSha,tag:'v1.0.0'});
});

test('RC_SELECTED rejects leaked final release metadata and publication evidence', () => {
  const sha='e'.repeat(40);
  const base={
    readiness:selectedReadiness(sha),
    finalization:{
      ...finalization,
      status:'RC_SELECTED',
      rcCoordinate:sha,
      releaseSha:null,
      releaseTag:null,
      releaseGenerated:false,
      publicationEvidence:null,
      packageVersionExpected:'0.0.0',
    },
    classification:classificationFor('RC_SELECTED'),
    pkg:{...pkg,version:'0.0.0'},
  };
  assert.throws(
    () => validateV1ReleaseFinalization({...base,finalization:{...base.finalization,releaseTag:'v1.0.0'}}),
    /cannot declare final release SHA\/tag/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({...base,finalization:{...base.finalization,publicationEvidence:publicationEvidence()}}),
    /cannot declare publication evidence/u,
  );
});

test('RELEASE_AUTHORIZED rejects self-referential SHA or premature publication claims', () => {
  const sha='f'.repeat(40);
  const base={
    readiness:selectedReadiness(sha),
    finalization:{
      ...finalization,
      status:'RELEASE_AUTHORIZED',
      rcCoordinate:sha,
      releaseSha:null,
      releaseTag:'v1.0.0',
      releaseGenerated:false,
      publicationEvidence:null,
      packageVersionExpected:'1.0.0',
    },
    classification:classificationFor('RELEASE_AUTHORIZED'),
    pkg:{...pkg,version:'1.0.0'},
  };
  assert.throws(
    () => validateV1ReleaseFinalization({...base,finalization:{...base.finalization,releaseSha:sha}}),
    /cannot predeclare its own release SHA/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({...base,finalization:{...base.finalization,releaseGenerated:true}}),
    /cannot claim releaseGenerated=true before publish/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({...base,finalization:{...base.finalization,publicationEvidence:publicationEvidence()}}),
    /cannot claim publication evidence before publish/u,
  );
});

test('RELEASED rejects missing or malformed publication evidence', () => {
  const rcSha='1'.repeat(40);
  const releaseSha='2'.repeat(40);
  const base={
    readiness:selectedReadiness(rcSha),
    finalization:{
      ...finalization,
      status:'RELEASED',
      rcCoordinate:rcSha,
      releaseSha,
      releaseTag:'v1.0.0',
      releaseGenerated:true,
      publicationEvidence:publicationEvidence(rcSha,releaseSha),
      packageVersionExpected:'1.0.0',
    },
    classification:classificationFor('RELEASED'),
    pkg:{...pkg,version:'1.0.0'},
  };
  assert.throws(
    () => validateV1ReleaseFinalization({...base,finalization:{...base.finalization,publicationEvidence:null}}),
    /publicationEvidence must be an object/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      ...base,
      finalization:{
        ...base.finalization,
        publicationEvidence:{...publicationEvidence(rcSha,releaseSha),releaseManifestSha256:'bad'},
      },
    }),
    /releaseManifestSha256 is invalid/u,
  );
});

test('blocked readiness cannot advertise RC selectability, a coordinate or selected status', () => {
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness:{...readiness,rcSelectable:true},
      finalization,
      classification,
      pkg,
    }),
    /blocked readiness requires rcSelectable=false/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness:{...readiness,rcCoordinate:'3'.repeat(40)},
      finalization,
      classification,
      pkg,
    }),
    /blocked readiness cannot declare readiness RC coordinate/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness:{...readiness,status:'BERS_V1_RC_SELECTED'},
      finalization,
      classification,
      pkg,
    }),
    /blocked readiness requires BERS_V1_RC_NOT_SELECTABLE status/u,
  );
});

test('finalization state machine rejects capability release-state drift', () => {
  const sha='4'.repeat(40);
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness:selectedReadiness(sha),
      finalization:{
        ...finalization,
        status:'RC_SELECTED',
        rcCoordinate:sha,
        releaseSha:null,
        releaseTag:null,
        releaseGenerated:false,
        publicationEvidence:null,
        packageVersionExpected:'0.0.0',
      },
      classification,
      pkg:{...pkg,version:'0.0.0'},
    }),
    /classification releaseState must be RC_SELECTED/u,
  );
});

test('finalization state machine rejects release-state mapping drift', () => {
  assert.throws(
    () => validateV1ReleaseFinalization({
      finalization,
      readiness,
      classification:{
        ...classification,
        versioning:{
          ...classification.versioning,
          releaseStateByFinalizationStatus:{
            ...classification.versioning.releaseStateByFinalizationStatus,
            RELEASE_AUTHORIZED:'SOMETHING_ELSE',
          },
        },
      },
      pkg,
    }),
    /classification release-state mapping mismatch for RELEASE_AUTHORIZED/u,
  );
});

test('finalization state machine rejects readiness status drift', () => {
  const sha='5'.repeat(40);
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness:{
        ...selectedReadiness(sha),
        status:'BERS_V1_RC_NOT_SELECTABLE',
      },
      finalization:{
        ...finalization,
        status:'RC_SELECTED',
        rcCoordinate:sha,
        releaseSha:null,
        releaseTag:null,
        releaseGenerated:false,
        publicationEvidence:null,
        packageVersionExpected:'0.0.0',
      },
      classification:classificationFor('RC_SELECTED'),
      pkg:{...pkg,version:'0.0.0'},
    }),
    /empty blockers require BERS_V1_RC_SELECTED readiness status/u,
  );
});

test('finalization state machine rejects cross-manifest program identity drift', () => {
  assert.throws(
    () => validateV1ReleaseFinalization({
      finalization:{...finalization,program:'WRONG'},
      readiness,
      classification,
      pkg,
    }),
    /finalization program mismatch/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      finalization,
      readiness:{...readiness,program:'WRONG'},
      classification,
      pkg,
    }),
    /readiness program mismatch/u,
  );
  assert.throws(
    () => validateV1ReleaseFinalization({
      finalization,
      readiness,
      classification:{...classification,program:'WRONG'},
      pkg,
    }),
    /classification program mismatch/u,
  );
});


test('RELEASED rejects publication evidence for another published SHA', () => {
  const rcSha='6'.repeat(40);
  const releaseSha='7'.repeat(40);
  assert.throws(
    () => validateV1ReleaseFinalization({
      readiness:selectedReadiness(rcSha),
      finalization:{
        ...finalization,
        status:'RELEASED',
        rcCoordinate:rcSha,
        releaseSha,
        releaseTag:'v1.0.0',
        releaseGenerated:true,
        publicationEvidence:publicationEvidence(rcSha,'8'.repeat(40)),
        packageVersionExpected:'1.0.0',
      },
      classification:classificationFor('RELEASED'),
      pkg:{...pkg,version:'1.0.0'},
    }),
    /publicationEvidence releaseSha mismatch/u,
  );
});
