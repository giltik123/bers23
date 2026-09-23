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
  admitCoreHsmeProtectedTrainingV1,
} from './HsmeProtectedTrainingAdmissionV1.ts';
import {
  HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
  HSME_DENSE_STUDENT_ENTRYPOINT_V1,
  HSME_DENSE_STUDENT_PINNED_PACKAGES_V1,
  HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_V1_SCHEMA,
  hsmeDenseStudentTrainingToolchainV1Digest,
  preflightHsmeDenseStudentTrainingV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

const denseDecision=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-decision.json',
  'utf8',
));
const dualBudget=JSON.parse(await readFile(
  'src/platform/creative/local-ai/hsme/hsme-2a-dense-baseline-dual-budget.json',
  'utf8',
));
const entrypointBytes=await readFile(HSME_DENSE_STUDENT_ENTRYPOINT_V1);
const dependencyLockBytes=await readFile(HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1);

const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');
const fileSha=bytes=>createHash('sha256').update(bytes).digest('hex');
const REPOSITORY_COMMIT_SHA=process.env.TEST_REPOSITORY_COMMIT_SHA??'1'.repeat(40);

assert.match(REPOSITORY_COMMIT_SHA,/^[0-9a-f]{40}$/);

async function readyPlan(){
  const payload={
    schemaVersion:HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
    state:'TRAINING_PLAN_READY_NOT_AUTHORIZED',
    reuseHandoffEvidenceSha256:H('toolchain-preflight-handoff'),
    reuseSourceDecisionSha256:H('toolchain-preflight-source'),
    reuseFinalDecisionSha256:H('toolchain-preflight-reuse-final'),
    teacherAdmissionFinalizationSha256:H('toolchain-preflight-teacher-finalization'),
    teacherDecisionSha256:H('toolchain-preflight-teacher-decision'),
    teacherAdmissionGateEvidenceSha256:H('toolchain-preflight-teacher-gate'),
    selectedTeacherIds:[
      'qwen-image-2512-quality-teacher',
      'qwen-image-edit-2511-quality-teacher',
    ],
    reproductionEvidenceSha256:H('toolchain-preflight-reproduction'),
    corpusShardDigests:[H('toolchain-preflight-shard')],
    corpusRootDigest:H('toolchain-preflight-corpus'),
    recipeDigest:H('toolchain-preflight-recipe'),
    checkpointSha256:H('toolchain-preflight-checkpoint'),
    resumeCheckpointSha256:H('toolchain-preflight-resume'),
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

function rawToolchain(overrides={}){
  const base={
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_V1_SCHEMA,
    pythonVersion:'3.12',
    os:'LINUX',
    arch:'X86_64',
    backendClass:'CUDA_GPU',
    immutableEnvironmentSha256:H('hsme-dense-student-protected-env-v1'),
    packages:{...HSME_DENSE_STUDENT_PINNED_PACKAGES_V1},
    acceleratorRuntime:{
      kind:'CUDA',
      identity:'cuda-runtime:13.0-driver:580.95',
    },
    repositoryCommitSha:REPOSITORY_COMMIT_SHA,
    entrypoint:{
      relativePath:HSME_DENSE_STUDENT_ENTRYPOINT_V1,
      fileSha256:fileSha(entrypointBytes),
    },
    dependencyLock:{
      relativePath:HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
      fileSha256:fileSha(dependencyLockBytes),
    },
    deterministicAlgorithmPolicy:'TORCH_DETERMINISTIC_ALGORITHMS_REQUIRED',
    mixedPrecisionPolicy:'BF16_MODEL_FP32_ACCUMULATION_NO_TF32',
    checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY',
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  };
  return {
    ...base,
    ...overrides,
    packages:{...base.packages,...(overrides.packages??{})},
    acceleratorRuntime:{
      ...base.acceleratorRuntime,
      ...(overrides.acceleratorRuntime??{}),
    },
    entrypoint:{...base.entrypoint,...(overrides.entrypoint??{})},
    dependencyLock:{
      ...base.dependencyLock,
      ...(overrides.dependencyLock??{}),
    },
  };
}

async function toolchainDigest(toolchain=rawToolchain()){
  return hsmeDenseStudentTrainingToolchainV1Digest(toolchain,hashPort);
}

function hsmeEnvelope(toolchainLockSha256,overrides={}){
  return {
    schemaVersion:HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA,
    candidateId:'bers-dense-core-v1-training-target',
    activeParametersMillions:600,
    targetStepCount:4,
    maxTrainingExamples:2_000_000,
    maxGpuSeconds:500_000,
    maxTrainingCostMicrousd:50_000_000,
    toolchainLockSha256,
    outputStagingPolicySha256:H('toolchain-preflight-staging-policy'),
    ...overrides,
  };
}

async function readyRequest(toolchainLockSha256,overrides={}){
  const result=await buildHsmeFullStudentTrainingRunRequestV1(
    await readyPlan(),
    denseDecision,
    dualBudget,
    hsmeEnvelope(toolchainLockSha256,overrides),
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

function admissionInput(toolchainLockSha256,overrides={}){
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
    toolchainLockSha256,
    outputStaging:{
      stagingAuthorityId:'hsme-staging:training-candidate',
      policySha256:H('toolchain-preflight-staging-policy'),
      promotedModelFleetIdentity:false,
    },
    idempotencyKey:'hsme-training-request:toolchain-preflight-001',
    admissionNonce:'core-admission-toolchain-preflight-001',
    issuedAtMs:2_000_000,
    expiresAtMs:2_000_000+3_600_000,
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

function corePolicy(){
  return {
    async verifyProjectTrainingPolicy(){return true;},
    async verifyBackendBinding(){return true;},
    async verifyBillingAuthorization(){return true;},
    async verifyOutputStagingAuthority(){return true;},
  };
}

async function admittedFixture({
  toolchain=rawToolchain(),
  requestOverrides={},
  admissionOverrides={},
}={}){
  const digest=await toolchainDigest(toolchain);
  const request=await readyRequest(digest,requestOverrides);
  const admission=await admitCoreHsmeProtectedTrainingV1(
    request,
    admissionInput(digest,admissionOverrides),
    {async verifyTrainingRunRequest(){return true;}},
    corePolicy(),
    hashPort,
  );
  assert.equal(
    admission.state,
    'TRAINING_ADMISSION_ADMITTED_NOT_STARTED',
    JSON.stringify(admission),
  );
  return {toolchain,digest,request,admission};
}

function observed(overrides={}){
  return {
    repositoryCommitSha:REPOSITORY_COMMIT_SHA,
    entrypointFileSha256:fileSha(entrypointBytes),
    dependencyLockFileSha256:fileSha(dependencyLockBytes),
    ...overrides,
  };
}

test('dependency lock exactly matches repository-owned pinned package versions',()=>{
  const lines=dependencyLockBytes.toString('utf8')
    .split(/\r?\n/)
    .map(value=>value.trim())
    .filter(value=>value.length>0&&!value.startsWith('#'));
  assert.deepEqual(lines,[
    'torch==2.14.0',
    'diffusers==0.40.0',
    'transformers==5.17.0',
    'accelerate==1.15.0',
    'safetensors==0.8.0',
    'numpy==2.5.3',
    'huggingface-hub==1.32.0',
    'sentencepiece==0.2.2',
  ]);
  assert.equal(lines.some(value=>/[<>~^*]|latest/i.test(value)),false);
});

test('exact admitted Core authority and pinned toolchain produce READY_NOT_EXECUTED',async()=>{
  const fixture=await admittedFixture();
  const result=await preflightHsmeDenseStudentTrainingV1(
    fixture.request,
    fixture.admission,
    fixture.toolchain,
    observed(),
    hashPort,
  );

  assert.equal(result.state,'TRAINING_PREFLIGHT_READY_NOT_EXECUTED');
  assert.deepEqual(result.blockers,[]);
  assert.match(result.preflightEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.ok(result.launchSpec);
  assert.equal(result.launchSpec.state,'LAUNCH_SPEC_READY_NOT_EXECUTED');
  assert.equal(result.launchSpec.interpreter,'python3.12');
  assert.equal(
    result.launchSpec.entrypointRelativePath,
    HSME_DENSE_STUDENT_ENTRYPOINT_V1,
  );
  assert.equal(
    result.launchSpec.outputStagingAuthorityId,
    'hsme-staging:training-candidate',
  );
  assert.equal(result.launchSpec.networkPolicy,'SEALED_INPUTS_ONLY');
  assert.equal(
    result.launchSpec.cacheModelInputPolicy,
    'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  );
  assert.equal(result.launchSpec.resourceCeilings.maxGpuSeconds,400_000);
  assert.equal(result.launchSpec.processSpawned,false);
  assert.equal(result.launchSpec.trainingStarted,false);
  assert.equal(result.launchSpec.checkpointWritten,false);
  assert.equal(result.processSpawned,false);
  assert.equal(result.trainingStarted,false);
});

test('fixed argv is derived only from admitted/requested identities and ceilings',async()=>{
  const fixture=await admittedFixture();
  const result=await preflightHsmeDenseStudentTrainingV1(
    fixture.request,fixture.admission,fixture.toolchain,observed(),hashPort,
  );
  const argv=result.launchSpec.argv;
  assert.equal(argv[0],HSME_DENSE_STUDENT_ENTRYPOINT_V1);
  assert.deepEqual(argv.slice(-4),[
    '--network-policy','SEALED_INPUTS_ONLY',
    '--cache-model-input-policy','READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  ]);
  assert.equal(argv.includes('--shell'),false);
  assert.equal(argv.includes('--command'),false);
  assert.equal(argv.includes('--extra-args'),false);
  assert.equal(argv[argv.indexOf('--max-gpu-seconds')+1],'400000');
  assert.equal(
    argv[argv.indexOf('--output-staging-authority-id')+1],
    'hsme-staging:training-candidate',
  );
});

test('Core admission not ADMITTED_NOT_STARTED is BLOCKED',async()=>{
  const toolchain=rawToolchain();
  const digest=await toolchainDigest(toolchain);
  const request=await readyRequest(digest);
  const denied=await admitCoreHsmeProtectedTrainingV1(
    request,
    admissionInput(digest,{
      resourceCeilings:{maxGpuSeconds:500_001},
    }),
    {async verifyTrainingRunRequest(){return true;}},
    corePolicy(),
    hashPort,
  );
  assert.equal(denied.state,'TRAINING_ADMISSION_DENIED');
  const result=await preflightHsmeDenseStudentTrainingV1(
    request,denied,toolchain,observed(),hashPort,
  );
  assert.equal(result.state,'TRAINING_PREFLIGHT_BLOCKED');
  assert.ok(result.blockers.includes('TRAINING_PREFLIGHT_CORE_ADMISSION_REQUIRED'));
  assert.equal(result.launchSpec,null);
});

test('repository commit, entrypoint and dependency-lock drift are INVALID',async()=>{
  const fixture=await admittedFixture();
  for(const [field,value,blocker] of [
    ['repositoryCommitSha','2'.repeat(40),'TRAINING_PREFLIGHT_REPOSITORY_COMMIT_DRIFT'],
    ['entrypointFileSha256',H('forged-entrypoint'),'TRAINING_PREFLIGHT_ENTRYPOINT_DIGEST_DRIFT'],
    ['dependencyLockFileSha256',H('forged-lock'),'TRAINING_PREFLIGHT_DEPENDENCY_LOCK_DIGEST_DRIFT'],
  ]){
    const result=await preflightHsmeDenseStudentTrainingV1(
      fixture.request,
      fixture.admission,
      fixture.toolchain,
      observed({[field]:value}),
      hashPort,
    );
    assert.equal(result.state,'TRAINING_PREFLIGHT_INVALID',field);
    assert.ok(result.blockers.includes(blocker),field);
  }
});

test('caller cannot substitute entrypoint, dependency lock or arbitrary toolchain fields',async()=>{
  const fixture=await admittedFixture();
  for(const toolchain of [
    rawToolchain({entrypoint:{relativePath:'scripts/evil.py'}}),
    rawToolchain({dependencyLock:{relativePath:'requirements.txt'}}),
    {...rawToolchain(),arbitraryArgv:['--shell','bash']},
  ]){
    const result=await preflightHsmeDenseStudentTrainingV1(
      fixture.request,fixture.admission,toolchain,observed(),hashPort,
    );
    assert.equal(result.state,'TRAINING_PREFLIGHT_INVALID');
    assert.ok(result.blockers.some(value=>
      value.startsWith('TRAINING_PREFLIGHT_TOOLCHAIN_INVALID')
    ));
  }
});

test('floating versions and network/cache policy drift are INVALID',async()=>{
  const fixture=await admittedFixture();
  for(const toolchain of [
    rawToolchain({packages:{torch:'>=2.14'}}),
    rawToolchain({networkPolicy:'RUNTIME_DOWNLOAD_ALLOWED'}),
    rawToolchain({cacheModelInputPolicy:'MUTABLE_SHARED_CACHE'}),
    rawToolchain({acceleratorRuntime:{identity:'latest'}}),
  ]){
    const result=await preflightHsmeDenseStudentTrainingV1(
      fixture.request,fixture.admission,toolchain,observed(),hashPort,
    );
    assert.equal(result.state,'TRAINING_PREFLIGHT_INVALID');
  }
});

test('toolchain manifest must equal both request and Core admission lock digest',async()=>{
  const fixture=await admittedFixture();
  const changed=rawToolchain({
    immutableEnvironmentSha256:H('different-protected-environment'),
  });
  const result=await preflightHsmeDenseStudentTrainingV1(
    fixture.request,fixture.admission,changed,observed(),hashPort,
  );
  assert.equal(result.state,'TRAINING_PREFLIGHT_INVALID');
  assert.ok(result.blockers.includes('TRAINING_PREFLIGHT_TOOLCHAIN_BINDING_MISMATCH'));
});

test('tampered request lineage is rejected by canonical request re-hash',async()=>{
  const fixture=await admittedFixture();
  const tampered={
    ...fixture.request,
    recipeDigest:H('tampered-recipe-after-admission'),
  };
  const result=await preflightHsmeDenseStudentTrainingV1(
    tampered,fixture.admission,fixture.toolchain,observed(),hashPort,
  );
  assert.equal(result.state,'TRAINING_PREFLIGHT_INVALID');
  assert.ok(result.blockers.includes('TRAINING_PREFLIGHT_REQUEST_REHASH_MISMATCH'));
});

test('tampered Core resource ceilings cannot widen after admission',async()=>{
  const fixture=await admittedFixture();
  const tampered={
    ...fixture.admission,
    resourceCeilings:{
      ...fixture.admission.resourceCeilings,
      maxGpuSeconds:fixture.request.maxGpuSeconds+1,
    },
  };
  const result=await preflightHsmeDenseStudentTrainingV1(
    fixture.request,tampered,fixture.toolchain,observed(),hashPort,
  );
  assert.equal(result.state,'TRAINING_PREFLIGHT_INVALID');
  assert.ok(result.blockers.includes('TRAINING_PREFLIGHT_ADMISSION_REHASH_MISMATCH'));
  assert.ok(result.blockers.includes('TRAINING_PREFLIGHT_RESOURCE_CEILING_WIDENED'));
});

test('same exact inputs produce byte-identical launch and preflight evidence',async()=>{
  const fixture=await admittedFixture();
  const first=await preflightHsmeDenseStudentTrainingV1(
    fixture.request,fixture.admission,fixture.toolchain,observed(),hashPort,
  );
  const second=await preflightHsmeDenseStudentTrainingV1(
    fixture.request,fixture.admission,fixture.toolchain,observed(),hashPort,
  );
  assert.deepEqual(first,second);
  assert.equal(first.launchSpec.launchSpecSha256,second.launchSpec.launchSpecSha256);
  assert.equal(first.preflightEvidenceSha256,second.preflightEvidenceSha256);
});

test('preflight grants no process, training, checkpoint promotion or production authority',async()=>{
  const fixture=await admittedFixture();
  const result=await preflightHsmeDenseStudentTrainingV1(
    fixture.request,fixture.admission,fixture.toolchain,observed(),hashPort,
  );
  for(const field of [
    'processSpawned',
    'trainingStarted',
    'checkpointWritten',
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'projectArtifactMutationAllowed',
    'winnerSelectionAllowed',
  ]){
    assert.equal(result[field],false,field);
    assert.equal(result.launchSpec[field],false,'launchSpec.'+field);
  }
});
