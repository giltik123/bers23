import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeStageRoutingExperimentPlanV1Digest,
} from './HsmeStageRoutingExperimentPlanV1.ts';
import {
  HSME_STAGE_ROUTE_TABLE_POLICY_V1_SCHEMA,
  freezeHsmeStageRouteTableV1,
  hsmeStageRouteTablePolicyV1Digest,
  hsmeStageRouteTableV1Digest,
} from './HsmeStageRouteTableV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    stageRoutingExecutionAllowed:false,
    routeSelectionAllowed:false,
    inferenceExecutionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
  };
}

function routeAuthority(){
  return {...authority(),routeMutationAllowed:false};
}

async function syntheticPlan(overrides={}){
  const base={
    schemaVersion:HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    residencyPlanSha256:h('1'),
    stageProfileRosterSha256:h('2'),
    stageRoutingPolicySha256:h('3'),
    prototypeSha256:h('4'),
    denseBaselineContentSha256:h('5'),
    routerContentSha256:h('6'),
    expertIds:['fashion-expert','identity-expert','detail-expert'],
    expertContentSha256s:[h('7'),h('8'),h('9')],
    runtimeRepresentationSha256:h('a'),
    hardwareClass:'synthetic-device-v1',
    profiles:[
      {
        stageId:'geometry-stage',
        stageKind:'GEOMETRY',
        progressStartBps:0,
        progressEndBps:3500,
        measuredCaseCount:20,
        stageWallClockUs:1000,
        flashBytesMoved:100,
        ramBytesMoved:200,
        acceleratorBytesMoved:300,
        peakMemoryBytes:400,
        qualitySensitivityEvidenceSha256:h('b'),
        specializationEvidenceSha256:h('c'),
        deterministicStageIdentitySha256:h('d'),
        runtimeRepresentationSha256:h('a'),
        hardwareClass:'synthetic-device-v1',
      },
      {
        stageId:'appearance-stage',
        stageKind:'APPEARANCE',
        progressStartBps:3500,
        progressEndBps:7500,
        measuredCaseCount:20,
        stageWallClockUs:1100,
        flashBytesMoved:110,
        ramBytesMoved:210,
        acceleratorBytesMoved:310,
        peakMemoryBytes:410,
        qualitySensitivityEvidenceSha256:h('e'),
        specializationEvidenceSha256:h('f'),
        deterministicStageIdentitySha256:h('1'),
        runtimeRepresentationSha256:h('a'),
        hardwareClass:'synthetic-device-v1',
      },
      {
        stageId:'detail-stage',
        stageKind:'DETAIL',
        progressStartBps:7500,
        progressEndBps:10000,
        measuredCaseCount:20,
        stageWallClockUs:1200,
        flashBytesMoved:120,
        ramBytesMoved:220,
        acceleratorBytesMoved:320,
        peakMemoryBytes:420,
        qualitySensitivityEvidenceSha256:h('2'),
        specializationEvidenceSha256:h('3'),
        deterministicStageIdentitySha256:h('4'),
        runtimeRepresentationSha256:h('a'),
        hardwareClass:'synthetic-device-v1',
      },
    ],
    maxActiveExpertsPerStage:1,
    maxStageTransitionPrefetchBytes:80_000_000,
    qualityPreservationContractSha256:h('5'),
    deterministicStageBoundariesRequired:true,
    deterministicRoutingRequired:true,
    nextStagePrefetchRequired:true,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    planEvidenceSha256:h('0'),
    ...authority(),
    ...overrides,
  };
  const planEvidenceSha256=await hsmeStageRoutingExperimentPlanV1Digest(
    base,
    hash,
  );
  return {...base,planEvidenceSha256};
}

function route({
  stageId,
  stageKind,
  start,
  end,
  expertId,
  expertSha,
  mode='SHARED_PLUS_SPECIALISTS',
  overrides={},
}){
  return {
    stageId,
    stageKind,
    progressStartBps:start,
    progressEndBps:end,
    routeMode:mode,
    sharedPathEnabled:true,
    routerContentSha256:h('6'),
    activeExperts:expertId
      ?[{expertId,expertContentSha256:expertSha}]
      :[],
    deterministicRouteSeedSha256:h(
      stageKind==='GEOMETRY'?'a':stageKind==='APPEARANCE'?'b':'c',
    ),
    deterministicRouteContractSha256:h(
      stageKind==='GEOMETRY'?'d':stageKind==='APPEARANCE'?'e':'f',
    ),
    ...overrides,
  };
}

