import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
  HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA,
} from './HsmeDenseStudentRealRepresentationRosterV1.ts';
import {
  assembleHsmeDenseStudentRealStepMatrixCampaignV1,
  hsmeDenseStudentRealStepMatrixCampaignV1Digest,
} from './HsmeDenseStudentRealStepMatrixCampaignV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort=Object.freeze({
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
});

function blockedRoster(){
  return {
    schemaVersion:HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_V1_SCHEMA,
    state:'REAL_REPRESENTATION_ROSTER_BLOCKED',
    blockers:['REAL_REPRESENTATION_ROSTER_COMPLETE_READY_SET_REQUIRED'],
    candidateId:'UNKNOWN',
    architectureFamily:'UNKNOWN',
    requiredStepCounts:HSME_DENSE_STUDENT_REAL_REPRESENTATION_ROSTER_STEP_COUNTS,
    entries:[],
    evidenceSha256:'UNKNOWN',
    stepMatrixExecutionGranted:false,
    scheduleSelectionAllowed:false,
    candidateSelectionAllowed:false,
    baselineSelectionAllowed:false,
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

function placeholder(step){
  return {
    trainingTargetStepCount:step,
    representation:null,
    expectedRepresentationEvidenceSha256:H('representation-'+step),
    stepMatrix:null,
    expectedStepMatrixEvidenceSha256:H('matrix-'+step),
  };
}

function origins(){
  let rosterCalls=0;
  let representationCalls=0;
  let matrixCalls=0;
  return {
    roster:{
      async verifyRealRepresentationRoster(){
        rosterCalls+=1;
        return false;
      },
    },
    representation:{
      async verifyRepresentationEvidence(){
        representationCalls+=1;
        return false;
      },
    },
    matrix:{
      async verifyStepMatrixEvidence(){
        matrixCalls+=1;
        return false;
      },
    },
    get rosterCalls(){return rosterCalls;},
    get representationCalls(){return representationCalls;},
    get matrixCalls(){return matrixCalls;},
  };
}

test('non-real roster remains BLOCKED and never reaches evidence origins',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealStepMatrixCampaignV1(
    blockedRoster(),
    H('roster'),
    o.roster,
    [placeholder(2),placeholder(4),placeholder(6),placeholder(8)],
    o.representation,
    o.matrix,
    hashPort,
  );

  assert.equal(result.state,'REAL_STEP_MATRIX_CAMPAIGN_BLOCKED');
  assert.deepEqual(
    result.blockers,
    ['REAL_STEP_MATRIX_CAMPAIGN_READY_ROSTER_REQUIRED'],
  );
  assert.equal(result.evidenceSha256,'UNKNOWN');
  assert.equal(o.rosterCalls,0);
  assert.equal(o.representationCalls,0);
  assert.equal(o.matrixCalls,0);
});

test('duplicate training-step input fails before any real-evidence trust check',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealStepMatrixCampaignV1(
    blockedRoster(),
    H('roster'),
    o.roster,
    [placeholder(2),placeholder(4),placeholder(4),placeholder(8)],
    o.representation,
    o.matrix,
    hashPort,
  );

  assert.equal(result.state,'REAL_STEP_MATRIX_CAMPAIGN_INVALID');
  assert.deepEqual(
    result.blockers,
    ['REAL_STEP_MATRIX_CAMPAIGN_DUPLICATE_TRAINING_STEP'],
  );
  assert.equal(o.rosterCalls,0);
});

test('extra campaign input fails rather than widening the canonical four variants',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealStepMatrixCampaignV1(
    blockedRoster(),
    H('roster'),
    o.roster,
    [
      placeholder(2),
      placeholder(4),
      placeholder(6),
      placeholder(8),
      placeholder(8),
    ],
    o.representation,
    o.matrix,
    hashPort,
  );

  assert.equal(result.state,'REAL_STEP_MATRIX_CAMPAIGN_INVALID');
  assert.deepEqual(
    result.blockers,
    ['REAL_STEP_MATRIX_CAMPAIGN_INPUT_COUNT_INVALID'],
  );
  assert.equal(o.rosterCalls,0);
});

test('training-step value outside 2/4/6/8 fails before trust verification',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealStepMatrixCampaignV1(
    blockedRoster(),
    H('roster'),
    [o.roster][0],
    [placeholder(2),placeholder(4),placeholder(6),placeholder(10)],
    o.representation,
    o.matrix,
    hashPort,
  );

  assert.equal(result.state,'REAL_STEP_MATRIX_CAMPAIGN_INVALID');
  assert.deepEqual(
    result.blockers,
    ['REAL_STEP_MATRIX_CAMPAIGN_TRAINING_STEP_OUTSIDE_TARGET'],
  );
  assert.equal(o.rosterCalls,0);
});

test('blocked campaign grants no score, selection, promotion or production authority',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealStepMatrixCampaignV1(
    blockedRoster(),
    H('roster'),
    o.roster,
    [placeholder(2),placeholder(4),placeholder(6),placeholder(8)],
    o.representation,
    o.matrix,
    hashPort,
  );

  for(const field of [
    'weightedAggregateScoreAllowed',
    'efficiencyMayOverrideQualityFailure',
    'scheduleSelectionAllowed',
    'trainingVariantSelectionAllowed',
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

test('non-ready campaign evidence is not digestible',async()=>{
  const o=origins();
  const result=await assembleHsmeDenseStudentRealStepMatrixCampaignV1(
    blockedRoster(),
    H('roster'),
    o.roster,
    [placeholder(2),placeholder(4),placeholder(6),placeholder(8)],
    o.representation,
    o.matrix,
    hashPort,
  );

  await assert.rejects(
    ()=>hsmeDenseStudentRealStepMatrixCampaignV1Digest(result,hashPort),
    error=>error.code==='hsme_real_step_matrix_campaign_digest_state',
  );
});
