import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  hsmeAdapterMoeExpertDeltaManifestV1Digest,
} from './HsmeAdapterMoeExpertPackSetV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingRunReceiptV1Digest,
} from './HsmeAdapterMoeExpertProtectedTrainingRunV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_V1_SCHEMA,
  deriveHsmeAdapterMoeExpertRealRunEvidenceV1,
  hsmeAdapterMoeExpertArtifactAttestationV1Digest,
  hsmeAdapterMoeExpertRealRunEvidenceV1Digest,
} from './HsmeAdapterMoeExpertRealRunEvidenceV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
  HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
} from './HsmeAdapterMoeExpertSealedWorkspaceV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
function h(ch){return ch.repeat(64);}
function commonAuthority(){
  return {
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

async function preflight(){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED',
    blockers:[],
    experimentPlanSha256:h('1'),
    trainingSpecSha256:h('2'),
    experimentId:'hsme3-adapter-moe-prototype-001',
    expertId:'fashion-adapter-v1',
    specialistHypothesis:'FASHION',
    adapterKind:'LORA_LOW_RANK',
    denseBaselineDecisionSha256:h('3'),
    denseBaselineContentSha256:h('4'),
    denseBaselinePackageBytes:700_000_000,
    targetModuleSetSha256:h('5'),
    adapterConfigSha256:h('6'),
    trainingCorpusRootSha256:h('7'),
    reproductionContractSha256:h('8'),
    immutableEnvironmentSha256:h('9'),
    trainingToolchainSha256:h('a'),
    trainerEntrypointSha256:h('b'),
    license:'SYNTHETIC-COMMERCIAL-EXPERT-FIXTURE',
    licenseEvidenceSha256:h('c'),
    resourceCeilings:{
      maxTrainingExamples:100_000,
      maxGpuSeconds:14_400,
      maxTrainingCostMicrousd:25_000_000,
      maxStagedArtifactBytes:120_000_000,
      maxTrainableParameters:25_000_000,
    },
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    preflightEvidenceSha256:h('0'),
    trainingExecutionAllowed:false,
    workspaceMaterializationAllowed:false,
    prototypeAssemblyAllowed:false,
    ...commonAuthority(),
  };
  const preflightEvidenceSha256=
    await hsmeAdapterMoeExpertTrainingPreflightV1Digest(base,hash);
  return {...base,preflightEvidenceSha256};
}

async function runReceipt(p){
  const stagedExpertDelta={
    expertId:p.expertId,
    adapterKind:p.adapterKind,
    denseBaselineContentSha256:p.denseBaselineContentSha256,
    targetModuleSetSha256:p.targetModuleSetSha256,
    adapterConfigSha256:p.adapterConfigSha256,
    artifactSha256:h('d'),
    artifactBytes:80_000_000,
    trainableParameters:12_000_000,
    artifactMetadataSha256:h('e'),
    trainingSpecSha256:p.trainingSpecSha256,
    reproductionContractSha256:p.reproductionContractSha256,
    stagedDeltaPath:HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
    stagedMetadataPath:HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
  };
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
    state:'EXPERT_TRAINING_RUN_COMPLETED_DELTA_STAGED_NOT_PACKED',
    blockers:[],
    preflightEvidenceSha256:p.preflightEvidenceSha256,
    workspaceFreezeReceiptSha256:h('f'),
    workspaceSha256:h('1'),
    inventorySha256:h('2'),
    experimentPlanSha256:p.experimentPlanSha256,
    trainingSpecSha256:p.trainingSpecSha256,
    expertId:p.expertId,
    specialistHypothesis:p.specialistHypothesis,
    adapterKind:p.adapterKind,
    executionAttemptId:'synthetic-execution-001',
    startedAtMs:1000,
    finishedAtMs:2000,
    exitCode:0,
    processSpawned:true,
    trainingStarted:true,
    consumedTrainingExamples:500,
    consumedGpuSeconds:120,
    consumedTrainingCostMicrousd:1_000_000,
    stdoutEvidenceSha256:h('3'),
    stderrEvidenceSha256:h('4'),
    stagedExpertDelta,
    hostResultSha256:h('5'),
    receiptEvidenceSha256:h('0'),
    expertPackAdmissionAllowed:false,
    prototypeAssemblyAllowed:false,
    ...commonAuthority(),
  };
  const receiptEvidenceSha256=
    await hsmeAdapterMoeExpertTrainingRunReceiptV1Digest(base,hash);
  return {...base,receiptEvidenceSha256};
}

