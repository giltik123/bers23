import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  applyHsmeFoundationPhysicalReuseRuntimeOverlayV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPendingReuseRuntimeApplicationV1.ts';
import {
  HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalReuseRuntimeOverlayV1.ts';
import {
  HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
  hsmeFoundationQualityFinalizationV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFinalizationV1.ts';
import {
  HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA,
  qualifyHsmeFoundationReuseEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceQualificationV1.ts';
import {
  proveHsmeFoundationReuseEvidenceRejectionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceRejectionV1.ts';
import {
  capabilityProofOriginIndexDigest,
  compileHsmeReuseCapabilityProof,
  HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1_SCHEMA,
  jsonFileBytes,
  sha256Bytes,
} from '../scripts/compile-hsme-reuse-capability-proof.mjs';

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const trust=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json',
  'utf8',
));
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const CANDIDATE='flux2-klein-4b-distilled-v1';

function unknownRuntime(){
  return {
    backboneBytes:'UNKNOWN',
    conditionerBytes:'UNKNOWN',
    vaeBytes:'UNKNOWN',
    adapterBytes:'UNKNOWN',
    otherRequiredBytes:'UNKNOWN',
    mandatoryInstalledBytes:'UNKNOWN',
    workingMemoryBytes:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
  };
}

function zeroTraining(){
  return {
    mode:'ZERO_TRAINING',
    trainableParameters:0,
    frozenParameters:'UNKNOWN',
    trainingExamples:0,
    gpuSeconds:0,
    trainingCostMicrousd:0,
    evidenceSha256:'UNKNOWN',
  };
}

function placeholder(id,strategy){
  return {
    candidateId:id,
    strategy,
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:{
      sourceRoot:'bers/'+id,
      immutableRevision:'a'.repeat(40),
      contentSha256:H(id+'-source'),
    },
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unknownRuntime(),
    training:strategy==='DIRECT_FOUNDATION'
      ?zeroTraining()
      :{
        mode:'LORA',
        trainableParameters:10,
        frozenParameters:1000,
        trainingExamples:10,
        gpuSeconds:10,
        trainingCostMicrousd:100,
        evidenceSha256:'UNKNOWN',
      },
    rejectionReasons:[],
  };
}

function sourceDecision(){
  const meta=campaign.candidates.find(value=>value.candidateId===CANDIDATE);
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['capability proof compiler preserves pending source decision'],
    candidates:[
      placeholder('control-capability-proof','CONTROL_BASELINE'),
      {
        candidateId:CANDIDATE,
        strategy:'DIRECT_FOUNDATION',
        targetTier:'MOBILE_DEFAULT',
        evidenceState:'UNRESOLVED',
        source:{
          sourceRoot:meta.sourceRoot,
          immutableRevision:meta.immutableRevision,
          contentSha256:meta.modelContentSha256,
        },
        licenseConclusion:'REVIEW_REQUIRED',
        licenseEvidenceSha256:'UNKNOWN',
        quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
        runtime:unknownRuntime(),
        training:zeroTraining(),
        rejectionReasons:[],
      },
      placeholder('adapt-capability-proof','FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function overlay(capability,{working=300_000_000}={}){
  const meta=campaign.candidates.find(value=>value.candidateId===CANDIDATE);
  const base={
    schemaVersion:'BERS_HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1',
    candidateId:CANDIDATE,
    capability,
    state:'PHYSICAL_RUNTIME_EVIDENCE_READY',
    blockers:[],
    targetTier:'MOBILE_DEFAULT',
    backboneBytes:100,
    conditionerBytes:20,
    vaeBytes:30,
    adapterBytes:10,
    otherRequiredBytes:5,
    mandatoryInstalledBytes:165,
    workingMemoryBytes:working,
    componentMapSha256:H('capability-proof-components'),
    physicalTargetBindingSha256:H(CANDIDATE+'-'+capability+'-physical-binding'),
    targetEvidenceSha256:H(CANDIDATE+'-'+capability+'-target-evidence'),
    sourceExecutionProfileSha256:meta.executionProfileSha256,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
    licenseMutationAllowed:false,
    qualityMutationAllowed:false,
    trainingEvidenceMutationAllowed:false,
    decisionMutationAllowed:false,
  };
  const payload={
    schemaVersion:base.schemaVersion,
    candidateId:base.candidateId,
    capability:base.capability,
    targetTier:base.targetTier,
    backboneBytes:base.backboneBytes,
    conditionerBytes:base.conditionerBytes,
    vaeBytes:base.vaeBytes,
    adapterBytes:base.adapterBytes,
    otherRequiredBytes:base.otherRequiredBytes,
    mandatoryInstalledBytes:base.mandatoryInstalledBytes,
    workingMemoryBytes:base.workingMemoryBytes,
    componentMapSha256:base.componentMapSha256,
    physicalTargetBindingSha256:base.physicalTargetBindingSha256,
    targetEvidenceSha256:base.targetEvidenceSha256,
    sourceExecutionProfileSha256:base.sourceExecutionProfileSha256,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
  return {
    ...base,
    runtimeEvidenceSha256:H(
      HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN
      +JSON.stringify(payload),
    ),
  };
}

function qualityFinalization(capability,state='QUALITY_FLOOR_PASS'){
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
    campaignId:campaign.campaignId,
    runEvidenceSha256:H('capability-proof-quality-run-'+capability),
    runEvidenceState:'FULL_COMPLETE',
    finalizationState:'FULL_FINALIZED',
    aggregationPolicy:'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN',
    medianPolicy:'EVEN_ARITHMETIC_MEAN_HALF_UP',
    rows:[{
      candidateId:CANDIDATE,
      capability,
      qualityState:state,
      outputSetSha256:H(CANDIDATE+'-'+capability+'-output'),
      dimensionResults:[{
        dimensionId:capability==='IMAGE_EDITING'
          ?'identity-preservation'
          :'semantic-adherence',
        reviewMode:'HYBRID',
        maxLossMicrounits:100_000,
        lossMicrounits:state==='QUALITY_FLOOR_FAIL'?200_000:10_000,
        criticalFailureObserved:state==='QUALITY_FLOOR_FAIL',
        evidenceSha256:H(CANDIDATE+'-'+capability+'-dimension'),
        passesFloor:state==='QUALITY_FLOOR_PASS',
      }],
    }],
    slices:[],
    qualityEvidenceFrozen:true,
    efficiencyUsedInQualitySelection:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
}

function trainingAttestation(capability,runtimeOverlay){
  const meta=campaign.candidates.find(value=>value.candidateId===CANDIDATE);
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA,
    candidateId:CANDIDATE,
    capability,
    sourceRoot:meta.sourceRoot,
    immutableRevision:meta.immutableRevision,
    sourceContentSha256:meta.modelContentSha256,
    runtimeEvidenceSha256:runtimeOverlay.runtimeEvidenceSha256,
    targetEvidenceSha256:runtimeOverlay.targetEvidenceSha256,
    mode:'ZERO_TRAINING',
    trainableParameters:0,
    frozenParameters:'UNKNOWN',
    trainingExamples:0,
    gpuSeconds:0,
    trainingCostMicrousd:0,
    productionAuthorityGranted:false,
    trainingAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function loaded(value,{suffix=''}={}){
  const bytes=Buffer.concat([
    jsonFileBytes(value),
    Buffer.from(suffix,'utf8'),
  ]);
  return Object.freeze({
    fileSha256:sha256Bytes(bytes),
    value,
  });
}

async function fixture({
  mode='QUALIFICATION',
  capability='IMAGE_EDITING',
  qualityState=mode==='REJECTION'?'QUALITY_FLOOR_FAIL':'QUALITY_FLOOR_PASS',
}={}){
  const rawDecision=sourceDecision();
  const runtime=overlay(capability);
  const quality=qualityFinalization(capability,qualityState);
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(
    quality,
    hashPort,
  );
  const training=mode==='QUALIFICATION'
    ?trainingAttestation(capability,runtime)
    :null;

  const sourceDecisionInput=loaded(rawDecision);
  const runtimeOverlayInput=loaded(runtime);
  const campaignInput=loaded(campaign);
  const trustInput=loaded(trust);
  const qualityFinalizationInput=loaded(quality);
  const trainingAttestationInput=training?loaded(training):null;

  const index={
    schemaVersion:HSME_REUSE_CAPABILITY_PROOF_ORIGIN_INDEX_V1_SCHEMA,
    mode,
    candidateId:CANDIDATE,
    capability,
    sourceDecisionFileSha256:sourceDecisionInput.fileSha256,
    runtimeOverlayFileSha256:runtimeOverlayInput.fileSha256,
    runtimeEvidenceSha256:runtime.runtimeEvidenceSha256,
    campaignFileSha256:campaignInput.fileSha256,
    trustFileSha256:trustInput.fileSha256,
    qualityFinalizationFileSha256:qualityFinalizationInput.fileSha256,
    qualityFinalizationSha256:qualitySha,
    trainingAttestationFileSha256:
      trainingAttestationInput?.fileSha256??'NONE',
    decisionMutationAllowed:false,
    candidateSelectionAllowed:false,
    winnerSelectionAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    trainingRunStartAllowed:false,
    trainingOrDistillationAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
  };

  return {
    rawDecision,
    runtime,
    quality,
    training,
    sourceDecision:sourceDecisionInput,
    runtimeOverlay:runtimeOverlayInput,
    campaign:campaignInput,
    trust:trustInput,
    qualityFinalization:qualityFinalizationInput,
    trainingAttestation:trainingAttestationInput,
    originIndex:loaded(index),
    expectedOriginIndexSha256:capabilityProofOriginIndexDigest(index),
  };
}

async function directQualification(input){
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    input.rawDecision,
    CANDIDATE,
    input.runtime.capability,
    input.runtime,
    input.runtime.runtimeEvidenceSha256,
    hashPort,
  );
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(
    input.quality,
    hashPort,
  );
  return qualifyHsmeFoundationReuseEvidenceV1(
    application,
    input.runtime,
    CANDIDATE,
    input.runtime.capability,
    campaign,
    trust,
    input.quality,
    qualitySha,
    {async verifyQualityFinalization(){return true;}},
    input.training,
    hashPort,
  );
}

async function directRejection(input){
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    input.rawDecision,
    CANDIDATE,
    input.runtime.capability,
    input.runtime,
    input.runtime.runtimeEvidenceSha256,
    hashPort,
  );
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(
    input.quality,
    hashPort,
  );
  return proveHsmeFoundationReuseEvidenceRejectionV1(
    application,
    input.runtime,
    CANDIDATE,
    input.runtime.capability,
    campaign,
    trust,
    input.quality,
    qualitySha,
    {async verifyQualityFinalization(){return true;}},
    hashPort,
  );
}

test('QUALIFICATION compiler equals direct canonical proof',async()=>{
  const input=await fixture({mode:'QUALIFICATION'});
  const compiled=await compileHsmeReuseCapabilityProof(input);
  const direct=await directQualification(input);
  assert.deepEqual(compiled.proof,direct);
  assert.equal(compiled.proof.state,'QUALIFICATION_EVIDENCE_READY');
  assert.match(compiled.proof.evidenceSetSha256,/^[0-9a-f]{64}$/);
  assert.equal(compiled.materialization.qualityOriginVerifierCallCount,1);
});

test('REJECTION compiler equals direct canonical hard-blocker proof',async()=>{
  const input=await fixture({mode:'REJECTION'});
  const compiled=await compileHsmeReuseCapabilityProof(input);
  const direct=await directRejection(input);
  assert.deepEqual(compiled.proof,direct);
  assert.equal(compiled.proof.state,'REJECTION_EVIDENCE_READY');
  assert.deepEqual(compiled.proof.derivedRejectionReasons,['QUALITY_FLOOR_FAILED']);
  assert.equal(compiled.materialization.qualityOriginVerifierCallCount,1);
});

test('same exact inputs produce byte-identical proof and sidecar',async()=>{
  const input=await fixture({mode:'QUALIFICATION'});
  const first=await compileHsmeReuseCapabilityProof(input);
  const second=await compileHsmeReuseCapabilityProof(input);
  assert.deepEqual(first.files.proof,second.files.proof);
  assert.deepEqual(first.files.materialization,second.files.materialization);
});

test('external origin-index digest mismatch fails before proof construction',async()=>{
  const input=await fixture({mode:'QUALIFICATION'});
  await assert.rejects(
    ()=>compileHsmeReuseCapabilityProof({
      ...input,
      expectedOriginIndexSha256:H('wrong-origin-index'),
    }),
    error=>error.code==='hsme_capability_proof_compiler_origin_digest_mismatch',
  );
});

test('quality semantic digest drift fails before canonical proof',async()=>{
  const input=await fixture({mode:'QUALIFICATION'});
  const index=structuredClone(input.originIndex.value);
  index.qualityFinalizationSha256=H('forged-quality-digest');
  await assert.rejects(
    ()=>compileHsmeReuseCapabilityProof({
      ...input,
      originIndex:loaded(index),
      expectedOriginIndexSha256:capabilityProofOriginIndexDigest(index),
    }),
    error=>error.code==='hsme_capability_proof_compiler_quality_digest_drift',
  );
});

test('runtime overlay raw-byte drift fails against trusted index',async()=>{
  const input=await fixture({mode:'QUALIFICATION'});
  await assert.rejects(
    ()=>compileHsmeReuseCapabilityProof({
      ...input,
      runtimeOverlay:loaded(input.runtime,{suffix:'\n'}),
    }),
    error=>error.code==='hsme_capability_proof_compiler_file_digest_mismatch',
  );
});

test('QUALIFICATION requires exact training attestation input',async()=>{
  const input=await fixture({mode:'QUALIFICATION'});
  await assert.rejects(
    ()=>compileHsmeReuseCapabilityProof({
      ...input,
      trainingAttestation:null,
    }),
    error=>
      error.code==='hsme_capability_proof_compiler_training_attestation_required',
  );
});

test('REJECTION cannot receive a training attestation',async()=>{
  const input=await fixture({mode:'REJECTION'});
  const training=loaded(trainingAttestation(input.runtime.capability,input.runtime));
  await assert.rejects(
    ()=>compileHsmeReuseCapabilityProof({
      ...input,
      trainingAttestation:training,
    }),
    error=>
      error.code==='hsme_capability_proof_compiler_rejection_training_forbidden',
  );
});

test('compiled proof materialization never grants execution or selection authority',async()=>{
  const result=await compileHsmeReuseCapabilityProof(
    await fixture({mode:'QUALIFICATION'}),
  );
  for(const field of [
    'decisionMutationAllowed',
    'candidateSelectionAllowed',
    'winnerSelectionAllowed',
    'reuseAdvanceAllowed',
    'fullStudentEscalationAllowed',
    'trainingRunStartAllowed',
    'trainingOrDistillationAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
  ]){
    assert.equal(result.materialization[field],false,field);
  }
});
