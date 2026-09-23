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
  hsmeFoundationBenchmarkCampaignV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  hsmeFoundationBenchmarkRightsReviewDigestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8',
));
const trust=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8',
));
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const CANDIDATE='flux2-klein-4b-distilled-v1';
const REQUIRED=['IMAGE_EDITING','TEXT_TO_IMAGE'];
const clone=value=>structuredClone(value);

function unknownRuntime(){
  return {
    backboneBytes:'UNKNOWN',conditionerBytes:'UNKNOWN',vaeBytes:'UNKNOWN',adapterBytes:'UNKNOWN',
    otherRequiredBytes:'UNKNOWN',mandatoryInstalledBytes:'UNKNOWN',
    workingMemoryBytes:'UNKNOWN',evidenceSha256:'UNKNOWN',
  };
}
function zeroTraining(){
  return {
    mode:'ZERO_TRAINING',trainableParameters:0,frozenParameters:'UNKNOWN',
    trainingExamples:0,gpuSeconds:0,trainingCostMicrousd:0,evidenceSha256:'UNKNOWN',
  };
}
function placeholder(id,strategy){
  return {
    candidateId:id,strategy,targetTier:'MOBILE_DEFAULT',evidenceState:'UNRESOLVED',
    source:{sourceRoot:'bers/'+id,immutableRevision:'a'.repeat(40),contentSha256:H(id+'-source')},
    licenseConclusion:'REVIEW_REQUIRED',licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unknownRuntime(),
    training:strategy==='DIRECT_FOUNDATION'?zeroTraining():{
      mode:'LORA',trainableParameters:10,frozenParameters:1000,
      trainingExamples:10,gpuSeconds:10,trainingCostMicrousd:100,evidenceSha256:'UNKNOWN',
    },
    rejectionReasons:[],
  };
}
function sourceDecision({
  workingBudget=1_000_000_000,
  installedBudget=1_000_000_000,
  rationale='candidate evidence remains unresolved before capability proofs',
}={}){
  const meta=campaign.candidates.find(value=>value.candidateId===CANDIDATE);
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:installedBudget,
    mobileWorkingMemoryBudgetBytes:workingBudget,
    rationale:[rationale],
    candidates:[
      placeholder('control-assembly','CONTROL_BASELINE'),
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
      placeholder('adapt-assembly','FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function overlay(capability,{
  working=300_000_000,
  componentTag='shared-components',
  installed=165,
}={}){
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
    componentMapSha256:H(componentTag),
    physicalTargetBindingSha256:H(CANDIDATE+'-'+capability+'-physical-binding'),
    targetEvidenceSha256:H(CANDIDATE+'-'+capability+'-target-evidence'),
    sourceExecutionProfileSha256:meta.executionProfileSha256,
    selectedCandidateIdAllowed:false,reuseAdvanceAllowed:false,fullStudentEscalationAllowed:false,
    modelFleetPromotionAllowed:false,installOrDownloadAllowed:false,productionAuthorityGranted:false,
    providerAuthorityGranted:false,billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
    licenseMutationAllowed:false,qualityMutationAllowed:false,trainingEvidenceMutationAllowed:false,
    decisionMutationAllowed:false,
  };
  const payload={
    schemaVersion:base.schemaVersion,candidateId:base.candidateId,capability:base.capability,
    targetTier:base.targetTier,backboneBytes:base.backboneBytes,conditionerBytes:base.conditionerBytes,
    vaeBytes:base.vaeBytes,adapterBytes:base.adapterBytes,otherRequiredBytes:base.otherRequiredBytes,
    mandatoryInstalledBytes:base.mandatoryInstalledBytes,workingMemoryBytes:base.workingMemoryBytes,
    componentMapSha256:base.componentMapSha256,
    physicalTargetBindingSha256:base.physicalTargetBindingSha256,
    targetEvidenceSha256:base.targetEvidenceSha256,
    sourceExecutionProfileSha256:base.sourceExecutionProfileSha256,
    selectedCandidateIdAllowed:false,reuseAdvanceAllowed:false,fullStudentEscalationAllowed:false,
    productionAuthorityGranted:false,trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
  return {...base,runtimeEvidenceSha256:H(
    HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN+JSON.stringify(payload),
  )};
}

function qualityFinalization(capability,state='QUALITY_FLOOR_PASS',campaignId=campaign.campaignId){
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
    campaignId,
    runEvidenceSha256:H('assembly-quality-run-'+capability),
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
        dimensionId:capability==='IMAGE_EDITING'?'identity-preservation':'semantic-adherence',
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
    productionAuthorityGranted:false,providerAuthorityGranted:false,billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
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
    productionAuthorityGranted:false,trainingAuthorityGranted:false,winnerSelectionAllowed:false,
  };
}
const qualityOrigin={async verifyQualityFinalization(){return true;}};
function proofOrigin({qualification=true,rejection=true}={}){
  return {
    async verifyQualificationEvidence(){return qualification;},
    async verifyRejectionEvidence(){return rejection;},
  };
}

