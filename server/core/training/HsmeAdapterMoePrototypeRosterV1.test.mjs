import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeAdapterMoeExperimentPlanV1Digest,
} from './HsmeAdapterMoeExperimentPlanV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA,
  HSME_ADAPTER_MOE_EXPERT_PACK_SET_V1_SCHEMA,
  hsmeAdapterMoeExpertDeltaManifestV1Digest,
  hsmeAdapterMoeExpertPackSetV1Digest,
} from './HsmeAdapterMoeExpertPackSetV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_V1_SCHEMA,
  hsmeAdapterMoeExpertRealRunEvidenceV1Digest,
} from './HsmeAdapterMoeExpertRealRunEvidenceV1.ts';
import {
  HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_V1_SCHEMA,
  assembleHsmeAdapterMoePrototypeRosterV1,
  hsmeAdapterMoePrototypeAssemblyAttestationV1Digest,
  hsmeAdapterMoePrototypeRosterV1Digest,
} from './HsmeAdapterMoePrototypeRosterV1.ts';

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
function packAuthority(){
  return {
    standaloneExecutionAllowed:false,
    ...planAuthority(),
  };
}
function prototypeAuthority(){
  return {
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
function manifestAuthority(){
  return {
    standaloneExecutionAllowed:false,
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

async function plan(){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERIMENT_PLAN_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERIMENT_PLAN_FROZEN_NOT_EXECUTED',
    blockers:[],
    experimentId:'hsme3-adapter-moe-prototype-001',
    denseBaselineDecisionSha256:h('1'),
    denseBaselineModelId:'bers-dense-core-v1',
    denseBaselineVersion:'synthetic-v1',
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
    ],
    specialistHypotheses:['FASHION','IDENTITY_FACE'],
    maxExpertCount:2,
    maxExpertArtifactBytes:150_000_000,
    maxTotalExpertArtifactBytes:300_000_000,
    maxActiveSpecialistsPerDecision:2,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    qualityDimensions:['A','B','C'],
    hardPreservationDimensions:['A'],
    qualityPriority:['A','B','C'],
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

async function manifest(p,{expertId,family,ch,bytes}){
  const raw={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_DELTA_MANIFEST_V1_SCHEMA,
    expertId,
    specialistHypothesis:family,
    adapterKind:'LORA_LOW_RANK',
    experimentPlanSha256:p.planEvidenceSha256,
    denseBaselineDecisionSha256:p.denseBaselineDecisionSha256,
    denseBaselineContentSha256:p.denseBaselineContentSha256,
    targetModuleSetSha256:h('9'),
    adapterConfigSha256:h('a'),
    artifactUri:'bers://hsme3/expert/'+expertId+'/'+h(ch),
    artifactRevision:h(ch),
    contentSha256:h(ch),
    artifactBytes:bytes,
    trainableParameters:10_000_000,
    exportToolchainSha256:h('b'),
    trainingReceiptSha256:h('c'),
    license:'SYNTHETIC-COMMERCIAL',
    licenseEvidenceSha256:h('d'),
    requiresSharedBaseline:true,
    containsFullBackboneWeights:false,
    ...manifestAuthority(),
  };
  const manifestSha256=await hsmeAdapterMoeExpertDeltaManifestV1Digest(raw,hash);
  return {manifest:raw,manifestSha256};
}

async function packSet(p){
  const a=await manifest(p,{expertId:'fashion-adapter-v1',family:'FASHION',ch:'e',bytes:80_000_000});
  const b=await manifest(p,{expertId:'identity-adapter-v1',family:'IDENTITY_FACE',ch:'f',bytes:90_000_000});
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_PACK_SET_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERT_PACK_SET_READY_NOT_ASSEMBLED',
    blockers:[],
    experimentPlanSha256:p.planEvidenceSha256,
    experimentId:p.experimentId,
    denseBaselineDecisionSha256:p.denseBaselineDecisionSha256,
    denseBaselineContentSha256:p.denseBaselineContentSha256,
    denseBaselinePackageBytes:p.denseBaselinePackageBytes,
    experts:[a,b],
    expertCount:2,
    totalExpertArtifactBytes:170_000_000,
    totalTrainableParameters:20_000_000,
    sharedPathRequired:true,
    fullBackboneExpertAllowed:false,
    packSetEvidenceSha256:h('0'),
    ...packAuthority(),
  };
  const packSetEvidenceSha256=await hsmeAdapterMoeExpertPackSetV1Digest(base,hash);
  return {...base,packSetEvidenceSha256};
}

async function realEvidence(p,entry,index){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_REAL_RUN_EVIDENCE_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERT_REAL_RUN_READY_NOT_PACKED',
    blockers:[],
    preflightEvidenceSha256:h(String((index+1)%10)),
    trainingRunReceiptSha256:h(String((index+2)%10)),
    artifactAttestationSha256:h(String((index+3)%10)),
    experimentPlanSha256:p.planEvidenceSha256,
    trainingSpecSha256:h(String((index+4)%10)),
    expertId:entry.manifest.expertId,
    workspaceFreezeReceiptSha256:h(String((index+5)%10)),
    workspaceSha256:h(String((index+6)%10)),
    executionAttemptId:'synthetic-execution-'+index,
    consumedTrainingExamples:500,
    consumedGpuSeconds:120,
    consumedTrainingCostMicrousd:1_000_000,
    realProtectedExecution:true,
    manifest:entry.manifest,
    manifestSha256:entry.manifestSha256,
    evidenceSha256:h('0'),
    expertPackAdmissionAllowed:false,
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
  const evidenceSha256=await hsmeAdapterMoeExpertRealRunEvidenceV1Digest(base,hash);
  return {...base,evidenceSha256};
}

function attestation(p,pack,variant,maxActiveExperts,overrides={}){
  return {
    schemaVersion:HSME_ADAPTER_MOE_PROTOTYPE_ASSEMBLY_ATTESTATION_V1_SCHEMA,
    experimentPlanSha256:p.planEvidenceSha256,
    expertPackSetSha256:pack.packSetEvidenceSha256,
    variant,
    routerKind:'TASK_COARSE_STATIC',
    routerContentSha256:variant==='SHARED_TOP1_ADAPTER'?h('1'):h('2'),
    routerConfigSha256:variant==='SHARED_TOP1_ADAPTER'?h('3'):h('4'),
    routerBytes:2_000_000,
    routerUri:'bers://hsme3/router/'+variant.toLowerCase(),
    routerRevision:variant==='SHARED_TOP1_ADAPTER'?h('5'):h('6'),
    routerToolchainSha256:h('7'),
    routerLicense:'SYNTHETIC-COMMERCIAL',
    routerLicenseEvidenceSha256:h('8'),
    expertIds:['fashion-adapter-v1','identity-adapter-v1'],
    maxActiveExperts,
    sharedPathRequired:true,
    deterministicReplayRequired:true,
    fullBackboneExpertAllowed:false,
    reviewState:'R_AND_D_ASSEMBLY_REVIEWED',
    ...prototypeAuthority(),
    ...overrides,
  };
}

const truePlanOrigin={async verifyExperimentPlan(){return true;}};
const truePackOrigin={async verifyExpertPackSet(){return true;}};
const trueRealOrigin={async verifyRealExpertEvidence(){return true;}};
const falseRealOrigin={async verifyRealExpertEvidence(){return false;}};
const trueAssemblyOrigin={async verifyAssemblyAttestation(){return true;}};
const falseAssemblyOrigin={async verifyAssemblyAttestation(){return false;}};

async function fixture(){
  const p=await plan();
  const pack=await packSet(p);
  const real=[];
  for(let i=0;i<pack.experts.length;i++){
    const evidence=await realEvidence(p,pack.experts[i],i);
    real.push({evidence,expectedEvidenceSha256:evidence.evidenceSha256});
  }
  const top1=attestation(p,pack,'SHARED_TOP1_ADAPTER',1);
  const top2=attestation(p,pack,'SHARED_TOP2_ADAPTER',2);
  const top1Sha=await hsmeAdapterMoePrototypeAssemblyAttestationV1Digest(top1,hash);
  const top2Sha=await hsmeAdapterMoePrototypeAssemblyAttestationV1Digest(top2,hash);
  return {
    p,pack,real,
    assemblies:[
      {rawAttestation:top1,expectedAttestationSha256:top1Sha},
      {rawAttestation:top2,expectedAttestationSha256:top2Sha},
    ],
  };
}

async function assemble(f,overrides={}){
  return assembleHsmeAdapterMoePrototypeRosterV1(
    overrides.p??f.p,
    overrides.planSha??f.p.planEvidenceSha256,
    overrides.planOrigin??truePlanOrigin,
    overrides.pack??f.pack,
    overrides.packSha??f.pack.packSetEvidenceSha256,
    overrides.packOrigin??truePackOrigin,
    overrides.real??f.real,
    overrides.realOrigin??trueRealOrigin,
    overrides.assemblies??f.assemblies,
    overrides.assemblyOrigin??trueAssemblyOrigin,
    hash,
  );
}

test('exact real expert set assembles deterministic Top-1 and Top-2 prototype roster',async()=>{
  const f=await fixture();
  const first=await assemble(f);
  const second=await assemble(f,{
    real:[...f.real].reverse(),
    assemblies:[...f.assemblies].reverse(),
  });

  assert.equal(first.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_READY_NOT_EXECUTED');
  assert.deepEqual(first.blockers,[]);
  assert.deepEqual(first.prototypes.map(x=>x.variant),[
    'SHARED_TOP1_ADAPTER','SHARED_TOP2_ADAPTER',
  ]);
  assert.equal(first.prototypes[0].maxActiveExperts,1);
  assert.equal(first.prototypes[1].maxActiveExperts,2);
  assert.deepEqual(first.prototypes[0].expertIds,first.prototypes[1].expertIds);
  assert.equal(first.prototypes[0].packageBytes,872_000_000);
  assert.equal(first.inferenceExecutionAllowed,false);
  assert.equal(first.modelInstallAllowed,false);
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeAdapterMoePrototypeRosterV1Digest(first,hash),
    first.rosterEvidenceSha256,
  );
});

test('every pack-set expert requires exact real protected evidence',async()=>{
  const f=await fixture();
  let result=await assemble(f,{real:f.real.slice(0,1)});
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_PROTOTYPE_REAL_EVIDENCE_COVERAGE_INVALID'),
  );

  result=await assemble(f,{realOrigin:falseRealOrigin});
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');
});

test('mandatory Top-1 and Top-2 variants cannot be omitted or duplicated',async()=>{
  const f=await fixture();
  let result=await assemble(f,{assemblies:[f.assemblies[0],f.assemblies[0]]});
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');

  result=await assemble(f,{assemblies:[f.assemblies[0]]});
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');
});

test('router Top-K must match the frozen prototype variant',async()=>{
  const f=await fixture();
  const bad=attestation(f.p,f.pack,'SHARED_TOP1_ADAPTER',2);
  const badSha=await hsmeAdapterMoePrototypeAssemblyAttestationV1Digest(bad,hash);
  const result=await assemble(f,{
    assemblies:[
      {rawAttestation:bad,expectedAttestationSha256:badSha},
      f.assemblies[1],
    ],
  });
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_PROTOTYPE_ASSEMBLY_BINDING_INVALID'),
  );
});

test('Top-1 and Top-2 must use the exact same canonical expert set',async()=>{
  const f=await fixture();
  const partial=attestation(
    f.p,f.pack,'SHARED_TOP1_ADAPTER',1,
    {expertIds:['fashion-adapter-v1']},
  );
  const partialSha=
    await hsmeAdapterMoePrototypeAssemblyAttestationV1Digest(partial,hash);
  const result=await assemble(f,{
    assemblies:[
      {rawAttestation:partial,expectedAttestationSha256:partialSha},
      f.assemblies[1],
    ],
  });
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');
});

test('assembly attestation origin and digest are mandatory',async()=>{
  const f=await fixture();
  let result=await assemble(f,{assemblyOrigin:falseAssemblyOrigin});
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');

  const drift={
    ...f.assemblies[0],
    expectedAttestationSha256:h('0'),
  };
  result=await assemble(f,{assemblies:[drift,f.assemblies[1]]});
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');
});

test('pack-set cannot be rebound to another plan or dense baseline',async()=>{
  const f=await fixture();
  const pack={
    ...f.pack,
    denseBaselineContentSha256:h('f'),
  };
  const packSetEvidenceSha256=await hsmeAdapterMoeExpertPackSetV1Digest(pack,hash);
  const result=await assemble(f,{
    pack:{...pack,packSetEvidenceSha256},
    packSha:packSetEvidenceSha256,
  });
  assert.equal(result.state,'ADAPTER_MOE_PROTOTYPE_ROSTER_INVALID');
  assert.ok(
    result.blockers.includes('ADAPTER_MOE_PROTOTYPE_PACK_SET_BINDING_MISMATCH'),
  );
});
