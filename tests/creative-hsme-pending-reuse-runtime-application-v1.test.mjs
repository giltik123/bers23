import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  applyHsmeFoundationPhysicalReuseRuntimeOverlayV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPendingReuseRuntimeApplicationV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
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

function zeroTraining(label){
  return {
    mode:'ZERO_TRAINING',
    trainableParameters:0,
    frozenParameters:'UNKNOWN',
    trainingExamples:0,
    gpuSeconds:0,
    trainingCostMicrousd:0,
    evidenceSha256:H(label+'-zero-training'),
  };
}

function loraTraining(label){
  return {
    mode:'LORA',
    trainableParameters:10,
    frozenParameters:1000,
    trainingExamples:40,
    gpuSeconds:120,
    trainingCostMicrousd:2500,
    evidenceSha256:H(label+'-lora-training'),
  };
}

function baseCandidate(id,strategy,targetTier='MOBILE_DEFAULT'){
  return {
    candidateId:id,
    strategy,
    targetTier,
    evidenceState:'UNRESOLVED',
    source:{
      sourceRoot:'bers/'+id,
      immutableRevision:'a'.repeat(40),
      contentSha256:H(id+'-source'),
    },
    licenseConclusion:'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256:H(id+'-license'),
    quality:{status:'PASS',evidenceSha256:H(id+'-quality')},
    runtime:unresolvedRuntime(),
    training:strategy==='FROZEN_FOUNDATION_ADAPTATION'?loraTraining(id):zeroTraining(id),
    rejectionReasons:[],
  };
}

function decision(){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'EVALUATION_PENDING',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['runtime evidence still being assembled'],
    candidates:[
      baseCandidate('control-mobile','CONTROL_BASELINE'),
      baseCandidate('direct-mobile','DIRECT_FOUNDATION'),
      baseCandidate('adapt-mobile','FROZEN_FOUNDATION_ADAPTATION'),
    ],
  };
}

function overlay(candidateId,overrides={}){
  return {
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
    runtimeEvidenceSha256:H(candidateId+'-runtime-evidence'),
    componentMapSha256:H(candidateId+'-component-map'),
    physicalTargetBindingSha256:H(candidateId+'-physical-target-binding'),
    targetEvidenceSha256:H(candidateId+'-target-evidence'),
    sourceExecutionProfileSha256:H(candidateId+'-execution-profile'),
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
    ...overrides,
  };
}

async function apply(candidateId,raw=decision(),ov=overlay(candidateId)){
  return applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    raw,candidateId,CAPABILITY,ov,ov.runtimeEvidenceSha256,hashPort,
  );
}

