import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
  hsmeStageRouteTableV1Digest,
} from './HsmeStageRouteTableV1.ts';
import {
  HSME_STAGE_PREFETCH_ASSET_ROSTER_V1_SCHEMA,
  HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1_SCHEMA,
  freezeHsmeStageTransitionPrefetchScheduleV1,
  hsmeStagePrefetchAssetRosterV1Digest,
  hsmeStageTransitionPrefetchPolicyV1Digest,
  hsmeStageTransitionPrefetchScheduleV1Digest,
} from './HsmeStageTransitionPrefetchScheduleV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    movementExecutionAllowed:false,
    stageRoutingExecutionAllowed:false,
    routeSelectionAllowed:false,
    routeMutationAllowed:false,
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

function route({
  stageId,stageKind,start,end,experts,seed,contract,
}){
  return {
    stageId,
    stageKind,
    progressStartBps:start,
    progressEndBps:end,
    routeMode:experts.length===0?'SHARED_ONLY':'SHARED_PLUS_SPECIALISTS',
    sharedPathEnabled:true,
    routerContentSha256:h('6'),
    activeExperts:experts,
    deterministicRouteSeedSha256:h(seed),
    deterministicRouteContractSha256:h(contract),
  };
}

async function routeTable(overrides={}){
  const base={
    schemaVersion:HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
    state:'STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED',
    blockers:[],
    stageRoutingPlanSha256:h('1'),
    routePolicySha256:h('2'),
    prototypeSha256:h('3'),
    denseBaselineContentSha256:h('4'),
    routerContentSha256:h('6'),
    runtimeRepresentationSha256:h('5'),
    hardwareClass:'synthetic-device-v1',
    qualityPreservationContractSha256:h('7'),
    maxActiveExpertsPerStage:2,
    maxStageTransitionPrefetchBytes:60_000_000,
    routes:[
      route({
        stageId:'geometry-stage',stageKind:'GEOMETRY',
        start:0,end:3500,
        experts:[
          {expertId:'expert-a',expertContentSha256:h('a')},
        ],
        seed:'1',contract:'2',
      }),
      route({
        stageId:'appearance-stage',stageKind:'APPEARANCE',
        start:3500,end:7500,
        experts:[
          {expertId:'expert-a',expertContentSha256:h('a')},
          {expertId:'expert-b',expertContentSha256:h('b')},
        ],
        seed:'3',contract:'4',
      }),
      route({
        stageId:'detail-stage',stageKind:'DETAIL',
        start:7500,end:10000,
        experts:[
          {expertId:'expert-b',expertContentSha256:h('b')},
        ],
        seed:'5',contract:'6',
      }),
    ],
    routeTableEvidenceSha256:h('0'),
    stageRoutingExecutionAllowed:false,
    routeSelectionAllowed:false,
    routeMutationAllowed:false,
    inferenceExecutionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    ...overrides,
  };
  const routeTableEvidenceSha256=
    await hsmeStageRouteTableV1Digest(base,hash);
  return {...base,routeTableEvidenceSha256};
}

function rawRoster(table,overrides={}){
  return {
    schemaVersion:HSME_STAGE_PREFETCH_ASSET_ROSTER_V1_SCHEMA,
    routeTableEvidenceSha256:table.routeTableEvidenceSha256,
    prototypeSha256:table.prototypeSha256,
    routerContentSha256:table.routerContentSha256,
    runtimeRepresentationSha256:table.runtimeRepresentationSha256,
    hardwareClass:table.hardwareClass,
    assets:[
      {
        expertId:'expert-b',
        expertContentSha256:h('b'),
        artifactBytes:50_000_000,
        immutableAssetEvidenceSha256:h('d'),
      },
      {
        expertId:'expert-a',
        expertContentSha256:h('a'),
        artifactBytes:40_000_000,
        immutableAssetEvidenceSha256:h('c'),
      },
    ],
    realMeasuredOrManifestEvidence:true,
    ...authority(),
    ...overrides,
  };
}

