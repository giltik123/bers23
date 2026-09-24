import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_STAGE_ROUTING_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeStageRoutingExperimentPlanV1Digest,
} from './HsmeStageRoutingExperimentPlanV1.ts';
import {
  HSME_SPATIAL_MEASUREMENTS_V1,
  HSME_SPATIAL_REGION_FIXTURE_V1_SCHEMA,
  HSME_SPATIAL_SPARSITY_POLICY_V1_SCHEMA,
  freezeHsmeSpatialSparsityExperimentPlanV1,
  hsmeSpatialRegionFixtureV1Digest,
  hsmeSpatialSparsityExperimentPlanV1Digest,
  hsmeSpatialSparsityPolicyV1Digest,
} from './HsmeSpatialSparsityExperimentPlanV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function stageAuthority(){
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

function spatialAuthority(){
  return {
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
  };
}

async function stagePlan(){
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
    expertIds:['expert-a','expert-b'],
    expertContentSha256s:[h('7'),h('8')],
    runtimeRepresentationSha256:h('9'),
    hardwareClass:'synthetic-mobile-device-v1',
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
        qualitySensitivityEvidenceSha256:h('a'),
        specializationEvidenceSha256:h('b'),
        deterministicStageIdentitySha256:h('c'),
        runtimeRepresentationSha256:h('9'),
        hardwareClass:'synthetic-mobile-device-v1',
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
        qualitySensitivityEvidenceSha256:h('d'),
        specializationEvidenceSha256:h('e'),
        deterministicStageIdentitySha256:h('f'),
        runtimeRepresentationSha256:h('9'),
        hardwareClass:'synthetic-mobile-device-v1',
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
        qualitySensitivityEvidenceSha256:h('1'),
        specializationEvidenceSha256:h('2'),
        deterministicStageIdentitySha256:h('3'),
        runtimeRepresentationSha256:h('9'),
        hardwareClass:'synthetic-mobile-device-v1',
      },
    ],
    maxActiveExpertsPerStage:2,
    maxStageTransitionPrefetchBytes:60_000_000,
    qualityPreservationContractSha256:h('4'),
    deterministicStageBoundariesRequired:true,
    deterministicRoutingRequired:true,
    nextStagePrefetchRequired:true,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    planEvidenceSha256:h('0'),
    ...stageAuthority(),
  };
  const planEvidenceSha256=
    await hsmeStageRoutingExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}

function rawFixture(plan,overrides={}){
  return {
    schemaVersion:HSME_SPATIAL_REGION_FIXTURE_V1_SCHEMA,
    stageRoutingPlanSha256:plan.planEvidenceSha256,
    fixtureSetSha256:h('5'),
    spatialRegionEvidenceSha256:h('6'),
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,
    caseCount:20,
    gridWidth:32,
    gridHeight:32,
    regions:[
      {
        role:'LOW_INFORMATION_BACKGROUND',
        evidenceSha256:h('b'),
        coveredCellCount:300,
      },
      {
        role:'CRITICAL_FINE_TEXTURE',
        evidenceSha256:h('a'),
        coveredCellCount:100,
      },
      {
        role:'CRITICAL_HANDS_ANATOMY',
        evidenceSha256:h('9'),
        coveredCellCount:80,
      },
      {
        role:'CRITICAL_GARMENT_LOGO_PATTERN',
        evidenceSha256:h('8'),
        coveredCellCount:180,
      },
      {
        role:'CRITICAL_IDENTITY',
        evidenceSha256:h('7'),
        coveredCellCount:120,
      },
    ],
    realReviewedRegionEvidence:true,
    ...spatialAuthority(),
    ...overrides,
  };
}

