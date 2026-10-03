import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import { validateV1ReleaseReadiness } from '../scripts/check-v1-release-readiness.mjs';

const readiness = JSON.parse(await readFile('config/v1-release-readiness.json','utf8'));
const journeys = JSON.parse(await readFile('config/v1-release-journey-matrix.json','utf8'));
const stageD = JSON.parse(await readFile('config/v1-generative-decision-matrix.json','utf8'));
const roadmap = await readFile('BERS_V1_DEVELOPMENT_ROADMAP.md','utf8');
const hsmeRoadmap = await readFile('BERS_HYBRID_SPARSE_MOBILE_ENGINE_ROADMAP.md','utf8');

function mainProtectionEvidence() {
  const requiredChecks=[
    'BERS Required Acceptance',
    'integrated-contract',
    'npm-production-audit',
    'fp16-webgpu-feasibility',
    'wasm-compact-feasibility',
    'ort-memory-latency-feasibility',
    'short-pipeline-measurement',
  ];
  return {
    schemaVersion:1,
    kind:'BERS_V1_GITHUB_MAIN_PROTECTION_EVIDENCE',
    verifiedAt:'2026-09-30T12:00:00.000Z',
    repository:'giltik123/bers23',
    branch:'main',
    mode:'RULESET',
    requiredChecks,
    ruleset:{
      id:7,
      name:'BERS immutable main release authority',
      enforcement:'active',
      target:'branch',
      requiredApprovingReviewCount:0,
      requiredStatusChecks:[...requiredChecks].sort(),
      strictRequiredStatusChecks:true,
      forcePushBlocked:true,
      deletionBlocked:true,
      bypassActors:[],
    },
    rulesetReadError:null,
  };
}

function frontendLiveEvidence(sha) {
  return {
    schemaVersion:1,
    kind:'BERS_V1_FRONTEND_SECURITY_EVIDENCE',
    verifiedSha:sha,
    frontendUrl:'https://app.example.test',
    coreApiUrl:'https://api.example.test/api/core',
    htmlSha256:'1'.repeat(64),
    verifiedAt:'2026-09-30T12:00:00.000Z',
    workflowRunUrl:'https://github.com/giltik123/bers23/actions/runs/123456789',
    artifactName:`bers-v1-frontend-security-${sha}`,
  };
}

function frontendDeploymentBlocker() {
  return {
    id:'FRONTEND_DEPLOYMENT_HEADERS',
    issue:233,
    releaseGate:'R4',
    state:'EXTERNAL_DEPLOYMENT_EVIDENCE_PENDING',
    evidence:'config/v1-release-journey-matrix.json#journey-22',
    resolution:'Run the live frontend verifier and record exact hosted deployment evidence.',
  };
}

function mainProtectionBlocker() {
  return {
    id:'REPOSITORY_MAIN_PROTECTION',
    issue:355,
    releaseGate:'R1',
    state:'EXTERNAL_GITHUB_ADMIN_REQUIRED',
  };
}

function blockedReadinessWithMainProtection() {
  return {
    ...readiness,
    blockers:[mainProtectionBlocker()],
    rcSelectable:false,
    rcCoordinate:null,
    status:'BERS_V1_RC_NOT_SELECTABLE',
    mainProtectionEvidence:null,
  };
}

function pendingFrontendJourneys() {
  return {
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {
          id:22,
          name:value.name,
          disposition:'DEPLOYMENT_TARGET_PENDING',
          reason:'Final canonical deployed frontend evidence remains pending.',
          evidence:value.evidence,
          workflow:value.workflow,
          verifier:value.verifier,
        }
      : value),
  };
}

test('current RC readiness matches its machine-readable state', () => {
  const result=validateV1ReleaseReadiness({readiness,journeys,stageD});
  const expected=readiness.blockers.length > 0
    ? 'BERS_V1_RC_NOT_SELECTABLE'
    : 'BERS_V1_RC_SELECTED';
  assert.equal(result.marker,expected);

  if (readiness.blockers.length > 0) {
    assert.equal(readiness.rcSelectable,false);
    assert.equal(readiness.rcCoordinate,null);
    assert.equal(readiness.status,'BERS_V1_RC_NOT_SELECTABLE');
  } else {
    assert.equal(readiness.rcSelectable,true);
    assert.match(readiness.rcCoordinate,/^[0-9a-f]{40}$/u);
    assert.equal(readiness.status,'BERS_V1_RC_SELECTED');
  }
});

test('RC guard consumes the accepted Stage D and browser ledgers instead of open-issue counts', () => {
  assert.equal(stageD.entries.length,6);
  assert.equal(stageD.entries.every(value=>value.productionEnabled === false),true);
  assert.equal(journeys.entries.find(value=>value.id === 17).disposition,'DEFERRED_OUT_OF_V1');
  const journey22=journeys.entries.find(value=>value.id === 22);
  const frontendBlocked=readiness.blockers.some(value=>value.id==='FRONTEND_DEPLOYMENT_HEADERS');
  assert.equal(journey22.disposition,frontendBlocked ? 'DEPLOYMENT_TARGET_PENDING' : 'PROVEN');
  assert.equal(
    journeys.entries.filter(value=>value.id !== 17 && value.disposition !== 'PROVEN')
      .every(value=>value.id === 22 && frontendBlocked),
    true,
  );
  assert.doesNotMatch(JSON.stringify(readiness.blockers), /192|191|155|180|349/);
});

