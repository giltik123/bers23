import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA,
  freezeHsmeAdapterMoeExpertPackSetV1,
  hsmeAdapterMoeExpertDeltaManifestV1Digest,
  hsmeAdapterMoeExpertPackSetV1Digest,
} from './HsmeAdapterMoeExpertPackSetV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdapterMoeExperimentPlanV1Digest,
} from './HsmeAdapterMoeExperimentPlanV1.ts';

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

function expertAuthority(){
  return {
    standaloneExecutionAllowed:false,
    ...planAuthority(),
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

function rawManifest(
  plan,
  {
    expertId='fashion-adapter-v1',
    specialistHypothesis='FASHION',
    adapterKind='LORA_LOW_RANK',
    contentChar='a',
    artifactBytes=80_000_000,
    trainableParameters=12_000_000,
    overrides={},
  }={},
){
  return {
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA,
    expertId,
    specialistHypothesis,
    adapterKind,
    experimentPlanSha256:plan.planEvidenceSha256,
    denseBaselineDecisionSha256:plan.denseBaselineDecisionSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    targetModuleSetSha256:h('9'),
    adapterConfigSha256:h('a'),
    artifactUri:
      'bers://hsme3/expert/'+expertId+'/sha256/'+h(contentChar),
    artifactRevision:h(contentChar),
    contentSha256:h(contentChar),
    artifactBytes,
    trainableParameters,
    exportToolchainSha256:h('b'),
    trainingReceiptSha256:h('c'),
    license:'SYNTHETIC-COMMERCIAL-EXPERT-FIXTURE',
    licenseEvidenceSha256:h('d'),
    requiresSharedBaseline:true,
    containsFullBackboneWeights:false,
    ...expertAuthority(),
    ...overrides,
  };
}

async function binding(manifest){
  return {
    rawManifest:manifest,
    expectedManifestSha256:
      await hsmeAdapterMoeExpertDeltaManifestV1Digest(manifest,hash),
  };
}

const truePlanOrigin={
  async verifyExperimentPlan(){return true;},
};
const falsePlanOrigin={
  async verifyExperimentPlan(){return false;},
};
const trueManifestOrigin={
  async verifyExpertManifest(){return true;},
};
const falseManifestOrigin={
  async verifyExpertManifest(){return false;},
};

async function freeze(plan,bindings,overrides={}){
  return freezeHsmeAdapterMoeExpertPackSetV1(
    plan,
    overrides.planSha??plan.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    bindings,
    overrides.manifestOrigin??trueManifestOrigin,
    hash,
  );
}

test('exact compact expert manifests freeze deterministic pack set independent of caller order',async()=>{
  const plan=await syntheticPlan();
  const fashion=await binding(rawManifest(plan,{
    expertId:'fashion-adapter-v1',
    specialistHypothesis:'FASHION',
    adapterKind:'LORA_LOW_RANK',
    contentChar:'a',
    artifactBytes:80_000_000,
    trainableParameters:12_000_000,
  }));
  const identity=await binding(rawManifest(plan,{
    expertId:'identity-adapter-v1',
    specialistHypothesis:'IDENTITY_FACE',
    adapterKind:'ATTENTION_DELTA',
    contentChar:'e',
    artifactBytes:90_000_000,
    trainableParameters:15_000_000,
  }));

  const first=await freeze(plan,[identity,fashion]);
  const second=await freeze(plan,[fashion,identity]);

  assert.equal(first.state,'ADAPTER_MOE_EXPERT_PACK_SET_READY_NOT_ASSEMBLED');
  assert.deepEqual(first.blockers,[]);
  assert.equal(first.experimentPlanSha256,plan.planEvidenceSha256);
  assert.equal(first.denseBaselineContentSha256,plan.denseBaselineContentSha256);
  assert.equal(first.expertCount,2);
  assert.equal(first.totalExpertArtifactBytes,170_000_000);
  assert.equal(first.totalTrainableParameters,27_000_000);
  assert.deepEqual(
    first.experts.map(entry=>entry.manifest.expertId),
    ['fashion-adapter-v1','identity-adapter-v1'],
  );
  assert.equal(first.sharedPathRequired,true);
  assert.equal(first.fullBackboneExpertAllowed,false);
  assert.equal(first.prototypeAssemblyAllowed,false);
  assert.equal(first.standaloneExecutionAllowed,false);
  assert.equal(first.modelInstallAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeAdapterMoeExpertPackSetV1Digest(first,hash),
    first.packSetEvidenceSha256,
  );
});

test('non-frozen plan remains BLOCKED before manifest processing',async()=>{
  const plan=await syntheticPlan();
  const blocked={
    ...plan,
    state:'ADAPTER_MOE_EXPERIMENT_PLAN_BLOCKED',
    blockers:['REAL_BASELINE_REQUIRED'],
    planEvidenceSha256:'UNKNOWN',
  };
  const result=await freeze(blocked,[]);
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_PACK_SET_BLOCKED');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_EXPERT_PACK_SET_FROZEN_PLAN_REQUIRED'),
  );
});

test('plan exact-origin refusal fails before expert processing',async()=>{
  const plan=await syntheticPlan();
  const manifest=await binding(rawManifest(plan));
  const result=await freeze(plan,[manifest],{planOrigin:falsePlanOrigin});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_EXPERT_PACK_SET_PLAN_ORIGIN_UNVERIFIED'),
  );
});

test('expert manifest exact-origin refusal fails closed',async()=>{
  const plan=await syntheticPlan();
  const manifest=await binding(rawManifest(plan));
  const result=await freeze(plan,[manifest],{
    manifestOrigin:falseManifestOrigin,
  });
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    result.blockers.includes(
      'ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_ORIGIN_UNVERIFIED',
    ),
  );
});

