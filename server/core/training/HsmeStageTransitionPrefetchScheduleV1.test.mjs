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

const hash={async sha256(bytes){
  return createHash('sha256').update(bytes).digest('hex');
}};
function h(ch){return ch.repeat(64);}
function authority(){
  return {
    movementExecutionAllowed:false,stageRoutingExecutionAllowed:false,
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
async function table(detailExperts=[
  {expertId:'fashion-adapter-v1',expertContentSha256:h('7')},
  {expertId:'detail-adapter-v1',expertContentSha256:h('8')},
]){
  const base={
    schemaVersion:HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
    state:'STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED',blockers:[],
    stageRoutingPlanSha256:h('1'),routePolicySha256:h('2'),
    prototypeSha256:h('3'),denseBaselineContentSha256:h('4'),
    routerContentSha256:h('5'),runtimeRepresentationSha256:h('6'),
    hardwareClass:'SYNTHETIC_MOBILE',
    qualityPreservationContractSha256:h('9'),
    maxActiveExpertsPerStage:2,maxStageTransitionPrefetchBytes:150_000_000,
    routes:[
      {
        stageId:'geometry-stage',stageKind:'GEOMETRY',
        progressStartBps:0,progressEndBps:3500,routeMode:'SHARED_ONLY',
        sharedPathEnabled:true,routerContentSha256:h('5'),activeExperts:[],
        deterministicRouteSeedSha256:h('a'),
        deterministicRouteContractSha256:h('b'),
      },
      {
        stageId:'appearance-stage',stageKind:'APPEARANCE',
        progressStartBps:3500,progressEndBps:7500,
        routeMode:'SHARED_PLUS_SPECIALISTS',sharedPathEnabled:true,
        routerContentSha256:h('5'),
        activeExperts:[
          {expertId:'fashion-adapter-v1',expertContentSha256:h('7')},
        ],
        deterministicRouteSeedSha256:h('c'),
        deterministicRouteContractSha256:h('d'),
      },
      {
        stageId:'detail-stage',stageKind:'DETAIL',
        progressStartBps:7500,progressEndBps:10000,
        routeMode:'SHARED_PLUS_SPECIALISTS',sharedPathEnabled:true,
        routerContentSha256:h('5'),activeExperts:detailExperts,
        deterministicRouteSeedSha256:h('e'),
        deterministicRouteContractSha256:h('f'),
      },
    ],
    routeTableEvidenceSha256:h('0'),...tableAuthority(),
  };
  const routeTableEvidenceSha256=await hsmeStageRouteTableV1Digest(base,hash);
  return {...base,routeTableEvidenceSha256};
}
function roster(t,assets=null,overrides={}){
  const rows=assets??[
    {
      expertId:'detail-adapter-v1',expertContentSha256:h('8'),
      artifactBytes:60_000_000,immutableAssetEvidenceSha256:h('1'),
    },
    {
      expertId:'fashion-adapter-v1',expertContentSha256:h('7'),
      artifactBytes:80_000_000,immutableAssetEvidenceSha256:h('2'),
    },
  ];
  return {
    schemaVersion:HSME_STAGE_PREFETCH_ASSET_ROSTER_V1_SCHEMA,
    routeTableEvidenceSha256:t.routeTableEvidenceSha256,
    prototypeSha256:t.prototypeSha256,routerContentSha256:t.routerContentSha256,
    runtimeRepresentationSha256:t.runtimeRepresentationSha256,
    hardwareClass:t.hardwareClass,assets:rows,
    realMeasuredOrManifestEvidence:true,...authority(),...overrides,
  };
}
function policy(t,overrides={}){
  return {
    schemaVersion:HSME_STAGE_TRANSITION_PREFETCH_POLICY_V1_SCHEMA,
    routeTableEvidenceSha256:t.routeTableEvidenceSha256,
    transitions:[
      {
        transitionId:'GEOMETRY_TO_APPEARANCE',
        fromStageId:'geometry-stage',toStageId:'appearance-stage',
        triggerProgressBps:3000,prefetchRequired:true,
        networkAllowed:false,deterministicOnly:true,
      },
      {
        transitionId:'APPEARANCE_TO_DETAIL',
        fromStageId:'appearance-stage',toStageId:'detail-stage',
        triggerProgressBps:7000,prefetchRequired:true,
        networkAllowed:false,deterministicOnly:true,
      },
    ],
    reviewState:'STAGE_TRANSITION_PREFETCH_POLICY_REVIEWED',
    ...authority(),routeMutationAllowed:false,...overrides,
  };
}
const trueTableOrigin={async verifyStageRouteTable(){return true;}};
const falseTableOrigin={async verifyStageRouteTable(){return false;}};
const trueRosterOrigin={async verifyStagePrefetchAssetRoster(){return true;}};
const falseRosterOrigin={async verifyStagePrefetchAssetRoster(){return false;}};
const truePolicyOrigin={async verifyStageTransitionPrefetchPolicy(){return true;}};

async function fixture(){
  const t=await table();
  const r=roster(t);
  const rSha=await hsmeStagePrefetchAssetRosterV1Digest(r,hash);
  const p=policy(t);
  const pSha=await hsmeStageTransitionPrefetchPolicyV1Digest(p,hash);
  return {t,r,rSha,p,pSha};
}
async function freeze(f,overrides={}){
  return freezeHsmeStageTransitionPrefetchScheduleV1(
    overrides.table??f.t,(overrides.table??f.t).routeTableEvidenceSha256,
    overrides.tableOrigin??trueTableOrigin,
    overrides.roster??f.r,overrides.rosterSha??f.rSha,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.policy??f.p,overrides.policySha??f.pSha,
    truePolicyOrigin,hash,
  );
}

test('next-stage prefetch is exact target-minus-source expert delta and deterministic under caller order',async()=>{
  const f=await fixture();
  const reversedRoster={...f.r,assets:[...f.r.assets].reverse()};
  const reversedRosterSha=
    await hsmeStagePrefetchAssetRosterV1Digest(reversedRoster,hash);
  const reversedPolicy={...f.p,transitions:[...f.p.transitions].reverse()};
  const reversedPolicySha=
    await hsmeStageTransitionPrefetchPolicyV1Digest(reversedPolicy,hash);
  const a=await freeze(f,{
    roster:reversedRoster,rosterSha:reversedRosterSha,
    policy:reversedPolicy,policySha:reversedPolicySha,
  });
  const b=await freeze(f);
  assert.equal(
    a.state,
    'STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED',
  );
  assert.deepEqual(
    a.transitions[0].assets.map(v=>v.expertId),
    ['fashion-adapter-v1'],
  );
  assert.equal(a.transitions[0].prefetchBytes,80_000_000);
  assert.deepEqual(
    a.transitions[1].assets.map(v=>v.expertId),
    ['detail-adapter-v1'],
  );
  assert.equal(a.transitions[1].prefetchBytes,60_000_000);
  assert.ok(a.transitions.every(v=>v.networkAllowed===false));
  assert.equal(a.movementExecutionAllowed,false);
  assert.equal(a.routeMutationAllowed,false);
  assert.deepEqual(a,b);
  assert.equal(
    await hsmeStageTransitionPrefetchScheduleV1Digest(a,hash),
    a.scheduleEvidenceSha256,
  );
});

test('transition may deterministically require zero new bytes when target experts are already active',async()=>{
  const t=await table([
    {expertId:'fashion-adapter-v1',expertContentSha256:h('7')},
  ]);
  const r=roster(t,[
    {
      expertId:'fashion-adapter-v1',expertContentSha256:h('7'),
      artifactBytes:80_000_000,immutableAssetEvidenceSha256:h('2'),
    },
  ]);
  const rSha=await hsmeStagePrefetchAssetRosterV1Digest(r,hash);
  const p=policy(t);
  const pSha=await hsmeStageTransitionPrefetchPolicyV1Digest(p,hash);
  const f={t,r,rSha,p,pSha};
  const result=await freeze(f);
  assert.equal(result.transitions[1].assets.length,0);
  assert.equal(result.transitions[1].prefetchBytes,0);
});

test('route table and asset roster trusted origins are mandatory',async()=>{
  const f=await fixture();
  const a=await freeze(f,{tableOrigin:falseTableOrigin});
  assert.equal(a.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(
    a.blockers.includes('STAGE_TRANSITION_PREFETCH_ROUTE_TABLE_ORIGIN_UNVERIFIED'),
  );
  const b=await freeze(f,{rosterOrigin:falseRosterOrigin});
  assert.equal(b.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(
    b.blockers.includes('STAGE_TRANSITION_PREFETCH_ASSET_ROSTER_ORIGIN_UNVERIFIED'),
  );
});

test('asset roster must exactly cover used expert id-content identities',async()=>{
  const f=await fixture();
  const drift=roster(f.t,[
    {
      expertId:'detail-adapter-v1',expertContentSha256:h('0'),
      artifactBytes:60_000_000,immutableAssetEvidenceSha256:h('1'),
    },
    f.r.assets[1],
  ]);
  const driftSha=await hsmeStagePrefetchAssetRosterV1Digest(drift,hash);
  const result=await freeze(f,{roster:drift,rosterSha:driftSha});
  assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(
    result.blockers.includes(
      'STAGE_TRANSITION_PREFETCH_ASSET_ROSTER_COVERAGE_MISMATCH',
    ),
  );
});

test('per-transition exact-byte cap is enforced',async()=>{
  const f=await fixture();
  const oversized=roster(f.t,[
    f.r.assets[0],
    {...f.r.assets[1],artifactBytes:150_000_001},
  ]);
  const oversizedSha=await hsmeStagePrefetchAssetRosterV1Digest(oversized,hash);
  const result=await freeze(f,{roster:oversized,rosterSha:oversizedSha});
  assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(
    result.blockers.includes('STAGE_TRANSITION_PREFETCH_BYTE_CAP_EXCEEDED'),
  );
});

test('transition trigger must stay strictly inside the exact source stage',async()=>{
  const f=await fixture();
  const p=policy(f.t,{
    transitions:[
      {...f.p.transitions[0],triggerProgressBps:3500},
      f.p.transitions[1],
    ],
  });
  const pSha=await hsmeStageTransitionPrefetchPolicyV1Digest(p,hash);
  const result=await freeze(f,{policy:p,policySha:pSha});
  assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
  assert.ok(
    result.blockers.includes(
      'STAGE_TRANSITION_PREFETCH_POLICY_STAGE_BINDING_MISMATCH',
    ),
  );
});

test('network movement and route-mutation authority cannot enter reviewed inputs',async()=>{
  const f=await fixture();
  for(const p of [
    policy(f.t,{routeMutationAllowed:true}),
    policy(f.t,{
      transitions:[
        {...f.p.transitions[0],networkAllowed:true},
        f.p.transitions[1],
      ],
    }),
  ]){
    const result=await freeze(f,{policy:p,policySha:h('0')});
    assert.equal(result.state,'STAGE_TRANSITION_PREFETCH_SCHEDULE_INVALID');
    assert.ok(result.blockers.includes('STAGE_TRANSITION_PREFETCH_POLICY_INVALID'));
  }
});