test('optional/deferred work cannot accidentally block RC through this ledger', () => {
  assert.deepEqual(readiness.nonBlockingDeferred.map(value=>value.issue).sort((a,b)=>a-b), [189,192,352]);
  assert.equal(readiness.blockers.some(value=>[189,192,352].includes(value.issue)), false);
  const hsme = readiness.nonBlockingDeferred.find(value=>value.id==='HSME_REAL_MOBILE_EVIDENCE');
  assert.equal(hsme.state,'DEFERRED_POST_V1_RESEARCH');
  assert.deepEqual(hsme.relatedIssues,[862,871,867]);
});

test('readiness classifier emits exactly the disposition declared by the ledger', () => {
  const result=spawnSync(process.execPath,['scripts/check-v1-release-readiness.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const expected=readiness.blockers.length > 0 ? 'BERS_V1_RC_NOT_SELECTABLE' : 'BERS_V1_RC_SELECTED';
  assert.match(result.stdout,new RegExp(`^${expected}(?: |$)`,'m'));
  const other=expected === 'BERS_V1_RC_NOT_SELECTABLE' ? 'BERS_V1_RC_SELECTED' : 'BERS_V1_RC_NOT_SELECTABLE';
  assert.doesNotMatch(result.stdout,new RegExp(other));
  assert.match(result.stdout,/DEFERRED_POST_V1_RESEARCH/);
});

test('canonical roadmap keeps HSME physical-mobile work post-v1 and non-blocking', () => {
  assert.match(roadmap, /Stage E — Post-v1 BERS Local-First AI Engine R&D/);
  assert.match(roadmap, /Stage E\/HSME is explicitly non-blocking for `BERS_V1_RC` and `BERS v1\.0 RELEASE`/);
  assert.match(roadmap, /HSME remains explicitly non-production\/post-v1/);
  assert.doesNotMatch(roadmap, /at least one functioning real mobile backend is required for the pre-RC feasibility gate/);
  assert.doesNotMatch(roadmap, /R&D validation before v1 is mandatory/);
  assert.match(hsmeRoadmap, /HSME is an explicit \*\*post-v1 R&D workstream\*\*/);
  assert.match(hsmeRoadmap, /not an implementation\/evidence requirement for `BERS_V1_RC` or `BERS v1\.0 RELEASE`/);
  assert.doesNotMatch(hsmeRoadmap, /Before `BERS_V1_RC`, HSME is an \*\*implementation\/evidence requirement\*\*/);
  assert.doesNotMatch(hsmeRoadmap, /mandatory pre-v1 implementation\/evidence/);
});

test('selection law binds RC selection to empty blockers and one exact accepted SHA', () => {
  assert.match(readiness.selectionLaw,/blockers is empty/);
  assert.match(readiness.selectionLaw,/one exact accepted main SHA/);
  if (readiness.blockers.length > 0) {
    assert.equal(readiness.rcSelectable,false);
    assert.equal(readiness.rcCoordinate,null);
  }
});

test('readiness state machine permits either external blocker to close independently', () => {
  const oneBlocker=[mainProtectionBlocker()];
  const evidenceSha='7'.repeat(40);
  const promotedJourneys={
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {...value,disposition:'PROVEN',liveEvidence:frontendLiveEvidence(evidenceSha)}
      : value),
  };
  const result=validateV1ReleaseReadiness({
    readiness:{
      ...blockedReadinessWithMainProtection(),
      blockers:oneBlocker,
    },
    journeys:promotedJourneys,
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_NOT_SELECTABLE');
  assert.deepEqual(result.payload.blockers.map(value=>value.id),['REPOSITORY_MAIN_PROTECTION']);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[]);
});

test('readiness state machine selects one exact RC only after all blockers are removed', () => {
  const sha='a'.repeat(40);
  const selectedJourneys={
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {...value,disposition:'PROVEN',liveEvidence:frontendLiveEvidence(sha)}
      : value),
  };
  const result=validateV1ReleaseReadiness({
    readiness:{
      ...readiness,
      blockers:[],
      rcSelectable:true,
      rcCoordinate:sha,
      status:'BERS_V1_RC_SELECTED',
      mainProtectionEvidence:mainProtectionEvidence(),
    },
    journeys:selectedJourneys,
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_SELECTED');
  assert.equal(result.payload.rcCoordinate,sha);
  assert.equal(result.payload.provenBrowserJourneys,21);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[]);
});

test('readiness state machine rejects premature RC selection and frontend blocker drift', () => {
  const sha='b'.repeat(40);
  const blockedReadiness=blockedReadinessWithMainProtection();
  const provenJourneys={
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {...value,disposition:'PROVEN',liveEvidence:frontendLiveEvidence(sha)}
      : value),
  };
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{...blockedReadiness,rcSelectable:true,rcCoordinate:sha,status:'BERS_V1_RC_SELECTED'},
      journeys:provenJourneys,
      stageD,
    }),
    /non-selectable while blockers exist/u,
  );

  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:blockedReadiness,
      journeys:pendingFrontendJourneys(),
      stageD,
    }),
    /journey 22 must be PROVEN/u,
  );
});

