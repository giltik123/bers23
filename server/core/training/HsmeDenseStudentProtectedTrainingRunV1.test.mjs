import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
  HSME_DENSE_STUDENT_ENTRYPOINT_V1,
  HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
  HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeDenseStudentLaunchSpecV1Digest,
  hsmeDenseStudentTrainingPreflightV1Digest,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA,
  coreHsmeDenseStudentExecutionResultV1Digest,
  runHsmeDenseStudentProtectedTrainingV1,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';

const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');

const BACKEND=Object.freeze({
  backendClass:'CUDA_GPU',
  providerId:'core-protected-gpu',
  accountId:'rnd-budget-account',
  executionEnvironmentId:'hsme-protected-training-v1',
});
const CEILINGS=Object.freeze({
  maxTrainingExamples:1_500_000,
  maxGpuSeconds:400_000,
  maxTrainingCostMicrousd:40_000_000,
});

function fixedArgv(values){
  return Object.freeze([
    HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    '--candidate-id',values.candidateId,
    '--request-evidence-sha256',values.requestEvidenceSha256,
    '--admission-evidence-sha256',values.admissionEvidenceSha256,
    '--teacher-decision-sha256',values.teacherDecisionSha256,
    '--reproduction-evidence-sha256',values.reproductionEvidenceSha256,
    '--corpus-root-digest',values.corpusRootDigest,
    '--recipe-digest',values.recipeDigest,
    '--checkpoint-sha256',values.checkpointSha256,
    '--resume-checkpoint-sha256',values.resumeCheckpointSha256,
    '--output-staging-authority-id',values.outputStagingAuthorityId,
    '--output-staging-policy-sha256',values.outputStagingPolicySha256,
    '--max-training-examples',String(CEILINGS.maxTrainingExamples),
    '--max-gpu-seconds',String(CEILINGS.maxGpuSeconds),
    '--max-training-cost-microusd',String(CEILINGS.maxTrainingCostMicrousd),
    '--target-step-count','4',
    '--active-parameters-millions','600',
    '--network-policy','SEALED_INPUTS_ONLY',
    '--cache-model-input-policy','READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  ]);
}

async function readyPreflight(){
  const values={
    requestEvidenceSha256:H('run-request'),
    admissionEvidenceSha256:H('core-admission'),
    toolchainManifestSha256:H('toolchain'),
    candidateId:'bers-dense-core-v1-training-target',
    teacherDecisionSha256:H('teacher-decision'),
    reproductionEvidenceSha256:H('reproduction'),
    corpusRootDigest:H('corpus-root'),
    recipeDigest:H('recipe'),
    checkpointSha256:H('input-checkpoint'),
    resumeCheckpointSha256:H('resume-checkpoint'),
    outputStagingAuthorityId:'hsme-staging:training-candidate',
    outputStagingPolicySha256:H('staging-policy'),
  };
  const launchBase={
    schemaVersion:HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
    state:'LAUNCH_SPEC_READY_NOT_EXECUTED',
    requestEvidenceSha256:values.requestEvidenceSha256,
    admissionEvidenceSha256:values.admissionEvidenceSha256,
    toolchainManifestSha256:values.toolchainManifestSha256,
    candidateId:values.candidateId,
    backend:BACKEND,
    repositoryCommitSha:'1'.repeat(40),
    interpreter:'python3.12',
    entrypointRelativePath:HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    entrypointFileSha256:H('entrypoint'),
    dependencyLockRelativePath:HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
    dependencyLockFileSha256:H('dependency-lock'),
    immutableEnvironmentSha256:H('protected-environment'),
    acceleratorRuntimeIdentity:'cuda-runtime:13.0-driver:580.95',
    teacherDecisionSha256:values.teacherDecisionSha256,
    reproductionEvidenceSha256:values.reproductionEvidenceSha256,
    corpusRootDigest:values.corpusRootDigest,
    recipeDigest:values.recipeDigest,
    checkpointSha256:values.checkpointSha256,
    resumeCheckpointSha256:values.resumeCheckpointSha256,
    outputStagingAuthorityId:values.outputStagingAuthorityId,
    outputStagingPolicySha256:values.outputStagingPolicySha256,
    resourceCeilings:CEILINGS,
    targetStepCount:4,
    activeParametersMillions:600,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    argv:fixedArgv(values),
    processSpawned:false,
    trainingStarted:false,
    checkpointWritten:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    winnerSelectionAllowed:false,
    launchSpecSha256:H('placeholder-launch'),
  };
  const launchSpecSha256=await hsmeDenseStudentLaunchSpecV1Digest(
    launchBase,
    hashPort,
  );
  const launchSpec=Object.freeze({...launchBase,launchSpecSha256});
  const preflightBase={
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state:'TRAINING_PREFLIGHT_READY_NOT_EXECUTED',
    blockers:Object.freeze([]),
    requestEvidenceSha256:values.requestEvidenceSha256,
    admissionEvidenceSha256:values.admissionEvidenceSha256,
    toolchainManifestSha256:values.toolchainManifestSha256,
    launchSpecSha256,
    launchSpec,
    preflightEvidenceSha256:H('placeholder-preflight'),
    processSpawned:false,
    trainingStarted:false,
    checkpointWritten:false,
    checkpointPromotionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    winnerSelectionAllowed:false,
  };
  const preflightEvidenceSha256=await hsmeDenseStudentTrainingPreflightV1Digest(
    preflightBase,
    hashPort,
  );
  return Object.freeze({...preflightBase,preflightEvidenceSha256});
}

async function executionResult(preflight,overrides={}){
  const launch=preflight.launchSpec;
  const checkpointBase={
    checkpointSha256:H('staged-checkpoint'),
    checkpointBytes:987_654_321,
    checkpointMetadataSha256:H('checkpoint-metadata'),
    teacherDecisionSha256:launch.teacherDecisionSha256,
    reproductionEvidenceSha256:launch.reproductionEvidenceSha256,
    corpusRootDigest:launch.corpusRootDigest,
    recipeDigest:launch.recipeDigest,
    inputCheckpointSha256:launch.checkpointSha256,
    resumeCheckpointSha256:launch.resumeCheckpointSha256,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
  };
  const base={
    schemaVersion:CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA,
    state:'EXECUTION_ATTEMPT_PROCESS_COMPLETED',
    launchSpecSha256:launch.launchSpecSha256,
    executionAttemptId:'hsme-run-attempt:0001',
    backend:launch.backend,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    startedAtMs:3_000_000,
    finishedAtMs:3_120_000,
    exitCode:0,
    processSpawned:true,
    trainingStarted:true,
    consumedTrainingExamples:1_000_000,
    consumedGpuSeconds:120_000,
    consumedTrainingCostMicrousd:25_000_000,
    stdoutEvidenceSha256:H('stdout'),
    stderrEvidenceSha256:H('stderr'),
    stagedCheckpoint:checkpointBase,
    runnerResultSha256:H('placeholder-runner-result'),
  };
  const merged={
    ...base,
    ...overrides,
    backend:{...base.backend,...(overrides.backend??{})},
    stagedCheckpoint:overrides.stagedCheckpoint===null
      ?null
      :{
        ...checkpointBase,
        ...(overrides.stagedCheckpoint??{}),
      },
  };
  const runnerResultSha256=await coreHsmeDenseStudentExecutionResultV1Digest(
    merged,
    hashPort,
  );
  return Object.freeze({...merged,runnerResultSha256});
}

function fakeExecutor(resultFactory){
  const calls=[];
  return {
    calls,
    async executeExactTrainingLaunch(request){
      calls.push(structuredClone(request));
      return resultFactory(request);
    },
  };
}

function trustedOrigin(){
  return {
    calls:0,
    async verifyExecutionResult(result,expected){
      this.calls+=1;
      return result.runnerResultSha256===expected;
    },
  };
}

test('exact READY preflight plus protected result yields staged-not-promoted receipt',async()=>{
  const preflight=await readyPreflight();
  const executor=fakeExecutor(()=>executionResult(preflight));
  const origin=trustedOrigin();
  const receipt=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,executor,origin,hashPort,
  );

  assert.equal(
    receipt.state,
    'TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED',
  );
  assert.deepEqual(receipt.blockers,[]);
  assert.equal(executor.calls.length,1);
  assert.equal(origin.calls,1);
  assert.equal(receipt.processSpawned,true);
  assert.equal(receipt.trainingStarted,true);
  assert.equal(receipt.exitCode,0);
  assert.equal(receipt.stagedCheckpointSha256,H('staged-checkpoint'));
  assert.equal(receipt.stagedCheckpointBytes,987_654_321);
  assert.equal(receipt.checkpointMetadataSha256,H('checkpoint-metadata'));
  assert.equal(receipt.teacherDecisionSha256,preflight.launchSpec.teacherDecisionSha256);
  assert.equal(receipt.corpusRootDigest,preflight.launchSpec.corpusRootDigest);
  assert.equal(receipt.recipeDigest,preflight.launchSpec.recipeDigest);
  assert.equal(receipt.inputCheckpointSha256,preflight.launchSpec.checkpointSha256);
  assert.equal(
    receipt.resumeCheckpointSha256,
    preflight.launchSpec.resumeCheckpointSha256,
  );
  assert.match(receipt.runnerResultSha256,/^[0-9a-f]{64}$/);
  assert.match(receipt.receiptEvidenceSha256,/^[0-9a-f]{64}$/);
  for(const field of [
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
    assert.equal(receipt[field],false,field);
  }
});

test('protected adapter receives only the exact launch-derived request',async()=>{
  const preflight=await readyPreflight();
  const executor=fakeExecutor(()=>executionResult(preflight));
  await runHsmeDenseStudentProtectedTrainingV1(
    preflight,executor,trustedOrigin(),hashPort,
  );
  const request=executor.calls[0];
  const launch=preflight.launchSpec;
  assert.deepEqual(request,{
    schemaVersion:'BERS_CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1',
    launchSpecSha256:launch.launchSpecSha256,
    interpreter:'python3.12',
    argv:[...launch.argv],
    repositoryCommitSha:launch.repositoryCommitSha,
    immutableEnvironmentSha256:launch.immutableEnvironmentSha256,
    backend:launch.backend,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    resourceCeilings:launch.resourceCeilings,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  });
  assert.equal(Object.hasOwn(request,'shell'),false);
  assert.equal(Object.hasOwn(request,'executable'),false);
  assert.equal(Object.hasOwn(request,'extraArgv'),false);
  assert.equal(Object.hasOwn(request,'environment'),false);
});

test('preflight tamper fails before protected adapter call',async()=>{
  const preflight=await readyPreflight();
  const tampered={
    ...preflight,
    launchSpec:{
      ...preflight.launchSpec,
      recipeDigest:H('tampered-after-preflight'),
    },
  };
  const executor=fakeExecutor(()=>{throw new Error('must not run');});
  const receipt=await runHsmeDenseStudentProtectedTrainingV1(
    tampered,executor,trustedOrigin(),hashPort,
  );
  assert.equal(receipt.state,'TRAINING_RUN_INVALID');
  assert.ok(receipt.blockers.includes('TRAINING_RUN_LAUNCH_SPEC_REHASH_MISMATCH'));
  assert.equal(executor.calls.length,0);
});

test('nonzero protected process exit yields FAILED and no promotion authority',async()=>{
  const preflight=await readyPreflight();
  const result=await executionResult(preflight,{
    exitCode:17,
    stagedCheckpoint:null,
  });
  const receipt=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,
    fakeExecutor(()=>result),
    trustedOrigin(),
    hashPort,
  );
  assert.equal(receipt.state,'TRAINING_RUN_FAILED');
  assert.ok(receipt.blockers.includes('TRAINING_RUN_PROCESS_EXIT_NONZERO'));
  assert.equal(receipt.stagedCheckpointSha256,'UNKNOWN');
  assert.equal(receipt.checkpointPromotionAllowed,false);
});

test('resource overrun fails closed even when executor reports exit zero',async()=>{
  const preflight=await readyPreflight();
  const result=await executionResult(preflight,{
    consumedGpuSeconds:CEILINGS.maxGpuSeconds+1,
  });
  const receipt=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,
    fakeExecutor(()=>result),
    trustedOrigin(),
    hashPort,
  );
  assert.equal(receipt.state,'TRAINING_RUN_INVALID');
  assert.ok(receipt.blockers.includes('TRAINING_RUN_RESOURCE_GPU_SECONDS_OVERRUN'));
  assert.equal(receipt.checkpointPromotionAllowed,false);
});

