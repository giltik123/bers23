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

function fashionQualityBlocker() {
  return {
    id:'FASHION_REAL_IMAGE_QUALITY',
    issue:230,
    releaseGate:'R2',
    state:'REAL_IMAGE_QUALITY_EVIDENCE_PENDING',
  };
}

function fashionQualityEvidence() {
  return {
    schemaVersion:1,
    kind:'BERS_V1_FASHION_REAL_IMAGE_QUALITY_EVIDENCE',
    issue:230,
    productScope:'DETERMINISTIC_TRYON_V1',
    reviewDecision:'ADVANCE',
    realImageCaseCount:12,
    garmentLogoPatternPreservationReviewed:true,
    failureModesReviewed:true,
    latencyMeasured:true,
    memoryMeasured:true,
    qualityEvidenceSha256:'4'.repeat(64),
    resourceEvidenceSha256:'5'.repeat(64),
    reviewedAt:'2026-10-03T12:00:00.000Z',
    productionAuthorityGranted:false,
  };
}

function hsmeBlocker() {
  return {
    id:'HSME_REAL_MOBILE_EVIDENCE',
    issue:352,
    relatedIssues:[862,867,871],
    releaseGate:'R5',
    state:'HSME_RND_VALIDATION_PENDING',
  };
}

function validatedHsme() {
  return {
    schemaVersion:1,
    kind:'BERS_V1_HSME_RND_VALIDATION',
    requiredClassification:'R&D_VALIDATED',
    currentClassification:'R&D_VALIDATED',
    state:'R&D_VALIDATED',
    blockers:[],
    physicalMobileQualification:{
      state:'REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED',
      realPhysicalMobileDeviceEvidence:true,
      qualificationEvidenceSha256:'9'.repeat(64),
    },
    finalArchitectureDecision:'ADVANCE',
    productionAuthorityGranted:false,
  };
}

function blockedReadinessWithMainProtection() {
  return {
    ...readiness,
    blockers:[mainProtectionBlocker(),fashionQualityBlocker(),hsmeBlocker()],
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
  assert.deepEqual(readiness.nonBlockingDeferred.map(value=>value.issue).sort((a,b)=>a-b), [189,192]);
  assert.equal(readiness.blockers.some(value=>[189,192].includes(value.issue)), false);
  assert.equal(readiness.blockers.some(value=>value.id==='FASHION_REAL_IMAGE_QUALITY'), true);
  assert.equal(readiness.fashionQualityEvidence,null);
  assert.equal(readiness.blockers.some(value=>value.id==='HSME_REAL_MOBILE_EVIDENCE'), true);
  assert.equal(readiness.hsmeValidation.currentClassification,'RND_IMPLEMENTATION_EVIDENCE_PENDING');
  assert.equal(readiness.hsmeValidation.state,'BLOCKED');
  assert.equal(readiness.hsmeValidation.productionAuthorityGranted,false);
});

