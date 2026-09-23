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

function unresolvedRuntime(){
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

function training(strategy){
  return strategy==='DIRECT_FOUNDATION'
    ?{
      mode:'ZERO_TRAINING',
      trainableParameters:0,
      frozenParameters:'UNKNOWN',
      trainingExamples:0,
      gpuSeconds:0,
      trainingCostMicrousd:0,
      evidenceSha256:'UNKNOWN',
    }
    :{
      mode:'LORA',
      trainableParameters:10,
      frozenParameters:1000,
      trainingExamples:40,
      gpuSeconds:120,
      trainingCostMicrousd:2500,
      evidenceSha256:'UNKNOWN',
    };
}

function placeholder(candidateId,strategy){
  return {
    candidateId,
    strategy,
    targetTier:strategy==='CONTROL_BASELINE'?'REFERENCE':'MOBILE_DEFAULT',
    evidenceState:'UNRESOLVED',
    source:{
      sourceRoot:'example/'+candidateId,
      immutableRevision:'a'.repeat(40),
      contentSha256:H(candidateId+'-source'),
    },
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:training(strategy==='CONTROL_BASELINE'?'DIRECT_FOUNDATION':strategy),
    rejectionReasons:[],
  };
}

function sourceCandidate(candidateId,strategy){
  const row=campaign.candidates.find(value=>value.candidateId===candidateId);
  assert.ok(row,'campaign candidate must exist');
  assert.ok(row.capabilities.includes(CAPABILITY),'campaign candidate must support IMAGE_EDITING');
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
    training:training(strategy),
    rejectionReasons:[],
  };
}

