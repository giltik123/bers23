import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA,
  coreHsmeDenseStudentExecutionResultV1Digest,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1_SCHEMA,
  HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA,
  HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1,
  HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1,
  hsmeDenseStudentSealedWorkspaceV1Digest,
  normalizeHsmeDenseStudentSealedWorkspaceV1,
} from './HsmeDenseStudentSealedWorkspaceV1.ts';
import {
  HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
  hsmeDenseStudentWorkspaceFreezeReceiptV1Digest,
} from './HsmeDenseStudentSealedWorkspaceMaterializationV1.ts';
import {
  HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
  HSME_DENSE_STUDENT_ENTRYPOINT_V1,
  HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
  HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeDenseStudentLaunchSpecV1Digest,
  hsmeDenseStudentTrainingPreflightV1Digest,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  hsmeDenseStudentFrozenWorkspaceRunEvidenceV1Digest,
  runHsmeDenseStudentFrozenWorkspaceEvidenceV1,
} from './HsmeDenseStudentFrozenWorkspaceRunEvidenceV1.ts';

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
    requestEvidenceSha256:H('frozen-run-request'),
    admissionEvidenceSha256:H('frozen-run-admission'),
    toolchainManifestSha256:H('frozen-run-toolchain'),
    candidateId:'bers-dense-core-v1-training-target',
    teacherDecisionSha256:H('frozen-run-teacher'),
    reproductionEvidenceSha256:H('frozen-run-reproduction'),
    corpusRootDigest:H('frozen-run-corpus'),
    recipeDigest:H('frozen-run-recipe'),
    checkpointSha256:H('frozen-run-input-checkpoint'),
    resumeCheckpointSha256:H('frozen-run-resume-checkpoint'),
    outputStagingAuthorityId:'hsme-staging:training-candidate',
    outputStagingPolicySha256:H('frozen-run-staging-policy'),
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
    entrypointFileSha256:H('frozen-run-entrypoint'),
    dependencyLockRelativePath:HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
    dependencyLockFileSha256:H('frozen-run-dependency-lock'),
    immutableEnvironmentSha256:H('frozen-run-environment'),
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

function input(role,contentSha256,relativePath,bytes=100){
  return {role,contentSha256,relativePath,bytes,readOnly:true};
}

