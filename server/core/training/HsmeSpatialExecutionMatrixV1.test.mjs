import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_SPATIAL_MEASUREMENTS_V1,
  HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeSpatialSparsityExperimentPlanV1Digest,
} from './HsmeSpatialSparsityExperimentPlanV1.ts';
import {
  HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA,
  hsmeSpatialComputeMapRosterV1Digest,
} from './HsmeSpatialComputeMapRosterV1.ts';
import {
  CORE_HSME_SPATIAL_EXECUTION_RESULT_V1_SCHEMA,
  HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_V1_SCHEMA,
  collectHsmeSpatialExecutionMatrixV1,
  coreHsmeSpatialExecutionResultV1Digest,
  hsmeSpatialExecutionCampaignPolicyV1Digest,
  hsmeSpatialExecutionMatrixV1Digest,
} from './HsmeSpatialExecutionMatrixV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    selectionAllowed:false,
    spatialExecutionAllowed:false,
    spatialMapMutationAllowed:false,
    inferenceExecutionAllowed:false,
    fashionGeometryAuthorityGranted:false,
    projectMutationAllowed:false,
    artifactAuthorityGranted:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function planAuthority(){
  const {selectionAllowed:_selection,winnerSelectionAllowed:_winner,...rest}=
    authority();
  return rest;
}

