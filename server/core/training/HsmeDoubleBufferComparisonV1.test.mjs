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
  HSME_DOUBLE_BUFFER_CAMPAIGN_V1_SCHEMA,
  HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA,
  buildHsmeDoubleBufferComparisonV1,
  hsmeDoubleBufferCampaignV1Digest,
  hsmeDoubleBufferComparisonV1Digest,
  hsmeDoubleBufferMeasurementV1Digest,
} from './HsmeDoubleBufferComparisonV1.ts';

const hash={async sha256(bytes){return createHash('sha256').update(bytes).digest('hex');}};
function h(ch){return ch.repeat(64);}
function auth(){
  return {
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
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
    inferenceExecutionAllowed:false,...auth(),
  };
  const planEvidenceSha256=await hsmeAdaptiveResidencyExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
async function schedule(p){
  const base={
    schemaVersion:HSME_DETERMINISTIC_RESIDENCY_SCHEDULE_V1_SCHEMA,
    state:'DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED',blockers:[],
    residencyPlanSha256:p.planEvidenceSha256,stageScheduleSha256:h('a'),
    prototypeSha256:p.prototypeSha256,
    stages:[{stageIndex:0,stageId:'ONLY',requiredAssetIds:['DENSE_SHARED','ROUTER'],
      acceleratorAssetIds:['ROUTER'],ramAssetIds:['DENSE_SHARED'],
      deterministicPrefetchAssetIds:[],evictAssetIds:[]}],
    assetBytes:{DENSE_SHARED:700_000_000,ROUTER:10_000_000},
    projectedPeakRamBytes:700_000_000,projectedPeakAcceleratorBytes:10_000_000,
    totalDeterministicPrefetchBytes:0,scheduleEvidenceSha256:h('0'),
    predictionAllowed:false,movementExecutionAllowed:false,
    inferenceExecutionAllowed:false,...auth(),
  };
  const scheduleEvidenceSha256=await hsmeDeterministicResidencyScheduleV1Digest(base,hash);
  return {...base,scheduleEvidenceSha256};
}
function campaign(p,s,overrides={}){
  return {
    schemaVersion:HSME_DOUBLE_BUFFER_CAMPAIGN_V1_SCHEMA,
    residencyPlanSha256:p.planEvidenceSha256,
    deterministicScheduleSha256:s.scheduleEvidenceSha256,
    fixtureTraceSha256:h('b'),runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,maxConcurrentTransfers:2,
    sameInputs:true,sameStages:true,sameAssetIdentity:true,
    networkDuringExecutionAllowed:false,dispositionAllowed:false,...auth(),...overrides,
  };
}
function measurement(p,s,campaignSha,mode,overrides={}){
  const buffered=mode==='DOUBLE_BUFFERED';
  return {
    schemaVersion:HSME_DOUBLE_BUFFER_MEASUREMENT_V1_SCHEMA,campaignSha256:campaignSha,
    mode,residencyPlanSha256:p.planEvidenceSha256,
    deterministicScheduleSha256:s.scheduleEvidenceSha256,
    prototypeSha256:p.prototypeSha256,fixtureTraceSha256:h('b'),
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    endToEndLatencyMs:buffered?85:100,transferMs:40,computeMs:60,
    observedTransferComputeOverlapMs:buffered?15:0,
    computeStallMsWaitingForWeights:buffered?5:20,
    flashReadBytes:80_000_000,flashToRamBytes:80_000_000,
    ramToAcceleratorBytes:80_000_000,acceleratorToRamBytes:0,
    peakRamResidentBytes:buffered?800_000_000:780_000_000,
    peakAcceleratorResidentBytes:90_000_000,bufferBytes:buffered?20_000_000:0,
    networkBytesDuringExecution:0,qualityEvidenceSha256:h('c'),
    realMeasuredEvidence:true,inferenceAdmissionGranted:false,...auth(),...overrides,
  };
}
const truePlan={async verifyResidencyPlan(){return true;}};
const falsePlan={async verifyResidencyPlan(){return false;}};
const trueSchedule={async verifySchedule(){return true;}};
const trueCampaign={async verifyCampaign(){return true;}};
const trueMeasurement={async verifyMeasurement(){return true;}};
const falseMeasurement={async verifyMeasurement(){return false;}};
async function fixture(){
  const p=await plan(),s=await schedule(p),c=campaign(p,s);
  const cSha=await hsmeDoubleBufferCampaignV1Digest(c,hash);
  const a=measurement(p,s,cSha,'SERIALIZED_CONTROL');
  const b=measurement(p,s,cSha,'DOUBLE_BUFFERED');
  return {
    p,s,c,cSha,
    bindings:[
      {rawMeasurement:a,expectedMeasurementSha256:await hsmeDoubleBufferMeasurementV1Digest(a,hash)},
      {rawMeasurement:b,expectedMeasurementSha256:await hsmeDoubleBufferMeasurementV1Digest(b,hash)},
    ],
  };
}
async function run(f,overrides={}){
  return buildHsmeDoubleBufferComparisonV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlan,
    f.s,f.s.scheduleEvidenceSha256,trueSchedule,
    overrides.campaign??f.c,overrides.campaignSha??f.cSha,trueCampaign,
    overrides.bindings??f.bindings,overrides.measurementOrigin??trueMeasurement,hash,
  );
}