async function qualificationProof(
  rawDecision,
  capability,
  {working=300_000_000,componentTag='shared-components'}={},
){
  const runtimeOverlay=overlay(capability,{working,componentTag});
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    rawDecision,CANDIDATE,capability,runtimeOverlay,runtimeOverlay.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(application.state,'RUNTIME_OVERLAY_APPLIED_PENDING');
  const finalization=qualityFinalization(capability,'QUALITY_FLOOR_PASS');
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(finalization,hashPort);
  const proof=await qualifyHsmeFoundationReuseEvidenceV1(
    application,runtimeOverlay,CANDIDATE,capability,
    campaign,trust,finalization,qualitySha,qualityOrigin,
    trainingAttestation(capability,runtimeOverlay),hashPort,
  );
  assert.equal(proof.state,'QUALIFICATION_EVIDENCE_READY');
  return proof;
}

async function rejectionProof(
  rawDecision,
  capability,
  {
    qualityState='QUALITY_FLOOR_PASS',
    working=300_000_000,
    installed=165,
    componentTag='shared-components',
    rawCampaign=campaign,
    rawTrust=trust,
  }={},
){
  const runtimeOverlay=overlay(capability,{working,installed,componentTag});
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    rawDecision,CANDIDATE,capability,runtimeOverlay,runtimeOverlay.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(application.state,'RUNTIME_OVERLAY_APPLIED_PENDING');
  const finalization=qualityFinalization(capability,qualityState,rawCampaign.campaignId);
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(finalization,hashPort);
  const proof=await proveHsmeFoundationReuseEvidenceRejectionV1(
    application,runtimeOverlay,CANDIDATE,capability,
    rawCampaign,rawTrust,finalization,qualitySha,qualityOrigin,hashPort,
  );
  assert.equal(proof.state,'REJECTION_EVIDENCE_READY');
  return proof;
}

async function nonCommercialCampaignTrust(){
  const rawCampaign=clone(campaign);
  const rawTrust=clone(trust);
  const c=rawCampaign.candidates.find(value=>value.candidateId===CANDIDATE);
  const t=rawTrust.candidates.find(value=>value.candidateId===CANDIDATE);
  c.rightsState='REVIEW_REQUIRED';
  c.rightsEvidenceSha256='UNKNOWN';
  rawTrust.state='EVIDENCE_PENDING';
  t.rightsReview.commercialUseConclusion='REJECTED';
  t.rightsReview.dependencyReviews=t.rightsReview.dependencyReviews.map(value=>({...value,conclusion:'REJECTED'}));
  rawTrust.campaignDigest=await hsmeFoundationBenchmarkCampaignV1Digest(rawCampaign,hashPort);
  const rightsSha=await hsmeFoundationBenchmarkRightsReviewDigestV1(t.rightsReview,hashPort);
  assert.match(rightsSha,/^[0-9a-f]{64}$/);
  return {rawCampaign,rawTrust};
}