function rawPolicy(table,rosterSha,overrides={}){
  return {
    schemaVersion:HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1_SCHEMA,
    routeTableEvidenceSha256:table.routeTableEvidenceSha256,
    assetRosterSha256:rosterSha,
    transitions:[
      {
        transitionId:'APPEARANCE_TO_DETAIL',
        fromStageId:'appearance-stage',
        toStageId:'detail-stage',
        triggerProgressBps:7000,
        prefetchRequired:true,
        networkAllowed:false,
        deterministicOnly:true,
      },
      {
        transitionId:'GEOMETRY_TO_APPEARANCE',
        fromStageId:'geometry-stage',
        toStageId:'appearance-stage',
        triggerProgressBps:3000,
        prefetchRequired:true,
        networkAllowed:false,
        deterministicOnly:true,
      },
    ],
    reviewState:'STAGE_TRANSITION_PREFETCH_POLICY_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

const trueTableOrigin={
  async verifyStageRouteTable(){return true;},
};
const falseTableOrigin={
  async verifyStageRouteTable(){return false;},
};
const trueRosterOrigin={
  async verifyStagePrefetchAssetRoster(){return true;},
};
const falseRosterOrigin={
  async verifyStagePrefetchAssetRoster(){return false;},
};
const truePolicyOrigin={
  async verifyStageTransitionPrefetchPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifyStageTransitionPrefetchPolicy(){return false;},
};

async function fixture(){
  const table=await routeTable();
  const roster=rawRoster(table);
  const rosterSha=await hsmeStagePrefetchAssetRosterV1Digest(roster,hash);
  const policy=rawPolicy(table,rosterSha);
  const policySha=await hsmeStageTransitionPrefetchPolicyV1Digest(policy,hash);
  return {table,roster,rosterSha,policy,policySha};
}

async function freeze(f,overrides={}){
  return freezeHsmeStageTransitionPrefetchScheduleV1(
    overrides.table??f.table,
    overrides.tableSha??f.table.routeTableEvidenceSha256,
    overrides.tableOrigin??trueTableOrigin,
    overrides.roster??f.roster,
    overrides.rosterSha??f.rosterSha,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

test('exact target-minus-source expert sets yield deterministic transition schedule',async()=>{
  const f=await fixture();
  const first=await freeze(f);

  const reversedRoster={...f.roster,assets:[...f.roster.assets].reverse()};
  const reversedRosterSha=
    await hsmeStagePrefetchAssetRosterV1Digest(reversedRoster,hash);
  const reversedPolicy={
    ...f.policy,
    assetRosterSha256:reversedRosterSha,
    transitions:[...f.policy.transitions].reverse(),
  };
  const reversedPolicySha=
    await hsmeStageTransitionPrefetchPolicyV1Digest(reversedPolicy,hash);
  const second=await freeze(f,{
    roster:reversedRoster,
    rosterSha:reversedRosterSha,
    policy:reversedPolicy,
    policySha:reversedPolicySha,
  });

  assert.equal(
    first.state,
    'STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED',
  );
  assert.deepEqual(first.blockers,[]);
  assert.deepEqual(
    first.transitions.map(value=>value.transitionId),
    ['GEOMETRY_TO_APPEARANCE','APPEARANCE_TO_DETAIL'],
  );
  assert.deepEqual(
    first.transitions[0].assets.map(value=>value.expertId),
    ['expert-b'],
  );
  assert.equal(first.transitions[0].prefetchBytes,50_000_000);
  assert.equal(first.transitions[0].prefetchBudgetBytes,60_000_000);
  assert.deepEqual(first.transitions[1].assets,[]);
  assert.equal(first.transitions[1].prefetchBytes,0);
  assert.equal(first.transitions[0].networkAllowed,false);
  assert.equal(first.movementExecutionAllowed,false);
  assert.equal(first.stageRoutingExecutionAllowed,false);
  assert.equal(first.inferenceExecutionAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeStageTransitionPrefetchScheduleV1Digest(first,hash),
    first.scheduleEvidenceSha256,
  );
});

test('non-frozen route table remains BLOCKED',async()=>{
  const f=await fixture();
  const table={
    ...f.table,
    state:'STAGE_ROUTE_TABLE_BLOCKED',
    blockers:['REAL_ROUTE_TABLE_REQUIRED'],
    routeTableEvidenceSha256:'UNKNOWN',
  };
  const result=await freeze(f,{table});
  assert.equal(
    result.state,
    'STAGE_TRANSITION_PREFETCH_SCHEDULE_BLOCKED',
  );
  assert.ok(
    result.blockers.includes('STAGE_PREFETCH_FROZEN_ROUTE_TABLE_REQUIRED'),
  );
});

test('route-table asset-roster and policy origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await freeze(f,{tableOrigin:falseTableOrigin});
  assert.equal(a.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(a.blockers.includes('STAGE_PREFETCH_ROUTE_TABLE_ORIGIN_UNVERIFIED'));

  const b=await freeze(f,{rosterOrigin:falseRosterOrigin});
  assert.equal(b.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(b.blockers.includes('STAGE_PREFETCH_ASSET_ROSTER_ORIGIN_UNVERIFIED'));

  const c=await freeze(f,{policyOrigin:falsePolicyOrigin});
  assert.equal(c.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(c.blockers.includes('STAGE_PREFETCH_POLICY_ORIGIN_UNVERIFIED'));
});

test('asset roster must be the exact used expert set with exact content identities',async()=>{
  const f=await fixture();

  const extra={
    ...f.roster,
    assets:[
      ...f.roster.assets,
      {
        expertId:'unused-expert',
        expertContentSha256:h('e'),
        artifactBytes:1_000_000,
        immutableAssetEvidenceSha256:h('f'),
      },
    ],
  };
  const extraSha=await hsmeStagePrefetchAssetRosterV1Digest(extra,hash);
  const extraPolicy=rawPolicy(f.table,extraSha);
  const extraPolicySha=
    await hsmeStageTransitionPrefetchPolicyV1Digest(extraPolicy,hash);
  const a=await freeze(f,{
    roster:extra,rosterSha:extraSha,
    policy:extraPolicy,policySha:extraPolicySha,
  });
  assert.equal(a.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(a.blockers.includes('STAGE_PREFETCH_ASSET_ROSTER_EXACT_SET_REQUIRED'));

  const drift={
    ...f.roster,
    assets:f.roster.assets.map(value=>
      value.expertId==='expert-b'
        ?{...value,expertContentSha256:h('f')}
        :value
    ),
  };
  const driftSha=await hsmeStagePrefetchAssetRosterV1Digest(drift,hash);
  const driftPolicy=rawPolicy(f.table,driftSha);
  const driftPolicySha=
    await hsmeStageTransitionPrefetchPolicyV1Digest(driftPolicy,hash);
  const b=await freeze(f,{
    roster:drift,rosterSha:driftSha,
    policy:driftPolicy,policySha:driftPolicySha,
  });
  assert.equal(b.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(b.blockers.includes('STAGE_PREFETCH_ASSET_ROSTER_EXACT_SET_REQUIRED'));
});

test('transition prefetch bytes cannot exceed the frozen HSME-4/6.1 cap',async()=>{
  const f=await fixture();
  const roster={
    ...f.roster,
    assets:f.roster.assets.map(value=>
      value.expertId==='expert-b'
        ?{...value,artifactBytes:60_000_001}
        :value
    ),
  };
  const rosterSha=await hsmeStagePrefetchAssetRosterV1Digest(roster,hash);
  const policy=rawPolicy(f.table,rosterSha);
  const policySha=await hsmeStageTransitionPrefetchPolicyV1Digest(policy,hash);
  const result=await freeze(f,{roster,rosterSha,policy,policySha});
  assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(result.blockers.includes('STAGE_PREFETCH_BYTE_BUDGET_EXCEEDED'));
});

test('transition trigger must be strictly inside the source stage',async()=>{
  const f=await fixture();
  for(const triggerProgressBps of [0,3500,7500]){
    const policy={
      ...f.policy,
      transitions:f.policy.transitions.map(value=>
        value.transitionId==='GEOMETRY_TO_APPEARANCE'
          ?{...value,triggerProgressBps}
          :value
      ),
    };
    if(triggerProgressBps===0){
      const result=await freeze(f,{policy,policySha:h('0')});
      assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
      assert.ok(result.blockers.includes('STAGE_PREFETCH_POLICY_INVALID'));
      continue;
    }
    const policySha=
      await hsmeStageTransitionPrefetchPolicyV1Digest(policy,hash);
    const result=await freeze(f,{policy,policySha});
    assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
    assert.ok(result.blockers.includes('STAGE_PREFETCH_TRANSITION_BINDING_INVALID'));
  }
});

test('network post-hoc fields and authority widening fail exact policy schema',async()=>{
  const f=await fixture();
  for(const policy of [
    {
      ...f.policy,
      transitions:f.policy.transitions.map(value=>
        value.transitionId==='GEOMETRY_TO_APPEARANCE'
          ?{...value,networkAllowed:true}
          :value
      ),
    },
    {...f.policy,movementExecutionAllowed:true},
    {...f.policy,learnedPrefetchScore:0.9},
  ]){
    const result=await freeze(f,{policy,policySha:h('0')});
    assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
    assert.ok(result.blockers.includes('STAGE_PREFETCH_POLICY_INVALID'));
  }
});
