import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionFinalizationV1.ts';
import {
  HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA,
  proveHsmeReuseOutcomeHandoffV1,
} from '../src/platform/creative/local-ai/hsme/HsmeReuseOutcomeHandoffV1.ts';
import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function unresolvedRuntime(){
  return {
    backboneBytes:'UNKNOWN',conditionerBytes:'UNKNOWN',vaeBytes:'UNKNOWN',
    adapterBytes:'UNKNOWN',otherRequiredBytes:'UNKNOWN',
    mandatoryInstalledBytes:'UNKNOWN',workingMemoryBytes:'UNKNOWN',
    evidenceSha256:'UNKNOWN',
  };
}
function resolvedRuntime(){
  return {
    backboneBytes:100,conditionerBytes:20,vaeBytes:30,adapterBytes:10,
    otherRequiredBytes:5,mandatoryInstalledBytes:165,
    workingMemoryBytes:300_000_000,evidenceSha256:H('runtime'),
  };
}
function zeroTraining(evidence='UNKNOWN'){
  return {
    mode:'ZERO_TRAINING',trainableParameters:0,frozenParameters:'UNKNOWN',
    trainingExamples:0,gpuSeconds:0,trainingCostMicrousd:0,evidenceSha256:evidence,
  };
}
function loraTraining(evidence='UNKNOWN'){
  return {
    mode:'LORA',trainableParameters:10,frozenParameters:1000,
    trainingExamples:40,gpuSeconds:120,trainingCostMicrousd:2500,evidenceSha256:evidence,
  };
}
function source(candidateId){
  return {
    sourceRoot:'example/'+candidateId,
    immutableRevision:'a'.repeat(40),
    contentSha256:H(candidateId+'-source'),
  };
}
function control(){
  return {
    candidateId:'control-mobile',strategy:'CONTROL_BASELINE',targetTier:'REFERENCE',
    evidenceState:'UNRESOLVED',source:source('control-mobile'),
    licenseConclusion:'REVIEW_REQUIRED',licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),training:zeroTraining(),rejectionReasons:[],
  };
}
function direct(state='UNRESOLVED'){
  if(state==='QUALIFIED')return {
    candidateId:'direct-mobile',strategy:'DIRECT_FOUNDATION',targetTier:'MOBILE_DEFAULT',
    evidenceState:'QUALIFIED',source:source('direct-mobile'),
    licenseConclusion:'COMMERCIAL_ADMISSIBLE',licenseEvidenceSha256:H('direct-license'),
    quality:{status:'PASS',evidenceSha256:H('direct-quality')},
    runtime:resolvedRuntime(),training:zeroTraining(H('direct-zero-training')),rejectionReasons:[],
  };
  if(state==='REJECTED')return {
    candidateId:'direct-mobile',strategy:'DIRECT_FOUNDATION',targetTier:'MOBILE_DEFAULT',
    evidenceState:'REJECTED',source:source('direct-mobile'),
    licenseConclusion:'NON_COMMERCIAL',licenseEvidenceSha256:H('direct-license-rejected'),
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),training:zeroTraining(),rejectionReasons:['LICENSE_NON_COMMERCIAL'],
  };
  return {
    candidateId:'direct-mobile',strategy:'DIRECT_FOUNDATION',targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',source:source('direct-mobile'),
    licenseConclusion:'REVIEW_REQUIRED',licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),training:zeroTraining(),rejectionReasons:[],
  };
}
function adaptation(state='UNRESOLVED'){
  if(state==='QUALIFIED')return {
    candidateId:'adapt-mobile',strategy:'FROZEN_FOUNDATION_ADAPTATION',targetTier:'MOBILE_DEFAULT',
    evidenceState:'QUALIFIED',source:source('adapt-mobile'),
    licenseConclusion:'COMMERCIAL_ADMISSIBLE',licenseEvidenceSha256:H('adapt-license'),
    quality:{status:'PASS',evidenceSha256:H('adapt-quality')},
    runtime:resolvedRuntime(),training:loraTraining(H('adapt-training')),rejectionReasons:[],
  };
  if(state==='REJECTED')return {
    candidateId:'adapt-mobile',strategy:'FROZEN_FOUNDATION_ADAPTATION',targetTier:'MOBILE_DEFAULT',
    evidenceState:'REJECTED',source:source('adapt-mobile'),
    licenseConclusion:'COMMERCIAL_ADMISSIBLE',licenseEvidenceSha256:H('adapt-license'),
    quality:{status:'FAIL',evidenceSha256:H('adapt-quality-fail')},
    runtime:unresolvedRuntime(),training:loraTraining(),rejectionReasons:['QUALITY_FLOOR_FAILED'],
  };
  return {
    candidateId:'adapt-mobile',strategy:'FROZEN_FOUNDATION_ADAPTATION',targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',source:source('adapt-mobile'),
    licenseConclusion:'REVIEW_REQUIRED',licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),training:loraTraining(),rejectionReasons:[],
  };
}