function rawPolicy(plan,fixtureSha,overrides={}){
  return {
    schemaVersion:HSME_SPATIAL_SPARSITY_POLICY_V1_SCHEMA,
    stageRoutingPlanSha256:plan.planEvidenceSha256,
    regionFixtureSha256:fixtureSha,
    prototypeSha256:plan.prototypeSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,
    variants:[
      'BOUNDED_BACKGROUND_PRUNING',
      'FULL_SPATIAL_CONTROL',
      'PROTECTED_REGION_CHEAP_BACKGROUND',
    ],
    protectedRegionRoles:[
      'CRITICAL_FINE_TEXTURE',
      'CRITICAL_IDENTITY',
      'CRITICAL_HANDS_ANATOMY',
      'CRITICAL_GARMENT_LOGO_PATTERN',
    ],
    cheapPathAllowedRoles:['LOW_INFORMATION_BACKGROUND'],
    prunableRoles:['LOW_INFORMATION_BACKGROUND'],
    maxCheapPathAreaBps:3000,
    maxPrunedAreaBps:1000,
    minFullComputeAreaBps:7000,
    deterministicSpatialMapRequired:true,
    sharedPathRequired:true,
    postHocThresholdMutationAllowed:false,
    qualityDimensions:[
      'SEMANTIC_ADHERENCE',
      'IDENTITY_PERSON',
      'GARMENT_LOGO_PATTERN',
      'NON_TARGET_PRESERVATION',
      'ANATOMY_ARTIFACT',
    ],
    hardPreservationDimensions:[
      'IDENTITY_PERSON',
      'GARMENT_LOGO_PATTERN',
      'NON_TARGET_PRESERVATION',
      'ANATOMY_ARTIFACT',
    ],
    requiredMeasurements:[...HSME_SPATIAL_MEASUREMENTS_V1].reverse(),
    reviewState:'SPATIAL_SPARSITY_POLICY_REVIEWED',
    ...spatialAuthority(),
    ...overrides,
  };
}

const trueStageOrigin={
  async verifyStageRoutingPlan(){return true;},
};
const falseStageOrigin={
  async verifyStageRoutingPlan(){return false;},
};
const trueFixtureOrigin={
  async verifySpatialRegionFixture(){return true;},
};
const falseFixtureOrigin={
  async verifySpatialRegionFixture(){return false;},
};
const truePolicyOrigin={
  async verifySpatialSparsityPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifySpatialSparsityPolicy(){return false;},
};

async function fixture(){
  const plan=await stagePlan();
  const regionFixture=rawFixture(plan);
  const regionFixtureSha256=
    await hsmeSpatialRegionFixtureV1Digest(regionFixture,hash);
  const policy=rawPolicy(plan,regionFixtureSha256);
  const policySha=await hsmeSpatialSparsityPolicyV1Digest(policy,hash);
  return {plan,regionFixture,regionFixtureSha256,policy,policySha};
}

