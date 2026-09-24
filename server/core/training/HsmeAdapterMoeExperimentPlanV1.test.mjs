import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_TOPOLOGY_POLICY_V1_SCHEMA,
  freezeHsmeAdapterMoeExperimentPlanV1,
  hsmeAdapterMoeExperimentPlanV1Digest,
  hsmeAdapterMoeTopologyPolicyV1Digest,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
const trueBaselineOrigin={
  async verifyDenseBaselineDecision(){return true;},
};
const falseBaselineOrigin={
  async verifyDenseBaselineDecision(){return false;},
};
const truePolicyOrigin={
  async verifyTopologyPolicy(){return true;},
};
const falsePolicyOrigin={
  async verifyTopologyPolicy(){return false;},
};

function h(ch){return ch.repeat(64);}
function authority(){
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

async function baselines(){
  const raw=JSON.parse(await readFile(
    'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json',
    'utf8',
  ));
  const redesign=normalizeHsmeDenseBaselineDecisionV1(raw);
  const redesignSha=await hsmeDenseBaselineDecisionV1Digest(redesign,hash);

  const {trainingTarget:_trainingTarget,...withoutTarget}=redesign;
  const pinned=normalizeHsmeDenseBaselineDecisionV1({
    ...withoutTarget,
    decisionStatus:'BASELINE_PINNED',
    candidates:redesign.candidates.map(candidate=>
      candidate.candidateId===redesign.selectedCandidateId
        ?{...candidate,verdict:'SELECTED_BASELINE'}
        :candidate
    ),
    baselinePin:{
      modelId:'bers-dense-core-v1',
      version:'synthetic-hsme3-fixture-v1',
      sourceUri:'bers://synthetic/dense-core/'+h('1'),
      sourceRevision:h('1'),
      contentSha256:h('1'),
      packageBytes:700_000_000,
      license:'SYNTHETIC-COMMERCIAL-FIXTURE',
      licenseConclusion:'COMMERCIAL_ADMISSIBLE',
      licenseEvidenceSha256:h('2'),
      toolchainLockSha256:h('3'),
      architectureConfigSha256:h('4'),
      representationManifestSha256:h('5'),
      evaluationContractSha256:h('6'),
      qualityEvidenceSha256:h('7'),
      runtimeEvidenceSha256:h('8'),
      hsmeBindingEvidenceSha256:h('9'),
    },
  });
  const pinnedSha=await hsmeDenseBaselineDecisionV1Digest(pinned,hash);
  return {redesign,redesignSha,pinned,pinnedSha};
}

function rawPolicy(baselineSha,overrides={}){
  return {
    schemaVersion:HSME_ADAPTER_MOE_TOPOLOGY_POLICY_V1_SCHEMA,
    experimentId:'hsme3-adapter-moe-prototype-001',
    denseBaselineDecisionSha256:baselineSha,
    comparisonVariants:[
      'DENSE_CONTROL',
      'SHARED_TOP1_ADAPTER',
      'SHARED_TOP2_ADAPTER',
      'DENSE_TO_SPARSE_SECONDARY',
    ],
    specialistHypotheses:[
      'FASHION',
      'IDENTITY_FACE',
      'POSE_PERSON',
      'MATERIAL_TEXTURE',
      'BACKGROUND',
      'DETAIL_RESTORATION',
    ],
    maxExpertCount:4,
    maxExpertArtifactBytes:150_000_000,
    maxTotalExpertArtifactBytes:400_000_000,
    maxActiveSpecialistsPerDecision:2,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
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
    ...authority(),
    ...overrides,
  };
}

async function fixture(){
  const b=await baselines();
  const policy=rawPolicy(b.pinnedSha);
  const policySha=await hsmeAdapterMoeTopologyPolicyV1Digest(policy,hash);
  return {...b,policy,policySha};
}

async function freeze(f,overrides={}){
  return freezeHsmeAdapterMoeExperimentPlanV1(
    overrides.baseline??f.pinned,
    overrides.baselineSha??f.pinnedSha,
    overrides.baselineOrigin??trueBaselineOrigin,
    overrides.policy??f.policy,
    overrides.policySha??f.policySha,
    overrides.policyOrigin??truePolicyOrigin,
    hash,
  );
}

test('trusted pinned dense baseline freezes deterministic Adapter-MoE topology only',async()=>{
  const f=await fixture();
  const first=await freeze(f);
  const second=await freeze(f);

  assert.equal(first.state,'ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED');
  assert.deepEqual(first.blockers,[]);
  assert.equal(first.denseBaselineDecisionSha256,f.pinnedSha);
  assert.equal(first.denseBaselineModelId,'bers-dense-core-v1');
  assert.equal(first.denseBaselineContentSha256,h('1'));
  assert.deepEqual(first.comparisonVariants,[
    'DENSE_CONTROL',
    'SHARED_TOP1_ADAPTER',
    'SHARED_TOP2_ADAPTER',
    'DENSE_TO_SPARSE_SECONDARY',
  ]);
  assert.equal(first.maxExpertCount,4);
  assert.equal(first.maxExpertArtifactBytes,150_000_000);
  assert.equal(first.maxTotalExpertArtifactBytes,400_000_000);
  assert.equal(first.maxActiveSpecialistsPerDecision,2);
  assert.equal(first.sharedPathRequired,true);
  assert.equal(first.fullBackboneExpertAllowed,false);
  assert.equal(first.trainingExecutionAllowed,false);
  assert.equal(first.prototypeAssemblyAllowed,false);
  assert.equal(first.modelInstallAllowed,false);
  assert.equal(first.productionAuthorityGranted,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeAdapterMoeExperimentPlanV1Digest(first,hash),
    first.planEvidenceSha256,
  );
});

test('current REDESIGN_REQUIRED canonical baseline remains BLOCKED',async()=>{
  const f=await fixture();
  const policy=rawPolicy(f.redesignSha);
  const policySha=await hsmeAdapterMoeTopologyPolicyV1Digest(policy,hash);
  const result=await freeze(f,{
    baseline:f.redesign,
    baselineSha:f.redesignSha,
    policy,
    policySha,
  });
  assert.equal(result.state,'ADAPTER_MOE_EXPERIMENT_PLAN_BLOCKED');
  assert.ok(result.blockers.includes('ADAPTER_MOE_BASELINE_PINNED_REQUIRED'));
  assert.equal(result.planEvidenceSha256,'UNKNOWN');
});

test('untrusted pinned baseline fails before topology freeze',async()=>{
  const f=await fixture();
  const result=await freeze(f,{baselineOrigin:falseBaselineOrigin});
  assert.equal(result.state,'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID');
  assert.ok(result.blockers.includes('ADAPTER_MOE_DENSE_BASELINE_ORIGIN_UNVERIFIED'));
});

test('topology policy exact-origin refusal fails closed',async()=>{
  const f=await fixture();
  const result=await freeze(f,{policyOrigin:falsePolicyOrigin});
  assert.equal(result.state,'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID');
  assert.ok(result.blockers.includes('ADAPTER_MOE_TOPOLOGY_POLICY_ORIGIN_UNVERIFIED'));
});

test('policy cannot omit dense Top-1 or Top-2 controls',async()=>{
  const f=await fixture();
  const policy=rawPolicy(f.pinnedSha,{
    comparisonVariants:[
      'DENSE_CONTROL',
      'SHARED_TOP1_ADAPTER',
      'DENSE_TO_SPARSE_SECONDARY',
    ],
  });
  const result=await freeze(f,{policy,policySha:h('0')});
  assert.equal(result.state,'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID');
  assert.ok(result.blockers.includes('ADAPTER_MOE_TOPOLOGY_POLICY_INVALID'));
});

test('policy cannot widen Top-K shared-path or full-backbone semantics',async()=>{
  const f=await fixture();

  for(const policy of [
    rawPolicy(f.pinnedSha,{maxActiveSpecialistsPerDecision:3}),
    rawPolicy(f.pinnedSha,{sharedPathRequired:false}),
    rawPolicy(f.pinnedSha,{fullBackboneExpertAllowed:true}),
  ]){
    const result=await freeze(f,{policy,policySha:h('0')});
    assert.equal(result.state,'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID');
    assert.ok(result.blockers.includes('ADAPTER_MOE_TOPOLOGY_POLICY_INVALID'));
  }
});

test('expert byte budget must remain predeclared and compact versus the dense pack',async()=>{
  const f=await fixture();
  const oversized=rawPolicy(f.pinnedSha,{
    maxExpertArtifactBytes:700_000_000,
    maxTotalExpertArtifactBytes:800_000_000,
  });
  const oversizedSha=await hsmeAdapterMoeTopologyPolicyV1Digest(
    oversized,
    hash,
  );
  const result=await freeze(f,{policy:oversized,policySha:oversizedSha});
  assert.equal(result.state,'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_TOPOLOGY_POLICY_EXPERT_NOT_COMPACT'),
  );
});

test('policy authority widening and baseline rebinding fail closed',async()=>{
  const f=await fixture();

  const widened=rawPolicy(f.pinnedSha,{modelInstallAllowed:true});
  const widenedResult=await freeze(f,{policy:widened,policySha:h('0')});
  assert.equal(widenedResult.state,'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID');

  const rebound=rawPolicy(h('e'));
  const reboundSha=await hsmeAdapterMoeTopologyPolicyV1Digest(rebound,hash);
  const reboundResult=await freeze(f,{policy:rebound,policySha:reboundSha});
  assert.equal(reboundResult.state,'ADAPTER_MOE_EXPERIMENT_PLAN_INVALID');
  assert.ok(
    reboundResult.blockers.includes('ADAPTER_MOE_TOPOLOGY_POLICY_BASELINE_MISMATCH'),
  );
});