function decision(target){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['qualification evidence is capability-scoped and external'],
    candidates:[
      placeholder('control-mobile','CONTROL_BASELINE'),
      target.strategy==='DIRECT_FOUNDATION'
        ?target
        :placeholder('other-direct','DIRECT_FOUNDATION'),
      target.strategy==='FROZEN_FOUNDATION_ADAPTATION'
        ?target
        :placeholder('other-adaptation','FROZEN_FOUNDATION_ADAPTATION'),
    ],
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

function qualityFinalization(candidateId){
  return {
    schemaVersion:HSME_FOUNDATION_QUALITY_FINALIZATION_V1_SCHEMA,
    campaignId:campaign.campaignId,
    runEvidenceSha256:H('qualification-quality-run'),
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

function attestation(candidate,runOverlay){
  return {
    schemaVersion:HSME_FOUNDATION_REUSE_TRAINING_ATTESTATION_V1_SCHEMA,
    candidateId:candidate.candidateId,
    capability:CAPABILITY,
    sourceRoot:candidate.source.sourceRoot,
    immutableRevision:candidate.source.immutableRevision,
    sourceContentSha256:candidate.source.contentSha256,
    runtimeEvidenceSha256:runOverlay.runtimeEvidenceSha256,
    targetEvidenceSha256:runOverlay.targetEvidenceSha256,
    mode:candidate.training.mode,
    trainableParameters:candidate.training.trainableParameters,
    frozenParameters:candidate.training.frozenParameters,
    trainingExamples:candidate.training.trainingExamples,
    gpuSeconds:candidate.training.gpuSeconds,
    trainingCostMicrousd:candidate.training.trainingCostMicrousd,
    productionAuthorityGranted:false,
    trainingAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function origin(value=true){
  const calls=[];
  return {
    calls,
    async verifyQualityFinalization(finalization,digest){
      calls.push({finalization,digest});
      return value;
    },
  };
}

async function fixture(candidateId,strategy){
  const target=sourceCandidate(candidateId,strategy);
  const campaignRow=campaign.candidates.find(value=>value.candidateId===candidateId);
  const runOverlay=overlay(candidateId,campaignRow.executionProfileSha256);
  const application=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(target),candidateId,CAPABILITY,runOverlay,
    runOverlay.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(application.state,'RUNTIME_OVERLAY_APPLIED_PENDING');
  const finalization=qualityFinalization(candidateId);
  const qualitySha=await hsmeFoundationQualityFinalizationV1Digest(finalization,hashPort);
  const trainingAttestation=attestation(target,runOverlay);
  const trainingSha=await hsmeFoundationReuseTrainingAttestationV1Digest(
    trainingAttestation,hashPort,
  );
  return {
    target,runOverlay,application,finalization,qualitySha,
    trainingAttestation,trainingSha,
  };
}

for(const [candidateId,strategy] of [
  ['flux2-klein-4b-distilled-v1','DIRECT_FOUNDATION'],
  ['flux2-klein-base-4b-v1','FROZEN_FOUNDATION_ADAPTATION'],
]){
  test(strategy+' produces capability-scoped qualification evidence only',async()=>{
    const x=await fixture(candidateId,strategy);
    const before=structuredClone(x.application.pendingDecision);
    const verifier=origin(true);
    const result=await qualifyHsmeFoundationReuseEvidenceV1(
      x.application,x.runOverlay,candidateId,CAPABILITY,
      campaign,trust,x.finalization,x.qualitySha,verifier,
      x.trainingAttestation,hashPort,
    );
    assert.equal(result.state,'QUALIFICATION_EVIDENCE_READY');
    assert.deepEqual(result.blockers,[]);
    assert.equal(result.candidateId,candidateId);
    assert.equal(result.capability,CAPABILITY);
    assert.equal(result.runtimeEvidenceSha256,x.runOverlay.runtimeEvidenceSha256);
    assert.equal(result.runtimeComponentMapSha256,x.runOverlay.componentMapSha256);
    assert.equal(result.sourceExecutionProfileSha256,x.runOverlay.sourceExecutionProfileSha256);
    assert.equal(result.trainingEvidenceSha256,x.trainingSha);
    assert.equal(result.resolvedLicenseConclusion,'COMMERCIAL_ADMISSIBLE');
    assert.match(result.licenseEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.match(result.qualityEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.match(result.evidenceSetSha256,/^[0-9a-f]{64}$/);
    assert.equal('qualifiedCandidate' in result,false);
    assert.deepEqual(x.application.pendingDecision,before);
    assert.equal(x.application.candidate.evidenceState,'UNRESOLVED');
    assert.equal(x.application.candidate.licenseConclusion,'REVIEW_REQUIRED');
    assert.equal(x.application.candidate.quality.status,'UNKNOWN');
    assert.equal(x.application.candidate.training.evidenceSha256,'UNKNOWN');
    assert.equal(verifier.calls.length,1);
    for(const field of [
      'decisionMutationAllowed','candidateSelectionAllowed','selectedCandidateIdAllowed',
      'reuseAdvanceAllowed','fullStudentEscalationAllowed','modelFleetPromotionAllowed',
      'installOrDownloadAllowed','productionAuthorityGranted','providerAuthorityGranted',
      'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
      'durableModelFleetPromotionAllowed','trainingOrDistillationAllowed','winnerSelectionAllowed',
    ]) assert.equal(result[field],false,field);
  });
}

test('quality origin failure cannot produce qualification evidence',async()=>{
  const x=await fixture('flux2-klein-4b-distilled-v1','DIRECT_FOUNDATION');
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runOverlay,x.target.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualitySha,origin(false),
    x.trainingAttestation,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALITY_FINALIZATION_ORIGIN_UNVERIFIED'));
});

test('training attestation cannot be reused for another physical target',async()=>{
  const x=await fixture('flux2-klein-4b-distilled-v1','DIRECT_FOUNDATION');
  const changed=structuredClone(x.trainingAttestation);
  changed.targetEvidenceSha256=H('different-target');
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,x.runOverlay,x.target.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualitySha,origin(true),
    changed,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALIFICATION_TRAINING_TARGET_DRIFT'));
});

test('runtime overlay is independently rehashed at qualification boundary',async()=>{
  const x=await fixture('flux2-klein-4b-distilled-v1','DIRECT_FOUNDATION');
  const changed=structuredClone(x.runOverlay);
  changed.workingMemoryBytes+=1;
  const result=await qualifyHsmeFoundationReuseEvidenceV1(
    x.application,changed,x.target.candidateId,CAPABILITY,
    campaign,trust,x.finalization,x.qualitySha,origin(true),
    x.trainingAttestation,hashPort,
  );
  assert.equal(result.state,'QUALIFICATION_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('QUALIFICATION_RUNTIME_REHASH_MISMATCH')
    ||result.blockers.includes('QUALIFICATION_CANDIDATE_RUNTIME_DRIFT'));
});
