import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPendingReuseRuntimeApplicationV1.ts';
import {
  HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceQualificationV1.ts';
import {
  HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
  HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceRejectionV1.ts';
import {
  HSME_FOUNDATION_REUSE_CAPABILITY_QUALITY_AGGREGATE_DIGEST_DOMAIN,
  assembleHsmeFoundationReuseCandidateEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseCandidateEvidenceAssemblerV1.ts';
import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json',
  'utf8',
));
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const FLUX='flux2-klein-4b-distilled-v1';
const SANA='sana-sprint-0.6b-split-v1';

function unresolvedRuntime(){
  return {
    backboneBytes:'UNKNOWN',conditionerBytes:'UNKNOWN',vaeBytes:'UNKNOWN',
    adapterBytes:'UNKNOWN',otherRequiredBytes:'UNKNOWN',
    mandatoryInstalledBytes:'UNKNOWN',workingMemoryBytes:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
  };
}
function zeroTraining(){
  return {
    mode:'ZERO_TRAINING',trainableParameters:0,frozenParameters:'UNKNOWN',
    trainingExamples:0,gpuSeconds:0,trainingCostMicrousd:0,evidenceSha256:'UNKNOWN',
  };
}
function adaptationTraining(){
  return {
    mode:'PROJECTOR_BRIDGE',trainableParameters:10,frozenParameters:1000,
    trainingExamples:100,gpuSeconds:1000,trainingCostMicrousd:10000,evidenceSha256:'UNKNOWN',
  };
}
function candidateFromCampaign(candidateId,strategy){
  const row=campaign.candidates.find(value=>value.candidateId===candidateId);
  assert.ok(row);
  return {
    candidateId,
    strategy,
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:{
      sourceRoot:row.sourceRoot,
      immutableRevision:row.immutableRevision,
      contentSha256:row.modelContentSha256,
    },
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:strategy==='DIRECT_FOUNDATION'?zeroTraining():adaptationTraining(),
    rejectionReasons:[],
  };
}
function control(){
  return {
    candidateId:'control-mobile',
    strategy:'CONTROL_BASELINE',
    targetTier:'REFERENCE',
    evidenceState:'UNRESOLVED',
    source:{
      sourceRoot:'segmind/tiny-sd',
      immutableRevision:'a'.repeat(40),
      contentSha256:H('control-source'),
    },
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:zeroTraining(),
    rejectionReasons:[],
  };
}
function sourceDecision(target){
  const direct=target.strategy==='DIRECT_FOUNDATION'
    ?target
    :candidateFromCampaign(FLUX,'DIRECT_FOUNDATION');
  const adaptation=target.strategy==='FROZEN_FOUNDATION_ADAPTATION'
    ?target
    :candidateFromCampaign('flux2-klein-base-4b-v1','FROZEN_FOUNDATION_ADAPTATION');
  return normalizeHsmeFoundationReuseDecisionV1({
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['all capability evidence remains external until assembly'],
    candidates:[control(),direct,adaptation],
  });
}

function runtime(evidenceSha256){
  return {
    backboneBytes:100,conditionerBytes:20,vaeBytes:30,adapterBytes:10,
    otherRequiredBytes:5,mandatoryInstalledBytes:165,
    workingMemoryBytes:300_000_000,evidenceSha256,
  };
}
const authority={
  decisionMutationAllowed:false,
  candidateSelectionAllowed:false,
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
};

async function provenance(candidateId,strategy='DIRECT_FOUNDATION'){
  const source=sourceDecision(candidateFromCampaign(candidateId,strategy));
  const sourceCandidate=source.candidates.find(value=>value.candidateId===candidateId);
  return {
    source,
    sourceCandidate,
    sourceDecisionSha256:await hsmeFoundationReuseDecisionV1Digest(source,hashPort),
    sourceCandidateSha256:await hashPort.sha256(new TextEncoder().encode(
      HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN+
      JSON.stringify(sourceCandidate),
    )),
  };
}

async function qualificationProof(p,capability,{runtimeSalt='shared-runtime'}={}){
  const campaignRow=campaign.candidates.find(value=>value.candidateId===p.sourceCandidate.candidateId);
  const runtimeEvidenceSha256=H(runtimeSalt);
  const row={
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_QUALIFICATION_V1_SCHEMA,
    candidateId:p.sourceCandidate.candidateId,
    capability,
    state:'QUALIFICATION_EVIDENCE_READY',
    blockers:[],
    sourceDecisionSha256:p.sourceDecisionSha256,
    sourceCandidateSha256:p.sourceCandidateSha256,
    pendingDecisionSha256:H(capability+'-pending'),
    appliedCandidateSha256:H(capability+'-applied'),
    runtimeEvidenceSha256,
    runtimeComponentMapSha256:H('shared-component-map'),
    sourceExecutionProfileSha256:campaignRow.executionProfileSha256,
    runtime:runtime(runtimeEvidenceSha256),
    licenseEvidenceSha256:campaignRow.rightsEvidenceSha256,
    qualityEvidenceSha256:H(capability+'-quality-pass'),
    trainingEvidenceSha256:H('shared-training'),
    resolvedLicenseConclusion:'COMMERCIAL_ADMISSIBLE',
    evidenceSetSha256:'UNKNOWN',
    ...authority,
  };
  const payload={
    schemaVersion:row.schemaVersion,candidateId:row.candidateId,capability:row.capability,
    sourceDecisionSha256:row.sourceDecisionSha256,sourceCandidateSha256:row.sourceCandidateSha256,
    pendingDecisionSha256:row.pendingDecisionSha256,appliedCandidateSha256:row.appliedCandidateSha256,
    runtimeEvidenceSha256:row.runtimeEvidenceSha256,
    runtimeComponentMapSha256:row.runtimeComponentMapSha256,
    sourceExecutionProfileSha256:row.sourceExecutionProfileSha256,runtime:row.runtime,
    licenseEvidenceSha256:row.licenseEvidenceSha256,
    qualityEvidenceSha256:row.qualityEvidenceSha256,
    trainingEvidenceSha256:row.trainingEvidenceSha256,
    resolvedLicenseConclusion:row.resolvedLicenseConclusion,
    decisionMutationAllowed:false,candidateSelectionAllowed:false,reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
  row.evidenceSetSha256=H(
    HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN+JSON.stringify(payload),
  );
  return row;
}

async function rejectionProof(p,capability,reasons,{
  qualityOutcome='PASS',
  resolvedLicenseConclusion='COMMERCIAL_ADMISSIBLE',
  runtimeSalt='shared-runtime',
}={}){
  const campaignRow=campaign.candidates.find(value=>value.candidateId===p.sourceCandidate.candidateId);
  const runtimeEvidenceSha256=H(runtimeSalt);
  const row={
    schemaVersion:HSME_FOUNDATION_REUSE_EVIDENCE_REJECTION_V1_SCHEMA,
    candidateId:p.sourceCandidate.candidateId,
    capability,
    state:'REJECTION_EVIDENCE_READY',
    blockers:[],
    sourceDecisionSha256:p.sourceDecisionSha256,
    sourceCandidateSha256:p.sourceCandidateSha256,
    pendingDecisionSha256:H(capability+'-reject-pending'),
    appliedCandidateSha256:H(capability+'-reject-applied'),
    runtimeEvidenceSha256,
    runtimeComponentMapSha256:H('shared-component-map'),
    sourceExecutionProfileSha256:campaignRow.executionProfileSha256,
    runtime:runtime(runtimeEvidenceSha256),
    licenseEvidenceSha256:resolvedLicenseConclusion==='NON_COMMERCIAL'
      ?H('noncommercial-license')
      :campaignRow.rightsEvidenceSha256,
    qualityFinalizationSha256:H(capability+'-quality-finalization'),
    qualityEvidenceSha256:H(capability+'-quality-'+qualityOutcome.toLowerCase()),
    qualityOutcome,
    resolvedLicenseConclusion,
    derivedRejectionReasons:[...reasons].sort(),
    evidenceSetSha256:'UNKNOWN',
    ...authority,
  };
  const payload={
    schemaVersion:row.schemaVersion,candidateId:row.candidateId,capability:row.capability,
    sourceDecisionSha256:row.sourceDecisionSha256,sourceCandidateSha256:row.sourceCandidateSha256,
    pendingDecisionSha256:row.pendingDecisionSha256,appliedCandidateSha256:row.appliedCandidateSha256,
    runtimeEvidenceSha256:row.runtimeEvidenceSha256,
    runtimeComponentMapSha256:row.runtimeComponentMapSha256,
    sourceExecutionProfileSha256:row.sourceExecutionProfileSha256,runtime:row.runtime,
    licenseEvidenceSha256:row.licenseEvidenceSha256,
    resolvedLicenseConclusion:row.resolvedLicenseConclusion,
    qualityFinalizationSha256:row.qualityFinalizationSha256,
    qualityEvidenceSha256:row.qualityEvidenceSha256,
    qualityOutcome:row.qualityOutcome,
    derivedRejectionReasons:row.derivedRejectionReasons,
    decisionMutationAllowed:false,candidateSelectionAllowed:false,reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
  row.evidenceSetSha256=H(
    HSME_FOUNDATION_REUSE_REJECTION_EVIDENCE_DIGEST_DOMAIN+JSON.stringify(payload),
  );
  return row;
}

function origin({qual=true,reject=true}={}){
  return {
    async verifyQualificationProof(){return qual;},
    async verifyRejectionProof(){return reject;},
  };
}

test('two frozen required capabilities assemble one canonical QUALIFIED candidate',async()=>{
  const p=await provenance(FLUX);
  const q1=await qualificationProof(p,'IMAGE_EDITING');
  const q2=await qualificationProof(p,'TEXT_TO_IMAGE');
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[q1,q2],[],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_QUALIFIED');
  assert.deepEqual(result.requiredCapabilities,['IMAGE_EDITING','TEXT_TO_IMAGE']);
  assert.equal(result.assembledCandidate.evidenceState,'QUALIFIED');
  assert.equal(result.assembledCandidate.licenseConclusion,'COMMERCIAL_ADMISSIBLE');
  assert.equal(result.assembledCandidate.runtime.evidenceSha256,H('shared-runtime'));
  assert.equal(result.assembledCandidate.training.evidenceSha256,H('shared-training'));
  const expectedQuality=H(
    HSME_FOUNDATION_REUSE_CAPABILITY_QUALITY_AGGREGATE_DIGEST_DOMAIN+
    JSON.stringify({
      candidateId:FLUX,
      qualityRows:[
        {capability:'IMAGE_EDITING',qualityEvidenceSha256:q1.qualityEvidenceSha256},
        {capability:'TEXT_TO_IMAGE',qualityEvidenceSha256:q2.qualityEvidenceSha256},
      ],
    }),
  );
  assert.equal(result.assembledCandidate.quality.evidenceSha256,expectedQuality);
  assert.equal(result.decisionMutationAllowed,false);
  assert.equal(result.reuseAdvanceAllowed,false);
});

test('missing one required qualification capability cannot qualify',async()=>{
  const p=await provenance(FLUX);
  const q1=await qualificationProof(p,'IMAGE_EDITING');
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[q1],[],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID');
  assert.ok(result.blockers.includes('ASSEMBLY_REQUIRED_QUALIFICATION_MISSING'));
});

test('cross-capability runtime disagreement fails closed',async()=>{
  const p=await provenance(FLUX);
  const q1=await qualificationProof(p,'IMAGE_EDITING',{runtimeSalt:'runtime-a'});
  const q2=await qualificationProof(p,'TEXT_TO_IMAGE',{runtimeSalt:'runtime-b'});
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[q1,q2],[],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID');
  assert.ok(result.blockers.includes('ASSEMBLY_QUALIFICATION_CROSS_CAPABILITY_INCONSISTENT'));
});

test('untrusted child proof origin cannot be promoted by matching hashes',async()=>{
  const p=await provenance(FLUX);
  const q1=await qualificationProof(p,'IMAGE_EDITING');
  const q2=await qualificationProof(p,'TEXT_TO_IMAGE');
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[q1,q2],[],origin({qual:false}),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID');
  assert.ok(result.blockers.includes('ASSEMBLY_QUALIFICATION_ORIGIN_UNVERIFIED'));
});

test('candidate missing a frozen required capability cannot enter candidate-wide assembly',async()=>{
  const p=await provenance(SANA,'FROZEN_FOUNDATION_ADAPTATION');
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,SANA,campaign,[],[],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID');
  assert.deepEqual(result.structuralCoverageBlockers,['REQUIRED_CAPABILITY_UNSUPPORTED']);
  assert.ok(result.blockers.includes('ASSEMBLY_CANDIDATE_REQUIRED_CAPABILITY_UNSUPPORTED'));
  assert.equal(result.assembledCandidate,null);
  assert.equal(result.fullStudentEscalationAllowed,false);
});

test('quality fail in only one required capability cannot reject candidate-wide',async()=>{
  const p=await provenance(FLUX);
  const q=await qualificationProof(p,'TEXT_TO_IMAGE');
  const r=await rejectionProof(
    p,'IMAGE_EDITING',['QUALITY_FLOOR_FAILED'],{qualityOutcome:'FAIL'},
  );
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[q],[r],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID');
  assert.ok(result.blockers.includes('ASSEMBLY_PARTIAL_QUALITY_REJECTION_INSUFFICIENT'));
});

test('quality fail across every required capability assembles candidate-wide REJECTED',async()=>{
  const p=await provenance(FLUX);
  const r1=await rejectionProof(
    p,'IMAGE_EDITING',['QUALITY_FLOOR_FAILED'],{qualityOutcome:'FAIL'},
  );
  const r2=await rejectionProof(
    p,'TEXT_TO_IMAGE',['QUALITY_FLOOR_FAILED'],{qualityOutcome:'FAIL'},
  );
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[],[r1,r2],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_REJECTED');
  assert.equal(result.assembledCandidate.quality.status,'FAIL');
  assert.deepEqual(result.assembledCandidate.rejectionReasons,['QUALITY_FLOOR_FAILED']);
});

test('one verified non-commercial license blocker can reject candidate-wide',async()=>{
  const p=await provenance(FLUX);
  const r=await rejectionProof(
    p,'IMAGE_EDITING',['LICENSE_NON_COMMERCIAL'],{
      resolvedLicenseConclusion:'NON_COMMERCIAL',
    },
  );
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[],[r],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_REJECTED');
  assert.equal(result.assembledCandidate.licenseConclusion,'NON_COMMERCIAL');
  assert.deepEqual(result.assembledCandidate.rejectionReasons,['LICENSE_NON_COMMERCIAL']);
});

test('proofs from a different source decision cannot be assembled',async()=>{
  const p=await provenance(FLUX);
  const q1=await qualificationProof(p,'IMAGE_EDITING');
  const q2=await qualificationProof(p,'TEXT_TO_IMAGE');
  q2.sourceDecisionSha256=H('other-source-decision');
  const payload={
    schemaVersion:q2.schemaVersion,candidateId:q2.candidateId,capability:q2.capability,
    sourceDecisionSha256:q2.sourceDecisionSha256,sourceCandidateSha256:q2.sourceCandidateSha256,
    pendingDecisionSha256:q2.pendingDecisionSha256,appliedCandidateSha256:q2.appliedCandidateSha256,
    runtimeEvidenceSha256:q2.runtimeEvidenceSha256,
    runtimeComponentMapSha256:q2.runtimeComponentMapSha256,
    sourceExecutionProfileSha256:q2.sourceExecutionProfileSha256,runtime:q2.runtime,
    licenseEvidenceSha256:q2.licenseEvidenceSha256,qualityEvidenceSha256:q2.qualityEvidenceSha256,
    trainingEvidenceSha256:q2.trainingEvidenceSha256,
    resolvedLicenseConclusion:q2.resolvedLicenseConclusion,
    decisionMutationAllowed:false,candidateSelectionAllowed:false,reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,productionAuthorityGranted:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
  q2.evidenceSetSha256=H(
    HSME_FOUNDATION_REUSE_QUALIFICATION_EVIDENCE_DIGEST_DOMAIN+JSON.stringify(payload),
  );
  const result=await assembleHsmeFoundationReuseCandidateEvidenceV1(
    p.source,FLUX,campaign,[q1,q2],[],origin(),hashPort,
  );
  assert.equal(result.state,'CANDIDATE_EVIDENCE_ASSEMBLY_INVALID');
  assert.ok(result.blockers.includes('ASSEMBLY_PROOF_SOURCE_PROVENANCE_DRIFT'));
});
