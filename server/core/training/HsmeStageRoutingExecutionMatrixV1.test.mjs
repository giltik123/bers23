import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeStageRoutingExperimentPlanV1Digest,
} from './HsmeStageRoutingExperimentPlanV1.ts';
import {
  HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
  hsmeStageRouteTableV1Digest,
} from './HsmeStageRouteTableV1.ts';
import {
  HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA,
  hsmeStageTransitionPrefetchScheduleV1Digest,
} from './HsmeStageTransitionPrefetchScheduleV1.ts';
import {
  CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_V1_SCHEMA,
  HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_V1_SCHEMA,
  coreHsmeStageRoutingExecutionResultV1Digest,
  executeHsmeStageRoutingComparisonMatrixV1,
  hsmeStageRoutingExecutionCampaignV1Digest,
  hsmeStageRoutingExecutionMatrixV1Digest,
} from './HsmeStageRoutingExecutionMatrixV1.ts';

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function planAuthority(){
  return {
    stageRoutingExecutionAllowed:false,routeSelectionAllowed:false,
    inferenceExecutionAllowed:false,modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
  };
}
function tableAuthority(){
  return {
    stageRoutingExecutionAllowed:false,routeSelectionAllowed:false,
    routeMutationAllowed:false,inferenceExecutionAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
  };
}
function scheduleAuthority(){
  return {
    movementExecutionAllowed:false,stageRoutingExecutionAllowed:false,
    inferenceExecutionAllowed:false,routeMutationAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
  };
}
function resultAuthority(){
  return {
    selectionAllowed:false,routeMutationAllowed:false,
    modelInstallAllowed:false,modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
  };
}

