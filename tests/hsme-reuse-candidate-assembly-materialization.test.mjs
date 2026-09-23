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
  assembleHsmeFoundationReuseCandidateEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseCandidateEvidenceAssemblyV1.ts';
import {
  candidateAssemblyOriginIndexDigest,
  jsonFileBytes,
  materializeHsmeReuseCandidateAssembly,
  sha256Bytes,
  HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
} from '../scripts/materialize-hsme-reuse-candidate-assembly.mjs';

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

function sourceDecision({workingBudget=1_000_000_000}={}){
  const meta=campaign.candidates.find(value=>value.candidateId===CANDIDATE);
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:workingBudget,
    rationale:['candidate assembly materialization test remains proof-only'],
    candidates:[
      placeholder('control-assembly-materializer','CONTROL_BASELINE'),
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
      placeholder('adapt-assembly-materializer','FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function overlay(capability,{working=300_000_000,installed=165}={}){
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
    otherRequiredBytes:installed-160,
    mandatoryInstalledBytes:installed,
    workingMemoryBytes:working,
    componentMapSha256:H('shared-components'),
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
    runEvidenceSha256:H('assembly-materializer-quality-run-'+capability),
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

const qualityOrigin={
  async verifyQualityFinalization(){return true;},
};

async function qualificationProof(rawDecision,capability,{working=300_000_000}={}){
  const runtimeOverlay=overlay(capability,{working});
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    rawDecision,
    CANDIDATE,
    capability,
    runtimeOverlay,
    runtimeOverlay.runtimeEvidenceSha256,
    hashPort,
  );
  assert.equal(application.state,'RUNTIME_OVERLAY_APPLIED_PENDING');
  const finalization=qualityFinalization(capability,'QUALITY_FLOOR_PASS');
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(
    finalization,
    hashPort,
  );
  const proof=await qualifyHsmeFoundationReuseEvidenceV1(
    application,
    runtimeOverlay,
    CANDIDATE,
    capability,
    campaign,
    trust,
    finalization,
    qualitySha,
    qualityOrigin,
    trainingAttestation(capability,runtimeOverlay),
    hashPort,
  );
  assert.equal(proof.state,'QUALIFICATION_EVIDENCE_READY');
  return proof;
}

async function rejectionProof(
  rawDecision,
  capability,
  {qualityState='QUALITY_FLOOR_FAIL',working=300_000_000}={},
){
  const runtimeOverlay=overlay(capability,{working});
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    rawDecision,
    CANDIDATE,
    capability,
    runtimeOverlay,
    runtimeOverlay.runtimeEvidenceSha256,
    hashPort,
  );
  assert.equal(application.state,'RUNTIME_OVERLAY_APPLIED_PENDING');
  const finalization=qualityFinalization(capability,qualityState);
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(
    finalization,
    hashPort,
  );
  const proof=await proveHsmeFoundationReuseEvidenceRejectionV1(
    application,
    runtimeOverlay,
    CANDIDATE,
    capability,
    campaign,
    trust,
    finalization,
    qualitySha,
    qualityOrigin,
    hashPort,
  );
  assert.equal(proof.state,'REJECTION_EVIDENCE_READY');
  return proof;
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

function proofKind(proof){
  return proof.schemaVersion.includes('QUALIFICATION')
    ?'QUALIFICATION'
    :'REJECTION';
}

function originIndex(source,campaignInput,proofInputs){
  return {
    schemaVersion:HSME_REUSE_CANDIDATE_ASSEMBLY_ORIGIN_INDEX_V1_SCHEMA,
    candidateId:CANDIDATE,
    sourceDecisionFileSha256:source.fileSha256,
    campaignFileSha256:campaignInput.fileSha256,
    proofs:proofInputs.map(item=>({
      kind:proofKind(item.value),
      capability:item.value.capability,
      fileSha256:item.fileSha256,
      evidenceSetSha256:item.value.evidenceSetSha256,
    })),
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
}

async function fixture({proofMode='QUALIFIED'}={}){
  const raw=sourceDecision();
  const source=loaded(raw);
  const campaignInput=loaded(campaign);
  let proofValues;
  if(proofMode==='QUALIFIED'){
    proofValues=[
      await qualificationProof(raw,'IMAGE_EDITING',{working:420_000_000}),
      await qualificationProof(raw,'TEXT_TO_IMAGE',{working:310_000_000}),
    ];
  }else if(proofMode==='INCOMPLETE'){
    proofValues=[await qualificationProof(raw,'IMAGE_EDITING')];
  }else{
    proofValues=[await rejectionProof(raw,'IMAGE_EDITING')];
  }
  const proofs=proofValues.map(loaded);
  const index=originIndex(source,campaignInput,proofs);
  return {
    raw,
    sourceDecision:source,
    campaign:campaignInput,
    proofs,
    originIndex:loaded(index),
    expectedOriginIndexSha256:candidateAssemblyOriginIndexDigest(index),
  };
}

test('trusted proof files materialize the same QUALIFIED assembly as canonical direct call',async()=>{
  const input=await fixture({proofMode:'QUALIFIED'});
  const result=await materializeHsmeReuseCandidateAssembly(input);
  const direct=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    input.raw,
    campaign,
    CANDIDATE,
    input.proofs.map(value=>value.value),
    [],
    {
      async verifyQualificationEvidence(){return true;},
      async verifyRejectionEvidence(){return true;},
    },
    hashPort,
  );

  assert.deepEqual(result.assembly,direct);
  assert.equal(result.assembly.state,'CANDIDATE_EVIDENCE_QUALIFIED');
  assert.match(result.assembly.candidateEvidenceSetSha256,/^[0-9a-f]{64}$/);
  assert.match(result.assembly.assembledCandidateSha256,/^[0-9a-f]{64}$/);
  assert.equal(result.materialization.originVerifierCallCount,2);
  assert.match(
    result.materialization.materializationEvidenceSha256,
    /^[0-9a-f]{64}$/,
  );
});

test('incomplete trusted proof set remains canonical CANDIDATE_EVIDENCE_INCOMPLETE',async()=>{
  const result=await materializeHsmeReuseCandidateAssembly(
    await fixture({proofMode:'INCOMPLETE'}),
  );
  assert.equal(result.assembly.state,'CANDIDATE_EVIDENCE_INCOMPLETE');
  assert.equal(result.assembly.candidate,null);
  assert.deepEqual(result.assembly.missingCapabilities,['TEXT_TO_IMAGE']);
  assert.equal(result.materialization.originVerifierCallCount,1);
});

test('trusted quality rejection remains canonical rejection and grants no escalation authority',async()=>{
  const result=await materializeHsmeReuseCandidateAssembly(
    await fixture({proofMode:'REJECTED'}),
  );
  assert.equal(result.assembly.state,'CANDIDATE_EVIDENCE_REJECTED');
  assert.deepEqual(result.assembly.candidate.rejectionReasons,['QUALITY_FLOOR_FAILED']);
  assert.equal(result.assembly.fullStudentEscalationAllowed,false);
  assert.equal(result.assembly.reuseAdvanceAllowed,false);
  assert.equal(result.materialization.originVerifierCallCount,1);
});

test('same exact inputs produce byte-identical assembly and sidecar',async()=>{
  const input=await fixture({proofMode:'QUALIFIED'});
  const first=await materializeHsmeReuseCandidateAssembly(input);
  const second=await materializeHsmeReuseCandidateAssembly(input);
  assert.deepEqual(first.files.assembly,second.files.assembly);
  assert.deepEqual(first.files.materialization,second.files.materialization);
});

test('external origin-index digest mismatch fails before canonical assembly',async()=>{
  const input=await fixture({proofMode:'INCOMPLETE'});
  await assert.rejects(
    ()=>materializeHsmeReuseCandidateAssembly({
      ...input,
      expectedOriginIndexSha256:H('wrong-origin-index'),
    }),
    error=>
      error.code==='hsme_candidate_assembly_materialization_origin_digest_mismatch',
  );
});

test('raw proof byte drift fails before canonical assembly',async()=>{
  const input=await fixture({proofMode:'INCOMPLETE'});
  const changed={
    ...input,
    proofs:[loaded(input.proofs[0].value,{suffix:'\n'})],
  };
  await assert.rejects(
    ()=>materializeHsmeReuseCandidateAssembly(changed),
    error=>
      error.code==='hsme_candidate_assembly_materialization_file_digest_mismatch',
  );
});

test('proof semantic evidenceSet digest drift fails at the external trust boundary',async()=>{
  const input=await fixture({proofMode:'INCOMPLETE'});
  const forged=structuredClone(input.originIndex.value);
  forged.proofs[0].evidenceSetSha256=H('forged-proof-set');
  await assert.rejects(
    ()=>materializeHsmeReuseCandidateAssembly({
      ...input,
      originIndex:loaded(forged),
      expectedOriginIndexSha256:candidateAssemblyOriginIndexDigest(forged),
    }),
    error=>
      error.code===
      'hsme_candidate_assembly_materialization_proof_semantic_digest_mismatch',
  );
});

test('origin index authority widening fails closed',async()=>{
  const input=await fixture({proofMode:'INCOMPLETE'});
  const forged=structuredClone(input.originIndex.value);
  forged.winnerSelectionAllowed=true;
  await assert.rejects(
    ()=>materializeHsmeReuseCandidateAssembly({
      ...input,
      originIndex:loaded(forged),
      expectedOriginIndexSha256:H('not-reached'),
    }),
    error=>
      error.code==='hsme_candidate_assembly_materialization_authority_invalid',
  );
});

test('materializer and canonical assembly never grant decision, execution or production authority',async()=>{
  const result=await materializeHsmeReuseCandidateAssembly(
    await fixture({proofMode:'QUALIFIED'}),
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
