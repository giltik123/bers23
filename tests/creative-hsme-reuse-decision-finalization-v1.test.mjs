import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPendingReuseRuntimeApplicationV1.ts';
import {
  HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseCandidateEvidenceAssemblerV1.ts';
import {
  HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
  hsmeFoundationParetoEfficiencyV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationParetoEfficiencyV1.ts';
import {
  finalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionFinalizationV1.ts';
import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseCandidateV1,
  normalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const CAMPAIGN_ID='hsme-finalizer-campaign-v1';
const CAMPAIGN_SHA=H('hsme-finalizer-campaign-v1');
const REQUIRED=['IMAGE_EDITING','TEXT_TO_IMAGE'];

function unresolvedRuntime(){
  return {
    backboneBytes:'UNKNOWN',conditionerBytes:'UNKNOWN',vaeBytes:'UNKNOWN',
    adapterBytes:'UNKNOWN',otherRequiredBytes:'UNKNOWN',
    mandatoryInstalledBytes:'UNKNOWN',workingMemoryBytes:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
  };
}
function zeroTraining(evidenceSha256='UNKNOWN'){
  return {
    mode:'ZERO_TRAINING',trainableParameters:0,frozenParameters:'UNKNOWN',
    trainingExamples:0,gpuSeconds:0,trainingCostMicrousd:0,evidenceSha256,
  };
}
function loraTraining(evidenceSha256='UNKNOWN'){
  return {
    mode:'LORA',trainableParameters:10,frozenParameters:1000,
    trainingExamples:100,gpuSeconds:1000,trainingCostMicrousd:10000,evidenceSha256,
  };
}
function source(root,seed){
  return {
    sourceRoot:root,
    immutableRevision:seed.repeat(40),
    contentSha256:H(root+'-content'),
  };
}
function control(){
  return {
    candidateId:'control-mobile',
    strategy:'CONTROL_BASELINE',
    targetTier:'REFERENCE',
    evidenceState:'UNRESOLVED',
    source:source('segmind/tiny-sd','a'),
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:zeroTraining(),
    rejectionReasons:[],
  };
}
function directSource(){
  return {
    candidateId:'direct-mobile',
    strategy:'DIRECT_FOUNDATION',
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:source('bers/direct-mobile','b'),
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:zeroTraining(),
    rejectionReasons:[],
  };
}
function adaptationSource(){
  return {
    candidateId:'adapt-mobile',
    strategy:'FROZEN_FOUNDATION_ADAPTATION',
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:source('bers/adapt-mobile','c'),
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:loraTraining(),
    rejectionReasons:[],
  };
}
function sourceDecision(){
  return normalizeHsmeFoundationReuseDecisionV1({
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['finalize only from trusted candidate assemblies'],
    candidates:[control(),directSource(),adaptationSource()],
  });
}
function measuredRuntime(seed){
  return {
    backboneBytes:100,conditionerBytes:20,vaeBytes:30,adapterBytes:10,
    otherRequiredBytes:5,mandatoryInstalledBytes:165,
    workingMemoryBytes:300_000_000,evidenceSha256:H(seed+'-runtime'),
  };
}
function qualified(sourceCandidate){
  return normalizeHsmeFoundationReuseCandidateV1({
    ...sourceCandidate,
    evidenceState:'QUALIFIED',
    licenseConclusion:'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256:H(sourceCandidate.candidateId+'-license'),
    quality:{status:'PASS',evidenceSha256:H(sourceCandidate.candidateId+'-quality')},
    runtime:measuredRuntime(sourceCandidate.candidateId),
    training:{
      ...sourceCandidate.training,
      evidenceSha256:H(sourceCandidate.candidateId+'-training'),
    },
    rejectionReasons:[],
  });
}
function rejectedLicense(sourceCandidate){
  return normalizeHsmeFoundationReuseCandidateV1({
    ...sourceCandidate,
    evidenceState:'REJECTED',
    licenseConclusion:'NON_COMMERCIAL',
    licenseEvidenceSha256:H(sourceCandidate.candidateId+'-noncommercial'),
    rejectionReasons:['LICENSE_NON_COMMERCIAL'],
  });
}
function rejectedQuality(sourceCandidate){
  return normalizeHsmeFoundationReuseCandidateV1({
    ...sourceCandidate,
    evidenceState:'REJECTED',
    quality:{status:'FAIL',evidenceSha256:H(sourceCandidate.candidateId+'-quality-fail')},
    rejectionReasons:['QUALITY_FLOOR_FAILED'],
  });
}
const assemblyAuthority={
  decisionMutationAllowed:false,candidateSelectionAllowed:false,selectedCandidateIdAllowed:false,
  reuseAdvanceAllowed:false,fullStudentEscalationAllowed:false,
  modelFleetPromotionAllowed:false,installOrDownloadAllowed:false,
  productionAuthorityGranted:false,providerAuthorityGranted:false,billingAuthorityGranted:false,
  projectArtifactMutationAllowed:false,aeeExecutionAuthorityGranted:false,
  durableModelFleetPromotionAllowed:false,trainingOrDistillationAllowed:false,
  winnerSelectionAllowed:false,
};

async function assembly(sourceDecisionValue,candidateId,assembledCandidate,state){
  const sourceCandidate=sourceDecisionValue.candidates.find(value=>value.candidateId===candidateId);
  const sourceDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(sourceDecisionValue,hashPort);
  const sourceCandidateSha256=await hashPort.sha256(new TextEncoder().encode(
    HSME_FOUNDATION_PENDING_REUSE_SOURCE_CANDIDATE_DIGEST_DOMAIN+
    JSON.stringify(sourceCandidate),
  ));
  const assembledCandidateSha256=await hashPort.sha256(new TextEncoder().encode(
    HSME_FOUNDATION_REUSE_ASSEMBLED_CANDIDATE_DIGEST_DOMAIN+
    JSON.stringify(assembledCandidate),
  ));
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_CANDIDATE_EVIDENCE_ASSEMBLY_V1_SCHEMA,
    candidateId,
    state,
    blockers:[],
    requiredCapabilities:REQUIRED,
    campaignId:CAMPAIGN_ID,
    campaignSha256:CAMPAIGN_SHA,
    sourceDecisionSha256,
    sourceCandidateSha256,
    capabilityEvidenceSetSha256:H(candidateId+'-capability-set'),
    assembledCandidateSha256,
    structuralCoverageBlockers:[],
    assembledCandidate,
    ...assemblyAuthority,
  };
}
function assemblyOrigin(verified=true){
  return {
    async verifyAssembly(){return verified;},
  };
}
function paretoOrigin(verified=true){
  return {
    async verifyParetoEvidence(_pareto,_digest,campaignId,campaignSha256){
      return verified&&campaignId===CAMPAIGN_ID&&campaignSha256===CAMPAIGN_SHA;
    },
  };
}
function pareto(uniqueEdit,uniqueT2i,{missingUnique=false}={}){
  const make=(sliceId,capability,unique)=>({
    sliceId,capability,state:'PARETO_FRONTIER_READY',
    qualityPreferredCandidateIds:['direct-mobile','adapt-mobile'],
    vectors:[],
    paretoNondominatedCandidateIds:['direct-mobile','adapt-mobile'],
    dominatedCandidateIds:[],
    ...(!missingUnique&&unique?{uniqueEfficiencyDominantCandidateId:unique}:{}),
  });
  return {
    schemaVersion:HSME_FOUNDATION_PARETO_EFFICIENCY_V1_SCHEMA,
    campaignId:CAMPAIGN_ID,
    qualityFrontierSha256:H('frontier'),
    resourceEvidenceSha256:H('resource'),
    policy:'QUALITY_GATED_PARETO_NO_WEIGHTS',
    dimensions:[
      'mandatoryInstalledBytes','peakWorkingMemoryBytes','coldEndToEndLatencyMicros',
      'warmEndToEndLatencyMicros','acceptedOutputCostMicrousd',
    ],
    direction:'LOWER_IS_BETTER',
    slices:[
      make('image-edit','IMAGE_EDITING',uniqueEdit),
      make('text-to-image','TEXT_TO_IMAGE',uniqueT2i),
    ],
    weightedAggregateScoreAllowed:false,
    lowerQualityCandidateAdmissionAllowed:false,
    deploymentTierAdmissionGranted:false,
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

test('same unique direct candidate across required capabilities yields direct advance',async()=>{
  const source=sourceDecision();
  const before=structuredClone(source);
  const direct=await assembly(
    source,'direct-mobile',qualified(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const adapt=await assembly(
    source,'adapt-mobile',rejectedQuality(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_REJECTED',
  );
  const p=pareto('direct-mobile','direct-mobile');
  const pSha=await hsmeFoundationParetoEfficiencyV1Digest(p,hashPort);
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(),p,pSha,paretoOrigin(),hashPort,
  );
  assert.equal(result.state,'DIRECT_FOUNDATION_ADVANCE_READY');
  assert.equal(result.selectedCandidateId,'direct-mobile');
  assert.equal(result.finalDecision.decisionStatus,'DIRECT_FOUNDATION_ADVANCE');
  assert.equal(result.reuseAdvanceAllowed,true);
  assert.equal(result.fullStudentEscalationAllowed,false);
  assert.deepEqual(source,before);
});

test('same unique adaptation candidate across required capabilities yields bounded adaptation advance',async()=>{
  const source=sourceDecision();
  const direct=await assembly(
    source,'direct-mobile',rejectedLicense(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_REJECTED',
  );
  const adapt=await assembly(
    source,'adapt-mobile',qualified(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const p=pareto('adapt-mobile','adapt-mobile');
  const pSha=await hsmeFoundationParetoEfficiencyV1Digest(p,hashPort);
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(),p,pSha,paretoOrigin(),hashPort,
  );
  assert.equal(result.state,'BOUNDED_ADAPTATION_ADVANCE_READY');
  assert.equal(result.selectedCandidateId,'adapt-mobile');
  assert.equal(result.finalDecision.decisionStatus,'BOUNDED_ADAPTATION_ADVANCE');
  assert.equal(result.reuseAdvanceAllowed,true);
});

test('different Pareto dominants by capability remain ambiguous',async()=>{
  const source=sourceDecision();
  const direct=await assembly(
    source,'direct-mobile',qualified(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const adapt=await assembly(
    source,'adapt-mobile',qualified(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const p=pareto('direct-mobile','adapt-mobile');
  const pSha=await hsmeFoundationParetoEfficiencyV1Digest(p,hashPort);
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(),p,pSha,paretoOrigin(),hashPort,
  );
  assert.equal(result.state,'FINALIZATION_PENDING_AMBIGUOUS');
  assert.ok(result.blockers.includes('FINALIZER_PARETO_DOMINANT_DIFFERS_BY_CAPABILITY'));
  assert.equal(result.reuseAdvanceAllowed,false);
  assert.equal(result.finalDecision,null);
});

test('missing unique Pareto dominant remains ambiguous without lexical tie-break',async()=>{
  const source=sourceDecision();
  const direct=await assembly(
    source,'direct-mobile',qualified(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const adapt=await assembly(
    source,'adapt-mobile',qualified(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const p=pareto(null,null,{missingUnique:true});
  const pSha=await hsmeFoundationParetoEfficiencyV1Digest(p,hashPort);
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(),p,pSha,paretoOrigin(),hashPort,
  );
  assert.equal(result.state,'FINALIZATION_PENDING_AMBIGUOUS');
  assert.ok(result.blockers.includes('FINALIZER_PARETO_UNIQUE_DOMINANT_MISSING'));
  assert.equal(result.reuseAdvanceAllowed,false);
});

test('all reuse candidates rejected by canonical hard evidence proves reuse insufficient',async()=>{
  const source=sourceDecision();
  const direct=await assembly(
    source,'direct-mobile',rejectedLicense(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_REJECTED',
  );
  const adapt=await assembly(
    source,'adapt-mobile',rejectedQuality(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_REJECTED',
  );
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(),null,'UNKNOWN',paretoOrigin(),hashPort,
  );
  assert.equal(result.state,'REUSE_PATH_INSUFFICIENT_READY');
  assert.equal(result.finalDecision.decisionStatus,'REUSE_PATH_INSUFFICIENT');
  assert.equal(result.fullStudentEscalationAllowed,true);
  assert.equal(result.reuseAdvanceAllowed,false);
  assert.equal(result.paretoEvidenceSha256,'UNKNOWN');
});

test('forged assembly origin fails closed',async()=>{
  const source=sourceDecision();
  const direct=await assembly(
    source,'direct-mobile',qualified(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const adapt=await assembly(
    source,'adapt-mobile',rejectedQuality(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_REJECTED',
  );
  const p=pareto('direct-mobile','direct-mobile');
  const pSha=await hsmeFoundationParetoEfficiencyV1Digest(p,hashPort);
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(false),p,pSha,paretoOrigin(),hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(result.blockers.includes('FINALIZER_ASSEMBLY_ORIGIN_UNVERIFIED'));
});

test('forged Pareto origin fails closed even with matching digest',async()=>{
  const source=sourceDecision();
  const direct=await assembly(
    source,'direct-mobile',qualified(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  const adapt=await assembly(
    source,'adapt-mobile',rejectedQuality(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_REJECTED',
  );
  const p=pareto('direct-mobile','direct-mobile');
  const pSha=await hsmeFoundationParetoEfficiencyV1Digest(p,hashPort);
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(),p,pSha,paretoOrigin(false),hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(result.blockers.includes('FINALIZER_PARETO_ORIGIN_UNVERIFIED'));
});

test('structural coverage assembly is never consumed by V1 finalizer',async()=>{
  const source=sourceDecision();
  const direct=await assembly(
    source,'direct-mobile',qualified(source.candidates.find(x=>x.candidateId==='direct-mobile')),
    'CANDIDATE_EVIDENCE_QUALIFIED',
  );
  direct.structuralCoverageBlockers=['REQUIRED_CAPABILITY_UNSUPPORTED'];
  const adapt=await assembly(
    source,'adapt-mobile',rejectedQuality(source.candidates.find(x=>x.candidateId==='adapt-mobile')),
    'CANDIDATE_EVIDENCE_REJECTED',
  );
  const result=await finalizeHsmeFoundationReuseDecisionV1(
    source,[direct,adapt],assemblyOrigin(),null,'UNKNOWN',paretoOrigin(),hashPort,
  );
  assert.equal(result.state,'FINALIZATION_INVALID');
  assert.ok(result.blockers.includes('FINALIZER_STRUCTURAL_COVERAGE_ASSEMBLY_FORBIDDEN'));
});