async function plan(){
  const base={
    schemaVersion:HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED',blockers:[],
    residencyPlanSha256:h('1'),stageProfileRosterSha256:h('2'),
    stageRoutingPolicySha256:h('3'),prototypeSha256:h('4'),
    denseBaselineContentSha256:h('5'),routerContentSha256:h('6'),
    expertIds:['fashion-adapter-v1','detail-adapter-v1'],
    expertContentSha256s:[h('7'),h('8')],
    runtimeRepresentationSha256:h('9'),hardwareClass:'SYNTHETIC_MOBILE',
    profiles:[
      {
        stageId:'geometry-stage',stageKind:'GEOMETRY',
        progressStartBps:0,progressEndBps:3500,measuredCaseCount:64,
        stageWallClockUs:300,flashBytesMoved:120_000_000,
        ramBytesMoved:150_000_000,acceleratorBytesMoved:130_000_000,
        peakMemoryBytes:700_000_000,qualitySensitivityEvidenceSha256:h('a'),
        specializationEvidenceSha256:h('b'),deterministicStageIdentitySha256:h('c'),
        runtimeRepresentationSha256:h('9'),hardwareClass:'SYNTHETIC_MOBILE',
      },
      {
        stageId:'appearance-stage',stageKind:'APPEARANCE',
        progressStartBps:3500,progressEndBps:7500,measuredCaseCount:64,
        stageWallClockUs:400,flashBytesMoved:150_000_000,
        ramBytesMoved:180_000_000,acceleratorBytesMoved:160_000_000,
        peakMemoryBytes:780_000_000,qualitySensitivityEvidenceSha256:h('d'),
        specializationEvidenceSha256:h('e'),deterministicStageIdentitySha256:h('f'),
        runtimeRepresentationSha256:h('9'),hardwareClass:'SYNTHETIC_MOBILE',
      },
      {
        stageId:'detail-stage',stageKind:'DETAIL',
        progressStartBps:7500,progressEndBps:10000,measuredCaseCount:64,
        stageWallClockUs:250,flashBytesMoved:90_000_000,
        ramBytesMoved:110_000_000,acceleratorBytesMoved:100_000_000,
        peakMemoryBytes:650_000_000,qualitySensitivityEvidenceSha256:h('1'),
        specializationEvidenceSha256:h('2'),deterministicStageIdentitySha256:h('3'),
        runtimeRepresentationSha256:h('9'),hardwareClass:'SYNTHETIC_MOBILE',
      },
    ],
    maxActiveExpertsPerStage:2,maxStageTransitionPrefetchBytes:150_000_000,
    qualityPreservationContractSha256:h('a'),
    deterministicStageBoundariesRequired:true,deterministicRoutingRequired:true,
    nextStagePrefetchRequired:true,sharedPathRequired:true,
    fullBackboneExpertAllowed:false,planEvidenceSha256:h('0'),...planAuthority(),
  };
  const planEvidenceSha256=await hsmeStageRoutingExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
async function table(p){
  const base={
    schemaVersion:HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
    state:'STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED',blockers:[],
    stageRoutingPlanSha256:p.planEvidenceSha256,routePolicySha256:h('b'),
    prototypeSha256:p.prototypeSha256,denseBaselineContentSha256:p.denseBaselineContentSha256,
    routerContentSha256:p.routerContentSha256,
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,
    qualityPreservationContractSha256:p.qualityPreservationContractSha256,
    maxActiveExpertsPerStage:2,maxStageTransitionPrefetchBytes:150_000_000,
    routes:[
      {
        stageId:'geometry-stage',stageKind:'GEOMETRY',
        progressStartBps:0,progressEndBps:3500,routeMode:'SHARED_ONLY',
        sharedPathEnabled:true,routerContentSha256:p.routerContentSha256,
        activeExperts:[],deterministicRouteSeedSha256:h('c'),
        deterministicRouteContractSha256:h('d'),
      },
      {
        stageId:'appearance-stage',stageKind:'APPEARANCE',
        progressStartBps:3500,progressEndBps:7500,
        routeMode:'SHARED_PLUS_SPECIALISTS',sharedPathEnabled:true,
        routerContentSha256:p.routerContentSha256,
        activeExperts:[{expertId:'fashion-adapter-v1',expertContentSha256:h('7')}],
        deterministicRouteSeedSha256:h('e'),deterministicRouteContractSha256:h('f'),
      },
      {
        stageId:'detail-stage',stageKind:'DETAIL',
        progressStartBps:7500,progressEndBps:10000,
        routeMode:'SHARED_PLUS_SPECIALISTS',sharedPathEnabled:true,
        routerContentSha256:p.routerContentSha256,
        activeExperts:[
          {expertId:'fashion-adapter-v1',expertContentSha256:h('7')},
          {expertId:'detail-adapter-v1',expertContentSha256:h('8')},
        ],
        deterministicRouteSeedSha256:h('1'),deterministicRouteContractSha256:h('2'),
      },
    ],
    routeTableEvidenceSha256:h('0'),...tableAuthority(),
  };
  const routeTableEvidenceSha256=await hsmeStageRouteTableV1Digest(base,hash);
  return {...base,routeTableEvidenceSha256};
}
async function schedule(t){
  const base={
    schemaVersion:HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA,
    state:'STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED',
    blockers:[],routeTableEvidenceSha256:t.routeTableEvidenceSha256,
    assetRosterSha256:h('3'),prefetchPolicySha256:h('4'),
    prototypeSha256:t.prototypeSha256,routerContentSha256:t.routerContentSha256,
    runtimeRepresentationSha256:t.runtimeRepresentationSha256,
    hardwareClass:t.hardwareClass,
    transitions:[
      {
        transitionId:'GEOMETRY_TO_APPEARANCE',
        fromStageId:'geometry-stage',fromStageKind:'GEOMETRY',
        toStageId:'appearance-stage',toStageKind:'APPEARANCE',
        triggerProgressBps:3000,targetDeterministicRouteSeedSha256:h('e'),
        targetDeterministicRouteContractSha256:h('f'),
        routerContentSha256:t.routerContentSha256,
        assets:[{
          expertId:'fashion-adapter-v1',expertContentSha256:h('7'),
          artifactBytes:80_000_000,immutableAssetEvidenceSha256:h('5'),
        }],
        prefetchBytes:80_000_000,prefetchBudgetBytes:150_000_000,
        networkAllowed:false,
      },
      {
        transitionId:'APPEARANCE_TO_DETAIL',
        fromStageId:'appearance-stage',fromStageKind:'APPEARANCE',
        toStageId:'detail-stage',toStageKind:'DETAIL',
        triggerProgressBps:7000,targetDeterministicRouteSeedSha256:h('1'),
        targetDeterministicRouteContractSha256:h('2'),
        routerContentSha256:t.routerContentSha256,
        assets:[{
          expertId:'detail-adapter-v1',expertContentSha256:h('8'),
          artifactBytes:60_000_000,immutableAssetEvidenceSha256:h('6'),
        }],
        prefetchBytes:60_000_000,prefetchBudgetBytes:150_000_000,
        networkAllowed:false,
      },
    ],
    scheduleEvidenceSha256:h('0'),...scheduleAuthority(),
  };
  const scheduleEvidenceSha256=
    await hsmeStageTransitionPrefetchScheduleV1Digest(base,hash);
  return {...base,scheduleEvidenceSha256};
}
function campaign(p,t,s,overrides={}){
  return {
    schemaVersion:HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_V1_SCHEMA,
    stageRoutingPlanSha256:p.planEvidenceSha256,
    stageRouteTableSha256:t.routeTableEvidenceSha256,
    transitionPrefetchScheduleSha256:s.scheduleEvidenceSha256,
    fixtureSha256:h('7'),inputBatchSha256:h('8'),caseCount:32,
    warmupIterations:5,measuredIterations:20,
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,sameInputsAcrossVariants:true,
    sameStageBoundariesAcrossVariants:true,networkDuringExecutionAllowed:false,
    stageRoutingExecutionAllowed:false,...resultAuthority(),...overrides,
  };
}
const truePlanOrigin={async verifyStageRoutingPlan(){return true;}};
const falsePlanOrigin={async verifyStageRoutingPlan(){return false;}};
const trueTableOrigin={async verifyStageRouteTable(){return true;}};
const falseTableOrigin={async verifyStageRouteTable(){return false;}};
const trueScheduleOrigin={async verifyPrefetchSchedule(){return true;}};
const trueCampaignOrigin={async verifyExecutionCampaign(){return true;}};
const trueResultOrigin={async verifyExecutionResult(){return true;}};
const falseResultOrigin={async verifyExecutionResult(){return false;}};

function fakeHost(p,t,s,c,mode='OK'){
  const calls=[];
  return {
    calls,
    async executeExactStaticVsStageRoutedCampaign(request){
      calls.push(request);
      const rows=[
        {
          variant:'STATIC_SHARED_CONTROL',
          implementationSha256:p.denseBaselineContentSha256,
          fixtureSha256:c.fixtureSha256,inputBatchSha256:c.inputBatchSha256,
          runtimeRepresentationSha256:c.runtimeRepresentationSha256,
          hardwareClass:c.hardwareClass,caseCount:c.caseCount,
          qualityPreservationContractSha256:p.qualityPreservationContractSha256,
          qualityPreservationEvidenceSha256:h('9'),qualityPreservationPass:true,
          hardPreservationFailureCount:0,criticalFailureCount:0,
          coldEndToEndLatencyUs:1_000_000,warmEndToEndLatencyUs:800_000,
          activeWeightsBytes:700_000_000,peakMemoryBytes:1_000_000_000,
          flashBytesMoved:700_000_000,ramBytesMoved:900_000_000,
          acceleratorBytesMoved:750_000_000,expertActivationCount:0,
          transitionPrefetchBytes:0,transitionStallUs:80_000,
          deterministicReplayIdentitySha256:h('a'),
          realMeasuredEvidence:true,networkBytesDuringExecution:0,
        },
        {
          variant:'DETERMINISTIC_STAGE_ROUTED',
          implementationSha256:t.routeTableEvidenceSha256,
          fixtureSha256:c.fixtureSha256,inputBatchSha256:c.inputBatchSha256,
          runtimeRepresentationSha256:c.runtimeRepresentationSha256,
          hardwareClass:c.hardwareClass,caseCount:c.caseCount,
          qualityPreservationContractSha256:p.qualityPreservationContractSha256,
          qualityPreservationEvidenceSha256:h('b'),qualityPreservationPass:true,
          hardPreservationFailureCount:0,criticalFailureCount:0,
          coldEndToEndLatencyUs:850_000,warmEndToEndLatencyUs:650_000,
          activeWeightsBytes:500_000_000,peakMemoryBytes:900_000_000,
          flashBytesMoved:550_000_000,ramBytesMoved:700_000_000,
          acceleratorBytesMoved:600_000_000,expertActivationCount:48,
          transitionPrefetchBytes:140_000_000,transitionStallUs:25_000,
          deterministicReplayIdentitySha256:h('c'),
          realMeasuredEvidence:true,networkBytesDuringExecution:0,
        },
      ];
      if(mode==='REVERSED')rows.reverse();
      if(mode==='CONTROL_EXPERT')rows[0]={...rows[0],expertActivationCount:1};
      if(mode==='SOURCE_DRIFT')rows[1]={...rows[1],implementationSha256:h('0')};
      if(mode==='INPUT_DRIFT')rows[1]={...rows[1],inputBatchSha256:h('0')};
      if(mode==='NETWORK')rows[1]={...rows[1],networkBytesDuringExecution:1};
      const raw={
        schemaVersion:CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_V1_SCHEMA,
        state:'STAGE_ROUTING_EXECUTION_CAMPAIGN_COMPLETED',
        stageRoutingPlanSha256:p.planEvidenceSha256,
        stageRouteTableSha256:t.routeTableEvidenceSha256,
        transitionPrefetchScheduleSha256:s.scheduleEvidenceSha256,
        campaignSha256:await hsmeStageRoutingExecutionCampaignV1Digest(c,hash),
        executionAttemptId:'synthetic-stage-routing-001',rows,
        ...resultAuthority(),hostResultSha256:h('0'),
      };
      if(mode==='BAD_DIGEST'||mode==='NETWORK')return raw;
      const hostResultSha256=
        await coreHsmeStageRoutingExecutionResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}
async function fixture(){
  const p=await plan();const t=await table(p);const s=await schedule(t);
  const c=campaign(p,t,s);
  const cSha=await hsmeStageRoutingExecutionCampaignV1Digest(c,hash);
  return {p,t,s,c,cSha};
}
async function execute(f,host=fakeHost(f.p,f.t,f.s,f.c),overrides={}){
  return executeHsmeStageRoutingComparisonMatrixV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlanOrigin,
    f.t,f.t.routeTableEvidenceSha256,overrides.tableOrigin??trueTableOrigin,
    f.s,f.s.scheduleEvidenceSha256,overrides.scheduleOrigin??trueScheduleOrigin,
    overrides.campaign??f.c,overrides.campaignSha??f.cSha,
    trueCampaignOrigin,host,overrides.resultOrigin??trueResultOrigin,hash,
  );
}

test('exact static-vs-stage-routed campaign yields deterministic canonical matrix independent of host row order',async()=>{
  const f=await fixture();
  const a=await execute(f,fakeHost(f.p,f.t,f.s,f.c,'OK'));
  const b=await execute(f,fakeHost(f.p,f.t,f.s,f.c,'REVERSED'));
  assert.equal(a.state,'STAGE_ROUTING_EXECUTION_MATRIX_READY_NOT_DISPOSED');
  assert.deepEqual(a.rows.map(v=>v.variant),[
    'STATIC_SHARED_CONTROL','DETERMINISTIC_STAGE_ROUTED',
  ]);
  assert.equal(a.rows[0].expertActivationCount,0);
  assert.equal(a.rows[0].transitionPrefetchBytes,0);
  assert.equal(a.furtherStageRoutingExecutionAllowed,false);
  assert.equal(a.selectionAllowed,false);
  assert.equal(a.routeMutationAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeStageRoutingExecutionMatrixV1Digest(a,hash),
    a.matrixEvidenceSha256,
  );
});

test('plan and route-table exact origins are mandatory before protected host execution',async()=>{
  const f=await fixture();
  for(const overrides of [
    {planOrigin:falsePlanOrigin},
    {tableOrigin:falseTableOrigin},
  ]){
    const host=fakeHost(f.p,f.t,f.s,f.c);
    const result=await execute(f,host,overrides);
    assert.equal(result.state,'STAGE_ROUTING_EXECUTION_MATRIX_INVALID');
    assert.equal(host.calls.length,0);
  }
});

test('control must remain shared-only with zero specialist activations and transition prefetch',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.t,f.s,f.c,'CONTROL_EXPERT'));
  assert.equal(result.state,'STAGE_ROUTING_EXECUTION_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('STAGE_ROUTING_EXECUTION_CONTROL_IDENTITY_INVALID'),
  );
});

