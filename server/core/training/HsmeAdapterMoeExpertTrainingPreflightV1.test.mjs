import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdapterMoeExperimentPlanV1Digest,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_V1_SCHEMA,
  freezeHsmeAdapterMoeExpertTrainingPreflightV1,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
  hsmeAdapterMoeExpertTrainingSpecV1Digest,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';

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

function preflightAuthority(){
  return {
    trainingExecutionAllowed:false,
    workspaceMaterializationAllowed:false,
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

async function syntheticPlan(){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    experimentId:'hsme3-adapter-moe-prototype-001',
    denseBaselineDecisionSha256:h('1'),
    denseBaselineModelId:'bers-dense-core-v1',
    denseBaselineVersion:'synthetic-hsme3-fixture-v1',
    denseBaselineContentSha256:h('2'),
    denseBaselinePackageBytes:700_000_000,
    denseBaselineRepresentationManifestSha256:h('3'),
    denseBaselineEvaluationContractSha256:h('4'),
    denseBaselineQualityEvidenceSha256:h('5'),
    denseBaselineRuntimeEvidenceSha256:h('6'),
    denseBaselineHsmeBindingEvidenceSha256:h('7'),
    topologyPolicySha256:h('8'),
    comparisonVariants:[
      'DENSE_CONTROL',
      'SHARED_TOP1_ADAPTER',
      'SHARED_TOP2_ADAPTER',
      'DENSE_TO_SPARSE_SECONDARY',
    ],
    specialistHypotheses:[
      'BACKGROUND',
      'DETAIL_RESTORATION',
      'FASHION',
      'IDENTITY_FACE',
      'MATERIAL_TEXTURE',
      'POSE_PERSON',
    ],
    maxExpertCount:4,
    maxExpertArtifactBytes:150_000_000,
    maxTotalExpertArtifactBytes:400_000_000,
    maxActiveSpecialistsPerDecision:2,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
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
    qualityPriority:[
      'IDENTITY_PERSON',
      'GARMENT_LOGO_PATTERN',
      'NON_TARGET_PRESERVATION',
      'SEMANTIC_ADHERENCE',
      'ANATOMY_ARTIFACT',
    ],
    measurementDimensions:[
      'QUALITY_VECTOR',
      'SEMANTIC_ADHERENCE',
      'PRESERVATION_FAILURES',
      'PACKAGE_BYTES',
      'RESIDENT_BYTES',
      'ACTIVE_WEIGHTS_BYTES',
      'PEAK_MEMORY_BYTES',
      'FLASH_BYTES_MOVED',
      'RAM_BYTES_MOVED',
      'ACCELERATOR_BYTES_MOVED',
      'COLD_LATENCY_MS',
      'WARM_LATENCY_MS',
      'END_TO_END_LATENCY_MS',
      'EXPERT_ACTIVATION_COUNT',
      'ROUTER_REPLAY_IDENTITY',
    ],
    routerDeterminismLaw:'DETERMINISTIC_REPLAY_REQUIRED',
    planEvidenceSha256:h('0'),
    ...planAuthority(),
  };
  const planEvidenceSha256=await hsmeAdapterMoeExperimentPlanV1Digest(
    base,
    hash,
  );
  return {...base,planEvidenceSha256};
}

function rawSpec(plan,overrides={}){
  return {
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_SPEC_V1_SCHEMA,
    expertId:'fashion-adapter-v1',
    specialistHypothesis:'FASHION',
    adapterKind:'LORA_LOW_RANK',
    experimentPlanSha256:plan.planEvidenceSha256,
    denseBaselineDecisionSha256:plan.denseBaselineDecisionSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    targetModuleSetSha256:h('9'),
    adapterConfigSha256:h('a'),
    trainingCorpusRootSha256:h('b'),
    reproductionContractSha256:h('c'),
    immutableEnvironmentSha256:h('d'),
    trainingToolchainSha256:h('e'),
    trainerEntrypointSha256:h('f'),
    license:'SYNTHETIC-COMMERCIAL-EXPERT-FIXTURE',
    licenseEvidenceSha256:h('1'),
    resourceCeilings:{
      maxTrainingExamples:100_000,
      maxGpuSeconds:14_400,
      maxTrainingCostMicrousd:25_000_000,
      maxStagedArtifactBytes:120_000_000,
      maxTrainableParameters:25_000_000,
    },
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    ...preflightAuthority(),
    ...overrides,
  };
}

const truePlanOrigin={
  async verifyExperimentPlan(){return true;},
};
const falsePlanOrigin={
  async verifyExperimentPlan(){return false;},
};
const trueSpecOrigin={
  async verifyTrainingSpec(){return true;},
};
const falseSpecOrigin={
  async verifyTrainingSpec(){return false;},
};

async function fixture(){
  const plan=await syntheticPlan();
  const spec=rawSpec(plan);
  const specSha=await hsmeAdapterMoeExpertTrainingSpecV1Digest(spec,hash);
  return {plan,spec,specSha};
}

async function freeze(f,overrides={}){
  return freezeHsmeAdapterMoeExpertTrainingPreflightV1(
    overrides.plan??f.plan,
    overrides.planSha??f.plan.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.spec??f.spec,
    overrides.specSha??f.specSha,
    overrides.specOrigin??trueSpecOrigin,
    hash,
  );
}

test('exact frozen plan and reviewed expert spec yield deterministic READY_NOT_EXECUTED preflight',async()=>{
  const f=await fixture();
  const first=await freeze(f);
  const second=await freeze(f);

  assert.equal(
    first.state,
    'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED',
  );
  assert.deepEqual(first.blockers,[]);
  assert.equal(first.experimentPlanSha256,f.plan.planEvidenceSha256);
  assert.equal(first.trainingSpecSha256,f.specSha);
  assert.equal(first.expertId,'fashion-adapter-v1');
  assert.equal(first.specialistHypothesis,'FASHION');
  assert.equal(first.adapterKind,'LORA_LOW_RANK');
  assert.equal(first.denseBaselineContentSha256,h('2'));
  assert.deepEqual(first.resourceCeilings,f.spec.resourceCeilings);
  assert.equal(first.networkPolicy,'SEALED_INPUTS_ONLY');
  assert.equal(
    first.cacheModelInputPolicy,
    'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  );
  assert.equal(first.trainingExecutionAllowed,false);
  assert.equal(first.workspaceMaterializationAllowed,false);
  assert.equal(first.prototypeAssemblyAllowed,false);
  assert.equal(first.providerAuthorityGranted,false);
  assert.equal(first.billingAuthorityGranted,false);
  assert.equal(Object.hasOwn(first,'providerId'),false);
  assert.equal(Object.hasOwn(first,'accountId'),false);
  assert.equal(Object.hasOwn(first,'argv'),false);
  assert.equal(Object.hasOwn(first,'command'),false);
  assert.equal(Object.hasOwn(first,'outputPath'),false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeAdapterMoeExpertTrainingPreflightV1Digest(first,hash),
    first.preflightEvidenceSha256,
  );
});

test('non-frozen experiment plan remains BLOCKED before training-spec processing',async()=>{
  const f=await fixture();
  const blockedPlan={
    ...f.plan,
    state:'ADAPTER_MOE_EXPERIMENT_PLAN_BLOCKED',
    blockers:['REAL_BASELINE_REQUIRED'],
    planEvidenceSha256:'UNKNOWN',
  };
  const result=await freeze(f,{plan:blockedPlan});
  assert.equal(
    result.state,
    'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_BLOCKED',
  );
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_EXPERT_TRAINING_FROZEN_PLAN_REQUIRED'),
  );
});

test('plan and training-spec trusted origins are both mandatory',async()=>{
  const f=await fixture();

  const planResult=await freeze(f,{planOrigin:falsePlanOrigin});
  assert.equal(planResult.state,'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID');
  assert.ok(
    planResult.blockers.includes(
      'ADAPTER_MOE_EXPERT_TRAINING_PLAN_ORIGIN_UNVERIFIED',
    ),
  );

  const specResult=await freeze(f,{specOrigin:falseSpecOrigin});
  assert.equal(specResult.state,'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID');
  assert.ok(
    specResult.blockers.includes(
      'ADAPTER_MOE_EXPERT_TRAINING_SPEC_ORIGIN_UNVERIFIED',
    ),
  );
});

test('training spec cannot rebind the frozen plan or dense baseline',async()=>{
  const f=await fixture();
  for(const overrides of [
    {experimentPlanSha256:h('3')},
    {denseBaselineDecisionSha256:h('4')},
    {denseBaselineContentSha256:h('5')},
  ]){
    const spec=rawSpec(f.plan,overrides);
    const specSha=await hsmeAdapterMoeExpertTrainingSpecV1Digest(spec,hash);
    const result=await freeze(f,{spec,specSha});
    assert.equal(
      result.state,
      'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID',
    );
    assert.ok(
      result.blockers.includes(
        'ADAPTER_MOE_EXPERT_TRAINING_SPEC_BASELINE_BINDING_MISMATCH',
      ),
    );
  }
});

test('specialist family must come from the frozen topology roster',async()=>{
  const f=await fixture();
  const spec=rawSpec(f.plan,{specialistHypothesis:'UNREVIEWED_SPECIALIST'});
  const specSha=await hsmeAdapterMoeExpertTrainingSpecV1Digest(spec,hash);
  const result=await freeze(f,{spec,specSha});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID');
  assert.ok(
    result.blockers.includes(
      'ADAPTER_MOE_EXPERT_TRAINING_SPECIALIST_OUTSIDE_FROZEN_ROSTER',
    ),
  );
});

test('staged artifact byte ceiling cannot exceed the frozen HSME-3.1 budget',async()=>{
  const f=await fixture();
  const spec=rawSpec(f.plan,{
    resourceCeilings:{
      ...f.spec.resourceCeilings,
      maxStagedArtifactBytes:150_000_001,
    },
  });
  const specSha=await hsmeAdapterMoeExpertTrainingSpecV1Digest(spec,hash);
  const result=await freeze(f,{spec,specSha});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID');
  assert.ok(
    result.blockers.includes(
      'ADAPTER_MOE_EXPERT_TRAINING_ARTIFACT_BYTES_ESCALATION',
    ),
  );
});

test('unknown adapter kind resource underflow and authority widening fail exact schema',async()=>{
  const f=await fixture();

  for(const spec of [
    rawSpec(f.plan,{adapterKind:'FULL_MODEL_FINE_TUNE'}),
    rawSpec(f.plan,{
      resourceCeilings:{
        ...f.spec.resourceCeilings,
        maxTrainingExamples:0,
      },
    }),
    rawSpec(f.plan,{trainingExecutionAllowed:true}),
  ]){
    const result=await freeze(f,{spec,specSha:h('0')});
    assert.equal(
      result.state,
      'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID',
    );
    assert.ok(
      result.blockers.includes('ADAPTER_MOE_EXPERT_TRAINING_SPEC_INVALID'),
    );
  }
});

test('unknown command or path fields are rejected instead of becoming host authority',async()=>{
  const f=await fixture();
  for(const extra of [
    {argv:['python','train.py']},
    {command:'python train.py'},
    {outputPath:'/tmp/expert.bin'},
    {providerId:'cloud-gpu-provider'},
  ]){
    const spec={...f.spec,...extra};
    const result=await freeze(f,{spec,specSha:h('0')});
    assert.equal(
      result.state,
      'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_INVALID',
    );
    assert.ok(
      result.blockers.includes('ADAPTER_MOE_EXPERT_TRAINING_SPEC_INVALID'),
    );
  }
});
