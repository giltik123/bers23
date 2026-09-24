import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA,
} from './HsmeDenseStudentFrozenRunRepresentationAdmissionV1.ts';
import {
  HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
} from './HsmeDenseStudentRepresentationV1.ts';
import {
  assembleHsmeDenseStudentRealRepresentationRosterV1,
  hsmeDenseStudentRealRepresentationRosterV1Digest,
} from './HsmeDenseStudentRealRepresentationRosterV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort=Object.freeze({
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
});

function blockedAdmission(step){
  return {
    schemaVersion:
      HSME_DENSE_STUDENT_FROZEN_RUN_REPRESENTATION_ADMISSION_V1_SCHEMA,
    state:'FROZEN_RUN_REPRESENTATION_ADMISSION_BLOCKED',
    blockers:['FROZEN_RUN_REPRESENTATION_REAL_READY_RUN_REQUIRED'],
    frozenRunEvidenceSha256:H('frozen-'+step),
    trainingRunReceiptSha256:H('receipt-'+step),
    preflightEvidenceSha256:H('preflight-'+step),
    launchSpecSha256:H('launch-'+step),
    representationEvidenceSha256:'UNKNOWN',
    candidateId:'bers-dense-core-v1-training-target',
    targetStepCount:step,
    stagedCheckpointSha256:'UNKNOWN',
    stagedCheckpointBytes:'UNKNOWN',
    representationArtifactSha256:'UNKNOWN',
    representationBytes:'UNKNOWN',
    representationMetadataSha256:'UNKNOWN',
    exportToolchainSha256:'UNKNOWN',
    packDescriptorSha256:'UNKNOWN',
    admissionEvidenceSha256:'UNKNOWN',
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
  };
}

function blockedRepresentation(step){
  return {
    schemaVersion:HSME_DENSE_STUDENT_REPRESENTATION_EVIDENCE_V1_SCHEMA,
    state:'REPRESENTATION_BLOCKED',
    blockers:['REPRESENTATION_COMPLETED_RECEIPT_REQUIRED'],
    receiptEvidenceSha256:'UNKNOWN',
    preflightEvidenceSha256:'UNKNOWN',
    launchSpecSha256:'UNKNOWN',
    candidateId:'bers-dense-core-v1-training-target',
    architectureFamily:'COMPACT_DIT',
    activeParametersMillions:'UNKNOWN',
    targetStepCount:step,
    repositoryCommitSha:'UNKNOWN',
    immutableEnvironmentSha256:'UNKNOWN',
    stagedCheckpointSha256:'UNKNOWN',
    stagedCheckpointBytes:'UNKNOWN',
    checkpointMetadataSha256:'UNKNOWN',
    teacherDecisionSha256:'UNKNOWN',
    reproductionEvidenceSha256:'UNKNOWN',
    corpusRootDigest:'UNKNOWN',
    recipeDigest:'UNKNOWN',
    inputCheckpointSha256:'UNKNOWN',
    resumeCheckpointSha256:'UNKNOWN',
    exportAttemptId:'UNKNOWN',
    exportSpec:null,
    representationArtifactSha256:'UNKNOWN',
    representationBytes:'UNKNOWN',
    representationMetadataSha256:'UNKNOWN',
    components:null,
    exportToolchainSha256:'UNKNOWN',
    resourceEvidence:null,
    exporterResultSha256:'UNKNOWN',
    packCandidateState:'PACK_CANDIDATE_UNAVAILABLE',
    packDescriptor:null,
    packDescriptorSha256:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
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
  };
}

function pair(step){
  return {
    admission:blockedAdmission(step),
    expectedAdmissionEvidenceSha256:H('admission-'+step),
    representation:blockedRepresentation(step),
    expectedRepresentationEvidenceSha256:H('representation-'+step),
  };
}

function origins(){
  let admissionCalls=0;
  let representationCalls=0;
  return {
    admissionOrigin:{
      async verifyRepresentationAdmission(){
        admissionCalls+=1;
        return false;
      },
    },
    representationOrigin:{
      async verifyRepresentationEvidence(){
        representationCalls+=1;
        return false;
      },
    },
    get admissionCalls(){return admissionCalls;},
    get representationCalls(){return representationCalls;},
  };
}

test('complete non-ready 2/4/6/8 inputs remain BLOCKED and never reach origin verification',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealRepresentationRosterV1(
    [pair(8),pair(2),pair(6),pair(4)],
    o.admissionOrigin,
    o.representationOrigin,
    hashPort,
  );

  assert.equal(result.state,'REAL_REPRESENTATION_ROSTER_BLOCKED');
  assert.deepEqual(
    result.blockers,
    ['REAL_REPRESENTATION_ROSTER_COMPLETE_READY_SET_REQUIRED'],
  );
  assert.deepEqual(result.entries,[]);
  assert.equal(result.evidenceSha256,'UNKNOWN');
  assert.equal(o.admissionCalls,0);
  assert.equal(o.representationCalls,0);
});

test('missing step-count evidence remains BLOCKED, never inferred',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealRepresentationRosterV1(
    [pair(2),pair(4),pair(6)],
    o.admissionOrigin,
    o.representationOrigin,
    hashPort,
  );
  assert.equal(result.state,'REAL_REPRESENTATION_ROSTER_BLOCKED');
  assert.equal(result.entries.length,0);
  assert.equal(o.admissionCalls,0);
});

test('duplicate declared step count fails closed before trust verification',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealRepresentationRosterV1(
    [pair(2),pair(4),pair(4),pair(8)],
    o.admissionOrigin,
    o.representationOrigin,
    hashPort,
  );
  assert.equal(result.state,'REAL_REPRESENTATION_ROSTER_INVALID');
  assert.deepEqual(
    result.blockers,
    ['REAL_REPRESENTATION_ROSTER_DUPLICATE_STEP_COUNT'],
  );
  assert.equal(o.admissionCalls,0);
  assert.equal(o.representationCalls,0);
});

test('extra roster entry fails closed rather than widening canonical schedule',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealRepresentationRosterV1(
    [pair(2),pair(4),pair(6),pair(8),pair(8)],
    o.admissionOrigin,
    o.representationOrigin,
    hashPort,
  );
  assert.equal(result.state,'REAL_REPRESENTATION_ROSTER_INVALID');
  assert.deepEqual(
    result.blockers,
    ['REAL_REPRESENTATION_ROSTER_INPUT_COUNT_INVALID'],
  );
  assert.equal(o.admissionCalls,0);
});

test('blocked roster grants no benchmark, selection, promotion or production authority',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealRepresentationRosterV1(
    [pair(2),pair(4),pair(6),pair(8)],
    o.admissionOrigin,
    o.representationOrigin,
    hashPort,
  );

  for(const field of [
    'stepMatrixExecutionGranted',
    'scheduleSelectionAllowed',
    'candidateSelectionAllowed',
    'baselineSelectionAllowed',
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

test('non-ready roster evidence is not digestible',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealRepresentationRosterV1(
    [pair(2),pair(4),pair(6),pair(8)],
    o.admissionOrigin,
    o.representationOrigin,
    hashPort,
  );
  await assert.rejects(
    ()=>hsmeDenseStudentRealRepresentationRosterV1Digest(result,hashPort),
    error=>error.code==='hsme_real_representation_roster_digest_state',
  );
});
