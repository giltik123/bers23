import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA,
  hsmeAdaptiveResidencyMovementReceiptV1Digest,
} from './HsmeAdaptiveResidencyMovementReceiptV1.ts';
import {
  HSME_PREDICTIVE_PREFETCH_COMPARISON_V1_SCHEMA,
  hsmePredictivePrefetchComparisonV1Digest,
} from './HsmePredictivePrefetchComparisonV1.ts';
import {
  HSME_DOUBLE_BUFFER_COMPARISON_V1_SCHEMA,
  HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA,
  hsmeDoubleBufferComparisonV1Digest,
} from './HsmeDoubleBufferComparisonV1.ts';
import {
  HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_V1_SCHEMA,
  HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_V1_SCHEMA,
  disposeHsmeAdaptiveResidencyV1,
  hsmeAdaptiveResidencyDispositionPolicyV1Digest,
  hsmeAdaptiveResidencyDispositionV1Digest,
  hsmeResidencyQualityPreservationAttestationV1Digest,
} from './HsmeAdaptiveResidencyDispositionV1.ts';

const hash={async sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}};
function h(ch){return ch.repeat(64);}
function authority(){
  return {
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
  };
}
async function plan(){
  const base={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED',blockers:[],
    prototypeRosterSha256:h('1'),prototypeSha256:h('2'),
    prototypeVariant:'SHARED_TOP1_ADAPTER',
    denseBaselineContentSha256:h('3'),routerContentSha256:h('4'),
    expertIds:['fashion-adapter-v1'],expertContentSha256s:[h('5')],
    maxActiveExperts:1,denseBaselinePackageBytes:700_000_000,
    totalExpertArtifactBytes:80_000_000,routerBytes:10_000_000,
    prototypePackageBytes:790_000_000,deviceProfileSha256:h('6'),policySha256:h('7'),
    hardwareClass:'SYNTHETIC',runtimeRepresentationSha256:h('8'),
    measurementEnvironmentSha256:h('9'),measuredFlashReadBytesPerSecond:1_000_000_000,
    measuredRamToAcceleratorBytesPerSecond:20_000_000_000,
    measuredAcceleratorToRamBytesPerSecond:15_000_000_000,
    physicalRamBytes:8_000_000_000,physicalAcceleratorBytes:4_000_000_000,
    availableStorageBytes:20_000_000_000,maxRamBudgetBytes:900_000_000,
    maxAcceleratorBudgetBytes:200_000_000,maxColdStorageCacheBytes:3_000_000_000,
    maxDeterministicPrefetchBytesPerStage:100_000_000,
    maxPredictivePrefetchBytesPerStage:50_000_000,maxPredictionLookaheadStages:1,
    maxConcurrentTransfers:2,deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:true,doubleBufferingAllowed:true,
    maxWastedPrefetchRatioBps:2000,telemetryDimensions:['FLASH_READ_BYTES'],
    planEvidenceSha256:h('0'),movementExecutionAllowed:false,
    inferenceExecutionAllowed:false,selectionAllowed:false,...authority(),
  };
  delete base.selectionAllowed;
  const planEvidenceSha256=await hsmeAdaptiveResidencyExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
async function movement(p){
  const base={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED',blockers:[],
    residencyPlanSha256:p.planEvidenceSha256,deterministicScheduleSha256:h('a'),
    prototypeSha256:p.prototypeSha256,executionAttemptId:'movement-control',
    stages:[],totalFlashReadBytes:100,totalFlashToRamBytes:100,
    totalRamToAcceleratorBytes:100,totalAcceleratorToRamBytes:0,
    totalDeterministicPrefetchBytes:80,totalUsefulPrefetchBytes:70,
    totalWastedPrefetchBytes:10,totalEvictionBytes:80,
    peakRamResidentBytes:800_000_000,peakAcceleratorResidentBytes:100_000_000,
    totalComputeStallMsWaitingForWeights:100,networkBytesDuringExecution:0,
    inferenceExecuted:false,hostResultSha256:h('b'),receiptEvidenceSha256:h('0'),
    furtherMovementExecutionAllowed:false,inferenceExecutionAllowed:false,
    ...authority(),winnerSelectionAllowed:false,
  };
  const receiptEvidenceSha256=await hsmeAdaptiveResidencyMovementReceiptV1Digest(base,hash);
  return {...base,receiptEvidenceSha256};
}
async function predictive(p,m,overrides={}){
  const base={
    schemaVersion:HSME_PREDICTIVE_PREFETCH_COMPARISON_V1_SCHEMA,
    state:'PREDICTIVE_PREFETCH_COMPARISON_READY_NOT_DISPOSED',blockers:[],
    residencyPlanSha256:p.planEvidenceSha256,
    deterministicScheduleSha256:m.deterministicScheduleSha256,
    controlMovementReceiptSha256:m.receiptEvidenceSha256,policySha256:h('c'),
    predictiveHostResultSha256:h('d'),executionAttemptId:'predictive',
    stages:[],controlFlashReadBytes:100,predictiveFlashReadBytes:70,
    controlComputeStallMs:100,predictiveComputeStallMs:70,
    totalPredictivePrefetchBytes:40,totalPredictiveUsefulBytes:35,
    totalPredictiveWastedBytes:5,predictiveWastedRatioBps:1250,
    peakRamResidentBytes:820_000_000,peakAcceleratorResidentBytes:110_000_000,
    networkBytesDuringExecution:0,inferenceExecuted:false,
    comparisonEvidenceSha256:h('0'),dispositionAllowed:false,
    inferenceExecutionAllowed:false,...authority(),winnerSelectionAllowed:false,
    ...overrides,
  };
  const comparisonEvidenceSha256=await hsmePredictivePrefetchComparisonV1Digest(base,hash);
  return {...base,comparisonEvidenceSha256};
}
function measurement(mode,overrides={}){
  const buffered=mode==='DOUBLE_BUFFERED';
  return {
    schemaVersion:HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA,campaignSha256:h('e'),
    mode,residencyPlanSha256:h('0'),deterministicScheduleSha256:h('a'),
    prototypeSha256:h('2'),fixtureTraceSha256:h('f'),
    runtimeRepresentationSha256:h('8'),endToEndLatencyMs:buffered?80:100,
    transferMs:40,computeMs:60,observedTransferComputeOverlapMs:buffered?20:0,
    computeStallMsWaitingForWeights:buffered?80:100,
    flashReadBytes:100,flashToRamBytes:100,ramToAcceleratorBytes:100,
    acceleratorToRamBytes:0,peakRamResidentBytes:buffered?850_000_000:800_000_000,
    peakAcceleratorResidentBytes:110_000_000,bufferBytes:buffered?20_000_000:0,
    networkBytesDuringExecution:0,qualityEvidenceSha256:h('1'),
    realMeasuredEvidence:true,inferenceAdmissionGranted:false,...authority(),
    winnerSelectionAllowed:false,...overrides,
  };
}
async function doubleBuffer(p,overrides={}){
  const rows=[
    measurement('SERIALIZED_CONTROL',{
      residencyPlanSha256:p.planEvidenceSha256,
      prototypeSha256:p.prototypeSha256,
      runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    }),
    measurement('DOUBLE_BUFFERED',{
      residencyPlanSha256:p.planEvidenceSha256,
      prototypeSha256:p.prototypeSha256,
      runtimeRepresentationSha256:p.runtimeRepresentationSha256,
      ...(overrides.buffered??{}),
    }),
  ];
  const base={
    schemaVersion:HSME_DOUBLE_BUFFER_COMPARISON_V1_SCHEMA,
    state:'DOUBLE_BUFFER_COMPARISON_READY_NOT_DISPOSED',blockers:[],
    residencyPlanSha256:p.planEvidenceSha256,deterministicScheduleSha256:h('a'),
    campaignSha256:h('e'),rows,serializedMeasurementSha256:h('2'),
    doubleBufferedMeasurementSha256:h('3'),endToEndLatencyDeltaMs:-20,
    computeStallDeltaMs:-20,measuredOverlapMs:20,bufferBytes:20_000_000,
    comparisonEvidenceSha256:h('0'),dispositionAllowed:false,...authority(),
    winnerSelectionAllowed:false,
  };
  const comparisonEvidenceSha256=await hsmeDoubleBufferComparisonV1Digest(base,hash);
  return {...base,comparisonEvidenceSha256};
}
function quality(p,overrides={}){
  return {
    schemaVersion:HSME_RESIDENCY_QUALITY_PRESERVATION_ATTESTATION_V1_SCHEMA,
    prototypeSha256:p.prototypeSha256,qualityEvidenceSha256:h('1'),
    preservationState:'PASS',reviewState:'QUALITY_PRESERVATION_REVIEWED',
    selectionAllowed:false,...authority(),...overrides,
  };
}
function policy(p,m,pred,db,overrides={}){
  return {
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_DISPOSITION_POLICY_V1_SCHEMA,
    residencyPlanSha256:p.planEvidenceSha256,
    movementReceiptSha256:m.receiptEvidenceSha256,
    predictiveComparisonSha256:pred.comparisonEvidenceSha256,
    doubleBufferComparisonSha256:db.comparisonEvidenceSha256,
    minPredictiveFlashReadImprovementBps:1000,
    minPredictiveStallImprovementBps:1000,
    maxPredictiveFlashReadRegressionBps:500,
    maxPredictiveStallRegressionBps:500,
    minDoubleBufferLatencyImprovementBps:1000,
    maxDoubleBufferStallRegressionBps:500,
    maxBufferBytes:30_000_000,
    reviewState:'QUALITY_WALL_CLOCK_RESOURCE_POLICY_REVIEWED',
    selectionAllowed:false,...authority(),...overrides,
  };
}
const inputOrigin={
  async verifyResidencyPlan(){return true;},
  async verifyMovementReceipt(){return true;},
  async verifyPredictiveComparison(){return true;},
  async verifyDoubleBufferComparison(){return true;},
};
const falseInputOrigin={
  async verifyResidencyPlan(){return false;},
  async verifyMovementReceipt(){return true;},
  async verifyPredictiveComparison(){return true;},
  async verifyDoubleBufferComparison(){return true;},
};
const qualityOrigin={async verifyQualityPreservation(){return true;}};
const policyOrigin={async verifyDispositionPolicy(){return true;}};

async function fixture(overrides={}){
  const p=await plan(),m=await movement(p);
  const pred=await predictive(p,m,overrides.predictive??{});
  const db=await doubleBuffer(p,overrides.doubleBuffer??{});
  const q=quality(p,overrides.quality??{});
  const qSha=await hsmeResidencyQualityPreservationAttestationV1Digest(q,hash);
  const pol=policy(p,m,pred,db,overrides.policy??{});
  const polSha=await hsmeAdaptiveResidencyDispositionPolicyV1Digest(pol,hash);
  return {p,m,pred,db,q,qSha,pol,polSha};
}
async function run(f,overrides={}){
  return disposeHsmeAdaptiveResidencyV1(
    f.p,f.p.planEvidenceSha256,
    f.m,f.m.receiptEvidenceSha256,
    f.pred,f.pred.comparisonEvidenceSha256,
    f.db,f.db.comparisonEvidenceSha256,
    overrides.inputOrigin??inputOrigin,
    f.q,f.qSha,qualityOrigin,f.pol,f.polSha,policyOrigin,hash,
  );
}

test('quality-preserving material predictive and double-buffer gains may co-advance',async()=>{
  const f=await fixture();
  const r=await run(f);
  assert.equal(r.state,'ADAPTIVE_RESIDENCY_DISPOSITION_READY');
  assert.equal(r.disposition,'ADVANCE');
  assert.deepEqual(r.advancedMechanisms,['PREDICTIVE_PREFETCH','DOUBLE_BUFFERING']);
  assert.equal(r.predictiveFlashReadImprovementBps,3000);
  assert.equal(r.predictiveStallImprovementBps,3000);
  assert.equal(r.doubleBufferLatencyImprovementBps,2000);
  assert.equal(r.selectionAllowed,false);
  assert.equal(r.modelInstallAllowed,false);
  assert.equal(
    await hsmeAdaptiveResidencyDispositionV1Digest(r,hash),
    r.dispositionEvidenceSha256,
  );
});

test('quality preservation failure rejects even when runtime metrics improve',async()=>{
  const f=await fixture({quality:{preservationState:'FAIL'}});
  const r=await run(f);
  assert.equal(r.disposition,'REJECT');
  assert.deepEqual(r.advancedMechanisms,[]);
  assert.ok(r.mechanismDispositions.every(v=>v.qualityGate==='FAIL'));
});

test('no material wall-clock or movement benefit produces REDESIGN not a winner',async()=>{
  const f=await fixture({
    predictive:{predictiveFlashReadBytes:99,predictiveComputeStallMs:99},
    doubleBuffer:{buffered:{endToEndLatencyMs:99,computeStallMsWaitingForWeights:99}},
  });
  const r=await run(f);
  assert.equal(r.disposition,'REDESIGN');
  assert.deepEqual(r.advancedMechanisms,[]);
});

test('resource regression blocks a mechanism even when another metric improves',async()=>{
  const f=await fixture({
    predictive:{predictiveFlashReadBytes:70,predictiveComputeStallMs:110},
  });
  const r=await run(f);
  const predictiveRow=r.mechanismDispositions.find(v=>v.mechanism==='PREDICTIVE_PREFETCH');
  assert.equal(predictiveRow.advance,false);
  assert.equal(predictiveRow.resourceGate,'FAIL');
  assert.ok(r.advancedMechanisms.includes('DOUBLE_BUFFERING'));
});

test('buffer byte policy can block double buffering without weighted score',async()=>{
  const f=await fixture({policy:{maxBufferBytes:10_000_000}});
  const r=await run(f);
  const row=r.mechanismDispositions.find(v=>v.mechanism==='DOUBLE_BUFFERING');
  assert.equal(row.advance,false);
  assert.equal(row.resourceGate,'FAIL');
  assert.ok(r.advancedMechanisms.includes('PREDICTIVE_PREFETCH'));
});

test('input origin drift fails before disposition',async()=>{
  const f=await fixture();
  const r=await run(f,{inputOrigin:falseInputOrigin});
  assert.equal(r.state,'ADAPTIVE_RESIDENCY_DISPOSITION_INVALID');
  assert.ok(r.blockers.includes('ADAPTIVE_RESIDENCY_DISPOSITION_INPUT_ORIGIN_UNVERIFIED'));
});
