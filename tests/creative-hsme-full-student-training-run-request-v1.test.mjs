import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFullStudentTrainingPlanAdmissionV1.ts';
import {
  HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA,
  HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
  buildHsmeFullStudentTrainingRunRequestV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFullStudentTrainingRunRequestV1.ts';

const denseDecision=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json',
  'utf8',
));
const dualBudget=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-dual-budget.json',
  'utf8',
));
const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');

async function readyPlan(){
  const payload={
    schemaVersion:HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
    state:'TRAINING_PLAN_READY_NOT_AUTHORIZED',
    reuseHandoffEvidenceSha256:H('run-request-handoff'),
    reuseSourceDecisionSha256:H('run-request-source-decision'),
    reuseFinalDecisionSha256:H('run-request-final-reuse-decision'),
    teacherAdmissionFinalizationSha256:H('run-request-teacher-finalization'),
    teacherDecisionSha256:H('run-request-teacher-decision'),
    teacherAdmissionGateEvidenceSha256:H('run-request-teacher-gate'),
    selectedTeacherIds:[
      'qwen-image-2512-quality-teacher',
      'qwen-image-edit-2511-quality-teacher',
    ],
    reproductionEvidenceSha256:H('run-request-reproduction'),
    corpusShardDigests:[H('run-request-shard-a'),H('run-request-shard-b')].sort(),
    corpusRootDigest:H('run-request-corpus-root'),
    recipeDigest:H('run-request-recipe'),
    checkpointSha256:H('run-request-checkpoint'),
    resumeCheckpointSha256:H('run-request-resume-checkpoint'),
    deterministicTargetCount:2,
    trainingRunStartAllowed:false,
    trainingOrDistillationExecutionAllowed:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    winnerSelectionAllowed:false,
  };
  const planEvidenceSha256=await hashPort.sha256(
    new TextEncoder().encode(
      HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN
      +JSON.stringify(payload),
    ),
  );
  return Object.freeze({
    ...payload,
    blockers:Object.freeze([]),
    planEvidenceSha256,
  });
}

function envelope(overrides={}){
  return {
    schemaVersion:HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA,
    candidateId:'bers-dense-core-v1-training-target',
    activeParametersMillions:600,
    targetStepCount:4,
    maxTrainingExamples:2_000_000,
    maxGpuSeconds:500_000,
    maxTrainingCostMicrousd:50_000_000,
    toolchainLockSha256:H('dense-training-toolchain-lock'),
    outputStagingPolicySha256:H('dense-training-output-staging-policy'),
    ...overrides,
  };
}

function origin(ok=true){
  const calls=[];
  return {
    calls,
    async verifyTrainingPlan(plan,digest){
      calls.push({plan,digest});
      return ok;
    },
  };
}

