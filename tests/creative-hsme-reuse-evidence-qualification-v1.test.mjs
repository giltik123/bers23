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
  HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA,
  hsmeFoundationReuseTrainingAttestationV1Digest,
  qualifyHsmeFoundationReuseEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseEvidenceQualificationV1.ts';

const campaign=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-campaign.v1.json','utf8',
));
const trust=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-foundation-benchmark-candidate-trust.v1.json','utf8',
));
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const H=value=>createHash('sha256').update(value).digest('hex');
const CAPABILITY='IMAGE_EDITING';

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

function zeroTraining(evidenceSha256='UNKNOWN'){
  return {
    mode:'ZERO_TRAINING',
    trainableParameters:0,
    frozenParameters:'UNKNOWN',
    trainingExamples:0,
    gpuSeconds:0,
    trainingCostMicrousd:0,
    evidenceSha256,
  };
}

function loraTraining(evidenceSha256='UNKNOWN'){
  return {
    mode:'LORA',
    trainableParameters:10,
    frozenParameters:1000,
    trainingExamples:40,
    gpuSeconds:120,
    trainingCostMicrousd:2500,
    evidenceSha256,
  };
}

function placeholderCandidate(id,strategy){
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
    training:strategy==='FROZEN_FOUNDATION_ADAPTATION'
      ?loraTraining()
      :zeroTraining(),
    rejectionReasons:[],
  };
}

function qualityFinalization(candidateId){
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
    campaignId:campaign.campaignId,
    runEvidenceSha256:H('quality-run-evidence'),
    runEvidenceState:'FULL_COMPLETE',
    finalizationState:'FULL_FINALIZED',
    aggregationPolicy:'MAX_NONCOMPENSABLE_CRITICAL_THEN_MEDIAN',
    medianPolicy:'EVEN_ARITHMETIC_MEAN_HALF_UP',
    rows:[{
      candidateId,
      capability:CAPABILITY,
      qualityState:'QUALITY_FLOOR_PASS',
      outputSetSha256:H(candidateId+'-quality-output'),
      dimensionResults:[{
        dimensionId:'identity-preservation',
        reviewMode:'HYBRID',
        maxLossMicrounits:100_000,
        lossMicrounits:10_000,
        criticalFailureObserved:false,
        evidenceSha256:H(candidateId+'-quality-dimension'),
        passesFloor:true,
      }],
    }],
    slices:[{
      sliceId:'image-editing',
      capability:CAPABILITY,
      qualityFloorPassCandidateIds:[candidateId],
      qualityFloorFailCandidateIds:[],
      unresolvedCandidateIds:[],
      failedEvidenceCandidateIds:[],
    }],
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

function trainingAttestation(candidateId,source,training,runtimeOverlay){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA,
    candidateId,
    capability:CAPABILITY,
    sourceRoot:source.sourceRoot,
    immutableRevision:source.immutableRevision,
    sourceContentSha256:source.contentSha256,
    runtimeEvidenceSha256:runtimeOverlay.runtimeEvidenceSha256,
    targetEvidenceSha256:runtimeOverlay.targetEvidenceSha256,
    mode:training.mode,
    trainableParameters:training.trainableParameters,
    frozenParameters:training.frozenParameters,
    trainingExamples:training.trainingExamples,
    gpuSeconds:training.gpuSeconds,
    trainingCostMicrousd:training.trainingCostMicrousd,
    productionAuthorityGranted:false,
    trainingAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function overlay(candidateId,executionProfileSha256){
  const base={
    schemaVersion:'BERS_HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_V1',
    candidateId,
    capability:CAPABILITY,
    state:'PHYSICAL_RUNTIME_EVIDENCE_READY',
    blockers:[],
    targetTier:'MOBILE_DEFAULT',
    backboneBytes:100,
    conditionerBytes:20,
    vaeBytes:30,
    adapterBytes:10,
    otherRequiredBytes:5,
    mandatoryInstalledBytes:165,
    workingMemoryBytes:300_000_000,
    componentMapSha256:H(candidateId+'-component-map'),
    physicalTargetBindingSha256:H(candidateId+'-physical-target-binding'),
    targetEvidenceSha256:H(candidateId+'-target-evidence'),
    sourceExecutionProfileSha256:executionProfileSha256,
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
      HSME_FOUNDATION_PHYSICAL_REUSE_RUNTIME_OVERLAY_DIGEST_DOMAIN+JSON.stringify(payload),
    ),
  };
}

function decision(target,otherDirect,otherAdapt){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['candidate evidence remains pending until proof-only qualification'],
    candidates:[
      placeholderCandidate('control-mobile','CONTROL_BASELINE'),
      target.strategy==='DIRECT_FOUNDATION'?target:otherDirect,
      target.strategy==='FROZEN_FOUNDATION_ADAPTATION'?target:otherAdapt,
    ],
  };
}

