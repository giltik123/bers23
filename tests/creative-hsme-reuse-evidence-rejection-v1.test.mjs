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
  hsmeFoundationBenchmarkCampaignV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCampaignV1.ts';
import {
  hsmeFoundationBenchmarkRightsReviewDigestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationBenchmarkCandidateTrustV1.ts';
import {
  HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
  hsmeFoundationQualityFinalizationV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationQualityFinalizationV1.ts';
import {
  HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceQualificationV1.ts';
import {
  proveHsmeFoundationReuseEvidenceRejectionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceRejectionV1.ts';

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8',
));
const trust=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8',
));
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const CANDIDATE='flux2-klein-4b-distilled-v1';
const CAPABILITY='IMAGE_EDITING';

function clone(value){return structuredClone(value);}

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

function qualityFinalization(candidateId,state='QUALITY_FLOOR_PASS'){
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
    campaignId:campaign.campaignId,
    runEvidenceSha256:H('rejection-quality-run'),
    runEvidenceState:'FULL_COMPLETE',
    finalizationState:'FULL_FINALIZED',
    aggregationPolicy:'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN',
    medianPolicy:'EVEN_ARITHMETIC_MEAN_HALF_UP',
    rows:[{
      candidateId,
      capability:CAPABILITY,
      qualityState:state,
      outputSetSha256:H(candidateId+'-rejection-output'),
      dimensionResults:[{
        dimensionId:'identity-preservation',reviewMode:'HYBRID',
        maxLossMicrounits:100_000,lossMicrounits:state==='QUALITY_FLOOR_FAIL'?200_000:10_000,
        criticalFailureObserved:state==='QUALITY_FLOOR_FAIL',
        evidenceSha256:H(candidateId+'-rejection-dimension'),
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

function overlay(candidateId,profileSha,{installed=165,working=300_000_000}={}){
  const backbone=installed;
  const base={
    schemaVersion:'BERS_HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1',
    candidateId,capability:CAPABILITY,state:'PHYSICAL_RUNTIME_EVIDENCE_READY',blockers:[],
    targetTier:'MOBILE_DEFAULT',
    backboneBytes:backbone,conditionerBytes:0,vaeBytes:0,adapterBytes:0,otherRequiredBytes:0,
    mandatoryInstalledBytes:installed,workingMemoryBytes:working,
    componentMapSha256:H(candidateId+'-reject-component-map'),
    physicalTargetBindingSha256:H(candidateId+'-reject-physical-binding'),
    targetEvidenceSha256:H(candidateId+'-reject-target-evidence'),
    sourceExecutionProfileSha256:profileSha,
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

function decision(target,{installedBudget=1_000_000_000,workingBudget=1_000_000_000}={}){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:installedBudget,
    mobileWorkingMemoryBudgetBytes:workingBudget,
    rationale:['hard blockers are derived only from frozen evidence'],
    candidates:[
      placeholder('control-reject','CONTROL_BASELINE'),
      target,
      placeholder('adapt-reject','FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function qualityOrigin(verified=true){
  return {async verifyQualityFinalization(){return verified;}};
}

async function licenseInputs(nonCommercial=false){
  const rawCampaign=clone(campaign);
  const rawTrust=clone(trust);
  const c=rawCampaign.candidates.find(value=>value.candidateId===CANDIDATE);
  const t=rawTrust.candidates.find(value=>value.candidateId===CANDIDATE);
  if(nonCommercial){
    c.rightsState='REVIEW_REQUIRED';
    c.rightsEvidenceSha256='UNKNOWN';
    rawTrust.state='EVIDENCE_PENDING';
    t.rightsReview.commercialUseConclusion='REJECTED';
    t.rightsReview.dependencyReviews=t.rightsReview.dependencyReviews.map(value=>({
      ...value,conclusion:'REJECTED',
    }));
  }
  rawTrust.campaignDigest=await hsmeFoundationBenchmarkCampaignV1Digest(rawCampaign,hashPort);
  const rightsSha=await hsmeFoundationBenchmarkRightsReviewDigestV1(t.rightsReview,hashPort);
  return {rawCampaign,rawTrust,campaignCandidate:c,rightsSha};
}

async function fixture({
  qualityState='QUALITY_FLOOR_PASS',
  installed=165,
  working=300_000_000,
  installedBudget=1_000_000_000,
  workingBudget=1_000_000_000,
  nonCommercial=false,
}={}){
  const license=await licenseInputs(nonCommercial);
  const finalization=qualityFinalization(CANDIDATE,qualityState);
  finalization.campaignId=license.rawCampaign.campaignId;
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(finalization,hashPort);
  const row=finalization.rows[0];
  const qualityEvidenceSha256=H(
    HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN+
    JSON.stringify({candidateId:CANDIDATE,capability:CAPABILITY,qualityFinalizationSha256:qualitySha,row}),
  );
  const target={
    candidateId:CANDIDATE,
    strategy:'DIRECT_FOUNDATION',
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:{
      sourceRoot:license.campaignCandidate.sourceRoot,
      immutableRevision:license.campaignCandidate.immutableRevision,
      contentSha256:license.campaignCandidate.modelContentSha256,
    },
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unknownRuntime(),
    training:zeroTraining(),
    rejectionReasons:[],
  };
  const runtimeOverlay=overlay(CANDIDATE,license.campaignCandidate.executionProfileSha256,{installed,working});
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(target,{installedBudget,workingBudget}),
    CANDIDATE,CAPABILITY,runtimeOverlay,runtimeOverlay.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(application.state,'RUNTIME_OVERLAY_APPLIED_PENDING');
  return {
    ...license,finalization,qualitySha,target,runtimeOverlay,application,
  };
}

async function prove(x){
  return proveHsmeFoundationReuseEvidenceRejectionV1(
    x.application,x.runtimeOverlay,CANDIDATE,CAPABILITY,
    x.rawCampaign,x.rawTrust,x.finalization,x.qualitySha,qualityOrigin(true),hashPort,
  );
}

test('reviewed non-commercial rights produce license-only rejection',async()=>{
  const x=await fixture({nonCommercial:true});
  const result=await prove(x);
  assert.equal(result.state,'REJECTION_EVIDENCE_READY');
  assert.equal(result.sourceDecisionSha256,x.application.sourceDecisionSha256);
  assert.equal(result.sourceCandidateSha256,x.application.sourceCandidateSha256);
  assert.equal(result.pendingDecisionSha256,x.application.pendingDecisionSha256);
  assert.equal(result.appliedCandidateSha256,x.application.appliedCandidateSha256);
  assert.equal(result.runtimeComponentMapSha256,x.runtimeOverlay.componentMapSha256);
  assert.equal(result.sourceExecutionProfileSha256,x.runtimeOverlay.sourceExecutionProfileSha256);
  assert.deepEqual(result.runtime,x.application.candidate.runtime);
  assert.notEqual(result.sourceCandidateSha256,result.appliedCandidateSha256);
  assert.deepEqual(result.derivedRejectionReasons,['LICENSE_NON_COMMERCIAL']);
  assert.equal(result.resolvedLicenseConclusion,'NON_COMMERCIAL');
  assert.equal(result.qualityOutcome,'PASS');
  assert.equal('rejectedCandidate' in result,false);
  assert.equal('rejectedCandidateSha256' in result,false);
  assert.equal(result.fullStudentEscalationAllowed,false);
});

test('frozen quality floor failure produces quality-only rejection',async()=>{
  const x=await fixture({qualityState:'QUALITY_FLOOR_FAIL'});
  const result=await prove(x);
  assert.equal(result.state,'REJECTION_EVIDENCE_READY');
  assert.deepEqual(result.derivedRejectionReasons,['QUALITY_FLOOR_FAILED']);
  assert.equal(result.qualityOutcome,'FAIL');
  assert.match(result.qualityEvidenceSha256,/^[0-9a-f]{64}$/);
});

test('measured installed budget overflow produces resource rejection',async()=>{
  const x=await fixture({installed:1_000_000_001});
  const result=await prove(x);
  assert.equal(result.state,'REJECTION_EVIDENCE_READY');
  assert.deepEqual(result.derivedRejectionReasons,['MOBILE_INSTALLED_BUDGET_EXCEEDED']);
});

test('measured working-memory overflow produces resource rejection',async()=>{
  const x=await fixture({working:1_000_000_001});
  const result=await prove(x);
  assert.equal(result.state,'REJECTION_EVIDENCE_READY');
  assert.deepEqual(result.derivedRejectionReasons,['MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED']);
});

test('multiple hard blockers canonicalize deterministically',async()=>{
  const x=await fixture({
    qualityState:'QUALITY_FLOOR_FAIL',
    installed:1_000_000_001,
    working:1_000_000_001,
    nonCommercial:true,
  });
  const result=await prove(x);
  assert.equal(result.state,'REJECTION_EVIDENCE_READY');
  assert.deepEqual(result.derivedRejectionReasons,[
    'LICENSE_NON_COMMERCIAL',
    'MOBILE_INSTALLED_BUDGET_EXCEEDED',
    'MOBILE_WORKING_MEMORY_BUDGET_EXCEEDED',
    'QUALITY_FLOOR_FAILED',
  ]);
});

test('admissible quality-pass in-budget candidate cannot be rejected',async()=>{
  const x=await fixture();
  const result=await prove(x);
  assert.equal(result.state,'REJECTION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('REJECTION_HARD_BLOCKER_REQUIRED'));
  assert.equal('rejectedCandidate' in result,false);
});

test('unverified quality evidence cannot be converted into rejection authority',async()=>{
  const x=await fixture({working:1_000_000_001});
  const result=await proveHsmeFoundationReuseEvidenceRejectionV1(
    x.application,x.runtimeOverlay,CANDIDATE,CAPABILITY,
    x.rawCampaign,x.rawTrust,x.finalization,x.qualitySha,qualityOrigin(false),hashPort,
  );
  assert.equal(result.state,'REJECTION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('REJECTION_QUALITY_ORIGIN_UNVERIFIED'));
  assert.equal(result.fullStudentEscalationAllowed,false);
});

test('runtime digest tampering fails before deriving a resource blocker',async()=>{
  const x=await fixture({working:1_000_000_001});
  const changed=clone(x.runtimeOverlay);
  changed.workingMemoryBytes+=1;
  const result=await proveHsmeFoundationReuseEvidenceRejectionV1(
    x.application,changed,CANDIDATE,CAPABILITY,
    x.rawCampaign,x.rawTrust,x.finalization,x.qualitySha,qualityOrigin(true),hashPort,
  );
  assert.equal(result.state,'REJECTION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('REJECTION_RUNTIME_REHASH_MISMATCH')
    ||result.blockers.includes('REJECTION_CANDIDATE_RUNTIME_DRIFT'));
});

test('rejection proof never mutates the source pending decision or grants escalation',async()=>{
  const x=await fixture({working:1_000_000_001});
  const before=clone(x.application.pendingDecision);
  const result=await prove(x);
  assert.deepEqual(x.application.pendingDecision,before);
  assert.equal(x.application.pendingDecision.decisionStatus,'EVALUATION_PENDING');
  assert.equal(x.application.candidate.evidenceState,'UNRESOLVED');
  assert.equal(x.application.candidate.licenseConclusion,'REVIEW_REQUIRED');
  assert.equal(x.application.candidate.quality.status,'UNKNOWN');
  for(const field of [
    'decisionMutationAllowed','candidateSelectionAllowed','selectedCandidateIdAllowed',
    'reuseAdvanceAllowed','fullStudentEscalationAllowed','modelFleetPromotionAllowed',
    'installOrDownloadAllowed','productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed','trainingOrDistillationAllowed','winnerSelectionAllowed',
  ]) assert.equal(result[field],false,field);
});