test('READY plan plus canonical R&D dense target produces only a Core-admission request',async()=>{
  const plan=await readyPlan();
  const verifier=origin();
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    plan,
    denseDecision,
    dualBudget,
    envelope(),
    verifier,
    hashPort,
  );

  assert.equal(
    result.schemaVersion,
    HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_READY_FOR_CORE_ADMISSION');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.trainingPlanEvidenceSha256,plan.planEvidenceSha256);
  assert.equal(result.candidateId,'bers-dense-core-v1-training-target');
  assert.equal(result.architectureFamily,'COMPACT_DIT');
  assert.equal(result.activeParametersMillions,600);
  assert.equal(result.targetStepCount,4);
  assert.equal(result.teacherDecisionSha256,plan.teacherDecisionSha256);
  assert.equal(result.reproductionEvidenceSha256,plan.reproductionEvidenceSha256);
  assert.match(result.denseBaselineDecisionSha256,/^[0-9a-f]{64}$/);
  assert.match(result.denseDualBudgetEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(result.requestEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(verifier.calls.length,1);

  assert.equal(result.dualBudgetSnapshot.efficiencyDisposition,'R&D_ONLY');
  assert.equal(result.dualBudgetSnapshot.qualityPerInstalledGbStatus,'PENDING');
  assert.equal(result.dualBudgetSnapshot.mvmState,'NOT_EVALUATED');
  assert.equal(result.dualBudgetSnapshot.mandatoryInstalledBytes,'UNKNOWN');
  assert.equal(result.dualBudgetSnapshot.peakRamBytes,'UNKNOWN');
  assert.deepEqual(result.dualBudgetSnapshot.unresolvedFields,[
    'activeWeightsBytes',
    'firstUseDownloadBytes',
    'flashBytesMovedPerRun',
    'mandatoryInstalledBytes',
    'peakAcceleratorBytes',
    'peakRamBytes',
  ]);

  assert.equal(result.coreAdmissionRequired,true);
  assert.equal(result.coreExecutionTicketPresent,false);
  for(const field of [
    'providerSelectionAllowed',
    'executionTargetSelectionAllowed',
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

for(const step of [1,3,5,10]){
  test('unsupported target step '+step+' is BLOCKED, not silently normalized',async()=>{
    const result=await buildHsmeFullStudentTrainingRunRequestV1(
      await readyPlan(),
      denseDecision,
      dualBudget,
      envelope({targetStepCount:step}),
      origin(),
      hashPort,
    );
    assert.equal(result.state,'TRAINING_RUN_REQUEST_BLOCKED');
    assert.ok(
      result.blockers.includes('TRAINING_RUN_REQUEST_STEP_COUNT_OUTSIDE_TARGET'),
    );
    assert.equal(result.trainingRunStartAllowed,false);
  });
}

for(const scale of [499,801]){
  test('active scale '+scale+'M outside 500..800M target remains BLOCKED',async()=>{
    const result=await buildHsmeFullStudentTrainingRunRequestV1(
      await readyPlan(),
      denseDecision,
      dualBudget,
      envelope({activeParametersMillions:scale}),
      origin(),
      hashPort,
    );
    assert.equal(result.state,'TRAINING_RUN_REQUEST_BLOCKED');
    assert.ok(
      result.blockers.includes('TRAINING_RUN_REQUEST_ACTIVE_SCALE_OUTSIDE_TARGET'),
    );
  });
}

test('non-ready parent plan remains BLOCKED without an origin trust claim',async()=>{
  const plan={...await readyPlan(),state:'TRAINING_PLAN_BLOCKED'};
  const verifier=origin();
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    plan,
    denseDecision,
    dualBudget,
    envelope(),
    verifier,
    hashPort,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_BLOCKED');
  assert.ok(result.blockers.includes('TRAINING_RUN_REQUEST_READY_PLAN_REQUIRED'));
  assert.equal(verifier.calls.length,0);
});

test('one-byte semantic plan drift is INVALID before dense target processing',async()=>{
  const plan={
    ...await readyPlan(),
    recipeDigest:H('tampered-recipe'),
  };
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    plan,
    denseDecision,
    dualBudget,
    envelope(),
    origin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_INVALID');
  assert.ok(result.blockers.includes('TRAINING_RUN_REQUEST_PLAN_REHASH_MISMATCH'));
});

test('unverified plan origin is INVALID',async()=>{
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    await readyPlan(),
    denseDecision,
    dualBudget,
    envelope(),
    origin(false),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_INVALID');
  assert.ok(result.blockers.includes('TRAINING_RUN_REQUEST_PLAN_ORIGIN_UNVERIFIED'));
});

test('dense decision target identity drift is INVALID',async()=>{
  const changed=structuredClone(denseDecision);
  changed.trainingTarget.candidateId='different-dense-target';
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    await readyPlan(),
    changed,
    dualBudget,
    envelope(),
    origin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_INVALID');
  assert.ok(
    result.blockers.some(value=>
      value.startsWith('TRAINING_RUN_REQUEST_DENSE_DECISION_INVALID:')
      ||value==='TRAINING_RUN_REQUEST_DENSE_TARGET_IDENTITY_INVALID'
    ),
  );
});

test('caller cannot switch the exact dense candidate identity',async()=>{
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    await readyPlan(),
    denseDecision,
    dualBudget,
    envelope({candidateId:'other-dense-target'}),
    origin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_INVALID');
  assert.ok(result.blockers.includes('TRAINING_RUN_REQUEST_TARGET_IDENTITY_MISMATCH'));
});

test('dual-budget target cannot be promoted from R&D_ONLY by the request layer',async()=>{
  const changed=structuredClone(dualBudget);
  const target=changed.candidates.find(
    value=>value.candidateId==='bers-dense-core-v1-training-target',
  );
  target.efficiencyDisposition='COMPACT_DEFAULT_CANDIDATE';
  target.qualityPerInstalledGbStatus='MEASURED';
  target.installed.mandatoryInstalledBytes=700_000_000;
  target.workingMemory.peakRamBytes=1_000_000_000;
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    await readyPlan(),
    denseDecision,
    changed,
    envelope(),
    origin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_INVALID');
  assert.ok(
    result.blockers.some(value=>
      value.includes('hsme_training_run_request_dual_budget_disposition')
    ),
  );
});

test('malformed provenance ceiling/hash envelope fails closed',async()=>{
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    await readyPlan(),
    denseDecision,
    dualBudget,
    envelope({toolchainLockSha256:'not-a-hash'}),
    origin(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_RUN_REQUEST_INVALID');
  assert.ok(
    result.blockers.some(value=>
      value.startsWith('TRAINING_RUN_REQUEST_ENVELOPE_INVALID:')
    ),
  );
});

test('same exact inputs produce byte-identical request evidence',async()=>{
  const plan=await readyPlan();
  const first=await buildHsmeFullStudentTrainingRunRequestV1(
    plan,denseDecision,dualBudget,envelope(),origin(),hashPort,
  );
  const second=await buildHsmeFullStudentTrainingRunRequestV1(
    plan,denseDecision,dualBudget,envelope(),origin(),hashPort,
  );
  assert.deepEqual(first,second);
});