async function plan(){
  const base={
    schemaVersion:HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    stageRoutingPlanSha256:h('1'),
    regionFixtureSha256:h('2'),
    spatialPolicySha256:h('3'),
    prototypeSha256:h('4'),
    denseBaselineContentSha256:h('5'),
    runtimeRepresentationSha256:h('6'),
    hardwareClass:'synthetic-mobile-device-v1',
    fixtureSetSha256:h('7'),
    spatialRegionEvidenceSha256:h('8'),
    caseCount:20,
    gridWidth:32,
    gridHeight:32,
    regions:[
      {role:'CRITICAL_IDENTITY',evidenceSha256:h('9'),coveredCellCount:120},
      {role:'CRITICAL_GARMENT_LOGO_PATTERN',evidenceSha256:h('a'),coveredCellCount:180},
      {role:'CRITICAL_HANDS_ANATOMY',evidenceSha256:h('b'),coveredCellCount:80},
      {role:'CRITICAL_FINE_TEXTURE',evidenceSha256:h('c'),coveredCellCount:100},
      {role:'LOW_INFORMATION_BACKGROUND',evidenceSha256:h('d'),coveredCellCount:300},
    ],
    variants:[
      'FULL_SPATIAL_CONTROL',
      'PROTECTED_REGION_CHEAP_BACKGROUND',
      'BOUNDED_BACKGROUND_PRUNING',
    ],
    protectedRegionRoles:[
      'CRITICAL_IDENTITY',
      'CRITICAL_GARMENT_LOGO_PATTERN',
      'CRITICAL_HANDS_ANATOMY',
      'CRITICAL_FINE_TEXTURE',
    ],
    cheapPathAllowedRoles:['LOW_INFORMATION_BACKGROUND'],
    prunableRoles:['LOW_INFORMATION_BACKGROUND'],
    maxCheapPathAreaBps:3000,
    maxPrunedAreaBps:1000,
    minFullComputeAreaBps:7000,
    qualityDimensions:[
      'ANATOMY_ARTIFACT',
      'GARMENT_LOGO_PATTERN',
      'IDENTITY_PERSON',
      'NON_TARGET_PRESERVATION',
      'SEMANTIC_ADHERENCE',
    ],
    hardPreservationDimensions:[
      'ANATOMY_ARTIFACT',
      'GARMENT_LOGO_PATTERN',
      'IDENTITY_PERSON',
      'NON_TARGET_PRESERVATION',
    ],
    requiredMeasurements:[...HSME_SPATIAL_MEASUREMENTS_V1],
    deterministicSpatialMapRequired:true,
    sharedPathRequired:true,
    planEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const planEvidenceSha256=
    await hsmeSpatialSparsityExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}

function candidate(p,variant){
  const values={
    FULL_SPATIAL_CONTROL:{
      spatialMapSha256:h('a'),
      deterministicReplayIdentitySha256:h('1'),
      fullComputeAreaBps:10000,
      cheapPathAreaBps:0,
      prunedAreaBps:0,
      fullComputeTokenWork:1024,
      cheapPathTokenWork:0,
      prunedTokenWork:0,
    },
    PROTECTED_REGION_CHEAP_BACKGROUND:{
      spatialMapSha256:h('b'),
      deterministicReplayIdentitySha256:h('2'),
      fullComputeAreaBps:7500,
      cheapPathAreaBps:2500,
      prunedAreaBps:0,
      fullComputeTokenWork:768,
      cheapPathTokenWork:256,
      prunedTokenWork:0,
    },
    BOUNDED_BACKGROUND_PRUNING:{
      spatialMapSha256:h('c'),
      deterministicReplayIdentitySha256:h('3'),
      fullComputeAreaBps:9000,
      cheapPathAreaBps:0,
      prunedAreaBps:1000,
      fullComputeTokenWork:900,
      cheapPathTokenWork:0,
      prunedTokenWork:124,
    },
  }[variant];
  const backgroundAction=
    variant==='FULL_SPATIAL_CONTROL'
      ?'FULL_SHARED'
      :variant==='PROTECTED_REGION_CHEAP_BACKGROUND'
        ?'CHEAP_SHARED'
        :'PRUNED';
  const roles=[
    'CRITICAL_IDENTITY',
    'CRITICAL_GARMENT_LOGO_PATTERN',
    'CRITICAL_HANDS_ANATOMY',
    'CRITICAL_FINE_TEXTURE',
    'LOW_INFORMATION_BACKGROUND',
  ];
  return {
    variant,
    experimentPlanSha256:p.planEvidenceSha256,
    spatialMapEvidenceSha256:h(
      variant==='FULL_SPATIAL_CONTROL'
        ?'d'
        :variant==='PROTECTED_REGION_CHEAP_BACKGROUND'
          ?'e'
          :'f',
    ),
    gridWidth:p.gridWidth,
    gridHeight:p.gridHeight,
    regionActions:roles.map((role,index)=>({
      role,
      action:role==='LOW_INFORMATION_BACKGROUND'
        ?backgroundAction
        :'FULL_SHARED',
      actionEvidenceSha256:h(String((index+1)%10)),
    })),
    reviewedBeforeExecution:true,
    ...values,
  };
}

async function roster(p){
  const base={
    schemaVersion:HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA,
    state:'SPATIAL_COMPUTE_MAP_ROSTER_FROZEN_NOT_EXECUTED',
    blockers:[],
    experimentPlanSha256:p.planEvidenceSha256,
    mapSetSha256:h('9'),
    prototypeSha256:p.prototypeSha256,
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,
    fixtureSetSha256:p.fixtureSetSha256,
    gridWidth:p.gridWidth,
    gridHeight:p.gridHeight,
    candidates:[
      candidate(p,'FULL_SPATIAL_CONTROL'),
      candidate(p,'PROTECTED_REGION_CHEAP_BACKGROUND'),
      candidate(p,'BOUNDED_BACKGROUND_PRUNING'),
    ],
    rosterEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const rosterEvidenceSha256=
    await hsmeSpatialComputeMapRosterV1Digest(base,hash);
  return {...base,rosterEvidenceSha256};
}

function rawPolicy(p,r,overrides={}){
  return {
    schemaVersion:HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_V1_SCHEMA,
    experimentPlanSha256:p.planEvidenceSha256,
    computeMapRosterSha256:r.rosterEvidenceSha256,
    prototypeSha256:p.prototypeSha256,
    denseBaselineContentSha256:p.denseBaselineContentSha256,
    fixtureSetSha256:p.fixtureSetSha256,
    runtimeRepresentationSha256:p.runtimeRepresentationSha256,
    hardwareClass:p.hardwareClass,
    evaluationContractSha256:h('e'),
    deterministicSeedContractSha256:h('f'),
    caseCount:p.caseCount,
    qualityDimensions:[...p.qualityDimensions].reverse(),
    hardPreservationDimensions:
      [...p.hardPreservationDimensions].reverse(),
    maxWallClockUs:2_000_000,
    maxPeakMemoryBytes:2_000_000_000,
    maxFlashBytesMoved:2_000_000_000,
    maxRamBytesMoved:2_000_000_000,
    maxAcceleratorBytesMoved:2_000_000_000,
    maxNetworkBytesDuringExecution:0,
    sameFixtureAcrossVariants:true,
    sameSeedsAcrossVariants:true,
    sameRuntimeAcrossVariants:true,
    reviewState:'SPATIAL_EXECUTION_CAMPAIGN_REVIEWED',
    ...authority(),
    ...overrides,
  };
}

function quality(overrides={}){
  const values={
    ANATOMY_ARTIFACT:9800,
    GARMENT_LOGO_PATTERN:9700,
    IDENTITY_PERSON:9750,
    NON_TARGET_PRESERVATION:9650,
    SEMANTIC_ADHERENCE:9600,
    ...overrides,
  };
  return Object.keys(values).sort().map(dimension=>({
    dimension,
    valueBps:values[dimension],
  }));
}

function hard(overrides={}){
  const values={
    ANATOMY_ARTIFACT:0,
    GARMENT_LOGO_PATTERN:0,
    IDENTITY_PERSON:0,
    NON_TARGET_PRESERVATION:0,
    ...overrides,
  };
  return Object.keys(values).sort().map(dimension=>({
    dimension,
    failureCount:values[dimension],
  }));
}

function measurement(c,patch={}){
  const resource={
    FULL_SPATIAL_CONTROL:{
      wallClockUs:1_000_000,
      activeWeightsBytes:700_000_000,
      peakMemoryBytes:1_000_000_000,
      flashBytesMoved:500_000_000,
      ramBytesMoved:600_000_000,
      acceleratorBytesMoved:400_000_000,
    },
    PROTECTED_REGION_CHEAP_BACKGROUND:{
      wallClockUs:820_000,
      activeWeightsBytes:680_000_000,
      peakMemoryBytes:950_000_000,
      flashBytesMoved:420_000_000,
      ramBytesMoved:500_000_000,
      acceleratorBytesMoved:330_000_000,
    },
    BOUNDED_BACKGROUND_PRUNING:{
      wallClockUs:780_000,
      activeWeightsBytes:670_000_000,
      peakMemoryBytes:930_000_000,
      flashBytesMoved:400_000_000,
      ramBytesMoved:470_000_000,
      acceleratorBytesMoved:300_000_000,
    },
  }[c.variant];
  return {
    variant:c.variant,
    implementationSha256:c.spatialMapSha256,
    mapReplayIdentitySha256:c.deterministicReplayIdentitySha256,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    fullComputeTokenWork:c.fullComputeTokenWork,
    cheapPathTokenWork:c.cheapPathTokenWork,
    prunedTokenWork:c.prunedTokenWork,
    networkBytesDuringExecution:0,
    realTargetDeviceMeasurement:true,
    ...resource,
    ...patch,
  };
}

function fakeHost(mode='OK'){
  const calls=[];
  return {
    calls,
    async executeExactSpatialCampaign(request){
      calls.push(request);
      if(mode==='THROW'){
        throw new Error('synthetic protected spatial failure');
      }
      const failed=mode==='FAILED';
      const rows=failed?[]:[
        measurement(
          request.computeMapRoster.candidates[2],
          mode==='RESOURCE_OVER'?{wallClockUs:2_000_001}:{},
        ),
        measurement(
          request.computeMapRoster.candidates[0],
          mode==='CONTROL_WORK'
            ?{cheapPathTokenWork:1,fullComputeTokenWork:1023}
            :{},
        ),
        measurement(
          request.computeMapRoster.candidates[1],
          mode==='MAP_DRIFT'
            ?{implementationSha256:h('f')}
            :mode==='DIMENSION_DRIFT'
              ?{
                qualityVector:quality().filter(
                  value=>value.dimension!=='SEMANTIC_ADHERENCE',
                ),
              }
              :{},
        ),
      ];
      const raw={
        schemaVersion:CORE_HSME_SPATIAL_EXECUTION_RESULT_V1_SCHEMA,
        state:failed
          ?'SPATIAL_EXECUTION_CAMPAIGN_FAILED'
          :'SPATIAL_EXECUTION_CAMPAIGN_COMPLETED',
        experimentPlanSha256:request.experimentPlanSha256,
        computeMapRosterSha256:request.computeMapRosterSha256,
        campaignPolicySha256:request.campaignPolicySha256,
        executionAttemptId:'synthetic-spatial-attempt-001',
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
        failureEvidenceSha256:failed?h('d'):'NONE',
        ...authority(),
        hostResultSha256:h('0'),
      };
      if(mode==='BAD_DIGEST'){
        return raw;
      }
      const hostResultSha256=
        await coreHsmeSpatialExecutionResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}

const truePlanOrigin={
  async verifySpatialExperimentPlan(){return true;},
};
const falsePlanOrigin={
  async verifySpatialExperimentPlan(){return false;},
};
const trueRosterOrigin={
  async verifySpatialComputeMapRoster(){return true;},
};
const falseRosterOrigin={
  async verifySpatialComputeMapRoster(){return false;},
};
const truePolicyOrigin={
  async verifySpatialExecutionCampaignPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifySpatialExecutionCampaignPolicy(){return false;},
};
const trueResultOrigin={
  async verifySpatialExecutionResult(){return true;},
};
const falseResultOrigin={
  async verifySpatialExecutionResult(){return false;},
};

async function fixture(){
  const p=await plan();
  const r=await roster(p);
  const policy=rawPolicy(p,r);
  const policySha=
    await hsmeSpatialExecutionCampaignPolicyV1Digest(policy,hash);
  return {p,r,policy,policySha};
}

async function collect(f,host=fakeHost(),overrides={}){
  const selectedPlan=overrides.plan??f.p;
  const selectedRoster=overrides.roster??f.r;
  return collectHsmeSpatialExecutionMatrixV1(
    selectedPlan,
    overrides.planSha??selectedPlan.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    selectedRoster,
    overrides.rosterSha??selectedRoster.rosterEvidenceSha256,
    overrides.rosterOrigin??trueRosterOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    host,
    overrides.resultOrigin??trueResultOrigin,
    hash,
  );
}

test('protected same-fixture campaign yields canonical multi-variant READY matrix',async()=>{
  const f=await fixture();
  const host=fakeHost();
  const matrix=await collect(f,host);

  assert.equal(matrix.state,'SPATIAL_EXECUTION_MATRIX_READY_NOT_DISPOSED');
  assert.deepEqual(matrix.blockers,[]);
  assert.deepEqual(
    matrix.rows.map(value=>value.variant),
    [
      'FULL_SPATIAL_CONTROL',
      'PROTECTED_REGION_CHEAP_BACKGROUND',
      'BOUNDED_BACKGROUND_PRUNING',
    ],
  );
  assert.equal(matrix.rows[0].cheapPathTokenWork,0);
  assert.equal(matrix.rows[0].prunedTokenWork,0);
  assert.equal(
    matrix.rows[1].implementationSha256,
    f.r.candidates[1].spatialMapSha256,
  );
  assert.equal(
    matrix.rows[2].mapReplayIdentitySha256,
    f.r.candidates[2].deterministicReplayIdentitySha256,
  );
  assert.equal(matrix.selectionAllowed,false);
  assert.equal(matrix.spatialExecutionAllowed,false);
  assert.equal(matrix.fashionGeometryAuthorityGranted,false);
  assert.equal(host.calls.length,1);
  assert.equal(Object.hasOwn(host.calls[0],'command'),false);
  assert.equal(Object.hasOwn(host.calls[0],'argv'),false);
  assert.equal(Object.hasOwn(host.calls[0],'providerId'),false);
  assert.equal(
    await hsmeSpatialExecutionMatrixV1Digest(matrix,hash),
    matrix.matrixEvidenceSha256,
  );
});

test('plan roster policy and host-result origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await collect(f,fakeHost(),{planOrigin:falsePlanOrigin});
  assert.equal(a.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(a.blockers.includes('SPATIAL_EXECUTION_PLAN_ORIGIN_UNVERIFIED'));

  const b=await collect(f,fakeHost(),{rosterOrigin:falseRosterOrigin});
  assert.equal(b.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(b.blockers.includes('SPATIAL_EXECUTION_ROSTER_ORIGIN_UNVERIFIED'));

  const c=await collect(f,fakeHost(),{policyOrigin:falsePolicyOrigin});
  assert.equal(c.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(
    c.blockers.includes(
      'SPATIAL_EXECUTION_CAMPAIGN_POLICY_ORIGIN_UNVERIFIED',
    ),
  );

  const d=await collect(f,fakeHost(),{resultOrigin:falseResultOrigin});
  assert.equal(d.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(
    d.blockers.includes('SPATIAL_EXECUTION_HOST_RESULT_ORIGIN_UNVERIFIED'),
  );
});

test('full spatial control cannot report cheap or pruned token work',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('CONTROL_WORK'));
  assert.equal(result.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(
    result.blockers.some(value=>
      value==='SPATIAL_EXECUTION_TOKEN_WORK_BINDING_MISMATCH'
      ||value==='SPATIAL_EXECUTION_FULL_CONTROL_SHAPE_INVALID'
    ),
  );
});

test('every row must bind the exact immutable spatial map and replay identity',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('MAP_DRIFT'));
  assert.equal(result.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('SPATIAL_EXECUTION_MAP_REPLAY_BINDING_MISMATCH'),
  );
});

test('quality and hard-preservation dimensions must exactly match the frozen plan',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('DIMENSION_DRIFT'));
  assert.equal(result.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('SPATIAL_EXECUTION_QUALITY_DIMENSION_MISMATCH'),
  );
});

test('wall-clock memory and bytes-moved ceilings fail before READY',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('RESOURCE_OVER'));
  assert.equal(result.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(
    result.blockers.includes('SPATIAL_EXECUTION_RESOURCE_CEILING_EXCEEDED'),
  );
});

test('failed protected campaign produces FAILED evidence without matrix digest',async()=>{
  const f=await fixture();
  const result=await collect(f,fakeHost('FAILED'));
  assert.equal(result.state,'SPATIAL_EXECUTION_MATRIX_FAILED');
  assert.equal(result.rows.length,0);
  assert.equal(result.matrixEvidenceSha256,'UNKNOWN');
});

test('host rehash drift and thrown execution fail closed distinctly',async()=>{
  const f=await fixture();

  const bad=await collect(f,fakeHost('BAD_DIGEST'));
  assert.equal(bad.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
  assert.ok(
    bad.blockers.includes('SPATIAL_EXECUTION_HOST_RESULT_REHASH_MISMATCH'),
  );

  const thrown=await collect(f,fakeHost('THROW'));
  assert.equal(thrown.state,'SPATIAL_EXECUTION_MATRIX_FAILED');
  assert.ok(
    thrown.blockers.includes('SPATIAL_EXECUTION_HOST_EXECUTION_FAILED'),
  );
});

test('campaign policy cannot enable network authority or post-hoc fields',async()=>{
  const f=await fixture();

  for(const policy of [
    {...f.policy,maxNetworkBytesDuringExecution:1},
    {...f.policy,selectionAllowed:true},
    {...f.policy,weightedTokenScore:{quality:0.5,work:0.5}},
  ]){
    const result=await collect(f,fakeHost(),{
      policy,
      policySha:h('0'),
    });
    assert.equal(result.state,'SPATIAL_EXECUTION_MATRIX_INVALID');
    assert.ok(
      result.blockers.includes('SPATIAL_EXECUTION_CAMPAIGN_POLICY_INVALID'),
    );
  }
});