for(const candidateId of ['direct-mobile','adapt-mobile']){
  test(candidateId+' receives exact runtime overlay while all non-runtime evidence remains pending and unchanged',async()=>{
    const raw=decision();
    const before=structuredClone(raw.candidates.find(value=>value.candidateId===candidateId));
    const ov=overlay(candidateId);
    const result=await apply(candidateId,raw,ov);

    assert.equal(result.state,'RUNTIME_OVERLAY_APPLIED_PENDING');
    assert.deepEqual(result.blockers,[]);
    assert.match(result.sourceDecisionSha256,/^[0-9a-f]{64}$/);
    assert.match(result.sourceCandidateSha256,/^[0-9a-f]{64}$/);
    assert.match(result.appliedCandidateSha256,/^[0-9a-f]{64}$/);
    assert.match(result.pendingDecisionSha256,/^[0-9a-f]{64}$/);
    assert.notEqual(result.sourceDecisionSha256,result.pendingDecisionSha256);
    assert.notEqual(result.sourceCandidateSha256,result.appliedCandidateSha256);
    assert.equal(result.runtimeEvidenceSha256,ov.runtimeEvidenceSha256);

    assert.equal(result.candidate.candidateId,candidateId);
    assert.equal(result.candidate.evidenceState,'UNRESOLVED');
    assert.equal(result.candidate.strategy,before.strategy);
    assert.equal(result.candidate.targetTier,before.targetTier);
    assert.deepEqual(result.candidate.source,before.source);
    assert.equal(result.candidate.licenseConclusion,before.licenseConclusion);
    assert.equal(result.candidate.licenseEvidenceSha256,before.licenseEvidenceSha256);
    assert.deepEqual(result.candidate.quality,before.quality);
    assert.deepEqual(result.candidate.training,before.training);
    assert.deepEqual(result.candidate.rejectionReasons,before.rejectionReasons);
    assert.deepEqual(result.candidate.runtime,{
      backboneBytes:100,
      conditionerBytes:20,
      vaeBytes:30,
      adapterBytes:10,
      otherRequiredBytes:5,
      mandatoryInstalledBytes:165,
      workingMemoryBytes:300_000_000,
      evidenceSha256:ov.runtimeEvidenceSha256,
    });

    assert.equal(result.pendingDecision.decisionStatus,'EVALUATION_PENDING');
    assert.equal(result.pendingDecision.selectedCandidateId,undefined);
    const applied=result.pendingDecision.candidates.find(value=>value.candidateId===candidateId);
    assert.deepEqual(applied,result.candidate);

    for(const field of [
      'candidateQualificationAllowed','selectedCandidateIdAllowed','decisionStatusMutationAllowed',
      'strategyMutationAllowed','licenseMutationAllowed','qualityMutationAllowed','trainingMutationAllowed',
      'reuseAdvanceAllowed','fullStudentEscalationAllowed','modelFleetPromotionAllowed',
      'installOrDownloadAllowed','productionAuthorityGranted','providerAuthorityGranted',
      'billingAuthorityGranted','projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
      'durableModelFleetPromotionAllowed','trainingOrDistillationAllowed','winnerSelectionAllowed',
    ]) assert.equal(result[field],false,field);
  });
}

test('control baseline cannot consume physical reuse runtime overlay',async()=>{
  const result=await apply('control-mobile');
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('CONTROL_BASELINE_RUNTIME_APPLICATION_FORBIDDEN'));
  assert.equal(result.candidate,null);
});

test('non-mobile reuse candidate cannot receive MOBILE_DEFAULT overlay',async()=>{
  const raw=decision();
  raw.candidates[2].targetTier='DESKTOP_HIGH_END';
  const result=await apply('adapt-mobile',raw,overlay('adapt-mobile'));
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('MOBILE_DEFAULT_CANDIDATE_REQUIRED'));
});

test('candidate evidenceState is never upgraded by runtime wiring',async()=>{
  const raw=decision();
  raw.candidates[1].evidenceState='QUALIFIED';
  raw.candidates[1].runtime={
    backboneBytes:100,conditionerBytes:20,vaeBytes:30,adapterBytes:10,otherRequiredBytes:5,
    mandatoryInstalledBytes:165,workingMemoryBytes:300_000_000,evidenceSha256:H('already-runtime'),
  };
  const result=await apply('direct-mobile',raw,overlay('direct-mobile'));
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('SOURCE_CANDIDATE_MUST_REMAIN_UNRESOLVED')
    ||result.blockers.includes('PREEXISTING_RUNTIME_EVIDENCE_CONFLICT'));
  assert.equal(result.candidateQualificationAllowed,false);
});

test('partial pre-existing runtime values cannot be silently overwritten',async()=>{
  const raw=decision();
  raw.candidates[1].runtime.backboneBytes=1;
  const result=await apply('direct-mobile',raw,overlay('direct-mobile'));
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('PREEXISTING_RUNTIME_EVIDENCE_CONFLICT'));
});

