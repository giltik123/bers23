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
  CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_V1_SCHEMA,
  coreHsmeAdaptiveResidencyMovementResultV1Digest,
  executeHsmeAdaptiveResidencyMovementsV1,
  hsmeAdaptiveResidencyMovementReceiptV1Digest,
} from './HsmeAdaptiveResidencyMovementReceiptV1.ts';

const hash={async sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}};
function h(ch){return ch.repeat(64);}
function authority(){
  return {
    movementExecutionAllowed:false,
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
    prototypeRosterSha256:h('1'),
    prototypeSha256:h('2'),
    prototypeVariant:'SHARED_TOP1_ADAPTER',
    denseBaselineContentSha256:h('3'),
    routerContentSha256:h('4'),
    expertIds:['fashion-adapter-v1'],
    expertContentSha256s:[h('5')],
    maxActiveExperts:1,
    denseBaselinePackageBytes:700_000_000,
    totalExpertArtifactBytes:80_000_000,
    routerBytes:10_000_000,
    prototypePackageBytes:790_000_000,
    deviceProfileSha256:h('6'),
    policySha256:h('7'),
    hardwareClass:'SYNTHETIC',
    runtimeRepresentationSha256:h('8'),
    measurementEnvironmentSha256:h('9'),
    measuredFlashReadBytesPerSecond:1_000_000_000,
    measuredRamToAcceleratorBytesPerSecond:20_000_000_000,
    measuredAcceleratorToRamBytesPerSecond:15_000_000_000,
    physicalRamBytes:8_000_000_000,
    physicalAcceleratorBytes:4_000_000_000,
    availableStorageBytes:20_000_000_000,
    maxRamBudgetBytes:800_000_000,
    maxAcceleratorBudgetBytes:200_000_000,
    maxColdStorageCacheBytes:3_000_000_000,
    maxDeterministicPrefetchBytesPerStage:100_000_000,
    maxPredictivePrefetchBytesPerStage:50_000_000,
    maxPredictionLookaheadStages:1,
    maxConcurrentTransfers:2,
    deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:true,
    doubleBufferingAllowed:true,
    maxWastedPrefetchRatioBps:1500,
    telemetryDimensions:['FLASH_READ_BYTES'],
    planEvidenceSha256:h('0'),
    ...authority(),
  };
  const planEvidenceSha256=await hsmeAdaptiveResidencyExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
async function schedule(p){
  const base={
    schemaVersion:HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA,
    state:'DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED',
    blockers:[],
    residencyPlanSha256:p.planEvidenceSha256,
    stageScheduleSha256:h('a'),
    prototypeSha256:p.prototypeSha256,
    stages:[
      {
        stageIndex:0,stageId:'EARLY',
        requiredAssetIds:['DENSE_SHARED','ROUTER','fashion-adapter-v1'],
        acceleratorAssetIds:['ROUTER','fashion-adapter-v1'],
        ramAssetIds:['DENSE_SHARED'],
        deterministicPrefetchAssetIds:['fashion-adapter-v1'],
        evictAssetIds:[],
      },
      {
        stageIndex:1,stageId:'LATE',
        requiredAssetIds:['DENSE_SHARED','ROUTER'],
        acceleratorAssetIds:['ROUTER'],
        ramAssetIds:['DENSE_SHARED'],
        deterministicPrefetchAssetIds:[],
        evictAssetIds:['fashion-adapter-v1'],
      },
    ],
    assetBytes:{DENSE_SHARED:700_000_000,ROUTER:10_000_000,'fashion-adapter-v1':80_000_000},
    projectedPeakRamBytes:700_000_000,
    projectedPeakAcceleratorBytes:90_000_000,
    totalDeterministicPrefetchBytes:80_000_000,
    scheduleEvidenceSha256:h('0'),
    predictionAllowed:false,
    ...authority(),
  };
  const scheduleEvidenceSha256=await hsmeDeterministicResidencyScheduleV1Digest(base,hash);
  return {...base,scheduleEvidenceSha256};
}
const truePlanOrigin={async verifyResidencyPlan(){return true;}};
const falsePlanOrigin={async verifyResidencyPlan(){return false;}};
const trueScheduleOrigin={async verifyDeterministicSchedule(){return true;}};
const falseScheduleOrigin={async verifyDeterministicSchedule(){return false;}};
const trueResultOrigin={async verifyMovementResult(){return true;}};
const falseResultOrigin={async verifyMovementResult(){return false;}};

function host(mode='OK'){
  const calls=[];
  return {
    calls,
    async executeExactResidencyMovements(request){
      calls.push(request);
      const rows=[
        {
          stageIndex:0,stageId:'EARLY',
          flashReadBytes:80_000_000,
          flashToRamBytes:80_000_000,
          ramToAcceleratorBytes:80_000_000,
          acceleratorToRamBytes:0,
          flashHitCount:0,ramHitCount:1,acceleratorHitCount:1,cacheMissCount:1,
          deterministicPrefetchBytes:80_000_000,
          usefulPrefetchBytes:70_000_000,
          wastedPrefetchBytes:10_000_000,
          evictionBytes:0,
          peakRamResidentBytes:780_000_000,
          peakAcceleratorResidentBytes:90_000_000,
          flashToRamTransferMs:80,
          ramToAcceleratorTransferMs:5,
          acceleratorToRamTransferMs:0,
          computeStallMsWaitingForWeights:10,
          networkBytesDuringExecution:0,
        },
        {
          stageIndex:1,stageId:'LATE',
          flashReadBytes:0,flashToRamBytes:0,ramToAcceleratorBytes:0,
          acceleratorToRamBytes:0,
          flashHitCount:0,ramHitCount:1,acceleratorHitCount:1,cacheMissCount:0,
          deterministicPrefetchBytes:0,usefulPrefetchBytes:0,wastedPrefetchBytes:0,
          evictionBytes:80_000_000,
          peakRamResidentBytes:700_000_000,
          peakAcceleratorResidentBytes:10_000_000,
          flashToRamTransferMs:0,ramToAcceleratorTransferMs:0,
          acceleratorToRamTransferMs:0,
          computeStallMsWaitingForWeights:0,
          networkBytesDuringExecution:0,
        },
      ];
      if(mode==='PREFETCH_OVER') rows[0].deterministicPrefetchBytes=100_000_001;
      if(mode==='ACCOUNTING_OVER') {
        rows[0].usefulPrefetchBytes=80_000_000;
        rows[0].wastedPrefetchBytes=10_000_000;
      }
      if(mode==='RAM_OVER') rows[0].peakRamResidentBytes=800_000_001;
      if(mode==='STAGE_DRIFT') rows[0].stageId='OTHER';
      if(mode==='NETWORK') rows[0].networkBytesDuringExecution=1;
      const raw={
        schemaVersion:CORE_HSME_ADAPTIVE_RESIDENCY_MOVEMENT_RESULT_V1_SCHEMA,
        state:'ADAPTIVE_RESIDENCY_MOVEMENT_COMPLETED_NO_INFERENCE',
        residencyPlanSha256:request.residencyPlanSha256,
        deterministicScheduleSha256:request.deterministicScheduleSha256,
        prototypeSha256:request.prototypeSha256,
        executionAttemptId:'synthetic-movement-001',
        stages:rows,
        inferenceExecuted:false,
        networkBytesDuringExecution:0,
        modelInstallAllowed:false,
        modelFleetPromotionAllowed:false,
        durableModelFleetPromotionAllowed:false,
        productionAuthorityGranted:false,
        providerAuthorityGranted:false,
        billingAuthorityGranted:false,
        projectArtifactMutationAllowed:false,
        aeeExecutionAuthorityGranted:false,
        winnerSelectionAllowed:false,
        hostResultSha256:h('0'),
      };
      if(mode==='BAD_DIGEST') return raw;
      if(mode==='NETWORK') raw.networkBytesDuringExecution=1;
      if(mode==='NETWORK') return raw;
      const hostResultSha256=await coreHsmeAdaptiveResidencyMovementResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}
async function fixture(){
  const p=await plan();
  const s=await schedule(p);
  return {p,s};
}
async function run(f,hst=host(),overrides={}){
  return executeHsmeAdaptiveResidencyMovementsV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlanOrigin,
    f.s,f.s.scheduleEvidenceSha256,overrides.scheduleOrigin??trueScheduleOrigin,
    hst,overrides.resultOrigin??trueResultOrigin,hash,
  );
}

test('exact protected movement result yields deterministic no-inference telemetry receipt',async()=>{
  const f=await fixture();
  const hst=host();
  const r=await run(f,hst);
  assert.equal(r.state,'ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED');
  assert.equal(r.totalFlashReadBytes,80_000_000);
  assert.equal(r.totalDeterministicPrefetchBytes,80_000_000);
  assert.equal(r.totalUsefulPrefetchBytes,70_000_000);
  assert.equal(r.totalWastedPrefetchBytes,10_000_000);
  assert.equal(r.peakRamResidentBytes,780_000_000);
  assert.equal(r.networkBytesDuringExecution,0);
  assert.equal(r.inferenceExecuted,false);
  assert.equal(r.inferenceExecutionAllowed,false);
  assert.equal(hst.calls.length,1);
  assert.equal(
    await hsmeAdaptiveResidencyMovementReceiptV1Digest(r,hash),
    r.receiptEvidenceSha256,
  );
});

test('plan schedule and host result origins are independently mandatory',async()=>{
  const f=await fixture();
  assert.equal((await run(f,host(),{planOrigin:falsePlanOrigin})).state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  assert.equal((await run(f,host(),{scheduleOrigin:falseScheduleOrigin})).state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  assert.equal((await run(f,host(),{resultOrigin:falseResultOrigin})).state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
});

test('prefetch and useful-wasted accounting cannot exceed planned bytes',async()=>{
  const f=await fixture();
  const a=await run(f,host('PREFETCH_OVER'));
  assert.equal(a.state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  assert.ok(a.blockers.includes('ADAPTIVE_RESIDENCY_MOVEMENT_PREFETCH_BYTES_EXCEEDED'));
  const b=await run(f,host('ACCOUNTING_OVER'));
  assert.equal(b.state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  assert.ok(b.blockers.includes('ADAPTIVE_RESIDENCY_MOVEMENT_PREFETCH_ACCOUNTING_INVALID'));
});

test('observed peak residency cannot exceed frozen HSME-4.1 budgets',async()=>{
  const f=await fixture();
  const r=await run(f,host('RAM_OVER'));
  assert.equal(r.state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  assert.ok(r.blockers.includes('ADAPTIVE_RESIDENCY_MOVEMENT_RESIDENCY_BUDGET_EXCEEDED'));
});

test('stage identity drift fails after exact host result verification',async()=>{
  const f=await fixture();
  const r=await run(f,host('STAGE_DRIFT'));
  assert.equal(r.state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  assert.ok(r.blockers.includes('ADAPTIVE_RESIDENCY_MOVEMENT_STAGE_BINDING_MISMATCH'));
});

test('network bytes and host-result digest drift fail closed',async()=>{
  const f=await fixture();
  assert.equal((await run(f,host('NETWORK'))).state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  const bad=await run(f,host('BAD_DIGEST'));
  assert.equal(bad.state,'ADAPTIVE_RESIDENCY_MOVEMENT_INVALID');
  assert.ok(bad.blockers.includes('ADAPTIVE_RESIDENCY_MOVEMENT_HOST_RESULT_REHASH_MISMATCH'));
});