test('readiness state machine rejects HSME as a v1 blocker or unknown blocker', () => {
  const hsme=readiness.nonBlockingDeferred.find(value=>value.id==='HSME_REAL_MOBILE_EVIDENCE');
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:[...readiness.blockers,{...hsme,releaseGate:'R5'}],
      },
      journeys,
      stageD,
    }),
    /unexpected v1 blocker|physical-mobile HSME/u,
  );
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:[...readiness.blockers,{id:'UNKNOWN',issue:999,releaseGate:'RX'}],
      },
      journeys,
      stageD,
    }),
    /unexpected v1 blocker/u,
  );
});


test('readiness state machine keeps deployment pending when only frontend blocker remains', () => {
  const result=validateV1ReleaseReadiness({
    readiness:{
      ...readiness,
      blockers:[frontendDeploymentBlocker()],
      rcSelectable:false,
      rcCoordinate:null,
      status:'BERS_V1_RC_NOT_SELECTABLE',
      mainProtectionEvidence:mainProtectionEvidence(),
    },
    journeys:pendingFrontendJourneys(),
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_NOT_SELECTABLE');
  assert.deepEqual(result.payload.blockers.map(value=>value.id),['FRONTEND_DEPLOYMENT_HEADERS']);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[22]);
});

test('RC readiness workflow follows manifest state and keeps diff hygiene PR-only', async () => {
  const workflow=await readFile('.github/workflows/v1-release-readiness.yml','utf8');
  assert.match(workflow,/Emit manifest-matched RC disposition/u);
  assert.match(workflow,/BERS_V1_RC_NOT_SELECTABLE\)/u);
  assert.match(workflow,/BERS_V1_RC_SELECTED\)/u);
  assert.match(workflow,/Unknown release-readiness status/u);
  assert.match(workflow,/Check committed diff whitespace\s*\n\s*if:\s*github\.event_name == 'pull_request'/u);
});


test('readiness state machine rejects RC selection that is not the reviewed frontend deployment SHA', () => {
  const rcSha='6'.repeat(40);
  const deploymentSha='7'.repeat(40);
  const selectedJourneys={
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {...value,disposition:'PROVEN',liveEvidence:frontendLiveEvidence(deploymentSha)}
      : value),
  };
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:[],
        rcSelectable:true,
        rcCoordinate:rcSha,
        status:'BERS_V1_RC_SELECTED',
        mainProtectionEvidence:mainProtectionEvidence(),
      },
      journeys:selectedJourneys,
      stageD,
    }),
    /selected RC must equal journey 22 verified deployment SHA/u,
  );
});

test('readiness state machine rejects fake or partial journey 22 live evidence', () => {
  const sha='8'.repeat(40);
  const badJourneys={
    ...journeys,
    entries:journeys.entries.map(value=>value.id === 22
      ? {
          ...value,
          disposition:'PROVEN',
          liveEvidence:{...frontendLiveEvidence(sha),artifactName:'wrong'},
        }
      : value),
  };
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='FRONTEND_DEPLOYMENT_HEADERS'),
        rcSelectable:false,
        rcCoordinate:null,
        status:'BERS_V1_RC_NOT_SELECTABLE',
      },
      journeys:badJourneys,
      stageD,
    }),
    /artifactName does not bind verifiedSha/u,
  );
});


test('readiness state machine rejects clearing main protection blocker without accepted evidence', () => {
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='REPOSITORY_MAIN_PROTECTION'),
        mainProtectionEvidence:null,
      },
      journeys,
      stageD,
    }),
    /mainProtectionEvidence must be an object/u,
  );
});

test('readiness state machine rejects unsafe or incomplete main protection evidence', () => {
  const evidence=mainProtectionEvidence();
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='REPOSITORY_MAIN_PROTECTION'),
        mainProtectionEvidence:{
          ...evidence,
          ruleset:{...evidence.ruleset,bypassActors:[{actor:'admin'}]},
        },
      },
      journeys,
      stageD,
    }),
    /ruleset safety contract mismatch/u,
  );
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='REPOSITORY_MAIN_PROTECTION'),
        mainProtectionEvidence:{
          ...evidence,
          ruleset:{...evidence.ruleset,requiredApprovingReviewCount:1},
        },
      },
      journeys,
      stageD,
    }),
    /approval count mismatch/u,
  );
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='REPOSITORY_MAIN_PROTECTION'),
        mainProtectionEvidence:{
          ...evidence,
          requiredChecks:evidence.requiredChecks.slice(0,-1),
        },
      },
      journeys,
      stageD,
    }),
    /required checks mismatch/u,
  );
});
