import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';

import {
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFullStudentTrainingPlanAdmissionV1.ts';
import {
  HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA,
  buildHsmeFullStudentTrainingRunRequestV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFullStudentTrainingRunRequestV1.ts';
import {
  CORE_HSME_PROTECTED_TRAINING_ADMISSION_INPUT_V1_SCHEMA,
  CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA,
  admitCoreHsmeProtectedTrainingV1,
} from './HsmeProtectedTrainingAdmissionV1.ts';

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
    reuseHandoffEvidenceSha256:H('core-admission-handoff'),
    reuseSourceDecisionSha256:H('core-admission-source'),
    reuseFinalDecisionSha256:H('core-admission-reuse-final'),
    teacherAdmissionFinalizationSha256:H('core-admission-teacher-finalization'),
    teacherDecisionSha256:H('core-admission-teacher-decision'),
    teacherAdmissionGateEvidenceSha256:H('core-admission-teacher-gate'),
    selectedTeacherIds:[
      'qwen-image-2512-quality-teacher',
      'qwen-image-edit-2511-quality-teacher',
    ],
    reproductionEvidenceSha256:H('core-admission-reproduction'),
    corpusShardDigests:[H('core-admission-shard')],
    corpusRootDigest:H('core-admission-corpus'),
    recipeDigest:H('core-admission-recipe'),
    checkpointSha256:H('core-admission-checkpoint'),
    resumeCheckpointSha256:H('core-admission-resume'),
    deterministicTargetCount:1,
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

function hsmeEnvelope(overrides={}){
  return {
    schemaVersion:HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA,
    candidateId:'bers-dense-core-v1-training-target',
    activeParametersMillions:600,
    targetStepCount:4,
    maxTrainingExamples:2_000_000,
    maxGpuSeconds:500_000,
    maxTrainingCostMicrousd:50_000_000,
    toolchainLockSha256:H('core-admission-toolchain'),
    outputStagingPolicySha256:H('core-admission-staging-policy'),
    ...overrides,
  };
}

async function readyRequest(overrides={}){
  const runEnvelope=hsmeEnvelope(overrides);
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    await readyPlan(),
    denseDecision,
    dualBudget,
    runEnvelope,
    {async verifyTrainingPlan(){return true;}},
    hashPort,
  );
  assert.equal(
    result.state,
    'TRAINING_RUN_REQUEST_READY_FOR_CORE_ADMISSION',
    JSON.stringify(result),
  );
  return result;
}

function admissionInput(overrides={}){
  const base={
    schemaVersion:CORE_HSME_PROTECTED_TRAINING_ADMISSION_INPUT_V1_SCHEMA,
    scope:{
      tenantId:'system-rnd',
      userId:'hsme-training-service',
      projectId:'hsme-dense-student-rnd',
    },
    executionClass:'OFFLINE_PROTECTED_TRAINING',
    backend:{
      backendClass:'CUDA_GPU',
      providerId:'core-protected-gpu',
      accountId:'rnd-budget-account',
      executionEnvironmentId:'hsme-protected-training-v1',
    },
    resourceCeilings:{
      maxTrainingExamples:1_500_000,
      maxGpuSeconds:400_000,
      maxTrainingCostMicrousd:40_000_000,
    },
    billingAuthorizationRef:'billing-auth:hsme-rnd-001',
    toolchainLockSha256:H('core-admission-toolchain'),
    outputStaging:{
      stagingAuthorityId:'hsme-staging:training-candidate',
      policySha256:H('core-admission-staging-policy'),
      promotedModelFleetIdentity:false,
    },
    idempotencyKey:'hsme-training-request:fixture-001',
    admissionNonce:'core-admission-nonce-001',
    issuedAtMs:1_000_000,
    expiresAtMs:1_000_000+3_600_000,
  };
  return {
    ...base,
    ...overrides,
    scope:{...base.scope,...(overrides.scope??{})},
    backend:{...base.backend,...(overrides.backend??{})},
    resourceCeilings:{
      ...base.resourceCeilings,
      ...(overrides.resourceCeilings??{}),
    },
    outputStaging:{
      ...base.outputStaging,
      ...(overrides.outputStaging??{}),
    },
  };
}

function requestOrigin(ok=true){
  const calls=[];
  return {
    calls,
    async verifyTrainingRunRequest(request,digest){
      calls.push({request,digest});
      return ok;
    },
  };
}

function corePolicy(overrides={}){
  const calls={project:0,backend:0,billing:0,staging:0};
  return {
    calls,
    async verifyProjectTrainingPolicy(){
      calls.project+=1;
      return overrides.project??true;
    },
    async verifyBackendBinding(){
      calls.backend+=1;
      return overrides.backend??true;
    },
    async verifyBillingAuthorization(){
      calls.billing+=1;
      return overrides.billing??true;
    },
    async verifyOutputStagingAuthority(){
      calls.staging+=1;
      return overrides.staging??true;
    },
  };
}

test('Core can admit one exact bounded request without starting training',async()=>{
  const request=await readyRequest();
  const before=structuredClone(request);
  const origin=requestOrigin();
  const policy=corePolicy();
  const result=await admitCoreHsmeProtectedTrainingV1(
    request,
    admissionInput(),
    origin,
    policy,
    hashPort,
  );

  assert.equal(
    result.schemaVersion,
    CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_ADMITTED_NOT_STARTED');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.requestEvidenceSha256,request.requestEvidenceSha256);
  assert.equal(result.candidateId,'bers-dense-core-v1-training-target');
  assert.equal(result.executionClass,'OFFLINE_PROTECTED_TRAINING');
  assert.equal(result.backend.backendClass,'CUDA_GPU');
  assert.equal(result.protectedTrainingExecutionAdmitted,true);
  assert.equal(result.trainingStarted,false);
  assert.match(result.admissionEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(origin.calls.length,1);
  assert.equal(policy.calls.project,1);
  assert.equal(policy.calls.backend,1);
  assert.equal(policy.calls.billing,1);
  assert.equal(policy.calls.staging,1);
  assert.deepEqual(request,before);

  for(const field of [
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ]){
    assert.equal(result[field],false,field);
  }
});

test('Core resource envelope cannot exceed the HSME request ceiling',async()=>{
  const result=await admitCoreHsmeProtectedTrainingV1(
    await readyRequest(),
    admissionInput({
      resourceCeilings:{maxGpuSeconds:500_001},
    }),
    requestOrigin(),
    corePolicy(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_DENIED');
  assert.ok(result.blockers.includes('CORE_TRAINING_RESOURCE_ESCALATION_DENIED'));
  assert.equal(result.protectedTrainingExecutionAdmitted,false);
});

test('nonzero training cost without Billing authorization is DENIED',async()=>{
  const policy=corePolicy();
  const result=await admitCoreHsmeProtectedTrainingV1(
    await readyRequest(),
    admissionInput({billingAuthorizationRef:'NONE'}),
    requestOrigin(),
    policy,
    hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_DENIED');
  assert.ok(
    result.blockers.includes('CORE_TRAINING_BILLING_AUTHORIZATION_REQUIRED'),
  );
});

test('Core policy can deny project, backend, Billing or staging authority',async()=>{
  for(const [field,blocker] of [
    ['project','CORE_TRAINING_PROJECT_POLICY_DENIED'],
    ['backend','CORE_TRAINING_BACKEND_DENIED'],
    ['billing','CORE_TRAINING_BILLING_AUTHORIZATION_DENIED'],
    ['staging','CORE_TRAINING_STAGING_AUTHORITY_DENIED'],
  ]){
    const result=await admitCoreHsmeProtectedTrainingV1(
      await readyRequest(),
      admissionInput(),
      requestOrigin(),
      corePolicy({[field]:false}),
      hashPort,
    );
    assert.equal(result.state,'TRAINING_ADMISSION_DENIED',field);
    assert.ok(result.blockers.includes(blocker),field);
  }
});

test('tampering the HSME request after its evidence digest is INVALID',async()=>{
  const request={
    ...await readyRequest(),
    recipeDigest:H('tampered-core-request-recipe'),
  };
  const result=await admitCoreHsmeProtectedTrainingV1(
    request,
    admissionInput(),
    requestOrigin(),
    corePolicy(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_INVALID');
  assert.ok(result.blockers.includes('CORE_TRAINING_REQUEST_REHASH_MISMATCH'));
});

test('unverified HSME request origin is INVALID',async()=>{
  const result=await admitCoreHsmeProtectedTrainingV1(
    await readyRequest(),
    admissionInput(),
    requestOrigin(false),
    corePolicy(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_INVALID');
  assert.ok(result.blockers.includes('CORE_TRAINING_REQUEST_ORIGIN_UNVERIFIED'));
});

test('Core toolchain cannot drift from the HSME request',async()=>{
  const result=await admitCoreHsmeProtectedTrainingV1(
    await readyRequest(),
    admissionInput({toolchainLockSha256:H('different-toolchain')}),
    requestOrigin(),
    corePolicy(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_INVALID');
  assert.ok(result.blockers.includes('CORE_TRAINING_TOOLCHAIN_BINDING_MISMATCH'));
});

test('output staging cannot alias a promoted ModelFleet identity',async()=>{
  const result=await admitCoreHsmeProtectedTrainingV1(
    await readyRequest(),
    admissionInput({
      outputStaging:{promotedModelFleetIdentity:true},
    }),
    requestOrigin(),
    corePolicy(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_INVALID');
  assert.ok(
    result.blockers.some(value=>
      value.includes('core_training_staging_model_fleet_alias')
    ),
  );
});

test('admission TTL is bounded and cannot be open-ended',async()=>{
  const result=await admitCoreHsmeProtectedTrainingV1(
    await readyRequest(),
    admissionInput({
      expiresAtMs:1_000_000+86_400_001,
    }),
    requestOrigin(),
    corePolicy(),
    hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_INVALID');
  assert.ok(
    result.blockers.some(value=>value.includes('core_training_admission_ttl')),
  );
});

test('zero-cost exact request may use NONE Billing ref without fabricating spend authority',async()=>{
  const request=await readyRequest({maxTrainingCostMicrousd:0});
  const policy=corePolicy();
  const input=admissionInput({
    billingAuthorizationRef:'NONE',
    resourceCeilings:{maxTrainingCostMicrousd:0},
  });
  const result=await admitCoreHsmeProtectedTrainingV1(
    request,input,requestOrigin(),policy,hashPort,
  );
  assert.equal(result.state,'TRAINING_ADMISSION_ADMITTED_NOT_STARTED');
  assert.equal(policy.calls.billing,0);
  assert.equal(result.billingAuthorizationRef,'NONE');
  assert.equal(result.billingAuthorityGranted,false);
});

test('same exact request and Core input produce byte-identical admission evidence',async()=>{
  const request=await readyRequest();
  const input=admissionInput();
  const first=await admitCoreHsmeProtectedTrainingV1(
    request,input,requestOrigin(),corePolicy(),hashPort,
  );
  const second=await admitCoreHsmeProtectedTrainingV1(
    request,input,requestOrigin(),corePolicy(),hashPort,
  );
  assert.deepEqual(first,second);
});