test('complete pre-existing runtime evidence cannot be replaced either',async()=>{
  const raw=decision();
  raw.candidates[1].runtime={
    backboneBytes:1,
    conditionerBytes:2,
    vaeBytes:3,
    adapterBytes:4,
    otherRequiredBytes:5,
    mandatoryInstalledBytes:15,
    workingMemoryBytes:16,
    evidenceSha256:H('preexisting-runtime'),
  };
  const result=await apply('direct-mobile',raw,overlay('direct-mobile'));
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('PREEXISTING_RUNTIME_EVIDENCE_CONFLICT'));
});

test('READY overlay still requires exact schema and an empty blocker set',async()=>{
  let ov=overlay('direct-mobile',{schemaVersion:'OTHER_SCHEMA'});
  let result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,ov,ov.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('RUNTIME_OVERLAY_SCHEMA_INVALID'));

  ov=overlay('direct-mobile',{blockers:['forged-ready-with-blocker']});
  result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,ov,ov.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('RUNTIME_OVERLAY_BLOCKERS_PRESENT'));
});

test('overlay must be READY and exactly caller-pinned by runtime evidence digest',async()=>{
  const notReady=overlay('direct-mobile',{state:'PHYSICAL_RUNTIME_EVIDENCE_INVALID'});
  let result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,notReady,notReady.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('PHYSICAL_RUNTIME_OVERLAY_NOT_READY'));

  const ov=overlay('direct-mobile');
  result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,ov,H('other-runtime-evidence'),hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('RUNTIME_EVIDENCE_DIGEST_DRIFT'));
});

test('overlay candidate and capability drift fail closed with no fallback',async()=>{
  let ov=overlay('other-candidate');
  let result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,ov,ov.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('RUNTIME_OVERLAY_CANDIDATE_DRIFT'));

  ov=overlay('direct-mobile',{capability:'TEXT_TO_IMAGE'});
  result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,ov,ov.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('RUNTIME_OVERLAY_CAPABILITY_DRIFT'));
});

test('overlay mandatory installed total is independently checked before application',async()=>{
  const ov=overlay('direct-mobile',{mandatoryInstalledBytes:166});
  const result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,ov,ov.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('RUNTIME_OVERLAY_INSTALLED_TOTAL_MISMATCH'));
});

test('any authority widening in the runtime overlay is rejected',async()=>{
  const ov=overlay('direct-mobile',{reuseAdvanceAllowed:true});
  const result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'direct-mobile',CAPABILITY,ov,ov.runtimeEvidenceSha256,hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('RUNTIME_OVERLAY_AUTHORITY_WIDENING'));
});

test('a canonical non-pending decision cannot be repurposed as runtime application input',async()=>{
  const raw=decision();
  raw.decisionStatus='REJECT';
  raw.candidates[0].evidenceState='REJECTED';
  raw.candidates[0].licenseConclusion='NON_COMMERCIAL';
  raw.candidates[0].rejectionReasons=['control rejected'];
  const result=await apply('direct-mobile',raw,overlay('direct-mobile'));
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('SOURCE_DECISION_NOT_PENDING'));
});

test('candidate lookup is exact and never falls back to another reuse candidate',async()=>{
  const result=await applyHsmeFoundationPhysicalReuseRuntimeOverlayV1(
    decision(),'missing-candidate',CAPABILITY,overlay('missing-candidate'),
    H('missing-candidate-runtime-evidence'),hashPort,
  );
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.ok(result.blockers.includes('SOURCE_CANDIDATE_MISSING'));
});

test('invalid source decision fails before any runtime mutation',async()=>{
  const raw=decision();
  raw.qualityPolicy='WEIGHTED_SCORE';
  const result=await apply('direct-mobile',raw,overlay('direct-mobile'));
  assert.equal(result.state,'RUNTIME_OVERLAY_APPLICATION_INVALID');
  assert.deepEqual(result.blockers,['SOURCE_REUSE_DECISION_INVALID']);
  assert.equal(result.candidate,null);
  assert.equal(result.pendingDecision,null);
});