function rawPolicy(plan,overrides={}){
  return {
    schemaVersion:HSME_STAGE_ROUTE_TABLE_POLICY_V1_SCHEMA,
    stageRoutingPlanSha256:plan.planEvidenceSha256,
    routes:[
      route({
        stageId:'detail-stage',stageKind:'DETAIL',
        start:7500,end:10000,
        expertId:'detail-expert',expertSha:h('9'),
      }),
      route({
        stageId:'geometry-stage',stageKind:'GEOMETRY',
        start:0,end:3500,
        expertId:null,expertSha:null,mode:'SHARED_ONLY',
      }),
      route({
        stageId:'appearance-stage',stageKind:'APPEARANCE',
        start:3500,end:7500,
        expertId:'fashion-expert',expertSha:h('7'),
      }),
    ],
    reviewState:'STAGE_ROUTE_TABLE_POLICY_REVIEWED',
    ...routeAuthority(),
    ...overrides,
  };
}

const truePlanOrigin={
  async verifyStageRoutingPlan(){return true;},
};
const falsePlanOrigin={
  async verifyStageRoutingPlan(){return false;},
};
const truePolicyOrigin={
  async verifyStageRouteTablePolicy(){return true;},
};
const falsePolicyOrigin={
  async verifyStageRouteTablePolicy(){return false;},
};

async function fixture(){
  const plan=await syntheticPlan();
  const policy=rawPolicy(plan);
  const policySha=await hsmeStageRouteTablePolicyV1Digest(policy,hash);
  return {plan,policy,policySha};
}