function rawAttestation(p,r,overrides={}){
  return {
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_ARTIFACT_ATTESTATION_V1_SCHEMA,
    expertId:p.expertId,
    trainingRunReceiptSha256:r.receiptEvidenceSha256,
    artifactSha256:r.stagedExpertDelta.artifactSha256,
    artifactBytes:r.stagedExpertDelta.artifactBytes,
    artifactMetadataSha256:r.stagedExpertDelta.artifactMetadataSha256,
    artifactUri:'bers://hsme3/expert/fashion-adapter-v1/'+h('d'),
    artifactRevision:h('d'),
    license:p.license,
    licenseEvidenceSha256:p.licenseEvidenceSha256,
    reviewState:'REAL_PROTECTED_ARTIFACT_VERIFIED',
    expertPackAdmissionAllowed:false,
    prototypeAssemblyAllowed:false,
    ...commonAuthority(),
    ...overrides,
  };
}

const truePreflightOrigin={async verifyTrainingPreflight(){return true;}};
const falsePreflightOrigin={async verifyTrainingPreflight(){return false;}};
const trueReceiptOrigin={async verifyTrainingRunReceipt(){return true;}};
const falseReceiptOrigin={async verifyTrainingRunReceipt(){return false;}};
const trueRealOrigin={async verifyRealProtectedRun(){return true;}};
const falseRealOrigin={async verifyRealProtectedRun(){return false;}};
const trueAttestationOrigin={async verifyArtifactAttestation(){return true;}};
const falseAttestationOrigin={async verifyArtifactAttestation(){return false;}};

async function fixture(){
  const p=await preflight();
  const r=await runReceipt(p);
  const attestation=rawAttestation(p,r);
  const attestationSha=
    await hsmeAdapterMoeExpertArtifactAttestationV1Digest(attestation,hash);
  return {p,r,attestation,attestationSha};
}

async function derive(f,overrides={}){
  return deriveHsmeAdapterMoeExpertRealRunEvidenceV1(
    overrides.p??f.p,
    overrides.preflightSha??f.p.preflightEvidenceSha256,
    overrides.preflightOrigin??truePreflightOrigin,
    overrides.r??f.r,
    overrides.receiptSha??f.r.receiptEvidenceSha256,
    overrides.receiptOrigin??trueReceiptOrigin,
    overrides.realOrigin??trueRealOrigin,
    overrides.attestation??f.attestation,
    overrides.attestationSha??f.attestationSha,
    overrides.attestationOrigin??trueAttestationOrigin,
    hash,
  );
}

test('external real origin plus exact attestation derives canonical HSME-3.2 manifest',async()=>{
  const f=await fixture();
  const first=await derive(f);
  const second=await derive(f);

  assert.equal(first.state,'ADAPTER_MOE_EXPERT_REAL_RUN_READY_NOT_PACKED');
  assert.equal(first.realProtectedExecution,true);
  assert.deepEqual(first.blockers,[]);
  assert.equal(first.expertId,f.p.expertId);
  assert.equal(first.manifest.expertId,f.p.expertId);
  assert.equal(first.manifest.specialistHypothesis,f.p.specialistHypothesis);
  assert.equal(first.manifest.adapterKind,f.p.adapterKind);
  assert.equal(first.manifest.contentSha256,f.r.stagedExpertDelta.artifactSha256);
  assert.equal(first.manifest.artifactBytes,f.r.stagedExpertDelta.artifactBytes);
  assert.equal(first.manifest.trainableParameters,f.r.stagedExpertDelta.trainableParameters);
  assert.equal(first.manifest.trainingReceiptSha256,f.r.receiptEvidenceSha256);
  assert.equal(first.manifest.requiresSharedBaseline,true);
  assert.equal(first.manifest.containsFullBackboneWeights,false);
  assert.equal(first.manifest.standaloneExecutionAllowed,false);
  assert.equal(first.expertPackAdmissionAllowed,false);
  assert.equal(first.prototypeAssemblyAllowed,false);
  assert.equal(
    await hsmeAdapterMoeExpertDeltaManifestV1Digest(first.manifest,hash),
    first.manifestSha256,
  );
  assert.equal(
    await hsmeAdapterMoeExpertRealRunEvidenceV1Digest(first,hash),
    first.evidenceSha256,
  );
  assert.deepEqual(first,second);
});