async function freeze(f,overrides={}){
  return freezeHsmeSpatialSparsityExperimentPlanV1(
    overrides.plan??f.plan,
    overrides.planSha??f.plan.planEvidenceSha256,
    overrides.stageOrigin??trueStageOrigin,
    overrides.regionFixture??f.regionFixture,
    overrides.fixtureSha??f.regionFixtureSha256,
    overrides.fixtureOrigin??trueFixtureOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

test('reviewed region evidence and frozen budgets yield deterministic no-execution spatial plan',async()=>{
  const f=await fixture();
  const first=await freeze(f);

  const reversedFixture={
    ...f.regionFixture,
    regions:[...f.regionFixture.regions].reverse(),
  };
  const reversedFixtureSha=
    await hsmeSpatialRegionFixtureV1Digest(reversedFixture,hash);
  const reversedPolicy={
    ...rawPolicy(f.plan,reversedFixtureSha),
    variants:[...f.policy.variants].reverse(),
    qualityDimensions:[...f.policy.qualityDimensions].reverse(),
    hardPreservationDimensions:
      [...f.policy.hardPreservationDimensions].reverse(),
  };
  const reversedPolicySha=
    await hsmeSpatialSparsityPolicyV1Digest(reversedPolicy,hash);
  const second=await freeze(f,{
    regionFixture:reversedFixture,
    fixtureSha:reversedFixtureSha,
    policy:reversedPolicy,
    policySha:reversedPolicySha,
  });

  assert.equal(first.state,'SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED');
  assert.deepEqual(first.blockers,[]);
  assert.deepEqual(
    first.regions.map(value=>value.role),
    [
      'CRITICAL_IDENTITY',
      'CRITICAL_GARMENT_LOGO_PATTERN',
      'CRITICAL_HANDS_ANATOMY',
      'CRITICAL_FINE_TEXTURE',
      'LOW_INFORMATION_BACKGROUND',
    ],
  );
  assert.deepEqual(
    first.variants,
    [
      'FULL_SPATIAL_CONTROL',
      'PROTECTED_REGION_CHEAP_BACKGROUND',
      'BOUNDED_BACKGROUND_PRUNING',
    ],
  );
  assert.deepEqual(first.cheapPathAllowedRoles,['LOW_INFORMATION_BACKGROUND']);
  assert.deepEqual(first.prunableRoles,['LOW_INFORMATION_BACKGROUND']);
  assert.equal(first.maxCheapPathAreaBps,3000);
  assert.equal(first.maxPrunedAreaBps,1000);
  assert.equal(first.minFullComputeAreaBps,7000);
  assert.equal(first.spatialExecutionAllowed,false);
  assert.equal(first.spatialMapMutationAllowed,false);
  assert.equal(first.fashionGeometryAuthorityGranted,false);
  assert.equal(first.artifactAuthorityGranted,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeSpatialSparsityExperimentPlanV1Digest(first,hash),
    first.planEvidenceSha256,
  );
});

test('non-frozen stage substrate remains BLOCKED',async()=>{
  const f=await fixture();
  const plan={
    ...f.plan,
    state:'STAGE_ROUTING_PLAN_BLOCKED',
    blockers:['REAL_STAGE_EVIDENCE_REQUIRED'],
    planEvidenceSha256:'UNKNOWN',
  };
  const result=await freeze(f,{plan});
  assert.equal(result.state,'SPATIAL_SPARSITY_PLAN_BLOCKED');
  assert.ok(
    result.blockers.includes('SPATIAL_SPARSITY_FROZEN_SUBSTRATE_REQUIRED'),
  );
});

test('stage fixture and policy exact origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await freeze(f,{stageOrigin:falseStageOrigin});
  assert.equal(a.state,'SPATIAL_SPARSITY_PLAN_INVALID');
  assert.ok(
    a.blockers.includes('SPATIAL_SPARSITY_STAGE_PLAN_ORIGIN_UNVERIFIED'),
  );

  const b=await freeze(f,{fixtureOrigin:falseFixtureOrigin});
  assert.equal(b.state,'SPATIAL_SPARSITY_PLAN_INVALID');
  assert.ok(
    b.blockers.includes('SPATIAL_SPARSITY_REGION_FIXTURE_ORIGIN_UNVERIFIED'),
  );

  const c=await freeze(f,{policyOrigin:falsePolicyOrigin});
  assert.equal(c.state,'SPATIAL_SPARSITY_PLAN_INVALID');
  assert.ok(
    c.blockers.includes('SPATIAL_SPARSITY_POLICY_ORIGIN_UNVERIFIED'),
  );
});

test('region fixture requires every reviewed critical/background role exactly once',async()=>{
  const f=await fixture();
  const regionFixture={
    ...f.regionFixture,
    regions:f.regionFixture.regions.slice(0,4),
  };
  const result=await freeze(f,{
    regionFixture,
    fixtureSha:h('0'),
  });
  assert.equal(result.state,'SPATIAL_SPARSITY_PLAN_INVALID');
  assert.ok(
    result.blockers.includes('SPATIAL_SPARSITY_REGION_FIXTURE_INVALID'),
  );
});

test('critical roles can never be cheap-path or prunable roles',async()=>{
  const f=await fixture();

  for(const policy of [
    rawPolicy(f.plan,f.regionFixtureSha256,{
      cheapPathAllowedRoles:['CRITICAL_IDENTITY'],
    }),
    rawPolicy(f.plan,f.regionFixtureSha256,{
      prunableRoles:['CRITICAL_GARMENT_LOGO_PATTERN'],
    }),
  ]){
    const result=await freeze(f,{policy,policySha:h('0')});
    assert.equal(result.state,'SPATIAL_SPARSITY_PLAN_INVALID');
    assert.ok(result.blockers.includes('SPATIAL_SPARSITY_POLICY_INVALID'));
  }
});

test('mandatory identity Fashion non-target and anatomy dimensions cannot be removed',async()=>{
  const f=await fixture();
  for(const field of ['qualityDimensions','hardPreservationDimensions']){
    const policy=rawPolicy(f.plan,f.regionFixtureSha256,{
      [field]:f.policy[field].filter(
        value=>value!=='GARMENT_LOGO_PATTERN',
      ),
    });
    const result=await freeze(f,{policy,policySha:h('0')});
    assert.equal(result.state,'SPATIAL_SPARSITY_PLAN_INVALID');
    assert.ok(result.blockers.includes('SPATIAL_SPARSITY_POLICY_INVALID'));
  }
});

test('cheap/pruned/full-compute area budgets are frozen and internally consistent',async()=>{
  const f=await fixture();
  for(const overrides of [
    {maxCheapPathAreaBps:4000,minFullComputeAreaBps:7000},
    {maxPrunedAreaBps:3500,maxCheapPathAreaBps:3000},
    {
      variants:[
        'FULL_SPATIAL_CONTROL',
        'PROTECTED_REGION_CHEAP_BACKGROUND',
      ],
      maxPrunedAreaBps:1000,
      prunableRoles:['LOW_INFORMATION_BACKGROUND'],
    },
  ]){
    const policy=rawPolicy(f.plan,f.regionFixtureSha256,overrides);
    const result=await freeze(f,{policy,policySha:h('0')});
    assert.equal(result.state,'SPATIAL_SPARSITY_PLAN_INVALID');
    assert.ok(result.blockers.includes('SPATIAL_SPARSITY_POLICY_INVALID'));
  }
});

test('fixture policy prototype runtime and device rebinding fail closed',async()=>{
  const f=await fixture();

  const regionFixture={
    ...f.regionFixture,
    runtimeRepresentationSha256:h('f'),
  };
  const fixtureSha=await hsmeSpatialRegionFixtureV1Digest(
    regionFixture,
    hash,
  );
  const a=await freeze(f,{regionFixture,fixtureSha});
  assert.equal(a.state,'SPATIAL_SPARSITY_PLAN_INVALID');
  assert.ok(
    a.blockers.includes(
      'SPATIAL_SPARSITY_REGION_FIXTURE_BINDING_MISMATCH',
    ),
  );

  const policy=rawPolicy(f.plan,f.regionFixtureSha256,{
    prototypeSha256:h('e'),
  });
  const policySha=await hsmeSpatialSparsityPolicyV1Digest(policy,hash);
  const b=await freeze(f,{policy,policySha});
  assert.equal(b.state,'SPATIAL_SPARSITY_PLAN_INVALID');
  assert.ok(
    b.blockers.includes('SPATIAL_SPARSITY_POLICY_BINDING_MISMATCH'),
  );
});

test('post-hoc mutation Fashion authority and unknown fields fail exact policy schema',async()=>{
  const f=await fixture();
  for(const policy of [
    {...f.policy,postHocThresholdMutationAllowed:true},
    {...f.policy,fashionGeometryAuthorityGranted:true},
    {...f.policy,learnedPruningThreshold:0.5},
  ]){
    const result=await freeze(f,{policy,policySha:h('0')});
    assert.equal(result.state,'SPATIAL_SPARSITY_PLAN_INVALID');
    assert.ok(result.blockers.includes('SPATIAL_SPARSITY_POLICY_INVALID'));
  }
});
