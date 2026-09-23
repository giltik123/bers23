import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN,
  HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionFinalizationV1.ts';
import {
  hsmeFoundationReuseDecisionV1Digest,
  normalizeHsmeFoundationReuseDecisionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationReuseDecisionV1.ts';
import {
  proveHsmeReuseOutcomeHandoffV1,
} from '../src/platform/creative/local-ai/hsme/HsmeReuseOutcomeHandoffV1.ts';
import {
  proveHsmeTeacherAdmissionEligibilityV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAdmissionEligibilityV1.ts';
import {
  finalizeHsmeTeacherAdmissionV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTeacherAdmissionFinalizationV1.ts';
import {
  HSME_CORPUS_ROOT_V1_SCHEMA,
  HSME_CORPUS_SHARD_V1_SCHEMA,
  HSME_QUALITY_POLICY_V1,
  HSME_SYNTHETIC_SAMPLE_V1_SCHEMA,
  HSME_TRAINING_CHECKPOINT_V1_SCHEMA,
  HSME_TRAINING_RECIPE_V1_SCHEMA,
  hsmeTrainingProvenanceDigestV1,
  normalizeHsmeCorpusRootV1,
  normalizeHsmeCorpusShardV1,
  normalizeHsmeSyntheticSampleV1,
  normalizeHsmeTrainingRecipeV1,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingProvenanceV1.ts';
import {
  HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeTrainingReproductionGateV1.ts';
import {
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
  admitHsmeFullStudentTrainingPlanV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFullStudentTrainingPlanAdmissionV1.ts';
import {
  H,
  hashPort,
  makeManifests,
  buildQualityAssembly,
  buildRosterRefresh,
  makeLicenseReview,
  makeToolchain,
  makeEligibilityOrigin,
} from './helpers/hsme-teacher-admission-v1-fixture.mjs';

const HASH=value=>createHash('sha256').update(value).digest('hex');

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

function loraTraining(){
  return {
    mode:'LORA',
    trainableParameters:10,
    frozenParameters:1000,
    trainingExamples:40,
    gpuSeconds:120,
    trainingCostMicrousd:2500,
    evidenceSha256:'UNKNOWN',
  };
}

function source(candidateId){
  return {
    sourceRoot:'example/'+candidateId,
    immutableRevision:'a'.repeat(40),
    contentSha256:HASH(candidateId+'-source'),
  };
}

function rejectedDirect(){
  return {
    candidateId:'direct-mobile',
    strategy:'DIRECT_FOUNDATION',
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'REJECTED',
    source:source('direct-mobile'),
    licenseConclusion:'NON_COMMERCIAL',
    licenseEvidenceSha256:HASH('direct-license-rejected'),
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:zeroTraining(),
    rejectionReasons:['LICENSE_NON_COMMERCIAL'],
  };
}

function rejectedAdaptation(){
  return {
    candidateId:'adapt-mobile',
    strategy:'FROZEN_FOUNDATION_ADAPTATION',
    targetTier:'MOBILE_DEFAULT',
    evidenceState:'REJECTED',
    source:source('adapt-mobile'),
    licenseConclusion:'COMMERCIAL_ADMISSIBLE',
    licenseEvidenceSha256:HASH('adapt-license'),
    quality:{status:'FAIL',evidenceSha256:HASH('adapt-quality-fail')},
    runtime:unresolvedRuntime(),
    training:loraTraining(),
    rejectionReasons:['QUALITY_FLOOR_FAILED'],
  };
}

function control(){
  return {
    candidateId:'control-mobile',
    strategy:'CONTROL_BASELINE',
    targetTier:'REFERENCE',
    evidenceState:'UNRESOLVED',
    source:source('control-mobile'),
    licenseConclusion:'REVIEW_REQUIRED',
    licenseEvidenceSha256:'UNKNOWN',
    quality:{status:'UNKNOWN',evidenceSha256:'UNKNOWN'},
    runtime:unresolvedRuntime(),
    training:zeroTraining(),
    rejectionReasons:[],
  };
}

async function fullStudentHandoff(){
  const finalDecision=normalizeHsmeFoundationReuseDecisionV1({
    schemaVersion:'BERS_HSME_FOUNDATION_REUSE_DECISION_V1',
    qualityPolicy:'QUALITY_FLOOR_BEFORE_EFFICIENCY',
    decisionStatus:'REUSE_PATH_INSUFFICIENT',
    mobileInstalledBudgetBytes:1_000_000_000,
    mobileWorkingMemoryBudgetBytes:1_000_000_000,
    rationale:['every reuse path has a measured hard blocker'],
    candidates:[control(),rejectedDirect(),rejectedAdaptation()],
  });
  const finalDecisionSha256=await hsmeFoundationReuseDecisionV1Digest(
    finalDecision,
    hashPort,
  );
  const candidateAssemblyRefs=[
    {
      candidateId:'adapt-mobile',
      state:'CANDIDATE_EVIDENCE_REJECTED',
      candidateEvidenceSetSha256:HASH('adapt-set'),
      assembledCandidateSha256:HASH('adapt-candidate'),
    },
    {
      candidateId:'direct-mobile',
      state:'CANDIDATE_EVIDENCE_REJECTED',
      candidateEvidenceSetSha256:HASH('direct-set'),
      assembledCandidateSha256:HASH('direct-candidate'),
    },
  ];
  const finalization={
    schemaVersion:HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_V1_SCHEMA,
    state:'REUSE_PATH_INSUFFICIENT_READY',
    blockers:[],
    sourceDecisionSha256:HASH('source-decision'),
    campaignDigest:HASH('campaign'),
    qualityFrontierSha256:HASH('frontier'),
    paretoEvidenceSha256:HASH('pareto'),
    candidateAssemblyRefs,
    eligibleCandidateIds:[],
    finalDecisionSha256,
    finalizationEvidenceSha256:'UNKNOWN',
    finalDecision,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:true,
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
  const payload={
    schemaVersion:finalization.schemaVersion,
    state:finalization.state,
    sourceDecisionSha256:finalization.sourceDecisionSha256,
    campaignDigest:finalization.campaignDigest,
    qualityFrontierSha256:finalization.qualityFrontierSha256,
    paretoEvidenceSha256:finalization.paretoEvidenceSha256,
    candidateAssemblyRefs:finalization.candidateAssemblyRefs,
    eligibleCandidateIds:finalization.eligibleCandidateIds,
    finalDecisionSha256:finalization.finalDecisionSha256,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:true,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  };
  finalization.finalizationEvidenceSha256=HASH(
    HSME_FOUNDATION_REUSE_DECISION_FINALIZATION_DIGEST_DOMAIN
    +JSON.stringify(payload),
  );
  const handoff=await proveHsmeReuseOutcomeHandoffV1(
    finalization,
    {async verifyFinalization(){return true;}},
    hashPort,
  );
  assert.equal(handoff.state,'FULL_STUDENT_DISTILLATION_HANDOFF_READY');
  return handoff;
}

async function teacherFinalization(){
  const manifests=makeManifests();
  const qualityAssembly=await buildQualityAssembly({manifests});
  const rosterRefresh=await buildRosterRefresh({qualityAssembly,manifests});
  const selectedIds=[
    'qwen-image-2512-quality-teacher',
    'qwen-image-edit-2511-quality-teacher',
  ];
  const selectedManifests=selectedIds.map(
    id=>manifests.find(value=>value.teacherCandidateId===id),
  );
  const reviews=[];
  const toolchains=[];
  for(const manifest of selectedManifests){
    reviews.push(await makeLicenseReview(manifest));
    toolchains.push(await makeToolchain(manifest));
  }
  const eligibility=await proveHsmeTeacherAdmissionEligibilityV1(
    rosterRefresh,
    qualityAssembly,
    manifests,
    reviews,
    toolchains,
    makeEligibilityOrigin(),
    hashPort,
  );
  assert.equal(eligibility.state,'ELIGIBILITY_READY');
  const result=await finalizeHsmeTeacherAdmissionV1(
    rosterRefresh,
    eligibility,
    qualityAssembly,
    manifests,
    reviews,
    toolchains,
    selectedIds,
    H('full-student-plan-selection-rationale'),
    {async verifyEligibility(){return true;}},
    hashPort,
  );
  assert.equal(result.state,'TEACHER_SET_ADMITTED_READY');
  return result;
}

async function reproductionFixture(teacherDecision){
  const teacherDecisionDigest=await hsmeTrainingProvenanceDigestV1(
    teacherDecision,
    hashPort,
  );
  const teacherCandidateId=teacherDecision.selectedCandidateIds[0];
  assert.ok(teacherCandidateId);

  const corpusShard=normalizeHsmeCorpusShardV1({
    schemaVersion:HSME_CORPUS_SHARD_V1_SCHEMA,
    shardId:'full-student-plan-shard-0001',
    assets:[
      {
        contentSha256:HASH('plan-asset-1'),
        sourceRef:'fixture:licensed:plan-asset-1@immutable',
        sourceClass:'REAL_LICENSED',
        licenseId:'CC-BY-4.0',
        licenseEvidenceSha256:HASH('plan-license-1'),
        rightsConclusion:'ADMITTED',
        attribution:'Fixture Creator',
        split:'TRAIN',
        deduplicationKeySha256:HASH('plan-dedup-1'),
        preprocessingSha256:HASH('plan-preprocess-1'),
        promptOrCaptionSha256:HASH('plan-caption-1'),
      },
    ],
  });
  const shardDigest=await hsmeTrainingProvenanceDigestV1(corpusShard,hashPort);
  const corpusRoot=normalizeHsmeCorpusRootV1({
    schemaVersion:HSME_CORPUS_ROOT_V1_SCHEMA,
    corpusId:'full-student-plan-corpus-v1',
    shardDigests:[shardDigest],
    admittedAssetCount:1,
    rejectedAssetCount:0,
    corpusPolicySha256:HASH('plan-corpus-policy'),
  });
  const corpusRootDigest=await hsmeTrainingProvenanceDigestV1(corpusRoot,hashPort);

  const syntheticSample=normalizeHsmeSyntheticSampleV1({
    schemaVersion:HSME_SYNTHETIC_SAMPLE_V1_SCHEMA,
    teacherDecisionDigest,
    teacherCandidateId,
    inputSha256:HASH('plan-input'),
    promptSha256:HASH('plan-prompt'),
    seed:42,
    sampler:'euler',
    scheduler:'flow-match-v1',
    stepCount:4,
    guidance:'1.0',
    precision:'bf16',
    runtimeRepresentationSha256:HASH('plan-runtime-representation'),
    outputSha256:HASH('plan-output'),
    filterPolicySha256:HASH('plan-filter-policy'),
    filterDecision:'ADMITTED',
  });
  const syntheticSampleDigest=await hsmeTrainingProvenanceDigestV1(
    syntheticSample,
    hashPort,
  );

  const recipe=normalizeHsmeTrainingRecipeV1({
    schemaVersion:HSME_TRAINING_RECIPE_V1_SCHEMA,
    recipeId:'full-student-dense-plan-v1',
    studentArchitectureSha256:HASH('plan-student-architecture'),
    latentAutoencoderBindingSha256:HASH('plan-latent-binding'),
    textConditionerBindingSha256:HASH('plan-text-binding'),
    initializationSha256:HASH('plan-init'),
    objectiveSha256:HASH('plan-objective'),
    optimizerSha256:HASH('plan-optimizer'),
    scheduleSha256:HASH('plan-schedule'),
    preprocessingSha256:HASH('plan-preprocessing'),
    teacherDecisionDigest,
    corpusRootDigest,
    syntheticPolicySha256:HASH('plan-synthetic-policy'),
    toolchainLockSha256:HASH('plan-toolchain-lock'),
    seedRootSha256:HASH('plan-seed-root'),
    determinismMode:'BITWISE_WHERE_SUPPORTED',
    qualityGate:{
      policy:HSME_QUALITY_POLICY_V1,
      referenceEvidenceSha256:HASH('plan-reference-quality'),
      requiredMetrics:[
        'semantic-adherence',
        'identity-preservation',
        'garment-logo-pattern-preservation',
        'anatomy-artifact-rate',
      ],
    },
    resourcePolicy:{
      policy:'INDEPENDENT_STORAGE_AND_WORKING_MEMORY',
      efficiencyEvidenceSha256:HASH('plan-efficiency'),
    },
  });
  const recipeDigest=await hsmeTrainingProvenanceDigestV1(recipe,hashPort);

  const checkpoint={
    schemaVersion:HSME_TRAINING_CHECKPOINT_V1_SCHEMA,
    checkpointSha256:HASH('plan-checkpoint'),
    checkpointBytes:600_000_000,
    globalStep:10,
    teacherDecisionDigest,
    corpusRootDigest,
    recipeDigest,
    qualityEvidenceSha256:HASH('plan-checkpoint-quality'),
    resourceEvidenceSha256:HASH('plan-checkpoint-resource'),
    qualityGatePassed:true,
    status:'TRAINING_CANDIDATE',
  };
  const resumeCheckpoint={
    ...checkpoint,
    checkpointSha256:HASH('plan-resume-checkpoint'),
    checkpointBytes:601_000_000,
    globalStep:20,
    parentCheckpointSha256:checkpoint.checkpointSha256,
  };

  return {
    schemaVersion:HSME_TRAINING_REPRODUCTION_GATE_V1_SCHEMA,
    teacherDecision,
    corpusShards:[corpusShard],
    corpusRoot,
    syntheticSamples:[syntheticSample],
    recipe,
    checkpoint,
    resumeCheckpoint,
    deterministicTargetReproduction:[{
      syntheticSampleDigest,
      reproducedOutputSha256:syntheticSample.outputSha256,
    }],
  };
}

function trustedOrigin({handoff=true,teacher=true}={}){
  const calls={handoff:0,teacher:0};
  return {
    calls,
    async verifyReuseHandoff(){
      calls.handoff+=1;
      return handoff;
    },
    async verifyTeacherFinalization(){
      calls.teacher+=1;
      return teacher;
    },
  };
}

async function readyFixture(){
  const handoff=await fullStudentHandoff();
  const teacher=await teacherFinalization();
  const reproduction=await reproductionFixture(teacher.finalDecision);
  return {handoff,teacher,reproduction};
}

test('canonical full-student handoff plus admitted teachers and reproduction fixture is READY_NOT_AUTHORIZED',async()=>{
  const f=await readyFixture();
  const origin=trustedOrigin();
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    f.reproduction,
    origin,
    hashPort,
  );

  assert.equal(
    result.schemaVersion,
    HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
  );
  assert.equal(result.state,'TRAINING_PLAN_READY_NOT_AUTHORIZED');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.reuseHandoffEvidenceSha256,f.handoff.handoffEvidenceSha256);
  assert.equal(result.teacherDecisionSha256,f.teacher.finalDecisionSha256);
  assert.equal(
    result.teacherAdmissionFinalizationSha256,
    f.teacher.finalizationEvidenceSha256,
  );
  assert.deepEqual(result.selectedTeacherIds,f.teacher.selectedTeacherIds);
  assert.equal(result.corpusShardDigests.length,1);
  assert.equal(result.deterministicTargetCount,1);
  assert.match(result.reproductionEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.planEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(origin.calls.handoff,1);
  assert.equal(origin.calls.teacher,1);

  for(const field of [
    'trainingRunStartAllowed',
    'trainingOrDistillationExecutionAllowed',
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'durableModelFleetPromotionAllowed',
    'winnerSelectionAllowed',
  ]){
    assert.equal(result[field],false,field);
  }
});

for(const state of [
  'DIRECT_REUSE_HANDOFF_READY',
  'BOUNDED_ADAPTATION_HANDOFF_READY',
  'HANDOFF_PENDING',
]){
  test(state+' cannot enter full-student training-plan admission',async()=>{
    const f=await readyFixture();
    const handoff={...f.handoff,state};
    const result=await admitHsmeFullStudentTrainingPlanV1(
      handoff,
      f.teacher,
      f.reproduction,
      trustedOrigin(),
      hashPort,
    );
    assert.equal(result.state,'TRAINING_PLAN_BLOCKED');
    assert.ok(result.blockers.includes('TRAINING_PLAN_FULL_STUDENT_HANDOFF_REQUIRED'));
    assert.equal(result.trainingRunStartAllowed,false);
  });
}

test('teacher finalization that is not admitted remains BLOCKED and is never auto-selected',async()=>{
  const f=await readyFixture();
  const teacher={
    ...f.teacher,
    state:'FINALIZATION_BLOCKED',
    blockers:['FINALIZATION_SELECTION_REQUIRED'],
  };
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    teacher,
    f.reproduction,
    trustedOrigin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_BLOCKED');
  assert.ok(result.blockers.includes('TRAINING_PLAN_TEACHER_ADMISSION_NOT_READY'));
  assert.equal(result.trainingRunStartAllowed,false);
});

test('handoff digest drift is INVALID before teacher or reproduction admission',async()=>{
  const f=await readyFixture();
  const handoff={
    ...f.handoff,
    sourceDecisionSha256:HASH('tampered-handoff-source'),
  };
  const result=await admitHsmeFullStudentTrainingPlanV1(
    handoff,
    f.teacher,
    f.reproduction,
    trustedOrigin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_INVALID');
  assert.ok(result.blockers.includes('TRAINING_PLAN_HANDOFF_REHASH_MISMATCH'));
});

test('unverified handoff origin is INVALID even when its internal digest is correct',async()=>{
  const f=await readyFixture();
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    f.reproduction,
    trustedOrigin({handoff:false}),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_INVALID');
  assert.ok(result.blockers.includes('TRAINING_PLAN_HANDOFF_ORIGIN_UNVERIFIED'));
});

test('teacher finalization digest drift is INVALID',async()=>{
  const f=await readyFixture();
  const teacher={
    ...f.teacher,
    selectionRationaleSha256:HASH('tampered-selection-rationale'),
  };
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    teacher,
    f.reproduction,
    trustedOrigin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_INVALID');
  assert.ok(
    result.blockers.includes('TRAINING_PLAN_TEACHER_FINALIZATION_REHASH_MISMATCH'),
  );
});

test('unverified teacher finalization origin is INVALID',async()=>{
  const f=await readyFixture();
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    f.reproduction,
    trustedOrigin({teacher:false}),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_INVALID');
  assert.ok(
    result.blockers.includes('TRAINING_PLAN_TEACHER_FINALIZATION_ORIGIN_UNVERIFIED'),
  );
});

test('reproduction fixture using a different admitted teacher decision is INVALID',async()=>{
  const f=await readyFixture();
  const differentDecision=structuredClone(f.teacher.finalDecision);
  differentDecision.rationale=[
    ...differentDecision.rationale,
    'semantic drift after teacher finalization',
  ];
  const reproduction=await reproductionFixture(differentDecision);
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    reproduction,
    trustedOrigin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_INVALID');
  assert.ok(
    result.blockers.includes('TRAINING_PLAN_REPRODUCTION_TEACHER_DECISION_MISMATCH'),
  );
});

test('corpus root drift is rejected by the canonical reproduction gate',async()=>{
  const f=await readyFixture();
  const reproduction=structuredClone(f.reproduction);
  reproduction.corpusRoot.shardDigests=[HASH('wrong-shard')];
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    reproduction,
    trustedOrigin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_INVALID');
  assert.ok(
    result.blockers.some(value=>
      value.includes('TRAINING_PLAN_REPRODUCTION_PROOF_INVALID')
      &&value.includes('hsme_reproduction_corpus_root_mismatch')
    ),
  );
});

test('deterministic target byte drift is rejected by the canonical reproduction gate',async()=>{
  const f=await readyFixture();
  const reproduction=structuredClone(f.reproduction);
  reproduction.deterministicTargetReproduction[0].reproducedOutputSha256=
    HASH('wrong-target-output');
  const result=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    reproduction,
    trustedOrigin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_PLAN_INVALID');
  assert.ok(
    result.blockers.some(value=>
      value.includes('hsme_reproduction_target_hash_mismatch')
    ),
  );
});

test('same exact inputs produce byte-identical admission evidence',async()=>{
  const f=await readyFixture();
  const first=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    f.reproduction,
    trustedOrigin(),
    hashPort,
  );
  const second=await admitHsmeFullStudentTrainingPlanV1(
    f.handoff,
    f.teacher,
    f.reproduction,
    trustedOrigin(),
    hashPort,
  );
  assert.deepEqual(first,second);
});
