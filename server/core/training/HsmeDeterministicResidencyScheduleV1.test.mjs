import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  HSME_DETERMINISTIC_STAGE_SCHEDULE_V1_SCHEMA,
  freezeHsmeDeterministicResidencyScheduleV1,
  hsmeDeterministicResidencyScheduleV1Digest,
  hsmeDeterministicStageScheduleV1Digest,
} from './HsmeDeterministicResidencyScheduleV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
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
    prototypeVariant:'SHARED_TOP2_ADAPTER',
    denseBaselineContentSha256:h('3'),
    routerContentSha256:h('4'),
    expertIds:['fashion-adapter-v1','identity-adapter-v1'],
    expertContentSha256s:[h('5'),h('6')],
    maxActiveExperts:2,
    denseBaselinePackageBytes:700_000_000,
    totalExpertArtifactBytes:180_000_000,
    routerBytes:12_000_000,
    prototypePackageBytes:892_000_000,
    deviceProfileSha256:h('7'),
    policySha256:h('8'),
    hardwareClass:'SYNTHETIC_MOBILE_ACCELERATOR',
    runtimeRepresentationSha256:h('9'),
    measurementEnvironmentSha256:h('a'),
    measuredFlashReadBytesPerSecond:1_000_000_000,
    measuredRamToAcceleratorBytesPerSecond:20_000_000_000,
    measuredAcceleratorToRamBytesPerSecond:15_000_000_000,
    physicalRamBytes:8_000_000_000,
    physicalAcceleratorBytes:4_000_000_000,
    availableStorageBytes:20_000_000_000,
    maxRamBudgetBytes:1_000_000_000,
    maxAcceleratorBudgetBytes:1_000_000_000,
    maxColdStorageCacheBytes:3_000_000_000,
    maxDeterministicPrefetchBytesPerStage:200_000_000,
    maxPredictivePrefetchBytesPerStage:100_000_000,
    maxPredictionLookaheadStages:2,
    maxConcurrentTransfers:2,
    deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:true,
    doubleBufferingAllowed:true,
    maxWastedPrefetchRatioBps:1500,
    telemetryDimensions:['FLASH_READ_BYTES','NETWORK_BYTES_DURING_EXECUTION'],
    planEvidenceSha256:h('0'),
    ...authority(),
  };
  const planEvidenceSha256=await hsmeAdaptiveResidencyExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
function schedule(p,overrides={}){
  return {
    schemaVersion:HSME_DETERMINISTIC_STAGE_SCHEDULE_V1_SCHEMA,
    residencyPlanSha256:p.planEvidenceSha256,
    denseAssetId:'DENSE_SHARED',
    denseContentSha256:p.denseBaselineContentSha256,
    denseBytes:p.denseBaselinePackageBytes,
    routerAssetId:'ROUTER',
    routerContentSha256:p.routerContentSha256,
    routerBytes:p.routerBytes,
    expertAssets:[
      {expertId:'fashion-adapter-v1',contentSha256:h('5'),bytes:80_000_000},
      {expertId:'identity-adapter-v1',contentSha256:h('6'),bytes:100_000_000},
    ],
    stages:[
      {
        stageIndex:0,
        stageId:'EARLY',
        requiredAssetIds:['DENSE_SHARED','ROUTER','fashion-adapter-v1'],
        acceleratorAssetIds:['ROUTER','fashion-adapter-v1'],
        ramAssetIds:['DENSE_SHARED'],
        deterministicPrefetchAssetIds:['identity-adapter-v1'],
        evictAssetIds:[],
      },
      {
        stageIndex:1,
        stageId:'LATE',
        requiredAssetIds:['DENSE_SHARED','ROUTER','identity-adapter-v1'],
        acceleratorAssetIds:['ROUTER','identity-adapter-v1'],
        ramAssetIds:['DENSE_SHARED'],
        deterministicPrefetchAssetIds:[],
        evictAssetIds:['fashion-adapter-v1'],
      },
    ],
    sharedDenseRequiredEveryStage:true,
    predictionAllowed:false,
    networkFetchAllowed:false,
    movementExecutionAllowed:false,
    inferenceExecutionAllowed:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    productionAuthorityGranted:false,
    ...overrides,
  };
}
const truePlanOrigin={async verifyResidencyPlan(){return true;}};
const falsePlanOrigin={async verifyResidencyPlan(){return false;}};
const trueScheduleOrigin={async verifyStageSchedule(){return true;}};
const falseScheduleOrigin={async verifyStageSchedule(){return false;}};
async function fixture(){
  const p=await plan();
  const s=schedule(p);
  const sSha=await hsmeDeterministicStageScheduleV1Digest(s,hash);
  return {p,s,sSha};
}
async function freeze(f,overrides={}){
  return freezeHsmeDeterministicResidencyScheduleV1(
    f.p,f.p.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.schedule??f.s,
    overrides.scheduleSha??f.sSha,
    overrides.scheduleOrigin??trueScheduleOrigin,
    hash,
  );
}

