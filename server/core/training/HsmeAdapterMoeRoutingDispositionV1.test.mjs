import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdapterMoeExperimentPlanV1Digest,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
  HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA,
  hsmeAdapterMoeRoutingComparisonMatrixV1Digest,
} from './HsmeAdapterMoeRoutingComparisonMatrixV1.ts';
import {
  HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA,
  decideHsmeAdapterMoeRoutingDispositionV1,
  hsmeAdapterMoeRoutingDispositionPolicyV1Digest,
  hsmeAdapterMoeRoutingDispositionV1Digest,
} from './HsmeAdapterMoeRoutingDispositionV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
function h(ch){return ch.repeat(64);}
function planAuthority(){
  return {
    trainingExecutionAllowed:false,
    prototypeAssemblyAllowed:false,
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
function measurementAuthority(){
  return {
    selectionAllowed:false,
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
function matrixAuthority(){
  return {
    selectionAllowed:false,
    prototypeAssemblyAllowed:false,
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

async function plan(){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    experimentId:'hsme3-disposition-001',
    denseBaselineDecisionSha256:h('1'),
    denseBaselineModelId:'bers-dense-core-v1',
    denseBaselineVersion:'synthetic-v1',
    denseBaselineContentSha256:h('2'),
    denseBaselinePackageBytes:1000,
    denseBaselineRepresentationManifestSha256:h('3'),
    denseBaselineEvaluationContractSha256:h('4'),
    denseBaselineQualityEvidenceSha256:h('5'),
    denseBaselineRuntimeEvidenceSha256:h('6'),
    denseBaselineHsmeBindingEvidenceSha256:h('7'),
    topologyPolicySha256:h('8'),
    comparisonVariants:['DENSE_CONTROL','SHARED_TOP1_ADAPTER','SHARED_TOP2_ADAPTER'],
    specialistHypotheses:['FASHION','IDENTITY_FACE'],
    maxExpertCount:2,
    maxExpertArtifactBytes:200,
    maxTotalExpertArtifactBytes:300,
    maxActiveSpecialistsPerDecision:2,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    qualityDimensions:['A','B'],
    hardPreservationDimensions:['A'],
    qualityPriority:['A','B'],
    measurementDimensions:[
      'QUALITY_VECTOR','SEMANTIC_ADHERENCE','PRESERVATION_FAILURES',
      'PACKAGE_BYTES','RESIDENT_BYTES','ACTIVE_WEIGHTS_BYTES',
      'PEAK_MEMORY_BYTES','FLASH_BYTES_MOVED','RAM_BYTES_MOVED',
      'ACCELERATOR_BYTES_MOVED','COLD_LATENCY_MS','WARM_LATENCY_MS',
      'END_TO_END_LATENCY_MS','EXPERT_ACTIVATION_COUNT',
      'ROUTER_REPLAY_IDENTITY',
    ],
    routerDeterminismLaw:'DETERMINISTIC_REPLAY_REQUIRED',
    planEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const planEvidenceSha256=await hsmeAdapterMoeExperimentPlanV1Digest(base,hash);
  return {...base,planEvidenceSha256};
}

function row(variant,qualityA,qualityB,overrides={}){
  return {
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_MEASUREMENT_V1_SCHEMA,
    variant,
    sourceIdentitySha256:h(variant==='DENSE_CONTROL'?'1':variant==='SHARED_TOP1_ADAPTER'?'2':'3'),
    campaignFixtureSha256:h('4'),
    fixtureManifestSha256:h('5'),
    evaluationContractSha256:h('6'),
    deterministicSeedScheduleSha256:h('7'),
    runtimeRepresentationSha256:h('8'),
    caseCount:100,
    quality:[
      {dimension:'A',value:qualityA},
      {dimension:'B',value:qualityB},
    ],
    hardPreservationFailures:[{dimension:'A',failureCount:0}],
    criticalFailureCount:0,
    packageBytes:variant==='DENSE_CONTROL'?1000:1050,
    residentBytes:variant==='DENSE_CONTROL'?1000:950,
    activeWeightsBytes:variant==='DENSE_CONTROL'?1000:800,
    peakMemoryBytes:variant==='DENSE_CONTROL'?1000:950,
    flashBytesMoved:variant==='DENSE_CONTROL'?1000:900,
    ramBytesMoved:variant==='DENSE_CONTROL'?1000:900,
    acceleratorBytesMoved:variant==='DENSE_CONTROL'?1000:900,
    coldLatencyMs:variant==='DENSE_CONTROL'?1100:900,
    warmLatencyMs:variant==='DENSE_CONTROL'?900:800,
    endToEndLatencyMs:
      variant==='DENSE_CONTROL'?1000:variant==='SHARED_TOP1_ADAPTER'?850:800,
    expertActivationCount:variant==='DENSE_CONTROL'?0:variant==='SHARED_TOP1_ADAPTER'?100:180,
    routerReplayIdentitySha256:variant==='DENSE_CONTROL'?'NONE':h('9'),
    realMeasuredEvidence:true,
    ...measurementAuthority(),
    ...overrides,
  };
}

async function matrix(p,overrides={}){
  const rows=overrides.rows??[
    row('DENSE_CONTROL',0.90,0.90),
    row('SHARED_TOP1_ADAPTER',0.90,0.90),
    row('SHARED_TOP2_ADAPTER',0.90,0.90),
  ];
  const base={
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
    state:'ADAPTER_MOE_ROUTING_MATRIX_READY_NOT_DISPOSED',
    blockers:[],
    experimentPlanSha256:p.planEvidenceSha256,
    prototypeRosterSha256:h('a'),
    campaignFixtureSha256:h('4'),
    rows,
    measurementSha256s:[h('b'),h('c'),h('d')],
    matrixEvidenceSha256:h('0'),
    ...matrixAuthority(),
  };
  const matrixEvidenceSha256=
    await hsmeAdapterMoeRoutingComparisonMatrixV1Digest(base,hash);
  return {...base,matrixEvidenceSha256};
}

function rawPolicy(p,m,overrides={}){
  return {
    schemaVersion:HSME_ADAPTER_MOE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA,
    experimentPlanSha256:p.planEvidenceSha256,
    campaignFixtureSha256:m.campaignFixtureSha256,
    qualityFloors:[
      {dimension:'A',minimum:0.80},
      {dimension:'B',minimum:0.80},
    ],
    maxQualityRegressionVsDense:[
      {dimension:'A',maxRegression:0.03},
      {dimension:'B',maxRegression:0.03},
    ],
    qualityTieTolerance:[
      {dimension:'A',tolerance:0.01},
      {dimension:'B',tolerance:0.01},
    ],
    maxHardPreservationFailures:[
      {dimension:'A',maxFailureCount:0},
    ],
    maxCriticalFailureCount:0,
    efficiencyPriority:[
      'END_TO_END_LATENCY_MS',
      'PEAK_MEMORY_BYTES',
      'ACCELERATOR_BYTES_MOVED',
      'RESIDENT_BYTES',
      'PACKAGE_BYTES',
    ],
    minMaterialEfficiencyImprovementBps:500,
    maxEfficiencyRegressionBps:500,
    reviewState:'QUALITY_FIRST_POLICY_REVIEWED',
    ...measurementAuthority(),
    ...overrides,
  };
}

const truePlanOrigin={async verifyExperimentPlan(){return true;}};
const trueMatrixOrigin={async verifyRoutingMatrix(){return true;}};
const truePolicyOrigin={async verifyDispositionPolicy(){return true;}};
const falsePolicyOrigin={async verifyDispositionPolicy(){return false;}};

async function fixture(overrides={}){
  const p=await plan();
  const m=await matrix(p,overrides);
  const policy=rawPolicy(p,m,overrides.policyOverrides??{});
  const policySha=await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  return {p,m,policy,policySha};
}

async function decide(x,overrides={}){
  return decideHsmeAdapterMoeRoutingDispositionV1(
    overrides.p??x.p,
    overrides.planSha??x.p.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.m??x.m,
    overrides.matrixSha??x.m.matrixEvidenceSha256,
    overrides.matrixOrigin??trueMatrixOrigin,
    overrides.policy??x.policy,
    overrides.policySha??x.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

test('quality-equivalent sparse variants use frozen lexicographic efficiency priority',async()=>{
  const x=await fixture();
  const result=await decide(x);
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_DISPOSITION_READY');
  assert.equal(result.disposition,'ADVANCE');
  assert.deepEqual(result.advancedVariants,['SHARED_TOP2_ADAPTER']);
  assert.equal(result.preferredVariant,'SHARED_TOP2_ADAPTER');
  assert.equal(result.selectionAllowed,false);
  assert.equal(result.modelInstallAllowed,false);
  assert.equal(
    await hsmeAdapterMoeRoutingDispositionV1Digest(result,hash),
    result.dispositionEvidenceSha256,
  );
});

test('speed cannot rescue sparse variants that fail the frozen quality floor',async()=>{
  const p=await plan();
  const m=await matrix(p,{
    rows:[
      row('DENSE_CONTROL',0.90,0.90),
      row('SHARED_TOP1_ADAPTER',0.70,0.90,{endToEndLatencyMs:100}),
      row('SHARED_TOP2_ADAPTER',0.90,0.70,{endToEndLatencyMs:100}),
    ],
  });
  const policy=rawPolicy(p,m);
  const policySha=await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide({p,m,policy,policySha});
  assert.equal(result.disposition,'REDESIGN');
  assert.deepEqual(result.advancedVariants,[]);
  assert.ok(result.variantDispositions.every(x=>x.efficiencyEligible===false));
});

test('critical or hard-preservation failure across every sparse variant yields REJECT',async()=>{
  const p=await plan();
  const m=await matrix(p,{
    rows:[
      row('DENSE_CONTROL',0.90,0.90),
      row('SHARED_TOP1_ADAPTER',0.90,0.90,{
        hardPreservationFailures:[{dimension:'A',failureCount:1}],
      }),
      row('SHARED_TOP2_ADAPTER',0.90,0.90,{criticalFailureCount:1}),
    ],
  });
  const policy=rawPolicy(p,m);
  const policySha=await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide({p,m,policy,policySha});
  assert.equal(result.disposition,'REJECT');
  assert.ok(result.variantDispositions.every(x=>x.hardRejected===true));
});

test('quality dominance precedes a faster efficiency result',async()=>{
  const p=await plan();
  const m=await matrix(p,{
    rows:[
      row('DENSE_CONTROL',0.94,0.94),
      row('SHARED_TOP1_ADAPTER',0.93,0.93,{endToEndLatencyMs:900}),
      row('SHARED_TOP2_ADAPTER',0.90,0.90,{endToEndLatencyMs:700}),
    ],
  });
  const policy=rawPolicy(p,m,{
    maxQualityRegressionVsDense:[
      {dimension:'A',maxRegression:0.05},
      {dimension:'B',maxRegression:0.05},
    ],
  });
  const policySha=await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide({p,m,policy,policySha});
  assert.equal(result.disposition,'ADVANCE');
  assert.deepEqual(result.advancedVariants,['SHARED_TOP1_ADAPTER']);
  assert.equal(result.preferredVariant,'SHARED_TOP1_ADAPTER');
  assert.equal(
    result.variantDispositions.find(x=>x.variant==='SHARED_TOP2_ADAPTER')
      .qualityDominated,
    true,
  );
});

test('exact quality and efficiency tie co-advances without inventing a preferred variant',async()=>{
  const p=await plan();
  const tied={
    residentBytes:950,
    peakMemoryBytes:950,
    acceleratorBytesMoved:900,
    packageBytes:1050,
    endToEndLatencyMs:850,
  };
  const m=await matrix(p,{
    rows:[
      row('DENSE_CONTROL',0.90,0.90),
      row('SHARED_TOP1_ADAPTER',0.90,0.90,tied),
      row('SHARED_TOP2_ADAPTER',0.90,0.90,tied),
    ],
  });
  const policy=rawPolicy(p,m);
  const policySha=await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide({p,m,policy,policySha});
  assert.equal(result.disposition,'ADVANCE');
  assert.deepEqual(result.advancedVariants,[
    'SHARED_TOP1_ADAPTER','SHARED_TOP2_ADAPTER',
  ]);
  assert.equal(result.preferredVariant,'NONE');
});

test('dense control below absolute quality floor forces REDESIGN before sparse efficiency',async()=>{
  const p=await plan();
  const m=await matrix(p,{
    rows:[
      row('DENSE_CONTROL',0.70,0.90),
      row('SHARED_TOP1_ADAPTER',0.95,0.95,{endToEndLatencyMs:100}),
      row('SHARED_TOP2_ADAPTER',0.95,0.95,{endToEndLatencyMs:100}),
    ],
  });
  const policy=rawPolicy(p,m);
  const policySha=await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide({p,m,policy,policySha});
  assert.equal(result.disposition,'REDESIGN');
  assert.ok(
    result.variantDispositions.every(x=>
      x.reasons.includes('DENSE_CONTROL_QUALITY_FLOOR_FAILED')
    ),
  );
});

test('material efficiency improvement and bounded regression are both required',async()=>{
  const p=await plan();
  const noImprovement={
    endToEndLatencyMs:1000,
    peakMemoryBytes:1000,
    acceleratorBytesMoved:1000,
    residentBytes:1000,
    packageBytes:1000,
  };
  const m=await matrix(p,{
    rows:[
      row('DENSE_CONTROL',0.90,0.90),
      row('SHARED_TOP1_ADAPTER',0.90,0.90,noImprovement),
      row('SHARED_TOP2_ADAPTER',0.90,0.90,noImprovement),
    ],
  });
  const policy=rawPolicy(p,m);
  const policySha=await hsmeAdapterMoeRoutingDispositionPolicyV1Digest(policy,hash);
  const result=await decide({p,m,policy,policySha});
  assert.equal(result.disposition,'REDESIGN');
  assert.ok(
    result.variantDispositions.every(x=>
      x.reasons.includes('MATERIAL_EFFICIENCY_IMPROVEMENT_MISSING')
    ),
  );
});

test('disposition policy exact origin and digest are mandatory',async()=>{
  const x=await fixture();
  let result=await decide(x,{policyOrigin:falsePolicyOrigin});
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_DISPOSITION_INVALID');

  result=await decide(x,{policySha:h('0')});
  assert.equal(result.state,'ADAPTER_MOE_ROUTING_DISPOSITION_INVALID');
});