test('synthetic-shaped completed receipt stays BLOCKED when real protected origin is unverified',async()=>{
  const f=await fixture();
  const result=await derive(f,{realOrigin:falseRealOrigin});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_BLOCKED');
  assert.equal(result.realProtectedExecution,false);
  assert.equal(result.manifest,null);
  assert.equal(result.manifestSha256,'UNKNOWN');
  assert.ok(result.blockers.includes('REAL_EXPERT_PROTECTED_ORIGIN_UNVERIFIED'));
});

test('preflight and run-receipt exact origins are independently mandatory',async()=>{
  const f=await fixture();
  let result=await derive(f,{preflightOrigin:falsePreflightOrigin});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID');

  result=await derive(f,{receiptOrigin:falseReceiptOrigin});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID');
});

test('artifact attestation exact origin is mandatory after real-run verification',async()=>{
  const f=await fixture();
  const result=await derive(f,{attestationOrigin:falseAttestationOrigin});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID');
  assert.equal(result.realProtectedExecution,true);
  assert.equal(result.manifest,null);
});

test('artifact or license drift cannot alter the derived canonical manifest',async()=>{
  const f=await fixture();
  for(const overrides of [
    {artifactSha256:h('f')},
    {artifactBytes:70_000_000},
    {artifactMetadataSha256:h('f')},
    {license:'OTHER-LICENSE'},
    {licenseEvidenceSha256:h('f')},
  ]){
    const attestation=rawAttestation(f.p,f.r,overrides);
    const attestationSha=
      await hsmeAdapterMoeExpertArtifactAttestationV1Digest(attestation,hash);
    const result=await derive(f,{attestation,attestationSha});
    assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID');
    assert.ok(
      result.blockers.includes(
        'REAL_EXPERT_ARTIFACT_ATTESTATION_BINDING_MISMATCH',
      ),
    );
  }
});

test('attestation digest drift and unknown authority widening fail closed',async()=>{
  const f=await fixture();
  let result=await derive(f,{attestationSha:h('0')});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID');
  assert.ok(
    result.blockers.includes(
      'REAL_EXPERT_ARTIFACT_ATTESTATION_REHASH_MISMATCH',
    ),
  );

  const widened=rawAttestation(f.p,f.r,{modelInstallAllowed:true});
  result=await derive(f,{attestation:widened,attestationSha:h('0')});
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID');
  assert.ok(result.blockers.includes('REAL_EXPERT_ARTIFACT_ATTESTATION_INVALID'));
});

test('run receipt cross-binding drift is invalid before real origin admission',async()=>{
  const f=await fixture();
  const r={
    ...f.r,
    expertId:'other-expert-v1',
  };
  const receiptEvidenceSha256=
    await hsmeAdapterMoeExpertTrainingRunReceiptV1Digest(r,hash);
  const result=await derive(f,{
    r:{...r,receiptEvidenceSha256},
    receiptSha:receiptEvidenceSha256,
  });
  assert.equal(result.state,'ADAPTER_MOE_EXPERT_REAL_RUN_INVALID');
  assert.ok(
    result.blockers.includes('REAL_EXPERT_RUN_PREFLIGHT_BINDING_MISMATCH'),
  );
});