test('per-expert and total byte ceilings come only from the frozen plan',async()=>{
  const plan=await syntheticPlan();

  const oversized=await binding(rawManifest(plan,{
    artifactBytes:150_000_001,
  }));
  const single=await freeze(plan,[oversized]);
  assert.equal(single.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    single.blockers.includes(
      'ADAPTER_MOE_EXPERT_PACK_SET_EXPERT_BYTES_EXCEEDED',
    ),
  );

  const totalBindings=await Promise.all([
    binding(rawManifest(plan,{
      expertId:'fashion-adapter-v1',
      specialistHypothesis:'FASHION',
      contentChar:'a',
      artifactBytes:140_000_000,
    })),
    binding(rawManifest(plan,{
      expertId:'identity-adapter-v1',
      specialistHypothesis:'IDENTITY_FACE',
      contentChar:'e',
      artifactBytes:140_000_000,
    })),
    binding(rawManifest(plan,{
      expertId:'pose-adapter-v1',
      specialistHypothesis:'POSE_PERSON',
      contentChar:'f',
      artifactBytes:140_000_000,
    })),
  ]);
  const total=await freeze(plan,totalBindings);
  assert.equal(total.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    total.blockers.includes('ADAPTER_MOE_EXPERT_PACK_SET_TOTAL_BYTES_EXCEEDED'),
  );
});

test('expert count ceiling is enforced before set acceptance',async()=>{
  const plan=await syntheticPlan();
  const specs=[
    ['fashion-adapter-v1','FASHION','1'],
    ['identity-adapter-v1','IDENTITY_FACE','2'],
    ['pose-adapter-v1','POSE_PERSON','3'],
    ['material-adapter-v1','MATERIAL_TEXTURE','4'],
    ['background-adapter-v1','BACKGROUND','5'],
  ];
  const bindings=await Promise.all(specs.map(
    ([expertId,specialistHypothesis,contentChar])=>binding(rawManifest(plan,{
      expertId,
      specialistHypothesis,
      contentChar,
      artifactBytes:50_000_000,
    })),
  ));
  const result=await freeze(plan,bindings);
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    result.blockers.includes(
      'ADAPTER_MOE_EXPERT_PACK_SET_EXPERT_COUNT_EXCEEDED',
    ),
  );
});

test('full-backbone or standalone expert claims are invalid manifests',async()=>{
  const plan=await syntheticPlan();
  for(const overrides of [
    {containsFullBackboneWeights:true},
    {standaloneExecutionAllowed:true},
    {modelInstallAllowed:true},
  ]){
    const raw=rawManifest(plan,{overrides});
    const result=await freeze(plan,[{
      rawManifest:raw,
      expectedManifestSha256:h('0'),
    }]);
    assert.equal(result.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
    assert.ok(
      result.blockers.includes('ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_INVALID'),
    );
  }
});

test('plan baseline rebinding and expert family drift fail closed',async()=>{
  const plan=await syntheticPlan();

  const rebound=rawManifest(plan,{
    overrides:{denseBaselineContentSha256:h('f')},
  });
  const reboundResult=await freeze(plan,[await binding(rebound)]);
  assert.equal(reboundResult.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    reboundResult.blockers.includes(
      'ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_BASELINE_BINDING_MISMATCH',
    ),
  );

  const unknownFamily=rawManifest(plan,{
    specialistHypothesis:'UNREVIEWED_SPECIALIST',
  });
  const familyResult=await freeze(plan,[await binding(unknownFamily)]);
  assert.equal(familyResult.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    familyResult.blockers.includes(
      'ADAPTER_MOE_EXPERT_PACK_SET_SPECIALIST_OUTSIDE_FROZEN_ROSTER',
    ),
  );
});

test('duplicate expert id or content identity cannot inflate the set',async()=>{
  const plan=await syntheticPlan();

  const duplicateId=await Promise.all([
    binding(rawManifest(plan,{
      expertId:'same-adapter-v1',
      specialistHypothesis:'FASHION',
      contentChar:'a',
    })),
    binding(rawManifest(plan,{
      expertId:'same-adapter-v1',
      specialistHypothesis:'IDENTITY_FACE',
      contentChar:'e',
    })),
  ]);
  const idResult=await freeze(plan,duplicateId);
  assert.equal(idResult.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    idResult.blockers.includes('ADAPTER_MOE_EXPERT_PACK_SET_DUPLICATE_EXPERT_ID'),
  );

  const duplicateContent=await Promise.all([
    binding(rawManifest(plan,{
      expertId:'fashion-adapter-v1',
      specialistHypothesis:'FASHION',
      contentChar:'a',
    })),
    binding(rawManifest(plan,{
      expertId:'identity-adapter-v1',
      specialistHypothesis:'IDENTITY_FACE',
      contentChar:'a',
    })),
  ]);
  const contentResult=await freeze(plan,duplicateContent);
  assert.equal(contentResult.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    contentResult.blockers.includes('ADAPTER_MOE_EXPERT_PACK_SET_DUPLICATE_CONTENT'),
  );
});

test('unknown adapter kind is rejected by the exact manifest schema',async()=>{
  const plan=await syntheticPlan();
  const raw=rawManifest(plan,{adapterKind:'GIANT_FULL_MODEL_EXPERT'});
  const result=await freeze(plan,[{
    rawManifest:raw,
    expectedManifestSha256:h('0'),
  }]);
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_PACK_SET_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_EXPERT_PACK_SET_MANIFEST_INVALID'),
  );
});