async function fixture({
  candidateId='flux2-klein-4b-distilled-v1',
  strategy='DIRECT_FOUNDATION',
}={}){
  const campaignCandidate=campaign.candidates.find(value=>value.candidateId===candidateId);
  assert.ok(campaignCandidate,'campaign candidate required');
  const source={
    sourceRoot:campaignCandidate.sourceRoot,
    immutableRevision:campaignCandidate.immutableRevision,
    contentSha256:campaignCandidate.modelContentSha256,
  };

  const finalization=qualityFinalization(candidateId);
  const qualityFinalizationSha256=await hsmeFoundationQualityFinalizationV1Digest(
    finalization,hashPort,
  );
  const qualityRow=finalization.rows[0];
  const qualityEvidenceSha256=H(
    HSME_FOUNDATION_REUSE_QUALITY_EVIDENCE_DIGEST_DOMAIN+
    JSON.stringify({
      candidateId,
      capability:CAPABILITY,
      qualityFinalizationSha256,
      row:qualityRow,
    }),
  );

  const runtimeOverlay=overlay(candidateId,campaignCandidate.executionProfileSha256);
  const training=strategy==='DIRECT_FOUNDATION'?zeroTraining():loraTraining();
  const attestation=trainingAttestation(candidateId,source,training,runtimeOverlay);
  const trainingEvidenceSha256=await hsmeFoundationReuseTrainingAttestationV1Digest(
    attestation,hashPort,
  );

  const target={
    candidateId,
    strategy,
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source,
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unknownRuntime(),
    training:{...training,evidenceSha256:'UNKNOWN'},
    rejectionReasons:[],
  };
  const otherDirect=placeholderCandidate('other-direct','DIRECT_FOUNDATION');
  const otherAdapt=placeholderCandidate('other-adapt','FROZEN_FOUNDATION_ADAPTATION');
  const rawDecision=decision(target,otherDirect,otherAdapt);
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    rawDecision,candidateId,CAPABILITY,runtimeOverlay,
    runtimeOverlay.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(application.state,'RUNTIME_OVERLAY_APPLIED_PENDING');

  return {
    candidateId,
    campaignCandidate,
    source,
    finalization,
    qualityFinalizationSha256,
    trainingAttestation:attestation,
    runtimeOverlay,
    application,
    expectedQualityEvidenceSha256:qualityEvidenceSha256,
    expectedTrainingEvidenceSha256:trainingEvidenceSha256,
  };
}

function qualityOrigin(verified=true){
  const calls=[];
  return {
    calls,
    async verifyQualityFinalization(finalization,digest){
      calls.push({finalization,digest});
      if(verified instanceof Error)throw verified;
      return verified;
    },
  };
}

for(const config of [
  {candidateId:'flux2-klein-4b-distilled-v1',strategy:'DIRECT_FOUNDATION'},
  {candidateId:'flux2-klein-base-4b-v1',strategy:'FROZEN_FOUNDATION_ADAPTATION'},
]){
  test(config.strategy+' qualification remains capability-scoped and proof-only',async()=>{
    const x=await fixture(config);
    const beforeDecision=structuredClone(x.application.pendingDecision);
    const verifier=qualityOrigin(true);
    const result=await qualifyHsmeFoundationReuseEvidenceV1(
      x.application,x.runtimeOverlay,x.candidateId,CAPABILITY,
      campaign,trust,x.finalization,x.qualityFinalizationSha256,
      verifier,x.trainingAttestation,hashPort,
    );

    assert.equal(result.state,'QUALIFICATION_EVIDENCE_READY');
    assert.deepEqual(result.blockers,[]);
    assert.equal(result.candidateId,x.candidateId);
    assert.equal(result.capability,CAPABILITY);
    assert.equal(result.sourceDecisionSha256,x.application.sourceDecisionSha256);
    assert.equal(result.sourceCandidateSha256,x.application.sourceCandidateSha256);
    assert.equal(result.pendingDecisionSha256,x.application.pendingDecisionSha256);
    assert.equal(result.appliedCandidateSha256,x.application.appliedCandidateSha256);
    assert.equal(result.runtimeEvidenceSha256,x.runtimeOverlay.runtimeEvidenceSha256);
    assert.notEqual(result.sourceCandidateSha256,result.appliedCandidateSha256);
    assert.notEqual(result.sourceDecisionSha256,result.pendingDecisionSha256);
    assert.equal(result.licenseEvidenceSha256,x.campaignCandidate.rightsEvidenceSha256);
    assert.equal(result.qualityEvidenceSha256,x.expectedQualityEvidenceSha256);
    assert.equal(result.trainingEvidenceSha256,x.expectedTrainingEvidenceSha256);
    assert.equal(result.resolvedLicenseConclusion,'COMMERCIAL_ADMISSIBLE');
    assert.match(result.evidenceSetSha256,/^[0-9a-f]{64}$/);
    assert.equal('qualifiedCandidate' in result,false);
    assert.equal('qualifiedCandidateSha256' in result,false);
    assert.equal(verifier.calls.length,1);
    assert.deepEqual(x.application.pendingDecision,beforeDecision);
    assert.equal(x.application.pendingDecision.decisionStatus,'EVALUATION_PENDING');
    assert.equal(x.application.pendingDecision.selectedCandidateId,undefined);
    const source=x.application.candidate;
    assert.equal(source.evidenceState,'UNRESOLVED');
    assert.equal(source.licenseConclusion,'REVIEW_REQUIRED');
    assert.equal(source.licenseEvidenceSha256,'UNKNOWN');
    assert.equal(source.quality.status,'UNKNOWN');
    assert.equal(source.training.evidenceSha256,'UNKNOWN');

    for(const field of [
      'decisionMutationAllowed','candidateSelectionAllowed','selectedCandidateIdAllowed',
      'reuseAdvanceAllowed','fullStudentEscalationAllowed','modelFleetPromotionAllowed',
      'installOrDownloadAllowed','productionAuthorityGranted','providerAuthorityGranted',
      'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
      'durableModelFleetPromotionAllowed','trainingOrDistillationAllowed','winnerSelectionAllowed',
    ]) assert.equal(result[field],false,field);
  });
}