function decision(status){
  if(status==='DIRECT_FOUNDATION_ADVANCE'){
    return normalizeHsmeFoundationReuseDecisionV1({
      schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
      qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
      decisionStatus:status,selectedCandidateId:'direct-mobile',
      mobileInstalledBudgetBytes:1_000_000_000,mobileWorkingMemoryBudgetBytes:1_000_000_000,
      rationale:['direct reuse is uniquely proven'],
      candidates:[control(),direct('QUALIFIED'),adaptation()],
    });
  }
  if(status==='BOUNDED_ADAPTATION_ADVANCE'){
    return normalizeHsmeFoundationReuseDecisionV1({
      schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
      qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
      decisionStatus:status,selectedCandidateId:'adapt-mobile',
      mobileInstalledBudgetBytes:1_000_000_000,mobileWorkingMemoryBudgetBytes:1_000_000_000,
      rationale:['bounded adaptation is uniquely proven'],
      candidates:[control(),direct(),adaptation('QUALIFIED')],
    });
  }
  return normalizeHsmeFoundationReuseDecisionV1({
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'REUSE_PATH_INSUFFICIENT',
    mobileInstalledBudgetBytes:1_000_000_000,mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['every reuse path has a measured hard blocker'],
    candidates:[control(),direct('REJECTED'),adaptation('REJECTED')],
  });
}

const authority={
  modelFleetPromotionAllowed:false,installOrDownloadAllowed:false,
  productionAuthorityGranted:false,providerAuthorityGranted:false,
  billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
  aeeExecutionAuthorityGranted:false,durableModelFleetPromotionAllowed:false,
  trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
};

async function finalization(state){
  const status=state==='DIRECT_FOUNDATION_ADVANCE_READY'
    ?'DIRECT_FOUNDATION_ADVANCE'
    :state==='BOUNDED_ADAPTATION_ADVANCE_READY'
      ?'BOUNDED_ADAPTATION_ADVANCE'
      :'REUSE_PATH_INSUFFICIENT';
  const finalDecision=decision(status);
  const finalDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(finalDecision,hashPort);
  const selectedCandidateId=status==='DIRECT_FOUNDATION_ADVANCE'
    ?'direct-mobile'
    :status==='BOUNDED_ADAPTATION_ADVANCE'
      ?'adapt-mobile'
      :undefined;
  const candidateAssemblyRefs=[
    {
      candidateId:'adapt-mobile',
      state:status==='BOUNDED_ADAPTATION_ADVANCE'?'CANDIDATE_EVIDENCE_QUALIFIED':'CANDIDATE_EVIDENCE_REJECTED',
      candidateEvidenceSetSha256:H('adapt-set'),
      assembledCandidateSha256:H('adapt-candidate'),
    },
    {
      candidateId:'direct-mobile',
      state:status==='DIRECT_FOUNDATION_ADVANCE'?'CANDIDATE_EVIDENCE_QUALIFIED':'CANDIDATE_EVIDENCE_REJECTED',
      candidateEvidenceSetSha256:H('direct-set'),
      assembledCandidateSha256:H('direct-candidate'),
    },
  ];
  const value={
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state,blockers:[],
    sourceDecisionSha256:H('source-decision'),
    campaignDigest:H('campaign'),
    qualityFrontierSha256:H('frontier'),
    paretoEvidenceSha256:H('pareto'),
    candidateAssemblyRefs,
    eligibleCandidateIds:selectedCandidateId?[selectedCandidateId]:[],
    ...(selectedCandidateId?{selectedCandidateId}:{}),
    finalDecisionSha256,
    finalizationEvidenceSha256:'UNKNOWN',
    finalDecision,
    reuseAdvanceAllowed:state!=='REUSE_PATH_INSUFFICIENT_READY',
    fullStudentEscalationAllowed:state==='REUSE_PATH_INSUFFICIENT_READY',
    ...authority,
  };
  const payload={
    schemaVersion:value.schemaVersion,state:value.state,
    sourceDecisionSha256:value.sourceDecisionSha256,
    campaignDigest:value.campaignDigest,
    qualityFrontierSha256:value.qualityFrontierSha256,
    paretoEvidenceSha256:value.paretoEvidenceSha256,
    candidateAssemblyRefs:value.candidateAssemblyRefs,
    eligibleCandidateIds:value.eligibleCandidateIds,
    ...(value.selectedCandidateId?{selectedCandidateId:value.selectedCandidateId}:{}),
    finalDecisionSha256:value.finalDecisionSha256,
    reuseAdvanceAllowed:value.reuseAdvanceAllowed,
    fullStudentEscalationAllowed:value.fullStudentEscalationAllowed,
    productionAuthorityGranted:false,providerAuthorityGranted:false,
    billingAuthorityGranted:false,projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,winnerSelectionAllowed:false,
  };
  value.finalizationEvidenceSha256=H(
    HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN+JSON.stringify(payload),
  );
  return value;
}

function origin(ok=true){
  const calls=[];
  return {
    calls,
    async verifyFinalization(value,digest){
      calls.push({value,digest});
      return ok;
    },
  };
}

