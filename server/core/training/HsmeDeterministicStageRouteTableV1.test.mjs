import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeStageRoutingExperimentPlanV1Digest,
} from './HsmeStageRoutingExperimentPlanV1.ts';
import {
  HSME_STAGE_ROUTE_ASSIGNMENT_V1_SCHEMA,
  freezeHsmeDeterministicStageRouteTableV1,
  hsmeDeterministicStageRouteTableV1Digest,
  hsmeStageRouteAssignmentV1Digest,
} from './HsmeDeterministicStageRouteTableV1.ts';

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
function assignmentAuthority(){
  return {
    stageRoutingExecutionAllowed:false,modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
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
    qualityPreservationContractSha256:h('4'),
    deterministicStageBoundariesRequired:true,deterministicRoutingRequired:true,
    nextStagePrefetchRequired:true,sharedPathRequired:true,
    fullBackboneExpertAllowed:false,planEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const planEvidenceSha256=await hsmeStageRoutingExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}
function assignment(p,overrides={}){
  const routes=[
    {
      stageId:'geometry-stage',stageKind:'GEOMETRY',
      deterministicStageIdentitySha256:p.profiles[0].deterministicStageIdentitySha256,
      routeMode:'SHARED_ONLY',activeExpertIds:[],activeExpertContentSha256s:[],
      sharedPathContentSha256:p.denseBaselineContentSha256,
      routerContentSha256:p.routerContentSha256,
      routingRule:'EXACT_PROGRESS_BAND',fallbackRoute:'SHARED_ONLY_LOCAL',
    },
    {
      stageId:'appearance-stage',stageKind:'APPEARANCE',
      deterministicStageIdentitySha256:p.profiles[1].deterministicStageIdentitySha256,
      routeMode:'SHARED_PLUS_EXPERTS',
      activeExpertIds:['fashion-adapter-v1'],
      activeExpertContentSha256s:[h('7')],
      sharedPathContentSha256:p.denseBaselineContentSha256,
      routerContentSha256:p.routerContentSha256,
      routingRule:'EXACT_PROGRESS_BAND',fallbackRoute:'SHARED_ONLY_LOCAL',
    },
    {
      stageId:'detail-stage',stageKind:'DETAIL',
      deterministicStageIdentitySha256:p.profiles[2].deterministicStageIdentitySha256,
      routeMode:'SHARED_PLUS_EXPERTS',
      activeExpertIds:['detail-adapter-v1'],
      activeExpertContentSha256s:[h('8')],
      sharedPathContentSha256:p.denseBaselineContentSha256,
      routerContentSha256:p.routerContentSha256,
      routingRule:'EXACT_PROGRESS_BAND',fallbackRoute:'SHARED_ONLY_LOCAL',
    },
  ];
  return {
    schemaVersion:HSME_STAGE_ROUTE_ASSIGNMENT_V1_SCHEMA,
    stageRoutingPlanSha256:p.planEvidenceSha256,
    entries:routes,
    reviewState:'STAGE_ROUTE_ASSIGNMENT_REVIEWED',
    runtimeRouteMutationAllowed:false,learnedDynamicRoutingAllowed:false,
    providerFallbackAllowed:false,...assignmentAuthority(),...overrides,
  };
}
const truePlanOrigin={async verifyStageRoutingPlan(){return true;}};
const falsePlanOrigin={async verifyStageRoutingPlan(){return false;}};
const trueAssignmentOrigin={async verifyStageRouteAssignment(){return true;}};
const falseAssignmentOrigin={async verifyStageRouteAssignment(){return false;}};

async function fixture(){
  const p=await plan();
  const a=assignment(p);
  const aSha=await hsmeStageRouteAssignmentV1Digest(a,hash);
  return {p,a,aSha};
}
async function freeze(f,overrides={}){
  return freezeHsmeDeterministicStageRouteTableV1(
    f.p,f.p.planEvidenceSha256,overrides.planOrigin??truePlanOrigin,
    overrides.assignment??f.a,overrides.assignmentSha??f.aSha,
    overrides.assignmentOrigin??trueAssignmentOrigin,hash,
  );
}

test('exact stage assignment freezes deterministic route table independent of caller order',async()=>{
  const f=await fixture();
  const reversed={...f.a,entries:[...f.a.entries].reverse()};
  const reversedSha=await hsmeStageRouteAssignmentV1Digest(reversed,hash);
  const a=await freeze(f,{assignment:reversed,assignmentSha:reversedSha});
  const b=await freeze(f);
  assert.equal(a.state,'DETERMINISTIC_STAGE_ROUTE_TABLE_READY_NOT_EXECUTED');
  assert.deepEqual(a.routes.map(v=>v.stageKind),['GEOMETRY','APPEARANCE','DETAIL']);
  assert.deepEqual(a.routes.map(v=>v.routeMode),[
    'SHARED_ONLY','SHARED_PLUS_EXPERTS','SHARED_PLUS_EXPERTS',
  ]);
  assert.equal(a.stageRoutingExecutionAllowed,false);
  assert.equal(a.routeMutationAllowed,false);
  assert.equal(a.learnedDynamicRoutingAllowed,false);
  assert.equal(a.providerFallbackAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeDeterministicStageRouteTableV1Digest(a,hash),
    a.routeTableEvidenceSha256,
  );
});

test('plan and route-assignment trusted origins are mandatory',async()=>{
  const f=await fixture();
  const a=await freeze(f,{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'DETERMINISTIC_STAGE_ROUTE_TABLE_INVALID');
  assert.ok(a.blockers.includes('DETERMINISTIC_STAGE_ROUTE_PLAN_ORIGIN_UNVERIFIED'));
  const b=await freeze(f,{assignmentOrigin:falseAssignmentOrigin});
  assert.equal(b.state,'DETERMINISTIC_STAGE_ROUTE_TABLE_INVALID');
  assert.ok(b.blockers.includes('DETERMINISTIC_STAGE_ROUTE_ASSIGNMENT_ORIGIN_UNVERIFIED'));
});

test('unknown expert and expert-content mismatch fail exact plan binding',async()=>{
  const f=await fixture();
  for(const patch of [
    {activeExpertIds:['unknown-expert'],activeExpertContentSha256s:[h('7')]},
    {activeExpertIds:['fashion-adapter-v1'],activeExpertContentSha256s:[h('0')]},
  ]){
    const entries=f.a.entries.map(entry=>
      entry.stageKind==='APPEARANCE'?{...entry,...patch}:entry
    );
    const a={...f.a,entries};
    const aSha=await hsmeStageRouteAssignmentV1Digest(a,hash);
    const result=await freeze(f,{assignment:a,assignmentSha:aSha});
    assert.equal(result.state,'DETERMINISTIC_STAGE_ROUTE_TABLE_INVALID');
    assert.ok(result.blockers.includes('DETERMINISTIC_STAGE_ROUTE_EXPERT_BINDING_MISMATCH'));
  }
});

test('active expert count cannot exceed the frozen HSME-6.1 cap',async()=>{
  const f=await fixture();
  const entries=f.a.entries.map(entry=>
    entry.stageKind==='APPEARANCE'
      ?{
        ...entry,
        activeExpertIds:['fashion-adapter-v1','detail-adapter-v1','third-expert'],
        activeExpertContentSha256s:[h('7'),h('8'),h('9')],
      }
      :entry
  );
  const a={...f.a,entries};
  const aSha=await hsmeStageRouteAssignmentV1Digest(a,hash);
  const result=await freeze(f,{assignment:a,assignmentSha:aSha});
  assert.equal(result.state,'DETERMINISTIC_STAGE_ROUTE_TABLE_INVALID');
  assert.ok(
    result.blockers.includes('DETERMINISTIC_STAGE_ROUTE_ACTIVE_EXPERT_CAP_EXCEEDED'),
  );
});

test('route mode cardinality and specialist-experiment requirement fail closed',async()=>{
  const f=await fixture();
  const sharedWithExpert=f.a.entries.map(entry=>
    entry.stageKind==='GEOMETRY'
      ?{...entry,activeExpertIds:['fashion-adapter-v1'],activeExpertContentSha256s:[h('7')]}
      :entry
  );
  await assert.rejects(
    ()=>hsmeStageRouteAssignmentV1Digest({...f.a,entries:sharedWithExpert},hash),
    /route mode\/expert cardinality mismatch/,
  );

  const allShared=f.a.entries.map(entry=>({
    ...entry,routeMode:'SHARED_ONLY',activeExpertIds:[],activeExpertContentSha256s:[],
  }));
  await assert.rejects(
    ()=>hsmeStageRouteAssignmentV1Digest({...f.a,entries:allShared},hash),
    /at least one stage must use specialists/,
  );
});

test('runtime route mutation learned routing provider fallback and model authority are forbidden',async()=>{
  const f=await fixture();
  for(const overrides of [
    {runtimeRouteMutationAllowed:true},
    {learnedDynamicRoutingAllowed:true},
    {providerFallbackAllowed:true},
    {modelInstallAllowed:true},
  ]){
    const a=assignment(f.p,overrides);
    const result=await freeze(f,{assignment:a,assignmentSha:h('0')});
    assert.equal(result.state,'DETERMINISTIC_STAGE_ROUTE_TABLE_INVALID');
    assert.ok(result.blockers.includes('DETERMINISTIC_STAGE_ROUTE_ASSIGNMENT_INVALID'));
  }
});
