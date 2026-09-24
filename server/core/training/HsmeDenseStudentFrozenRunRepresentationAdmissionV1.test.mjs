import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1_SCHEMA,
} from './HsmeDenseStudentFrozenWorkspaceRunEvidenceV1.ts';
import {
  admitHsmeDenseStudentFrozenRunRepresentationV1,
  hsmeDenseStudentFrozenRunRepresentationAdmissionV1Digest,
} from './HsmeDenseStudentFrozenRunRepresentationAdmissionV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort=Object.freeze({
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
});

function blockedFrozenRun(overrides={}){
  return {
    schemaVersion:HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1_SCHEMA,
    state:'FROZEN_WORKSPACE_RUN_EVIDENCE_BLOCKED',
    blockers:['FROZEN_RUN_REAL_PROTECTED_ORIGIN_UNVERIFIED'],
    freezeReceiptEvidenceSha256:H('freeze'),
    workspaceSha256:H('workspace'),
    preflightEvidenceSha256:H('preflight'),
    launchSpecSha256:H('launch'),
    trainingRunReceiptSha256:H('receipt'),
    materializationAttemptId:'materialization:test',
    executionAttemptId:'execution:test',
    candidateId:'bers-dense-core-v1-training-target',
    targetStepCount:4,
    backend:null,
    startedAtMs:'UNKNOWN',
    finishedAtMs:'UNKNOWN',
    consumedTrainingExamples:'UNKNOWN',
    consumedGpuSeconds:'UNKNOWN',
    consumedTrainingCostMicrousd:'UNKNOWN',
    stdoutEvidenceSha256:'UNKNOWN',
    stderrEvidenceSha256:'UNKNOWN',
    stagedCheckpointSha256:'UNKNOWN',
    stagedCheckpointBytes:'UNKNOWN',
    checkpointMetadataSha256:'UNKNOWN',
    teacherDecisionSha256:H('teacher'),
    reproductionEvidenceSha256:H('reproduction'),
    corpusRootDigest:H('corpus'),
    recipeDigest:H('recipe'),
    inputCheckpointSha256:H('input-checkpoint'),
    resumeCheckpointSha256:'NONE',
    realProtectedExecution:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
    evidenceSha256:H('blocked-run-evidence'),
    ...overrides,
  };
}

function fakePorts(){
  let exporterCalls=0;
  let frozenOriginCalls=0;
  let resultOriginCalls=0;
  return {
    frozenOrigin:{
      async verifyFrozenRunEvidence(){
        frozenOriginCalls+=1;
        return false;
      },
    },
    exporter:{
      async exportExactDenseStudentRepresentation(){
        exporterCalls+=1;
        throw new Error('ordinary PR CI must never reach exporter');
      },
    },
    representationResultOrigin:{
      async verifyRepresentationResult(){
        resultOriginCalls+=1;
        return false;
      },
    },
    get exporterCalls(){return exporterCalls;},
    get frozenOriginCalls(){return frozenOriginCalls;},
    get resultOriginCalls(){return resultOriginCalls;},
  };
}

test('non-real frozen-run evidence is BLOCKED before exporter or origin admission',async()=>{
  const ports=fakePorts();
  const result=await admitHsmeDenseStudentFrozenRunRepresentationV1(
    blockedFrozenRun(),
    H('external-frozen-run'),
    ports.frozenOrigin,
    null,
    H('external-receipt'),
    null,
    ports.exporter,
    ports.representationResultOrigin,
    hashPort,
  );

  assert.equal(
    result.state,
    'FROZEN_RUN_REPRESENTATION_ADMISSION_BLOCKED',
  );
  assert.deepEqual(
    result.blockers,
    ['FROZEN_RUN_REPRESENTATION_REAL_READY_RUN_REQUIRED'],
  );
  assert.equal(ports.exporterCalls,0);
  assert.equal(ports.frozenOriginCalls,0);
  assert.equal(ports.resultOriginCalls,0);
});

test('blocked frozen-run input cannot be converted into a READY representation admission',async()=>{
  const ports=fakePorts();
  const result=await admitHsmeDenseStudentFrozenRunRepresentationV1(
    blockedFrozenRun({
      blockers:['FROZEN_RUN_SYNTHETIC_ORIGIN_FORBIDDEN'],
    }),
    H('external-frozen-run'),
    ports.frozenOrigin,
    null,
    H('external-receipt'),
    null,
    ports.exporter,
    ports.representationResultOrigin,
    hashPort,
  );

  assert.notEqual(
    result.state,
    'FROZEN_RUN_REPRESENTATION_READY_NOT_ADMITTED',
  );
  assert.equal(result.representationEvidenceSha256,'UNKNOWN');
  assert.equal(result.representationArtifactSha256,'UNKNOWN');
  assert.equal(result.admissionEvidenceSha256,'UNKNOWN');
  assert.equal(ports.exporterCalls,0);
});

test('invalid frozen-run schema fails closed without representation export',async()=>{
  const ports=fakePorts();
  const invalid={
    ...blockedFrozenRun(),
    schemaVersion:'BERS_FAKE_FROZEN_RUN_V1',
  };
  const result=await admitHsmeDenseStudentFrozenRunRepresentationV1(
    invalid,
    H('external-frozen-run'),
    ports.frozenOrigin,
    null,
    H('external-receipt'),
    null,
    ports.exporter,
    ports.representationResultOrigin,
    hashPort,
  );

  assert.equal(
    result.state,
    'FROZEN_RUN_REPRESENTATION_ADMISSION_INVALID',
  );
  assert.ok(
    result.blockers.includes(
      'FROZEN_RUN_REPRESENTATION_RUN_SCHEMA_INVALID',
    ),
  );
  assert.ok(
    result.blockers.includes(
      'FROZEN_RUN_REPRESENTATION_COMPLETED_RECEIPT_REQUIRED',
    ),
  );
  assert.ok(
    result.blockers.includes(
      'FROZEN_RUN_REPRESENTATION_READY_PREFLIGHT_REQUIRED',
    ),
  );
  assert.equal(ports.exporterCalls,0);
});

test('blocked admission preserves every non-promotion authority boundary',async()=>{
  const ports=fakePorts();
  const result=await admitHsmeDenseStudentFrozenRunRepresentationV1(
    blockedFrozenRun(),
    H('external-frozen-run'),
    ports.frozenOrigin,
    null,
    H('external-receipt'),
    null,
    ports.exporter,
    ports.representationResultOrigin,
    hashPort,
  );

  for(const field of [
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ]){
    assert.equal(result[field],false,field);
  }
});

test('non-ready admission evidence is not digestible',async()=>{
  const ports=fakePorts();
  const result=await admitHsmeDenseStudentFrozenRunRepresentationV1(
    blockedFrozenRun(),
    H('external-frozen-run'),
    ports.frozenOrigin,
    null,
    H('external-receipt'),
    null,
    ports.exporter,
    ports.representationResultOrigin,
    hashPort,
  );

  await assert.rejects(
    ()=>hsmeDenseStudentFrozenRunRepresentationAdmissionV1Digest(
      result,
      hashPort,
    ),
    error=>
      error.code==='hsme_frozen_run_representation_admission_digest_state',
  );
});