async function workspaceFor(preflight){
  const launch=preflight.launchSpec;
  return normalizeHsmeDenseStudentSealedWorkspaceV1({
    schemaVersion:HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA,
    launchSpecSha256:launch.launchSpecSha256,
    repositoryCommitSha:launch.repositoryCommitSha,
    immutableEnvironmentSha256:launch.immutableEnvironmentSha256,
    candidateId:launch.candidateId,
    teacherDecisionSha256:launch.teacherDecisionSha256,
    reproductionEvidenceSha256:launch.reproductionEvidenceSha256,
    corpusRootDigest:launch.corpusRootDigest,
    recipeDigest:launch.recipeDigest,
    inputCheckpointSha256:launch.checkpointSha256,
    resumeCheckpointSha256:launch.resumeCheckpointSha256,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    inputs:[
      input(
        'REPRODUCTION_FIXTURE_JSON',
        H('frozen-run-reproduction-file'),
        'reproduction/fixture.json',
      ),
      input(
        'TRAINING_RECIPE_JSON',
        H('frozen-run-recipe-file'),
        'recipe/training.json',
      ),
      input(
        'INPUT_CHECKPOINT',
        launch.checkpointSha256,
        'checkpoint/input.safetensors',
        500,
      ),
      input(
        'RESUME_CHECKPOINT',
        launch.resumeCheckpointSha256,
        'checkpoint/resume.safetensors',
        400,
      ),
      input(
        'CORPUS_ASSET',
        H('frozen-run-corpus-file'),
        'corpus/asset-0001.bin',
        1000,
      ),
      input(
        'SYNTHETIC_TARGET',
        H('frozen-run-target-file'),
        'targets/target-0001.bin',
        900,
      ),
    ],
    output:{
      stagedCheckpointRelativePath:
        HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1,
      checkpointMetadataRelativePath:
        HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1,
      atomicStagingRequired:true,
    },
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function fixedPaths(){
  return {
    workspaceRoot:HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
    manifestPath:HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
    outputRoot:HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  };
}

async function freezeFor(workspace){
  const workspaceSha256=await hsmeDenseStudentSealedWorkspaceV1Digest(
    workspace,
    hashPort,
  );
  const manifestBytes=new TextEncoder().encode(
    JSON.stringify(workspace,null,2)+'\n',
  );
  const base={
    schemaVersion:HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
    state:'WORKSPACE_FROZEN_NOT_EXECUTED',
    blockers:Object.freeze([]),
    launchSpecSha256:workspace.launchSpecSha256,
    candidateId:workspace.candidateId,
    workspaceSha256,
    inventorySha256:H('frozen-run-inventory'),
    fixedPaths:fixedPaths(),
    workspaceManifestFileSha256:await hashPort.sha256(manifestBytes),
    workspaceManifestBytes:manifestBytes.byteLength,
    inputFiles:workspace.inputs.map(value=>({
      role:value.role,
      relativePath:value.relativePath,
      contentSha256:value.contentSha256,
      bytes:value.bytes,
      readOnly:true,
      symlink:false,
    })),
    inputsReadOnly:true,
    outputWritableOnly:true,
    networkDisabled:true,
    noSymlinks:true,
    atomicManifestWrite:true,
    materializationAttemptId:'workspace-materialization:real-boundary-0001',
    hostResultSha256:H('frozen-run-materialization-result'),
    processSpawned:false,
    trainingStarted:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
    receiptEvidenceSha256:H('placeholder-freeze'),
  };
  const receiptEvidenceSha256=
    await hsmeDenseStudentWorkspaceFreezeReceiptV1Digest(base,hashPort);
  return Object.freeze({...base,receiptEvidenceSha256});
}

async function executionResult(preflight,overrides={}){
  const launch=preflight.launchSpec;
  const checkpointBase={
    checkpointSha256:H('frozen-run-staged-checkpoint'),
    checkpointBytes:987_654_321,
    checkpointMetadataSha256:H('frozen-run-checkpoint-metadata'),
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
    executionAttemptId:'frozen-run-execution:0001',
    backend:launch.backend,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    startedAtMs:4_000_000,
    finishedAtMs:4_120_000,
    exitCode:0,
    processSpawned:true,
    trainingStarted:true,
    consumedTrainingExamples:1_000_000,
    consumedGpuSeconds:120_000,
    consumedTrainingCostMicrousd:25_000_000,
    stdoutEvidenceSha256:H('frozen-run-stdout'),
    stderrEvidenceSha256:H('frozen-run-stderr'),
    stagedCheckpoint:checkpointBase,
    runnerResultSha256:H('placeholder-runner-result'),
  };
  const merged={
    ...base,
    ...overrides,
    backend:{...base.backend,...(overrides.backend??{})},
    stagedCheckpoint:overrides.stagedCheckpoint===null
      ?null
      :{...checkpointBase,...(overrides.stagedCheckpoint??{})},
  };
  const runnerResultSha256=await coreHsmeDenseStudentExecutionResultV1Digest(
    merged,
    hashPort,
  );
  return Object.freeze({...merged,runnerResultSha256});
}

function attestation(workspace,workspaceSha256){
  return {
    schemaVersion:
      CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1_SCHEMA,
    workspaceSha256,
    workspaceRoot:HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
    manifestPath:HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
    outputRoot:HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
    networkDisabled:true,
    inputsReadOnly:true,
    outputWritableOnly:true,
    noSymlinks:true,
    inputFiles:workspace.inputs.map(value=>({
      relativePath:value.relativePath,
      contentSha256:value.contentSha256,
      bytes:value.bytes,
      readOnly:true,
      symlink:false,
    })),
  };
}

async function fixture({executionOverrides={}}={}){
  const preflight=await readyPreflight();
  const workspace=await workspaceFor(preflight);
  const workspaceSha256=await hsmeDenseStudentSealedWorkspaceV1Digest(
    workspace,
    hashPort,
  );
  const freeze=await freezeFor(workspace);
  let attestCalls=0;
  let executeCalls=0;
  const host={
    async attestWorkspace(){
      attestCalls+=1;
      return attestation(workspace,workspaceSha256);
    },
    async executeExactSealedWorkspace(){
      executeCalls+=1;
      return executionResult(preflight,executionOverrides);
    },
  };
  const workspaceOrigin={
    calls:0,
    async verifyWorkspace(value,expected){
      this.calls+=1;
      return expected===workspaceSha256
        &&JSON.stringify(value)===JSON.stringify(workspace);
    },
  };
  const freezeOrigin={
    calls:0,
    async verifyFreezeReceipt(value,expected){
      this.calls+=1;
      return expected===freeze.receiptEvidenceSha256
        &&JSON.stringify(value)===JSON.stringify(freeze);
    },
  };
  const executionResultOrigin={
    calls:0,
    async verifyExecutionResult(value,expected){
      this.calls+=1;
      return value.runnerResultSha256===expected;
    },
  };
  const realRunOrigin={
    calls:0,
    async verifyRealProtectedRun(){
      this.calls+=1;
      return false;
    },
  };
  return {
    preflight,
    workspace,
    workspaceSha256,
    freeze,
    host,
    workspaceOrigin,
    freezeOrigin,
    executionResultOrigin,
    realRunOrigin,
    get attestCalls(){return attestCalls;},
    get executeCalls(){return executeCalls;},
  };
}

async function run(fx,overrides={}){
  return runHsmeDenseStudentFrozenWorkspaceEvidenceV1(
    overrides.preflight??fx.preflight,
    overrides.workspace??fx.workspace,
    overrides.expectedWorkspaceSha256??fx.workspaceSha256,
    overrides.workspaceOrigin??fx.workspaceOrigin,
    overrides.freeze??fx.freeze,
    overrides.expectedFreezeReceiptEvidenceSha256
      ??fx.freeze.receiptEvidenceSha256,
    overrides.freezeOrigin??fx.freezeOrigin,
    overrides.host??fx.host,
    overrides.executionResultOrigin??fx.executionResultOrigin,
    overrides.realRunOrigin??fx.realRunOrigin,
    hashPort,
  );
}

test('fake protected host can complete existing receipt but cannot mint real-run evidence',async()=>{
  const fx=await fixture();
  const evidence=await run(fx);

  assert.equal(evidence.state,'FROZEN_WORKSPACE_RUN_EVIDENCE_BLOCKED');
  assert.deepEqual(evidence.blockers,[
    'FROZEN_RUN_REAL_PROTECTED_ORIGIN_UNVERIFIED',
  ]);
  assert.equal(evidence.realProtectedExecution,false);
  assert.equal(fx.attestCalls,1);
  assert.equal(fx.executeCalls,1);
  assert.equal(fx.workspaceOrigin.calls,2);
  assert.equal(fx.freezeOrigin.calls,1);
  assert.equal(fx.executionResultOrigin.calls,1);
  assert.equal(fx.realRunOrigin.calls,1);
  assert.equal(evidence.targetStepCount,4);
  assert.equal(evidence.backend.backendClass,'CUDA_GPU');
  assert.match(evidence.trainingRunReceiptSha256,/^[0-9a-f]{64}$/);
  assert.equal(
    await hsmeDenseStudentFrozenWorkspaceRunEvidenceV1Digest(
      evidence,
      hashPort,
    ),
    evidence.evidenceSha256,
  );
});

test('freeze receipt or workspace digest drift fails before host execution',async()=>{
  let fx=await fixture();
  let evidence=await run(fx,{
    expectedWorkspaceSha256:H('wrong-workspace'),
  });
  assert.equal(evidence.state,'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID');
  assert.ok(evidence.blockers.includes('FROZEN_RUN_WORKSPACE_DIGEST_MISMATCH'));
  assert.equal(fx.attestCalls,0);
  assert.equal(fx.executeCalls,0);

  fx=await fixture();
  evidence=await run(fx,{
    expectedFreezeReceiptEvidenceSha256:H('wrong-freeze'),
  });
  assert.equal(evidence.state,'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID');
  assert.ok(
    evidence.blockers.includes('FROZEN_RUN_FREEZE_RECEIPT_REHASH_MISMATCH'),
  );
  assert.equal(fx.attestCalls,0);
  assert.equal(fx.executeCalls,0);
});

test('unverified workspace or freeze origin fails before host execution',async()=>{
  let fx=await fixture();
  let evidence=await run(fx,{
    workspaceOrigin:{async verifyWorkspace(){return false;}},
  });
  assert.equal(evidence.state,'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID');
  assert.ok(evidence.blockers.includes('FROZEN_RUN_WORKSPACE_ORIGIN_UNVERIFIED'));
  assert.equal(fx.executeCalls,0);

  fx=await fixture();
  evidence=await run(fx,{
    freezeOrigin:{async verifyFreezeReceipt(){return false;}},
  });
  assert.equal(evidence.state,'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID');
  assert.ok(
    evidence.blockers.includes('FROZEN_RUN_FREEZE_RECEIPT_ORIGIN_UNVERIFIED'),
  );
  assert.equal(fx.executeCalls,0);
});

test('freeze raw manifest SHA/byte binding drift fails before execution',async()=>{
  const fx=await fixture();
  const freeze={
    ...fx.freeze,
    workspaceManifestBytes:fx.freeze.workspaceManifestBytes+1,
  };
  freeze.receiptEvidenceSha256=
    await hsmeDenseStudentWorkspaceFreezeReceiptV1Digest(freeze,hashPort);
  const evidence=await run(fx,{
    freeze,
    expectedFreezeReceiptEvidenceSha256:freeze.receiptEvidenceSha256,
    freezeOrigin:{
      async verifyFreezeReceipt(value,expected){
        return value===freeze&&expected===freeze.receiptEvidenceSha256;
      },
    },
  });
  assert.equal(evidence.state,'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID');
  assert.ok(
    evidence.blockers.includes('FROZEN_RUN_FREEZE_MANIFEST_BINDING_MISMATCH'),
  );
  assert.equal(fx.executeCalls,0);
});

test('execution receipt lineage drift never becomes real evidence',async()=>{
  const fx=await fixture({
    executionOverrides:{
      stagedCheckpoint:{recipeDigest:H('wrong-recipe')},
    },
  });
  const evidence=await run(fx);
  assert.equal(evidence.state,'FROZEN_WORKSPACE_RUN_EVIDENCE_BLOCKED');
  assert.equal(evidence.realProtectedExecution,false);
  assert.ok(
    evidence.blockers.some(value=>
      value.includes('TRAINING_RUN_CHECKPOINT_RECIPE_LINEAGE_MISMATCH')
    ),
  );
  assert.equal(fx.realRunOrigin.calls,0);
});

test('identical fake-host inputs produce byte-identical blocked evidence',async()=>{
  const left=await fixture();
  const right=await fixture();
  const a=await run(left);
  const b=await run(right);
  assert.deepEqual(a,b);
  assert.equal(a.realProtectedExecution,false);
});

test('fake CI evidence keeps all promotion and production authority false',async()=>{
  const fx=await fixture();
  const evidence=await run(fx);
  for(const field of [
    'checkpointPromotionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ]){
    assert.equal(evidence[field],false,field);
  }
  assert.equal(evidence.realProtectedExecution,false);
});