async function freeze(f,overrides={}){
  return freezeHsmeStageRouteTableV1(
    overrides.plan??f.plan,
    overrides.planSha??f.plan.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

test('reviewed routes freeze one canonical deterministic three-stage table',async()=>{
  const f=await fixture();
  const first=await freeze(f);
  const reversed={
    ...f.policy,
    routes:[...f.policy.routes].reverse(),
  };
  const reversedSha=await hsmeStageRouteTablePolicyV1Digest(reversed,hash);
  const second=await freeze(f,{policy:reversed,policySha:reversedSha});

  assert.equal(first.state,'STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED');
  assert.deepEqual(first.blockers,[]);
  assert.deepEqual(
    first.routes.map(value=>value.stageKind),
    ['GEOMETRY','APPEARANCE','DETAIL'],
  );
  assert.equal(first.routes[0].routeMode,'SHARED_ONLY');
  assert.equal(first.routes[1].activeExperts[0].expertId,'fashion-expert');
  assert.equal(first.stageRoutingExecutionAllowed,false);
  assert.equal(first.routeSelectionAllowed,false);
  assert.equal(first.routeMutationAllowed,false);
  assert.equal(first.inferenceExecutionAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeStageRouteTableV1Digest(first,hash),
    first.routeTableEvidenceSha256,
  );
});

test('non-frozen plan remains BLOCKED',async()=>{
  const f=await fixture();
  const plan={
    ...f.plan,
    state:'STAGE_ROUTING_PLAN_BLOCKED',
    blockers:['REAL_MEASURED_STAGE_PROFILE_REQUIRED'],
    planEvidenceSha256:'UNKNOWN',
  };
  const result=await freeze(f,{plan});
  assert.equal(result.state,'STAGE_ROUTE_TABLE_BLOCKED');
  assert.ok(result.blockers.includes('STAGE_ROUTE_TABLE_FROZEN_PLAN_REQUIRED'));
});

test('plan and route-policy exact origins are mandatory',async()=>{
  const f=await fixture();
  const planResult=await freeze(f,{planOrigin:falsePlanOrigin});
  assert.equal(planResult.state,'STAGE_ROUTE_TABLE_INVALID');
  assert.ok(
    planResult.blockers.includes('STAGE_ROUTE_TABLE_PLAN_ORIGIN_UNVERIFIED'),
  );

  const policyResult=await freeze(f,{policyOrigin:falsePolicyOrigin});
  assert.equal(policyResult.state,'STAGE_ROUTE_TABLE_INVALID');
  assert.ok(
    policyResult.blockers.includes('STAGE_ROUTE_TABLE_POLICY_ORIGIN_UNVERIFIED'),
  );
});

test('stage id progress or router drift fails closed',async()=>{
  const f=await fixture();
  for(const patch of [
    {stageId:'other-stage'},
    {progressEndBps:3400},
    {routerContentSha256:h('0')},
  ]){
    const policy=rawPolicy(f.plan,{
      routes:f.policy.routes.map(value=>
        value.stageKind==='GEOMETRY'?{...value,...patch}:value
      ),
    });
    const policySha=await hsmeStageRouteTablePolicyV1Digest(policy,hash);
    const result=await freeze(f,{policy,policySha});
    assert.equal(result.state,'STAGE_ROUTE_TABLE_INVALID');
    assert.ok(
      result.blockers.some(value=>
        value==='STAGE_ROUTE_TABLE_STAGE_BINDING_MISMATCH'
        ||value==='STAGE_ROUTE_TABLE_ROUTER_BINDING_MISMATCH'
      ),
    );
  }
});

test('expert id and content identity must match the exact HSME-6.1 plan pair',async()=>{
  const f=await fixture();
  const policy=rawPolicy(f.plan,{
    routes:f.policy.routes.map(value=>
      value.stageKind==='APPEARANCE'
        ?{
          ...value,
          activeExperts:[{
            expertId:'fashion-expert',
            expertContentSha256:h('8'),
          }],
        }
        :value
    ),
  });
  const policySha=await hsmeStageRouteTablePolicyV1Digest(policy,hash);
  const result=await freeze(f,{policy,policySha});
  assert.equal(result.state,'STAGE_ROUTE_TABLE_INVALID');
  assert.ok(
    result.blockers.includes('STAGE_ROUTE_TABLE_EXPERT_BINDING_MISMATCH'),
  );
});

test('active expert cap cannot exceed the frozen HSME-6.1 maximum',async()=>{
  const f=await fixture();
  const policy=rawPolicy(f.plan,{
    routes:f.policy.routes.map(value=>
      value.stageKind==='APPEARANCE'
        ?{
          ...value,
          activeExperts:[
            {expertId:'fashion-expert',expertContentSha256:h('7')},
            {expertId:'identity-expert',expertContentSha256:h('8')},
          ],
        }
        :value
    ),
  });
  const policySha=await hsmeStageRouteTablePolicyV1Digest(policy,hash);
  const result=await freeze(f,{policy,policySha});
  assert.equal(result.state,'STAGE_ROUTE_TABLE_INVALID');
  assert.ok(
    result.blockers.includes('STAGE_ROUTE_TABLE_ACTIVE_EXPERT_CAP_EXCEEDED'),
  );
});

test('route mode cardinality shared-path and authority widening are exact-schema failures',async()=>{
  const f=await fixture();
  for(const policy of [
    rawPolicy(f.plan,{
      routes:f.policy.routes.map(value=>
        value.stageKind==='GEOMETRY'
          ?{...value,routeMode:'SHARED_PLUS_SPECIALISTS'}
          :value
      ),
    }),
    rawPolicy(f.plan,{
      routes:f.policy.routes.map(value=>
        value.stageKind==='GEOMETRY'
          ?{...value,sharedPathEnabled:false}
          :value
      ),
    }),
    rawPolicy(f.plan,{routeMutationAllowed:true}),
  ]){
    const result=await freeze(f,{policy,policySha:h('0')});
    assert.equal(result.state,'STAGE_ROUTE_TABLE_INVALID');
    assert.ok(result.blockers.includes('STAGE_ROUTE_TABLE_POLICY_INVALID'));
  }
});

test('unknown stage-route fields cannot become post-hoc routing authority',async()=>{
  const f=await fixture();
  const policy={
    ...f.policy,
    learnedThreshold:0.5,
  };
  const result=await freeze(f,{policy,policySha:h('0')});
  assert.equal(result.state,'STAGE_ROUTE_TABLE_INVALID');
  assert.ok(result.blockers.includes('STAGE_ROUTE_TABLE_POLICY_INVALID'));
});