test('readiness classifier emits exactly the disposition declared by the ledger', () => {
  const result=spawnSync(process.execPath,['scripts/check-v1-release-readiness.mjs'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const expected=readiness.blockers.length > 0 ? 'BERS_V1_RC_NOT_SELECTABLE' : 'BERS_V1_RC_SELECTED';
  assert.match(result.stdout,new RegExp(`^${expected}(?: |$)`,'m'));
  const other=expected === 'BERS_V1_RC_NOT_SELECTABLE' ? 'BERS_V1_RC_SELECTED' : 'BERS_V1_RC_NOT_SELECTABLE';
  assert.doesNotMatch(result.stdout,new RegExp(other));
  assert.match(result.stdout,/RND_IMPLEMENTATION_EVIDENCE_PENDING/);
});

test('canonical roadmap keeps HSME physical-mobile work mandatory before RC without granting production authority', () => {
  assert.match(roadmap, /Stage E — Mandatory pre-RC BERS Local-First AI Engine R&D/);
  assert.match(roadmap, /Stage E\/HSME is a mandatory implementation\/evidence gate for `BERS_V1_RC` and `BERS v1\.0 RELEASE`/);
  assert.match(roadmap, /at least one functioning real mobile backend is required for the pre-RC feasibility gate/);
  assert.match(roadmap, /R&D validation before v1 is mandatory/);
  assert.match(hsmeRoadmap, /Before `BERS_V1_RC`, HSME is an \*\*implementation\/evidence requirement\*\*/);
  assert.match(hsmeRoadmap, /mandatory pre-v1 implementation\/evidence/);
  assert.doesNotMatch(hsmeRoadmap, /explicit \*\*post-v1 R&D workstream\*\*/);
});

test('selection law binds RC selection to empty blockers and one exact accepted SHA', () => {
  assert.match(readiness.selectionLaw,/blockers is empty/);
  assert.match(readiness.selectionLaw,/one exact accepted main SHA/);
  if (readiness.blockers.length > 0) {
    assert.equal(readiness.rcSelectable,false);
    assert.equal(readiness.rcCoordinate,null);
  }
});

test('readiness state machine permits frontend evidence to remain proven while HSME still blocks RC', () => {
  const result=validateV1ReleaseReadiness({
    readiness:{
      ...readiness,
      blockers:[hsmeBlocker()],
      rcSelectable:false,
      rcCoordinate:null,
      status:'BERS_V1_RC_NOT_SELECTABLE',
      mainProtectionEvidence:mainProtectionEvidence(),
      fashionQualityEvidence:fashionQualityEvidence(),
    },
    journeys,
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_NOT_SELECTABLE');
  assert.deepEqual(result.payload.blockers.map(value=>value.id),['HSME_REAL_MOBILE_EVIDENCE']);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[]);
  assert.equal(result.payload.hsmeValidationState,'RND_IMPLEMENTATION_EVIDENCE_PENDING');
});

test('readiness state machine selects one exact RC only after Fashion quality and HSME evidence are accepted', () => {
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
      fashionQualityEvidence:fashionQualityEvidence(),
      hsmeValidation:validatedHsme(),
    },
    journeys:selectedJourneys,
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_SELECTED');
  assert.equal(result.payload.rcCoordinate,sha);
  assert.equal(result.payload.provenBrowserJourneys,21);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[]);
  assert.equal(result.payload.fashionQualityState,'QUALITY_VALIDATED');
  assert.equal(result.payload.hsmeValidationState,'R&D_VALIDATED');
});

test('readiness state machine rejects premature RC selection and frontend blocker drift', () => {
  const sha='b'.repeat(40);
  const blockedReadiness=blockedReadinessWithMainProtection();
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{...blockedReadiness,rcSelectable:true,rcCoordinate:sha,status:'BERS_V1_RC_SELECTED'},
      journeys,
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

test('readiness state machine requires accepted Fashion quality evidence before its blocker can clear', () => {
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='FASHION_REAL_IMAGE_QUALITY'),
        fashionQualityEvidence:null,
      },
      journeys,
      stageD,
    }),
    /fashionQualityEvidence must be an object/u,
  );

  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='FASHION_REAL_IMAGE_QUALITY'),
        fashionQualityEvidence:{...fashionQualityEvidence(),garmentLogoPatternPreservationReviewed:false},
      },
      journeys,
      stageD,
    }),
    /review dimensions are incomplete/u,
  );

  const result=validateV1ReleaseReadiness({
    readiness:{
      ...readiness,
      blockers:readiness.blockers.filter(value=>value.id!=='FASHION_REAL_IMAGE_QUALITY'),
      fashionQualityEvidence:fashionQualityEvidence(),
    },
    journeys,
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_NOT_SELECTABLE');
  assert.equal(result.payload.fashionQualityState,'QUALITY_VALIDATED');
});

test('readiness state machine requires the exact HSME blocker until R&D_VALIDATED and rejects unknown blockers', () => {
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:readiness.blockers.filter(value=>value.id!=='HSME_REAL_MOBILE_EVIDENCE'),
      },
      journeys,
      stageD,
    }),
    /HSME must block RC until R&D_VALIDATED/u,
  );
  assert.throws(
    () => validateV1ReleaseReadiness({
      readiness:{
        ...readiness,
        blockers:[fashionQualityBlocker(),{...hsmeBlocker(),issue:871}],
      },
      journeys,
      stageD,
    }),
    /HSME_REAL_MOBILE_EVIDENCE issue mismatch/u,
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

test('readiness state machine keeps deployment pending when frontend evidence is the only remaining blocker after HSME validation', () => {
  const result=validateV1ReleaseReadiness({
    readiness:{
      ...readiness,
      blockers:[frontendDeploymentBlocker()],
      rcSelectable:false,
      rcCoordinate:null,
      status:'BERS_V1_RC_NOT_SELECTABLE',
      mainProtectionEvidence:mainProtectionEvidence(),
      fashionQualityEvidence:fashionQualityEvidence(),
      hsmeValidation:validatedHsme(),
    },
    journeys:pendingFrontendJourneys(),
    stageD,
  });
  assert.equal(result.marker,'BERS_V1_RC_NOT_SELECTABLE');
  assert.deepEqual(result.payload.blockers.map(value=>value.id),['FRONTEND_DEPLOYMENT_HEADERS']);
  assert.deepEqual(result.payload.pendingBrowserJourneys,[22]);
  assert.equal(result.payload.hsmeValidationState,'R&D_VALIDATED');
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
        fashionQualityEvidence:fashionQualityEvidence(),
        hsmeValidation:validatedHsme(),
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