test('one capability PASS remains INCOMPLETE for a two-capability candidate',async()=>{
  const raw=sourceDecision();
  const editing=await qualificationProof(raw,'IMAGE_EDITING');
  const before=clone(raw);
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[editing],[],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_INCOMPLETE');
  assert.deepEqual(result.requiredCapabilities,REQUIRED);
  assert.deepEqual(result.coveredQualificationCapabilities,['IMAGE_EDITING']);
  assert.deepEqual(result.missingCapabilities,['TEXT_TO_IMAGE']);
  assert.deepEqual(result.proofEvidenceRefs,[{
    kind:'QUALIFICATION',
    capability:'IMAGE_EDITING',
    evidenceSetSha256:editing.evidenceSetSha256,
  }]);
  assert.equal(result.candidate,null);
  assert.deepEqual(raw,before);
});

test('all required capability PASS proofs assemble one canonical QUALIFIED candidate',async()=>{
  const raw=sourceDecision();
  const editing=await qualificationProof(raw,'IMAGE_EDITING',{working:420_000_000});
  const t2i=await qualificationProof(raw,'TEXT_TO_IMAGE',{working:310_000_000});
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[t2i,editing],[],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_QUALIFIED');
  assert.deepEqual(result.requiredCapabilities,REQUIRED);
  assert.deepEqual(result.coveredQualificationCapabilities,REQUIRED);
  assert.deepEqual(result.missingCapabilities,[]);
  assert.equal(result.candidate.evidenceState,'QUALIFIED');
  assert.equal(result.candidate.licenseConclusion,'COMMERCIAL_ADMISSIBLE');
  assert.equal(result.candidate.quality.status,'PASS');
  assert.equal(result.candidate.runtime.workingMemoryBytes,420_000_000);
  assert.equal(result.candidate.runtime.mandatoryInstalledBytes,165);
  assert.match(result.candidate.runtime.evidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.candidate.quality.evidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.candidate.training.evidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.assembledCandidateSha256,/^[0-9a-f]{64}$/);
  assert.match(result.candidateEvidenceSetSha256,/^[0-9a-f]{64}$/);
  assert.deepEqual(result.proofEvidenceRefs,[
    {kind:'QUALIFICATION',capability:'IMAGE_EDITING',evidenceSetSha256:editing.evidenceSetSha256},
    {kind:'QUALIFICATION',capability:'TEXT_TO_IMAGE',evidenceSetSha256:t2i.evidenceSetSha256},
  ]);
  assert.equal(result.reuseAdvanceAllowed,false);
  assert.equal(result.candidateSelectionAllowed,false);
});

test('different installed component maps cannot be silently combined into QUALIFIED',async()=>{
  const raw=sourceDecision();
  const editing=await qualificationProof(raw,'IMAGE_EDITING',{componentTag:'editing-components'});
  const t2i=await qualificationProof(raw,'TEXT_TO_IMAGE',{componentTag:'t2i-components'});
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[editing,t2i],[],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_INVALID');
  assert.ok(result.blockers.some(value=>value.startsWith('ASSEMBLY_QUALIFICATION_COMPONENT_MAP_DRIFT')));
});

test('one required-capability quality hard blocker rejects without running the other capability',async()=>{
  const raw=sourceDecision();
  const reject=await rejectionProof(raw,'IMAGE_EDITING',{qualityState:'QUALITY_FLOOR_FAIL'});
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[],[reject],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_REJECTED');
  assert.deepEqual(result.coveredRejectionCapabilities,['IMAGE_EDITING']);
  assert.ok(result.missingCapabilities.includes('TEXT_TO_IMAGE'));
  assert.equal(result.candidate.evidenceState,'REJECTED');
  assert.equal(result.candidate.quality.status,'FAIL');
  assert.deepEqual(result.candidate.rejectionReasons,['QUALITY_FLOOR_FAILED']);
  assert.deepEqual(result.proofEvidenceRefs,[{
    kind:'REJECTION',
    capability:'IMAGE_EDITING',
    evidenceSetSha256:reject.evidenceSetSha256,
  }]);
  assert.equal(result.fullStudentEscalationAllowed,false);
});

