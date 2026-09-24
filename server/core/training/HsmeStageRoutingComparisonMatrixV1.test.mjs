import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
  hsmeStageRouteTableV1Digest,
} from './HsmeStageRouteTableV1.ts';
import {
  HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA,
  hsmeStageTransitionPrefetchScheduleV1Digest,
} from './HsmeStageTransitionPrefetchScheduleV1.ts';
import {
  CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_V1_SCHEMA,
  HSME_STAGE_ROUTING_CAMPAIGN_POLICY_V1_SCHEMA,
  collectHsmeStageRoutingComparisonMatrixV1,
  coreHsmeStageRoutingCampaignResultV1Digest,
  hsmeStageRoutingCampaignPolicyV1Digest,
  hsmeStageRoutingComparisonMatrixV1Digest,
} from './HsmeStageRoutingComparisonMatrixV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    selectionAllowed:false,
    stageRoutingExecutionAllowed:false,
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

async function routeTable(){
  const base={
    schemaVersion:HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
    state:'STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED',
    blockers:[],
    stageRoutingPlanSha256:h('1'),
    routePolicySha256:h('2'),
    prototypeSha256:h('3'),
    denseBaselineContentSha256:h('4'),
    routerContentSha256:h('5'),
    runtimeRepresentationSha256:h('6'),
    hardwareClass:'synthetic-device-v1',
    qualityPreservationContractSha256:h('7'),
    maxActiveExpertsPerStage:2,
    maxStageTransitionPrefetchBytes:60_000_000,
    routes:[
      {
        stageId:'geometry-stage',stageKind:'GEOMETRY',
        progressStartBps:0,progressEndBps:3500,
        routeMode:'SHARED_PLUS_SPECIALISTS',sharedPathEnabled:true,
        routerContentSha256:h('5'),
        activeExperts:[{expertId:'expert-a',expertContentSha256:h('a')}],
        deterministicRouteSeedSha256:h('8'),
        deterministicRouteContractSha256:h('9'),
      },
      {
        stageId:'appearance-stage',stageKind:'APPEARANCE',
        progressStartBps:3500,progressEndBps:7500,
        routeMode:'SHARED_PLUS_SPECIALISTS',sharedPathEnabled:true,
        routerContentSha256:h('5'),
        activeExperts:[
          {expertId:'expert-a',expertContentSha256:h('a')},
          {expertId:'expert-b',expertContentSha256:h('b')},
        ],
        deterministicRouteSeedSha256:h('c'),
        deterministicRouteContractSha256:h('d'),
      },
      {
        stageId:'detail-stage',stageKind:'DETAIL',
        progressStartBps:7500,progressEndBps:10000,
        routeMode:'SHARED_PLUS_SPECIALISTS',sharedPathEnabled:true,
        routerContentSha256:h('5'),
        activeExperts:[{expertId:'expert-b',expertContentSha256:h('b')}],
        deterministicRouteSeedSha256:h('e'),
        deterministicRouteContractSha256:h('f'),
      },
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
  };
  const routeTableEvidenceSha256=await hsmeStageRouteTableV1Digest(base,hash);
  return {...base,routeTableEvidenceSha256};
}

async function schedule(table){
  const base={
    schemaVersion:HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA,
    state:'STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED',
    blockers:[],
    routeTableEvidenceSha256:table.routeTableEvidenceSha256,
    assetRosterSha256:h('1'),
    prefetchPolicySha256:h('2'),
    prototypeSha256:table.prototypeSha256,
    routerContentSha256:table.routerContentSha256,
    runtimeRepresentationSha256:table.runtimeRepresentationSha256,
    hardwareClass:table.hardwareClass,
    maxStageTransitionPrefetchBytes:table.maxStageTransitionPrefetchBytes,
    transitions:[
      {
        transitionId:'GEOMETRY_TO_APPEARANCE',
        fromStageId:'geometry-stage',fromStageKind:'GEOMETRY',
        toStageId:'appearance-stage',toStageKind:'APPEARANCE',
        triggerProgressBps:3000,
        targetRouterContentSha256:table.routerContentSha256,
        targetDeterministicRouteSeedSha256:h('c'),
        targetDeterministicRouteContractSha256:h('d'),
        assets:[{
          expertId:'expert-b',expertContentSha256:h('b'),
          artifactBytes:50_000_000,immutableAssetEvidenceSha256:h('3'),
        }],
        prefetchBytes:50_000_000,
        prefetchBudgetBytes:60_000_000,
        prefetchRequired:true,networkAllowed:false,deterministicOnly:true,
      },
      {
        transitionId:'APPEARANCE_TO_DETAIL',
        fromStageId:'appearance-stage',fromStageKind:'APPEARANCE',
        toStageId:'detail-stage',toStageKind:'DETAIL',
        triggerProgressBps:7000,
        targetRouterContentSha256:table.routerContentSha256,
        targetDeterministicRouteSeedSha256:h('e'),
        targetDeterministicRouteContractSha256:h('f'),
        assets:[],
        prefetchBytes:0,
        prefetchBudgetBytes:60_000_000,
        prefetchRequired:true,networkAllowed:false,deterministicOnly:true,
      },
    ],
    scheduleEvidenceSha256:h('0'),
    movementExecutionAllowed:false,
    ...authority(),
  };
  const scheduleEvidenceSha256=
    await hsmeStageTransitionPrefetchScheduleV1Digest(base,hash);
  return {...base,scheduleEvidenceSha256};
}

function rawPolicy(table,scheduleValue,overrides={}){
  return {
    schemaVersion:HSME_STAGE_ROUTING_CAMPAIGN_POLICY_V1_SCHEMA,
    routeTableEvidenceSha256:table.routeTableEvidenceSha256,
    scheduleEvidenceSha256:scheduleValue.scheduleEvidenceSha256,
    prototypeSha256:table.prototypeSha256,
    denseBaselineContentSha256:table.denseBaselineContentSha256,
    routerContentSha256:table.routerContentSha256,
    runtimeRepresentationSha256:table.runtimeRepresentationSha256,
    hardwareClass:table.hardwareClass,
    qualityPreservationContractSha256:table.qualityPreservationContractSha256,
    fixtureSetSha256:h('4'),
    evaluationContractSha256:h('5'),
    deterministicSeedContractSha256:h('6'),
    caseCount:20,
    qualityDimensions:[
      'SEMANTIC_ADHERENCE',
      'IDENTITY_PRESERVATION',
      'ANATOMY_ARTIFACT',
    ],
    hardPreservationDimensions:[
      'IDENTITY_PRESERVATION',
      'ANATOMY_ARTIFACT',
    ],
    maxWallClockUs:2_000_000,
    maxPeakMemoryBytes:2_000_000_000,
    maxFlashBytesMoved:2_000_000_000,
    maxRamBytesMoved:2_000_000_000,
    maxAcceleratorBytesMoved:2_000_000_000,
    maxTransitionStallUs:500_000,
    networkAllowed:false,
    sameFixtureAcrossVariants:true,
    sameSeedsAcrossVariants:true,
    sameRuntimeAcrossVariants:true,
    reviewState:'STAGE_ROUTING_CAMPAIGN_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

function quality(){
  return [
    {dimension:'ANATOMY_ARTIFACT',valueBps:9800},
    {dimension:'IDENTITY_PRESERVATION',valueBps:9600},
    {dimension:'SEMANTIC_ADHERENCE',valueBps:9500},
  ];
}

function hard(){
  return [
    {dimension:'ANATOMY_ARTIFACT',failureCount:0},
    {dimension:'IDENTITY_PRESERVATION',failureCount:1},
  ];
}

function row(variant,routeTableSha,scheduleSha,patch={}){
  const stage=variant==='STAGE_ROUTED';
  return {
    variant,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    wallClockUs:1_000_000,
    activeWeightsBytes:700_000_000,
    peakMemoryBytes:1_000_000_000,
    flashBytesMoved:500_000_000,
    ramBytesMoved:600_000_000,
    acceleratorBytesMoved:400_000_000,
    expertActivationCount:stage?60:0,
    transitionStallUs:stage?50_000:0,
    routerReplayIdentitySha256:stage?h('7'):h('8'),
    routeTableReplayIdentitySha256:stage?routeTableSha:'NONE',
    prefetchReplayIdentitySha256:stage?scheduleSha:'NONE',
    networkBytesDuringExecution:0,
    realTargetDeviceMeasurement:true,
    ...patch,
  };
}

function fakeHost(mode='OK'){
  const calls=[];
  return {
    calls,
    async executeExactStageRoutingCampaign(request){
      calls.push(request);
      if(mode==='THROW'){
        throw new Error('synthetic protected failure');
      }
      const failed=mode==='FAILED';
      const rows=failed?[]:[
        row(
          'STAGE_ROUTED',
          request.routeTableEvidenceSha256,
          request.scheduleEvidenceSha256,
          mode==='STAGE_OVER'
            ?{expertActivationCount:121}
            :mode==='RESOURCE_OVER'
              ?{wallClockUs:2_000_001}
              :mode==='QUALITY_DRIFT'
                ?{qualityVector:[
                  {dimension:'ANATOMY_ARTIFACT',valueBps:9800},
                  {dimension:'IDENTITY_PRESERVATION',valueBps:9600},
                ]}
                :{},
        ),
        row(
          'STATIC_SHARED_CONTROL',
          request.routeTableEvidenceSha256,
          request.scheduleEvidenceSha256,
          mode==='STATIC_ACTIVITY'
            ?{expertActivationCount:1}
            :{},
        ),
      ];
      const raw={
        schemaVersion:CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_V1_SCHEMA,
        state:failed
          ?'STAGE_ROUTING_CAMPAIGN_FAILED'
          :'STAGE_ROUTING_CAMPAIGN_COMPLETED',
        routeTableEvidenceSha256:request.routeTableEvidenceSha256,
        scheduleEvidenceSha256:request.scheduleEvidenceSha256,
        campaignPolicySha256:request.campaignPolicySha256,
        executionAttemptId:'synthetic-stage-routing-attempt-001',
        fixtureSetSha256:request.policy.fixtureSetSha256,
        evaluationContractSha256:request.policy.evaluationContractSha256,
        deterministicSeedContractSha256:
          request.policy.deterministicSeedContractSha256,
        runtimeRepresentationSha256:
          request.policy.runtimeRepresentationSha256,
        hardwareClass:request.policy.hardwareClass,
        caseCount:request.policy.caseCount,
        rows,
        processStarted:true,
        realTargetDeviceMeasurement:!failed,
        failureEvidenceSha256:failed?h('9'):'NONE',
        ...authority(),
        hostResultSha256:h('0'),
      };
      if(mode==='BAD_DIGEST'){
        return raw;
      }
      const hostResultSha256=
        await coreHsmeStageRoutingCampaignResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}

const trueTableOrigin={
  async verifyStageRouteTable(){return true;},
};
const falseTableOrigin={
  async verifyStageRouteTable(){return false;},
};
const trueScheduleOrigin={
  async verifyPrefetchSchedule(){return true;},
};
const falseScheduleOrigin={
  async verifyPrefetchSchedule(){return false;},
};
const truePolicyOrigin={
  async verifyCampaignPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifyCampaignPolicy(){return false;},
};
const trueResultOrigin={
  async verifyCampaignResult(){return true;},
};
const falseResultOrigin={
  async verifyCampaignResult(){return false;},
};

async function fixture(){
  const table=await routeTable();
  const scheduleValue=await schedule(table);
  const policy=rawPolicy(table,scheduleValue);
  const policySha=await hsmeStageRoutingCampaignPolicyV1Digest(policy,hash);
  return {table,schedule:scheduleValue,policy,policySha};
}

async function collect(f,host=fakeHost(),overrides={}){
  return collectHsmeStageRoutingComparisonMatrixV1(
    overrides.table??f.table,
    overrides.tableSha??f.table.routeTableEvidenceSha256,
    overrides.tableOrigin??trueTableOrigin,
    overrides.schedule??f.schedule,
    overrides.scheduleSha??f.schedule.scheduleEvidenceSha256,
    overrides.scheduleOrigin??trueScheduleOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    host,
    overrides.resultOrigin??trueResultOrigin,
    hash,
  );
}

test('same-fixture protected result yields canonical static vs stage-routed matrix',async()=>{
  const f=await fixture();
  const host=fakeHost();
  const matrix=await collect(f,host);

  assert.equal(
    matrix.state,
    'STAGE_ROUTING_COMPARISON_MATRIX_READY_NOT_DISPOSED',
  );
  assert.deepEqual(matrix.blockers,[]);
  assert.deepEqual(
    matrix.rows.map(value=>value.variant),
    ['STATIC_SHARED_CONTROL','STAGE_ROUTED'],
  );
  assert.equal(matrix.rows[0].expertActivationCount,0);
  assert.equal(matrix.rows[0].prefetchReplayIdentitySha256,'NONE');
  assert.equal(
    matrix.rows[1].routeTableReplayIdentitySha256,
    f.table.routeTableEvidenceSha256,
  );
  assert.equal(
    matrix.rows[1].prefetchReplayIdentitySha256,
    f.schedule.scheduleEvidenceSha256,
  );
  assert.equal(matrix.selectionAllowed,false);
  assert.equal(matrix.stageRoutingExecutionAllowed,false);
  assert.equal(matrix.inferenceExecutionAllowed,false);
  assert.equal(host.calls.length,1);
  assert.equal(Object.hasOwn(host.calls[0],'command'),false);
  assert.equal(Object.hasOwn(host.calls[0],'argv'),false);
  assert.equal(Object.hasOwn(host.calls[0],'providerId'),false);
  assert.equal(
    await hsmeStageRoutingComparisonMatrixV1Digest(matrix,hash),
    matrix.matrixEvidenceSha256,
  );
});

test('route-table schedule policy and host-result origins are independently mandatory',async()=>{
  const f=await fixture();
  const host=fakeHost();

  const a=await collect(f,host,{tableOrigin:falseTableOrigin});
  assert.equal(a.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(a.blockers.includes('STAGE_ROUTING_MATRIX_ROUTE_TABLE_ORIGIN_UNVERIFIED'));

  const b=await collect(f,host,{scheduleOrigin:falseScheduleOrigin});
  assert.equal(b.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(b.blockers.includes('STAGE_ROUTING_MATRIX_SCHEDULE_ORIGIN_UNVERIFIED'));

  const c=await collect(f,host,{policyOrigin:falsePolicyOrigin});
  assert.equal(c.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(c.blockers.includes('STAGE_ROUTING_MATRIX_POLICY_ORIGIN_UNVERIFIED'));

  const d=await collect(f,fakeHost(),{resultOrigin:falseResultOrigin});
  assert.equal(d.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(d.blockers.includes('STAGE_ROUTING_MATRIX_HOST_RESULT_ORIGIN_UNVERIFIED'));
});

test('static control cannot activate specialists or transition prefetch',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('STATIC_ACTIVITY'));
  assert.equal(result.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'STAGE_ROUTING_MATRIX_STATIC_CONTROL_ACTIVITY_INVALID',
    ),
  );
});

test('stage-routed expert activations remain bounded by cases times Top-K times three stages',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('STAGE_OVER'));
  assert.equal(result.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes(
      'STAGE_ROUTING_MATRIX_STAGE_ACTIVATION_CAP_EXCEEDED',
    ),
  );
});

test('quality dimension drift cannot produce comparable evidence',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('QUALITY_DRIFT'));
  assert.equal(result.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('STAGE_ROUTING_MATRIX_QUALITY_DIMENSION_MISMATCH'),
  );
});

test('wall-clock memory bytes and stall ceilings are enforced before READY',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('RESOURCE_OVER'));
  assert.equal(result.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('STAGE_ROUTING_MATRIX_RESOURCE_CEILING_EXCEEDED'),
  );
});