test('checkpoint lineage or staging drift fails closed',async()=>{
  const preflight=await readyPreflight();
  for(const [field,value,blocker] of [
    ['teacherDecisionSha256',H('wrong-teacher'),'TRAINING_RUN_CHECKPOINT_TEACHER_LINEAGE_MISMATCH'],
    ['corpusRootDigest',H('wrong-corpus'),'TRAINING_RUN_CHECKPOINT_CORPUS_LINEAGE_MISMATCH'],
    ['recipeDigest',H('wrong-recipe'),'TRAINING_RUN_CHECKPOINT_RECIPE_LINEAGE_MISMATCH'],
    ['outputStagingPolicySha256',H('wrong-staging-policy'),'TRAINING_RUN_CHECKPOINT_STAGING_POLICY_MISMATCH'],
  ]){
    const result=await executionResult(preflight,{
      stagedCheckpoint:{[field]:value},
    });
    const receipt=await runHsmeDenseStudentProtectedTrainingV1(
      preflight,
      fakeExecutor(()=>result),
      trustedOrigin(),
      hashPort,
    );
    assert.equal(receipt.state,'TRAINING_RUN_INVALID',field);
    assert.ok(receipt.blockers.includes(blocker),field);
  }
});

test('unverified protected result origin is INVALID',async()=>{
  const preflight=await readyPreflight();
  const result=await executionResult(preflight);
  const receipt=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,
    fakeExecutor(()=>result),
    {async verifyExecutionResult(){return false;}},
    hashPort,
  );
  assert.equal(receipt.state,'TRAINING_RUN_INVALID');
  assert.ok(receipt.blockers.includes('TRAINING_RUN_EXECUTION_RESULT_ORIGIN_UNVERIFIED'));
});

test('same protected result produces byte-identical completed receipt',async()=>{
  const preflight=await readyPreflight();
  const result=await executionResult(preflight);
  const first=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,
    fakeExecutor(()=>result),
    trustedOrigin(),
    hashPort,
  );
  const second=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,
    fakeExecutor(()=>result),
    trustedOrigin(),
    hashPort,
  );
  assert.deepEqual(first,second);
});