test('resource rejection may coexist with a PASS qualification proof for the same capability',async()=>{
  const raw=sourceDecision({workingBudget:350_000_000});
  const q=await qualificationProof(raw,'IMAGE_EDITING',{working:500_000_000});
  const r=await rejectionProof(raw,'IMAGE_EDITING',{working:500_000_000});
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[q],[r],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_REJECTED');
  assert.ok(result.candidate.rejectionReasons.includes('MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED'));
  assert.equal(result.candidate.runtime.workingMemoryBytes,500_000_000);
});

test('reviewed non-commercial rights reject the candidate without fabricating quality failure',async()=>{
  const {rawCampaign,rawTrust}=await nonCommercialCampaignTrust();
  const raw=sourceDecision();
  const r=await rejectionProof(raw,'IMAGE_EDITING',{rawCampaign,rawTrust});
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,rawCampaign,CANDIDATE,[],[r],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_REJECTED');
  assert.equal(result.candidate.licenseConclusion,'NON_COMMERCIAL');
  assert.equal(result.candidate.quality.status,'UNKNOWN');
  assert.deepEqual(result.candidate.rejectionReasons,['LICENSE_NON_COMMERCIAL']);
});

test('proofs from different pre-runtime decisions cannot be mixed',async()=>{
  const raw=sourceDecision();
  const other=sourceDecision({rationale:'different source decision'});
  const editing=await qualificationProof(raw,'IMAGE_EDITING');
  const t2i=await qualificationProof(other,'TEXT_TO_IMAGE');
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[editing,t2i],[],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_INVALID');
  assert.ok(result.blockers.some(value=>value.startsWith('ASSEMBLY_QUALIFICATION_SOURCE_BINDING_DRIFT')));
});

test('proof digest forgery and unverified proof origin fail closed',async()=>{
  const raw=sourceDecision();
  const editing=await qualificationProof(raw,'IMAGE_EDITING');
  const forged={...editing,evidenceSetSha256:H('forged-evidence-set')};
  let result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[forged],[],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_INVALID');
  assert.ok(result.blockers.some(value=>value.startsWith('ASSEMBLY_QUALIFICATION_REHASH_MISMATCH')));

  result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[editing],[],proofOrigin({qualification:false}),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_INVALID');
  assert.ok(result.blockers.some(value=>value.startsWith('ASSEMBLY_QUALIFICATION_ORIGIN_UNVERIFIED')));
});

test('duplicate capability qualification proofs fail closed',async()=>{
  const raw=sourceDecision();
  const editing=await qualificationProof(raw,'IMAGE_EDITING');
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[editing,editing],[],proofOrigin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('ASSEMBLY_QUALIFICATION_PROOF_DUPLICATE:IMAGE_EDITING'));
});

test('assembler never grants decision, selection, reuse or full-student authority',async()=>{
  const raw=sourceDecision();
  const reject=await rejectionProof(raw,'IMAGE_EDITING',{qualityState:'QUALITY_FLOOR_FAIL'});
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    raw,campaign,CANDIDATE,[],[reject],proofOrigin(),hashPort,
  );
  for(const field of [
    'decisionMutationAllowed','candidateSelectionAllowed','selectedCandidateIdAllowed',
    'reuseAdvanceAllowed','fullStudentEscalationAllowed','modelFleetPromotionAllowed',
    'installOrDownloadAllowed','productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','trainingOrDistillationAllowed','winnerSelectionAllowed',
  ]) assert.equal(result[field],false,field);
});
