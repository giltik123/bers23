import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA,
  hsmeDeterministicResidencyScheduleV1Digest,
} from './HsmeDeterministicResidencyScheduleV1.ts';
import {
  HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA,
  hsmeAdaptiveResidencyMovementReceiptV1Digest,
} from './HsmeAdaptiveResidencyMovementReceiptV1.ts';
import {
  CORE_HSME_PREDICTIVE_PREFETCH_RESULT_V1_SCHEMA,
  HSME_PREDICTIVE_PREFETCH_POLICY_V1_SCHEMA,
  compareHsmePredictivePrefetchV1,
  coreHsmePredictivePrefetchResultV1Digest,
  hsmePredictivePrefetchComparisonV1Digest,
  hsmePredictivePrefetchPolicyV1Digest,
} from './HsmePredictivePrefetchComparisonV1.ts';

const hash={async sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}};
function h(ch){return ch.repeat(64);}
function authority(){
  return {
    inferenceExecutionAllowed:false,
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
async function plan(){
  const base={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    prototypeRosterSha256:h('1'),prototypeSha256:h('2'),
    prototypeVariant:'SHARED_TOP1_ADAPTER',
    denseBaselineContentSha256:h('3'),routerContentSha256:h('4'),
    expertIds:['fashion-adapter-v1'],expertContentSha256s:[h('5')],
    maxActiveExperts:1,denseBaselinePackageBytes:700_000_000,
    totalExpertArtifactBytes:80_000_000,routerBytes:10_000_000,
    prototypePackageBytes:790_000_000,deviceProfileSha256:h('6'),
    policySha256:h('7'),hardwareClass:'SYNTHETIC',
    runtimeRepresentationSha256:h('8'),measurementEnvironmentSha256:h('9'),
    measuredFlashReadBytesPerSecond:1_000_000_000,
    measuredRamToAcceleratorBytesPerSecond:20_000_000_000,
    measuredAcceleratorToRamBytesPerSecond:15_000_000_000,
    physicalRamBytes:8_000_000_000,physicalAcceleratorBytes:4_000_000_000,
    availableStorageBytes:20_000_000_000,maxRamBudgetBytes:800_000_000,
    maxAcceleratorBudgetBytes:200_000_000,maxColdStorageCacheBytes:3_000_000_000,
    maxDeterministicPrefetchBytesPerStage:100_000_000,
    maxPredictivePrefetchBytesPerStage:50_000_000,
    maxPredictionLookaheadStages:1,maxConcurrentTransfers:2,
    deterministicPrefetchRequired:true,predictivePrefetchAllowed:true,
    doubleBufferingAllowed:true,maxWastedPrefetchRatioBps:2000,
    telemetryDimensions:['FLASH_READ_BYTES'],planEvidenceSha256:h('0'),
    movementExecutionAllowed:false,...authority(),
  };
  const planEvidenceSha256=await hsmeAdaptiveResidencyExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
async function schedule(p){
  const base={
    schemaVersion:HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA,
    state:'DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED',
    blockers:[],residencyPlanSha256:p.planEvidenceSha256,
    stageScheduleSha256:h('a'),prototypeSha256:p.prototypeSha256,
    stages:[
      {stageIndex:0,stageId:'EARLY',
        requiredAssetIds:['DENSE_SHARED','ROUTER','fashion-adapter-v1'],
        acceleratorAssetIds:['ROUTER','fashion-adapter-v1'],
        ramAssetIds:['DENSE_SHARED'],
        deterministicPrefetchAssetIds:['fashion-adapter-v1'],evictAssetIds:[]},
      {stageIndex:1,stageId:'LATE',
        requiredAssetIds:['DENSE_SHARED','ROUTER'],
        acceleratorAssetIds:['ROUTER'],ramAssetIds:['DENSE_SHARED'],
        deterministicPrefetchAssetIds:[],evictAssetIds:['fashion-adapter-v1']},
    ],
    assetBytes:{DENSE_SHARED:700_000_000,ROUTER:10_000_000,'fashion-adapter-v1':80_000_000},
    projectedPeakRamBytes:700_000_000,projectedPeakAcceleratorBytes:90_000_000,
    totalDeterministicPrefetchBytes:80_000_000,scheduleEvidenceSha256:h('0'),
    predictionAllowed:false,movementExecutionAllowed:false,...authority(),
  };
  const scheduleEvidenceSha256=await hsmeDeterministicResidencyScheduleV1Digest(base,hash);
  return {...base,scheduleEvidenceSha256};
}
async function control(p,s){
  const rows=[
    {stageIndex:0,stageId:'EARLY',flashReadBytes:80_000_000,flashToRamBytes:80_000_000,
      ramToAcceleratorBytes:80_000_000,acceleratorToRamBytes:0,flashHitCount:0,
      ramHitCount:1,acceleratorHitCount:1,cacheMissCount:1,
      deterministicPrefetchBytes:80_000_000,usefulPrefetchBytes:70_000_000,
      wastedPrefetchBytes:10_000_000,evictionBytes:0,peakRamResidentBytes:780_000_000,
      peakAcceleratorResidentBytes:90_000_000,flashToRamTransferMs:80,
      ramToAcceleratorTransferMs:5,acceleratorToRamTransferMs:0,
      computeStallMsWaitingForWeights:10,networkBytesDuringExecution:0},
    {stageIndex:1,stageId:'LATE',flashReadBytes:0,flashToRamBytes:0,
      ramToAcceleratorBytes:0,acceleratorToRamBytes:0,flashHitCount:0,
      ramHitCount:1,acceleratorHitCount:1,cacheMissCount:0,
      deterministicPrefetchBytes:0,usefulPrefetchBytes:0,wastedPrefetchBytes:0,
      evictionBytes:80_000_000,peakRamResidentBytes:700_000_000,
      peakAcceleratorResidentBytes:10_000_000,flashToRamTransferMs:0,
      ramToAcceleratorTransferMs:0,acceleratorToRamTransferMs:0,
      computeStallMsWaitingForWeights:0,networkBytesDuringExecution:0},
  ];
  const base={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RECEIPT_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED',blockers:[],
    residencyPlanSha256:p.planEvidenceSha256,
    deterministicScheduleSha256:s.scheduleEvidenceSha256,
    prototypeSha256:p.prototypeSha256,executionAttemptId:'control-001',stages:rows,
    totalFlashReadBytes:80_000_000,totalFlashToRamBytes:80_000_000,
    totalRamToAcceleratorBytes:80_000_000,totalAcceleratorToRamBytes:0,
    totalDeterministicPrefetchBytes:80_000_000,totalUsefulPrefetchBytes:70_000_000,
    totalWastedPrefetchBytes:10_000_000,totalEvictionBytes:80_000_000,
    peakRamResidentBytes:780_000_000,peakAcceleratorResidentBytes:90_000_000,
    totalComputeStallMsWaitingForWeights:10,networkBytesDuringExecution:0,
    inferenceExecuted:false,hostResultSha256:h('b'),receiptEvidenceSha256:h('0'),
    furtherMovementExecutionAllowed:false,...authority(),
  };
  const receiptEvidenceSha256=await hsmeAdaptiveResidencyMovementReceiptV1Digest(base,hash);
  return {...base,receiptEvidenceSha256};
}
function policy(p,s,overrides={}){
  return {
    schemaVersion:HSME_PREDICTIVE_PREFETCH_POLICY_V1_SCHEMA,
    residencyPlanSha256:p.planEvidenceSha256,
    deterministicScheduleSha256:s.scheduleEvidenceSha256,
    confidenceThresholdBps:9000,maxPredictionLookaheadStages:1,
    maxPredictivePrefetchBytesPerStage:50_000_000,maxWastedPrefetchRatioBps:2000,
    deterministicPrefetchRequired:true,predictivePrefetchAllowed:true,
    predictionMaySuppressDeterministicAssets:false,networkDuringExecutionAllowed:false,
    ...authority(),...overrides,
  };
}
const truePlan={async verifyResidencyPlan(){return true;}};
const falsePlan={async verifyResidencyPlan(){return false;}};
const trueSchedule={async verifySchedule(){return true;}};
const trueControl={async verifyControlReceipt(){return true;}};
const truePolicy={async verifyPredictivePolicy(){return true;}};
const falsePolicy={async verifyPredictivePolicy(){return false;}};
const trueResult={async verifyPredictiveResult(){return true;}};

function host(mode='OK'){
  return {async executeExactPredictivePrefetch(request){
    const stages=[
      {stageIndex:0,stageId:'EARLY',predictivePrefetchBytes:40_000_000,
        predictiveUsefulBytes:35_000_000,predictiveWastedBytes:5_000_000,
        predictionCount:2,acceptedPredictionCount:1,flashReadBytes:60_000_000,
        ramToAcceleratorBytes:80_000_000,peakRamResidentBytes:790_000_000,
        peakAcceleratorResidentBytes:90_000_000,
        computeStallMsWaitingForWeights:5,networkBytesDuringExecution:0},
      {stageIndex:1,stageId:'LATE',predictivePrefetchBytes:0,
        predictiveUsefulBytes:0,predictiveWastedBytes:0,predictionCount:0,
        acceptedPredictionCount:0,flashReadBytes:0,ramToAcceleratorBytes:0,
        peakRamResidentBytes:700_000_000,peakAcceleratorResidentBytes:10_000_000,
        computeStallMsWaitingForWeights:0,networkBytesDuringExecution:0},
    ];
    if(mode==='BYTE_OVER') stages[0].predictivePrefetchBytes=50_000_001;
    if(mode==='WASTE_OVER') {stages[0].predictiveUsefulBytes=20_000_000;stages[0].predictiveWastedBytes=20_000_000;}
    if(mode==='RAM_OVER') stages[0].peakRamResidentBytes=800_000_001;
    if(mode==='STAGE_DRIFT') stages[0].stageId='OTHER';
    const raw={
      schemaVersion:CORE_HSME_PREDICTIVE_PREFETCH_RESULT_V1_SCHEMA,
      state:'PREDICTIVE_PREFETCH_COMPLETED_NO_INFERENCE',
      residencyPlanSha256:request.residencyPlanSha256,
      deterministicScheduleSha256:request.deterministicScheduleSha256,
      controlMovementReceiptSha256:request.controlMovementReceiptSha256,
      policySha256:request.policySha256,executionAttemptId:'predictive-001',
      stages,inferenceExecuted:false,networkBytesDuringExecution:0,
      modelInstallAllowed:false,modelFleetPromotionAllowed:false,
      durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
      providerAuthorityGranted:false,billingAuthorityGranted:false,
      projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
      winnerSelectionAllowed:false,hostResultSha256:h('0'),
    };
    if(mode==='BAD_DIGEST') return raw;
    const hostResultSha256=await coreHsmePredictivePrefetchResultV1Digest(raw,hash);
    return {...raw,hostResultSha256};
  }};
}
async function fixture(){
  const p=await plan(),s=await schedule(p),c=await control(p,s);
  const pol=policy(p,s),polSha=await hsmePredictivePrefetchPolicyV1Digest(pol,hash);
  return {p,s,c,pol,polSha};
}
async function run(f,overrides={}){
  return compareHsmePredictivePrefetchV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlan,
    f.s,f.s.scheduleEvidenceSha256,trueSchedule,
    f.c,f.c.receiptEvidenceSha256,trueControl,
    overrides.policy??f.pol,overrides.policySha??f.polSha,
    overrides.policyOrigin??truePolicy,
    overrides.host??host(),trueResult,hash,
  );
}

test('bounded predictive run yields comparison evidence without disposition',async()=>{
  const f=await fixture();
  const r=await run(f);
  assert.equal(r.state,'PREDICTIVE_PREFETCH_COMPARISON_READY_NOT_DISPOSED');
  assert.equal(r.controlFlashReadBytes,80_000_000);
  assert.equal(r.predictiveFlashReadBytes,60_000_000);
  assert.equal(r.controlComputeStallMs,10);
  assert.equal(r.predictiveComputeStallMs,5);
  assert.equal(r.totalPredictivePrefetchBytes,40_000_000);
  assert.equal(r.totalPredictiveWastedBytes,5_000_000);
  assert.equal(r.predictiveWastedRatioBps,1250);
  assert.equal(r.dispositionAllowed,false);
  assert.equal(r.inferenceExecuted,false);
  assert.equal(
    await hsmePredictivePrefetchComparisonV1Digest(r,hash),
    r.comparisonEvidenceSha256,
  );
});

test('plan and predictive policy origins are mandatory',async()=>{
  const f=await fixture();
  assert.equal((await run(f,{planOrigin:falsePlan})).state,'PREDICTIVE_PREFETCH_COMPARISON_INVALID');
  assert.equal((await run(f,{policyOrigin:falsePolicy})).state,'PREDICTIVE_PREFETCH_COMPARISON_INVALID');
});

test('predictive caps cannot exceed HSME-4.1 policy',async()=>{
  const f=await fixture();
  const pol=policy(f.p,f.s,{maxPredictionLookaheadStages:2});
  const polSha=await hsmePredictivePrefetchPolicyV1Digest(pol,hash);
  const r=await run(f,{policy:pol,policySha:polSha});
  assert.equal(r.state,'PREDICTIVE_PREFETCH_COMPARISON_INVALID');
  assert.ok(r.blockers.includes('PREDICTIVE_PREFETCH_POLICY_CAP_ESCALATION'));
});

test('host byte accounting and peak residency fail closed',async()=>{
  const f=await fixture();
  for(const mode of ['BYTE_OVER','RAM_OVER']){
    const r=await run(f,{host:host(mode)});
    assert.equal(r.state,'PREDICTIVE_PREFETCH_COMPARISON_INVALID');
    assert.ok(r.blockers.includes('PREDICTIVE_PREFETCH_STAGE_BUDGET_OR_ACCOUNTING_INVALID'));
  }
});

test('wasted predictive ratio is independently capped',async()=>{
  const f=await fixture();
  const r=await run(f,{host:host('WASTE_OVER')});
  assert.equal(r.state,'PREDICTIVE_PREFETCH_COMPARISON_INVALID');
  assert.ok(r.blockers.includes('PREDICTIVE_PREFETCH_WASTED_RATIO_EXCEEDED'));
});

test('stage drift and host result digest drift fail closed',async()=>{
  const f=await fixture();
  const a=await run(f,{host:host('STAGE_DRIFT')});
  assert.equal(a.state,'PREDICTIVE_PREFETCH_COMPARISON_INVALID');
  assert.ok(a.blockers.includes('PREDICTIVE_PREFETCH_STAGE_BINDING_MISMATCH'));
  const b=await run(f,{host:host('BAD_DIGEST')});
  assert.equal(b.state,'PREDICTIVE_PREFETCH_COMPARISON_INVALID');
  assert.ok(b.blockers.includes('PREDICTIVE_PREFETCH_HOST_RESULT_REHASH_MISMATCH'));
});
