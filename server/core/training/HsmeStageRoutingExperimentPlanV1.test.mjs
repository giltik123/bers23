import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  HSME_STAGE_PROFILE_ROSTER_V1_SCHEMA,
  HSME_STAGE_ROUTING_POLICY_V1_SCHEMA,
  freezeHsmeStageRoutingExperimentPlanV1,
  hsmeStageProfileRosterV1Digest,
  hsmeStageRoutingExperimentPlanV1Digest,
  hsmeStageRoutingPolicyV1Digest,
} from './HsmeStageRoutingExperimentPlanV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function residencyAuthority(){
  return {
    movementExecutionAllowed:false,inferenceExecutionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
function stageAuthority(){
  return {
    stageRoutingExecutionAllowed:false,routeSelectionAllowed:false,
    inferenceExecutionAllowed:false,modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
  };
}
async function residencyPlan(){
  const base={
    schemaVersion:HSME_ADAPTIVE_RESIDENCY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED',blockers:[],
    prototypeRosterSha256:h('1'),prototypeSha256:h('2'),
    prototypeVariant:'SHARED_TOP1_ADAPTER',
    denseBaselineContentSha256:h('3'),routerContentSha256:h('4'),
    expertIds:['fashion-adapter-v1','detail-adapter-v1'],
    expertContentSha256s:[h('5'),h('6')],
    maxActiveExperts:2,denseBaselinePackageBytes:700_000_000,
    totalExpertArtifactBytes:150_000_000,routerBytes:10_000_000,
    prototypePackageBytes:860_000_000,deviceProfileSha256:h('7'),
    policySha256:h('8'),hardwareClass:'SYNTHETIC_MOBILE',
    runtimeRepresentationSha256:h('9'),measurementEnvironmentSha256:h('a'),
    measuredFlashReadBytesPerSecond:1_000_000_000,
    measuredRamToAcceleratorBytesPerSecond:20_000_000_000,
    measuredAcceleratorToRamBytesPerSecond:15_000_000_000,
    physicalRamBytes:8_000_000_000,physicalAcceleratorBytes:4_000_000_000,
    availableStorageBytes:20_000_000_000,maxRamBudgetBytes:2_000_000_000,
    maxAcceleratorBudgetBytes:1_000_000_000,maxColdStorageCacheBytes:3_000_000_000,
    maxDeterministicPrefetchBytesPerStage:200_000_000,
    maxPredictivePrefetchBytesPerStage:100_000_000,maxPredictionLookaheadStages:2,
    maxConcurrentTransfers:2,deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:true,doubleBufferingAllowed:true,
    maxWastedPrefetchRatioBps:1500,
    telemetryDimensions:['FLASH_READ_BYTES'],
    planEvidenceSha256:h('0'),...residencyAuthority(),
  };
  const planEvidenceSha256=await hsmeAdaptiveResidencyExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
function roster(plan,profiles=null,overrides={}){
  const rows=profiles??[
    {
      stageId:'geometry-stage',stageKind:'GEOMETRY',
      progressStartBps:0,progressEndBps:3500,measuredCaseCount:64,
      stageWallClockUs:300,flashBytesMoved:120_000_000,
      ramBytesMoved:150_000_000,acceleratorBytesMoved:130_000_000,
      peakMemoryBytes:700_000_000,qualitySensitivityEvidenceSha256:h('b'),
      specializationEvidenceSha256:h('c'),deterministicStageIdentitySha256:h('d'),
      runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
      hardwareClass:plan.hardwareClass,
    },
    {
      stageId:'appearance-stage',stageKind:'APPEARANCE',
      progressStartBps:3500,progressEndBps:7500,measuredCaseCount:64,
      stageWallClockUs:400,flashBytesMoved:150_000_000,
      ramBytesMoved:180_000_000,acceleratorBytesMoved:160_000_000,
      peakMemoryBytes:780_000_000,qualitySensitivityEvidenceSha256:h('e'),
      specializationEvidenceSha256:h('f'),deterministicStageIdentitySha256:h('1'),
      runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
      hardwareClass:plan.hardwareClass,
    },
    {
      stageId:'detail-stage',stageKind:'DETAIL',
      progressStartBps:7500,progressEndBps:10000,measuredCaseCount:64,
      stageWallClockUs:250,flashBytesMoved:90_000_000,
      ramBytesMoved:110_000_000,acceleratorBytesMoved:100_000_000,
      peakMemoryBytes:650_000_000,qualitySensitivityEvidenceSha256:h('2'),
      specializationEvidenceSha256:h('3'),deterministicStageIdentitySha256:h('4'),
      runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
      hardwareClass:plan.hardwareClass,
    },
  ];
  return {
    schemaVersion:HSME_STAGE_PROFILE_ROSTER_V1_SCHEMA,
    residencyPlanSha256:plan.planEvidenceSha256,
    prototypeSha256:plan.prototypeSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,profiles:rows,
    realMeasuredEvidence:true,...stageAuthority(),...overrides,
  };
}
function policy(plan,rosterSha,overrides={}){
  return {
    schemaVersion:HSME_STAGE_ROUTING_POLICY_V1_SCHEMA,
    residencyPlanSha256:plan.planEvidenceSha256,
    stageProfileRosterSha256:rosterSha,
    maxActiveExpertsPerStage:2,
    maxStageTransitionPrefetchBytes:150_000_000,
    deterministicStageBoundariesRequired:true,
    deterministicRoutingRequired:true,nextStagePrefetchRequired:true,
    sharedPathRequired:true,fullBackboneExpertAllowed:false,
    qualityPreservationContractSha256:h('5'),
    reviewState:'STAGE_ROUTING_POLICY_REVIEWED',
    ...stageAuthority(),...overrides,
  };
}
const truePlanOrigin={async verifyResidencyPlan(){return true;}};
const falsePlanOrigin={async verifyResidencyPlan(){return false;}};
const trueRosterOrigin={async verifyStageProfileRoster(){return true;}};
const falseRosterOrigin={async verifyStageProfileRoster(){return false;}};
const truePolicyOrigin={async verifyStageRoutingPolicy(){return true;}};

async function fixture(){
  const p=await residencyPlan();
  const r=roster(p);
  const rSha=await hsmeStageProfileRosterV1Digest(r,hash);
  const pol=policy(p,rSha);
  const polSha=await hsmeStageRoutingPolicyV1Digest(pol,hash);
  return {p,r,rSha,pol,polSha};
}
async function freeze(f,overrides={}){
  return freezeHsmeStageRoutingExperimentPlanV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlanOrigin,
    overrides.roster??f.r,overrides.rosterSha??f.rSha,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.policy??f.pol,overrides.policySha??f.polSha,
    truePolicyOrigin,hash,
  );
}

test('measured GEOMETRY APPEARANCE DETAIL topology freezes deterministically independent of caller order',async()=>{
  const f=await fixture();
  const reversed={...f.r,profiles:[...f.r.profiles].reverse()};
  const rSha=await hsmeStageProfileRosterV1Digest(reversed,hash);
  const pol=policy(f.p,rSha);
  const polSha=await hsmeStageRoutingPolicyV1Digest(pol,hash);
  const a=await freeze(f,{roster:reversed,rosterSha:rSha,policy:pol,policySha:polSha});
  const b=await freeze(f);
  assert.equal(a.state,'STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED');
  assert.deepEqual(a.profiles.map(v=>v.stageKind),['GEOMETRY','APPEARANCE','DETAIL']);
  assert.deepEqual(a.profiles.map(v=>[v.progressStartBps,v.progressEndBps]),[
    [0,3500],[3500,7500],[7500,10000],
  ]);
  assert.equal(a.maxActiveExpertsPerStage,2);
  assert.equal(a.maxStageTransitionPrefetchBytes,150_000_000);
  assert.equal(a.stageRoutingExecutionAllowed,false);
  assert.equal(a.routeSelectionAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeStageRoutingExperimentPlanV1Digest(a,hash),
    a.planEvidenceSha256,
  );
});

test('stage profile bands reject gaps overlap empty ranges and wrong semantic order',async()=>{
  const f=await fixture();
  const base=f.r.profiles;
  const cases=[
    [
      {...base[0],progressEndBps:3400},
      base[1],base[2],
    ],
    [
      {...base[0],progressEndBps:3600},
      base[1],base[2],
    ],
    [
      {...base[0],progressEndBps:0},
      base[1],base[2],
    ],
    [
      {...base[0],stageKind:'APPEARANCE'},
      {...base[1],stageKind:'GEOMETRY'},
      base[2],
    ],
  ];
  for(const profiles of cases){
    const raw=roster(f.p,profiles);
    const result=await freeze(f,{roster:raw,rosterSha:h('0')});
    assert.equal(result.state,'STAGE_ROUTING_PLAN_INVALID');
    assert.ok(result.blockers.includes('STAGE_ROUTING_PROFILE_ROSTER_INVALID'));
  }
});

test('residency plan and measured stage roster trusted origins are mandatory',async()=>{
  const f=await fixture();
  const a=await freeze(f,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'STAGE_ROUTING_PLAN_INVALID');
  assert.ok(a.blockers.includes('STAGE_ROUTING_RESIDENCY_PLAN_ORIGIN_UNVERIFIED'));
  const b=await freeze(f,{rosterOrigin:falseRosterOrigin});
  assert.equal(b.state,'STAGE_ROUTING_PLAN_INVALID');
  assert.ok(b.blockers.includes('STAGE_ROUTING_PROFILE_ROSTER_ORIGIN_UNVERIFIED'));
});

test('prototype binding drift reaches plan gate while internal runtime/hardware drift is schema-invalid',async()=>{
  const f=await fixture();

  const prototypeDrift=roster(f.p,null,{prototypeSha256:h('f')});
  const prototypeDriftSha=await hsmeStageProfileRosterV1Digest(
    prototypeDrift,
    hash,
  );
  const prototypeResult=await freeze(f,{
    roster:prototypeDrift,
    rosterSha:prototypeDriftSha,
  });
  assert.equal(prototypeResult.state,'STAGE_ROUTING_PLAN_INVALID');
  assert.ok(
    prototypeResult.blockers.includes(
      'STAGE_ROUTING_PROFILE_ROSTER_BINDING_MISMATCH',
    ),
  );

  for(const overrides of [
    {runtimeRepresentationSha256:h('f')},
    {hardwareClass:'OTHER_DEVICE'},
  ]){
    const raw=roster(f.p,null,overrides);
    await assert.rejects(
      ()=>hsmeStageProfileRosterV1Digest(raw,hash),
      /stage profile runtime\/hardware drift/,
    );
  }
});

test('active-expert and deterministic-prefetch caps cannot exceed HSME-4 plan',async()=>{
  const f=await fixture();
  for(const overrides of [
    {maxActiveExpertsPerStage:3},
    {maxStageTransitionPrefetchBytes:200_000_001},
  ]){
    const pol=policy(f.p,f.rSha,overrides);
    let polSha=h('0');
    try{polSha=await hsmeStageRoutingPolicyV1Digest(pol,hash);}catch{}
    const result=await freeze(f,{policy:pol,policySha:polSha});
    assert.equal(result.state,'STAGE_ROUTING_PLAN_INVALID');
    assert.ok(
      result.blockers.includes('STAGE_ROUTING_POLICY_INVALID')
      ||result.blockers.includes('STAGE_ROUTING_POLICY_RESOURCE_ESCALATION'),
    );
  }
});

test('shared path deterministic routing and authority boundary cannot widen',async()=>{
  const f=await fixture();
  for(const overrides of [
    {sharedPathRequired:false},
    {deterministicRoutingRequired:false},
    {fullBackboneExpertAllowed:true},
    {stageRoutingExecutionAllowed:true},
  ]){
    const pol=policy(f.p,f.rSha,overrides);
    const result=await freeze(f,{policy:pol,policySha:h('0')});
    assert.equal(result.state,'STAGE_ROUTING_PLAN_INVALID');
    assert.ok(result.blockers.includes('STAGE_ROUTING_POLICY_INVALID'));
  }
});