test('routed implementation identity must equal the exact route-table digest',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.t,f.s,f.c,'SOURCE_DRIFT'));
  assert.equal(result.state,'STAGE_ROUTING_EXECUTION_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('STAGE_ROUTING_EXECUTION_ROUTED_IDENTITY_INVALID'),
  );
});

test('fixture input runtime hardware and quality contract binding cannot drift',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.t,f.s,f.c,'INPUT_DRIFT'));
  assert.equal(result.state,'STAGE_ROUTING_EXECUTION_MATRIX_INVALID');
  assert.ok(result.blockers.includes('STAGE_ROUTING_EXECUTION_ROW_BINDING_MISMATCH'));
});

test('network bytes during execution are rejected before matrix evidence',async()=>{
  const f=await fixture();
  const result=await execute(f,fakeHost(f.p,f.t,f.s,f.c,'NETWORK'));
  assert.equal(result.state,'STAGE_ROUTING_EXECUTION_MATRIX_INVALID');
  assert.ok(result.blockers.includes('STAGE_ROUTING_EXECUTION_HOST_RESULT_INVALID'));
});

test('host result digest and origin are independently enforced',async()=>{
  const f=await fixture();
  const bad=await execute(f,fakeHost(f.p,f.t,f.s,f.c,'BAD_DIGEST'));
  assert.equal(bad.state,'STAGE_ROUTING_EXECUTION_MATRIX_INVALID');
  assert.ok(
    bad.blockers.includes('STAGE_ROUTING_EXECUTION_HOST_RESULT_REHASH_MISMATCH'),
  );
  const origin=await execute(
    f,fakeHost(f.p,f.t,f.s,f.c),{resultOrigin:falseResultOrigin},
  );
  assert.equal(origin.state,'STAGE_ROUTING_EXECUTION_MATRIX_INVALID');
  assert.ok(
    origin.blockers.includes('STAGE_ROUTING_EXECUTION_HOST_RESULT_ORIGIN_UNVERIFIED'),
  );
});