test('same-content measured double buffering yields comparison without disposition',async()=>{
  const f=await fixture();
  const r=await run(f);
  assert.equal(r.state,'DOUBLE_BUFFER_COMPARISON_READY_NOT_DISPOSED');
  assert.equal(r.endToEndLatencyDeltaMs,-15);
  assert.equal(r.computeStallDeltaMs,-15);
  assert.equal(r.measuredOverlapMs,15);
  assert.equal(r.bufferBytes,20_000_000);
  assert.equal(r.dispositionAllowed,false);
  assert.equal(
    await hsmeDoubleBufferComparisonV1Digest(r,hash),
    r.comparisonEvidenceSha256,
  );
});

test('plan and measurement origins are mandatory',async()=>{
  const f=await fixture();
  assert.equal((await run(f,{planOrigin:falsePlan})).state,'DOUBLE_BUFFER_COMPARISON_INVALID');
  assert.equal((await run(f,{measurementOrigin:falseMeasurement})).state,'DOUBLE_BUFFER_COMPARISON_INVALID');
});

test('serialized control cannot claim overlap and buffered overlap must be physically bounded',async()=>{
  const f=await fixture();
  for(const [mode,overlap] of [['SERIALIZED_CONTROL',1],['DOUBLE_BUFFERED',41]]){
    const raw=measurement(f.p,f.s,f.cSha,mode,{observedTransferComputeOverlapMs:overlap});
    const bindings=[
      ...f.bindings.filter(x=>x.rawMeasurement.mode!==mode),
      {rawMeasurement:raw,expectedMeasurementSha256:h('0')},
    ];
    const r=await run(f,{bindings});
    assert.equal(r.state,'DOUBLE_BUFFER_COMPARISON_INVALID');
    assert.ok(r.blockers.includes('DOUBLE_BUFFER_MEASUREMENT_INVALID'));
  }
});

test('same content bytes and quality evidence are required across modes',async()=>{
  const f=await fixture();
  const raw=measurement(f.p,f.s,f.cSha,'DOUBLE_BUFFERED',{
    flashReadBytes:70_000_000,
    qualityEvidenceSha256:h('d'),
  });
  const sha=await hsmeDoubleBufferMeasurementV1Digest(raw,hash);
  const bindings=[f.bindings[0],{rawMeasurement:raw,expectedMeasurementSha256:sha}];
  const r=await run(f,{bindings});
  assert.equal(r.state,'DOUBLE_BUFFER_COMPARISON_INVALID');
  assert.ok(r.blockers.includes('DOUBLE_BUFFER_CONTENT_OR_QUALITY_PARITY_MISMATCH'));
});

test('peak residency and concurrent transfers cannot exceed HSME-4.1',async()=>{
  const f=await fixture();
  const raw=measurement(f.p,f.s,f.cSha,'DOUBLE_BUFFERED',{peakRamResidentBytes:900_000_001});
  const sha=await hsmeDoubleBufferMeasurementV1Digest(raw,hash);
  const a=await run(f,{bindings:[f.bindings[0],{rawMeasurement:raw,expectedMeasurementSha256:sha}]});
  assert.equal(a.state,'DOUBLE_BUFFER_COMPARISON_INVALID');
  assert.ok(a.blockers.includes('DOUBLE_BUFFER_MEASUREMENT_BUDGET_EXCEEDED'));

  const c=campaign(f.p,f.s,{maxConcurrentTransfers:3});
  const cSha=await hsmeDoubleBufferCampaignV1Digest(c,hash);
  const b=await run(f,{campaign:c,campaignSha:cSha});
  assert.equal(b.state,'DOUBLE_BUFFER_COMPARISON_INVALID');
  assert.ok(b.blockers.includes('DOUBLE_BUFFER_CAMPAIGN_CAP_ESCALATION'));
});

test('duplicate or missing campaign modes fail closed',async()=>{
  const f=await fixture();
  const duplicate=[f.bindings[0],f.bindings[0]];
  const r=await run(f,{bindings:duplicate});
  assert.equal(r.state,'DOUBLE_BUFFER_COMPARISON_INVALID');
  assert.ok(r.blockers.includes('DOUBLE_BUFFER_DUPLICATE_MODE'));
});