for(const [finalState,handoffState] of [
  ['DIRECT_FOUNDATION_ADVANCE_READY','DIRECT_REUSE_HANDOFF_READY'],
  ['BOUNDED_ADAPTATION_ADVANCE_READY','BOUNDED_ADAPTATION_HANDOFF_READY'],
  ['REUSE_PATH_INSUFFICIENT_READY','FULL_STUDENT_DISTILLATION_HANDOFF_READY'],
]){
  test(finalState+' maps to exactly one non-executing handoff',async()=>{
    const f=await finalization(finalState);
    const verifier=origin(true);
    const result=await proveHsmeReuseOutcomeHandoffV1(f,verifier,hashPort);
    assert.equal(result.schemaVersion,HSME_REUSE_OUTCOME_HANDOFF_V1_SCHEMA);
    assert.equal(result.state,handoffState);
    assert.deepEqual(result.blockers,[]);
    assert.match(result.finalDecisionSha256,/^[0-9a-f]{64}$/);
    assert.match(result.finalizationEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.match(result.candidateAssemblyRefsSha256,/^[0-9a-f]{64}$/);
    assert.match(result.handoffEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.equal(verifier.calls.length,1);
    assert.equal(result.trainingRunStartAllowed,false);
    assert.equal(result.modelInstallAllowed,false);
    assert.equal(result.modelFleetPromotionAllowed,false);
    assert.equal(result.productionAuthorityGranted,false);
    assert.equal(result.providerAuthorityGranted,false);
    assert.equal(result.billingAuthorityGranted,false);
    assert.equal(result.projectArtifactMutationAllowed,false);
    assert.equal(result.aeeExecutionAuthorityGranted,false);
    assert.equal(result.durableModelFleetPromotionAllowed,false);
    assert.equal(result.winnerSelectionAllowed,false);
    if(handoffState==='FULL_STUDENT_DISTILLATION_HANDOFF_READY'){
      assert.equal(result.reusePhasePermitted,false);
      assert.equal(result.fullStudentDistillationPhasePermitted,true);
      assert.equal('selectedCandidateId' in result,false);
      assert.equal(result.selectedCandidateEvidenceSha256,'UNKNOWN');
    }else{
      assert.equal(result.reusePhasePermitted,true);
      assert.equal(result.fullStudentDistillationPhasePermitted,false);
      assert.ok(result.selectedCandidateId);
      assert.match(result.selectedCandidateEvidenceSha256,/^[0-9a-f]{64}$/);
    }
  });
}

test('ambiguous finalization remains pending and grants no next-phase permission',async()=>{
  const f={
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:'SELECTION_AMBIGUOUS',blockers:['FINALIZATION_PARETO_TIE'],
    sourceDecisionSha256:H('source-decision'),
    campaignDigest:H('campaign'),qualityFrontierSha256:H('frontier'),paretoEvidenceSha256:H('pareto'),
    candidateAssemblyRefs:[],eligibleCandidateIds:[],
    finalDecisionSha256:'UNKNOWN',finalizationEvidenceSha256:'UNKNOWN',finalDecision:null,
    reuseAdvanceAllowed:false,fullStudentEscalationAllowed:false,...authority,
  };
  const result=await proveHsmeReuseOutcomeHandoffV1(f,origin(true),hashPort);
  assert.equal(result.state,'HANDOFF_PENDING');
  assert.equal(result.reusePhasePermitted,false);
  assert.equal(result.fullStudentDistillationPhasePermitted,false);
  assert.equal(result.trainingRunStartAllowed,false);
});

test('forged finalization origin fails closed even when all hashes are internally consistent',async()=>{
  const f=await finalization('DIRECT_FOUNDATION_ADVANCE_READY');
  const result=await proveHsmeReuseOutcomeHandoffV1(f,origin(false),hashPort);
  assert.equal(result.state,'HANDOFF_INVALID');
  assert.ok(result.blockers.includes('HANDOFF_FINALIZATION_ORIGIN_UNVERIFIED'));
});

test('mutating final decision after finalization invalidates the handoff',async()=>{
  const f=await finalization('DIRECT_FOUNDATION_ADVANCE_READY');
  f.finalDecision={...f.finalDecision,rationale:['tampered after finalization']};
  const result=await proveHsmeReuseOutcomeHandoffV1(f,origin(true),hashPort);
  assert.equal(result.state,'HANDOFF_INVALID');
  assert.ok(result.blockers.includes('HANDOFF_FINAL_DECISION_DIGEST_MISMATCH')
    ||result.blockers.includes('HANDOFF_FINAL_DECISION_INVALID'));
});

test('finalizer authority widening is rejected before origin trust is consulted',async()=>{
  const f=await finalization('DIRECT_FOUNDATION_ADVANCE_READY');
  f.modelFleetPromotionAllowed=true;
  const verifier=origin(true);
  const result=await proveHsmeReuseOutcomeHandoffV1(f,verifier,hashPort);
  assert.equal(result.state,'HANDOFF_INVALID');
  assert.ok(result.blockers.includes('HANDOFF_FINALIZATION_AUTHORITY_WIDENING'));
});