test('exact reviewed stages freeze deterministic residency schedule without movement',async()=>{
  const f=await fixture();
  const a=await freeze(f);
  const b=await freeze(f);
  assert.equal(a.state,'DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED');
  assert.equal(a.projectedPeakRamBytes,700_000_000);
  assert.equal(a.projectedPeakAcceleratorBytes,112_000_000);
  assert.equal(a.totalDeterministicPrefetchBytes,100_000_000);
  assert.equal(a.predictionAllowed,false);
  assert.equal(a.movementExecutionAllowed,false);
  assert.equal(a.inferenceExecutionAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeDeterministicResidencyScheduleV1Digest(a,hash),
    a.scheduleEvidenceSha256,
  );
});

test('stage caller order canonicalizes by contiguous stage index',async()=>{
  const f=await fixture();
  const reversed={...f.s,stages:[...f.s.stages].reverse()};
  const sha=await hsmeDeterministicStageScheduleV1Digest(reversed,hash);
  const result=await freeze(f,{schedule:reversed,scheduleSha:sha});
  assert.deepEqual(result.stages.map(v=>v.stageIndex),[0,1]);
  assert.equal(result.scheduleEvidenceSha256,(await freeze(f)).scheduleEvidenceSha256);
});

test('plan and schedule trusted origins are mandatory',async()=>{
  const f=await fixture();
  const a=await freeze(f,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID');
  assert.ok(a.blockers.includes('DETERMINISTIC_RESIDENCY_PLAN_ORIGIN_UNVERIFIED'));
  const b=await freeze(f,{scheduleOrigin:falseScheduleOrigin});
  assert.equal(b.state,'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID');
  assert.ok(b.blockers.includes('DETERMINISTIC_RESIDENCY_STAGE_SCHEDULE_ORIGIN_UNVERIFIED'));
});

test('expert bytes and content roster must exactly bind HSME-4.1',async()=>{
  const f=await fixture();
  for(const expertAssets of [
    [
      {expertId:'fashion-adapter-v1',contentSha256:h('f'),bytes:80_000_000},
      {expertId:'identity-adapter-v1',contentSha256:h('6'),bytes:100_000_000},
    ],
    [
      {expertId:'fashion-adapter-v1',contentSha256:h('5'),bytes:80_000_000},
      {expertId:'identity-adapter-v1',contentSha256:h('6'),bytes:99_000_000},
    ],
  ]){
    const s=schedule(f.p,{expertAssets});
    const sha=await hsmeDeterministicStageScheduleV1Digest(s,hash);
    const result=await freeze(f,{schedule:s,scheduleSha:sha});
    assert.equal(result.state,'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID');
  }
});

test('per-stage prefetch RAM and accelerator ceilings fail closed',async()=>{
  const f=await fixture();
  const p={...f.p,maxDeterministicPrefetchBytesPerStage:50_000_000};
  const pSha=await hsmeAdaptiveResidencyExperimentPlanV1Digest(p,hash);
  p.planEvidenceSha256=pSha;
  const s=schedule(p);
  const sSha=await hsmeDeterministicStageScheduleV1Digest(s,hash);
  const result=await freezeHsmeDeterministicResidencyScheduleV1(
    p,pSha,truePlanOrigin,s,sSha,trueScheduleOrigin,hash,
  );
  assert.equal(result.state,'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID');
  assert.ok(result.blockers.includes('DETERMINISTIC_RESIDENCY_PREFETCH_CAP_EXCEEDED'));
});

test('required asset cannot be evicted in its own stage',async()=>{
  const f=await fixture();
  const stages=[...f.s.stages];
  stages[0]={...stages[0],evictAssetIds:['fashion-adapter-v1']};
  const s=schedule(f.p,{stages});
  const sSha=await hsmeDeterministicStageScheduleV1Digest(s,hash);
  const result=await freeze(f,{schedule:s,scheduleSha:sSha});
  assert.equal(result.state,'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID');
  assert.ok(result.blockers.includes('DETERMINISTIC_RESIDENCY_REQUIRED_ASSET_EVICTION'));
});

test('unknown assets and prediction/network widening fail exact schema',async()=>{
  const f=await fixture();
  for(const s of [
    schedule(f.p,{predictionAllowed:true}),
    schedule(f.p,{networkFetchAllowed:true}),
    schedule(f.p,{stages:[{
      ...f.s.stages[0],
      requiredAssetIds:['DENSE_SHARED','UNKNOWN_ASSET'],
    },f.s.stages[1]]}),
  ]){
    const result=await freeze(f,{schedule:s,scheduleSha:h('0')});
    assert.equal(result.state,'DETERMINISTIC_RESIDENCY_SCHEDULE_INVALID');
  }
});