test('failed protected campaign produces FAILED evidence without matrix digest',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('FAILED'));
  assert.equal(result.state,'STAGE_ROUTING_COMPARISON_MATRIX_FAILED');
  assert.equal(result.rows.length,0);
  assert.equal(result.matrixEvidenceSha256,'UNKNOWN');
});

test('host rehash drift and thrown execution fail closed distinctly',async()=>{
  const f=await fixture();

  const badDigest=await collect(f,fakeHost('BAD_DIGEST'));
  assert.equal(badDigest.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
  assert.ok(
    badDigest.blockers.includes(
      'STAGE_ROUTING_MATRIX_HOST_RESULT_REHASH_MISMATCH',
    ),
  );

  const thrown=await collect(f,fakeHost('THROW'));
  assert.equal(thrown.state,'STAGE_ROUTING_COMPARISON_MATRIX_FAILED');
  assert.ok(
    thrown.blockers.includes('STAGE_ROUTING_MATRIX_HOST_EXECUTION_FAILED'),
  );
});

test('campaign policy cannot enable network authority or post-hoc fields',async()=>{
  const f=await fixture();
  for(const policy of [
    {...f.policy,networkAllowed:true},
    {...f.policy,selectionAllowed:true},
    {...f.policy,weightedScoreWeights:{latency:0.5,quality:0.5}},
  ]){
    const result=await collect(f,fakeHost(),{policy,policySha:h('0')});
    assert.equal(result.state,'STAGE_ROUTING_COMPARISON_MATRIX_INVALID');
    assert.ok(result.blockers.includes('STAGE_ROUTING_MATRIX_POLICY_INVALID'));
  }
});