test('quality origin must be independently verified',async()=>{
  const x=await fixture();
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runtimeOverlay,x.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualityFinalizationSha256,
    qualityOrigin(false),x.trainingAttestation,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALITY_FINALIZATION_ORIGIN_UNVERIFIED'));
});

test('quality floor failure cannot be upgraded by candidate PASS metadata',async()=>{
  const x=await fixture();
  const finalization=structuredClone(x.finalization);
  finalization.rows[0].qualityState='QUALITY_FLOOR_FAIL';
  const digest=await hsmeFoundationQualityFinalizationV1Digest(finalization,hashPort);
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runtimeOverlay,x.candidateId,CAPABILITY,
    campaign,trust,finalization,digest,
    qualityOrigin(true),x.trainingAttestation,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALITY_FLOOR_NOT_PROVEN'));
});

test('training source or training block drift fails closed',async()=>{
  const x=await fixture();
  const changedSource=structuredClone(x.trainingAttestation);
  changedSource.sourceContentSha256=H('other-source');
  let result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runtimeOverlay,x.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualityFinalizationSha256,
    qualityOrigin(true),changedSource,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALIFICATION_TRAINING_SOURCE_DRIFT'));

  const changedTraining=structuredClone(x.trainingAttestation);
  changedTraining.trainingExamples=1;
  result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runtimeOverlay,x.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualityFinalizationSha256,
    qualityOrigin(true),changedTraining,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALIFICATION_TRAINING_BLOCK_DRIFT'));
});

test('training attestation cannot be reused for a different physical runtime target',async()=>{
  const x=await fixture();
  const changed=structuredClone(x.trainingAttestation);
  changed.targetEvidenceSha256=H('different-target-evidence');
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runtimeOverlay,x.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualityFinalizationSha256,
    qualityOrigin(true),changed,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALIFICATION_TRAINING_TARGET_DRIFT'));
});

test('campaign or license trust drift cannot qualify the runtime-wired candidate',async()=>{
  const x=await fixture();
  const changedCampaign=structuredClone(campaign);
  const row=changedCampaign.candidates.find(value=>value.candidateId===x.candidateId);
  row.sourceRoot='other-owner/other-model';
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runtimeOverlay,x.candidateId,CAPABILITY,
    changedCampaign,trust,x.finalization,x.qualityFinalizationSha256,
    qualityOrigin(true),x.trainingAttestation,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALIFICATION_TRUST_PROOF_INVALID')
    ||result.blockers.includes('QUALIFICATION_SOURCE_TRUST_DRIFT'));
});

test('runtime overlay must be independently rehashed again at qualification boundary',async()=>{
  const x=await fixture();
  const changed=structuredClone(x.runtimeOverlay);
  changed.workingMemoryBytes+=1;
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,changed,x.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualityFinalizationSha256,
    qualityOrigin(true),x.trainingAttestation,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALIFICATION_RUNTIME_REHASH_MISMATCH')
    ||result.blockers.includes('QUALIFICATION_CANDIDATE_RUNTIME_DRIFT'));
});

test('source application authority widening is rejected before capability qualification',async()=>{
  const x=await fixture();
  const application=structuredClone(x.application);
  application.reuseAdvanceAllowed=true;
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    application,x.runtimeOverlay,x.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualityFinalizationSha256,
    qualityOrigin(true),x.trainingAttestation,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('PENDING_RUNTIME_APPLICATION_AUTHORITY_WIDENING'));
});
