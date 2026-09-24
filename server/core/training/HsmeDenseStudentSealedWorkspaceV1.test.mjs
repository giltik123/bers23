import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1_SCHEMA,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';
import {
  HSME_DENSE_STUDENT_ENTRYPOINT_V1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1_SCHEMA,
  HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA,
  HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1,
  HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1,
  createHsmeDenseStudentSealedWorkspaceExecutionAdapterV1,
  hsmeDenseStudentSealedWorkspaceV1Digest,
  normalizeHsmeDenseStudentSealedWorkspaceV1,
} from './HsmeDenseStudentSealedWorkspaceV1.ts';

const hashPort={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
const H=value=>createHash('sha256').update(value).digest('hex');

const IDS=Object.freeze({
  launch:H('workspace-launch'),
  env:H('workspace-environment'),
  teacher:H('workspace-teacher'),
  reproduction:H('workspace-reproduction'),
  corpus:H('workspace-corpus'),
  recipe:H('workspace-recipe'),
  checkpoint:H('workspace-checkpoint'),
  stagingPolicy:H('workspace-staging-policy'),
  reproductionFile:H('workspace-reproduction-file'),
  recipeFile:H('workspace-recipe-file'),
  corpusAsset:H('workspace-corpus-asset'),
  target:H('workspace-synthetic-target'),
});

function fixedArgv({resume='NONE'}={}){
  return Object.freeze([
    HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    '--candidate-id','bers-dense-core-v1-training-target',
    '--request-evidence-sha256',H('workspace-request'),
    '--admission-evidence-sha256',H('workspace-admission'),
    '--teacher-decision-sha256',IDS.teacher,
    '--reproduction-evidence-sha256',IDS.reproduction,
    '--corpus-root-digest',IDS.corpus,
    '--recipe-digest',IDS.recipe,
    '--checkpoint-sha256',IDS.checkpoint,
    '--resume-checkpoint-sha256',resume,
    '--output-staging-authority-id','hsme-staging:training-candidate',
    '--output-staging-policy-sha256',IDS.stagingPolicy,
    '--max-training-examples','1000',
    '--max-gpu-seconds','3600',
    '--max-training-cost-microusd','1000000',
    '--target-step-count','8',
    '--active-parameters-millions','600',
    '--network-policy','SEALED_INPUTS_ONLY',
    '--cache-model-input-policy','READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  ]);
}

function executionRequest({resume='NONE'}={}){
  return Object.freeze({
    schemaVersion:CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1_SCHEMA,
    launchSpecSha256:IDS.launch,
    interpreter:'python3.12',
    argv:fixedArgv({resume}),
    repositoryCommitSha:'a'.repeat(40),
    immutableEnvironmentSha256:IDS.env,
    backend:{
      backendClass:'CUDA_GPU',
      providerId:'protected-provider-v1',
      accountId:'protected-account-v1',
      executionEnvironmentId:'protected-env-v1',
    },
    outputStagingAuthorityId:'hsme-staging:training-candidate',
    outputStagingPolicySha256:IDS.stagingPolicy,
    resourceCeilings:{
      maxTrainingExamples:1000,
      maxGpuSeconds:3600,
      maxTrainingCostMicrousd:1000000,
    },
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  });
}

function input(role,contentSha256,relativePath,bytes=100){
  return {role,contentSha256,relativePath,bytes,readOnly:true};
}

function workspace({resume='NONE',mutate}={}){
  const value={
    schemaVersion:HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA,
    launchSpecSha256:IDS.launch,
    repositoryCommitSha:'a'.repeat(40),
    immutableEnvironmentSha256:IDS.env,
    candidateId:'bers-dense-core-v1-training-target',
    teacherDecisionSha256:IDS.teacher,
    reproductionEvidenceSha256:IDS.reproduction,
    corpusRootDigest:IDS.corpus,
    recipeDigest:IDS.recipe,
    inputCheckpointSha256:IDS.checkpoint,
    resumeCheckpointSha256:resume,
    outputStagingAuthorityId:'hsme-staging:training-candidate',
    outputStagingPolicySha256:IDS.stagingPolicy,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    inputs:[
      input(
        'REPRODUCTION_FIXTURE_JSON',
        IDS.reproductionFile,
        'reproduction/fixture.json',
      ),
      input('TRAINING_RECIPE_JSON',IDS.recipeFile,'recipe/training.json'),
      input('INPUT_CHECKPOINT',IDS.checkpoint,'checkpoint/input.safetensors',500),
      ...(resume==='NONE'?[]:[
        input('RESUME_CHECKPOINT',resume,'checkpoint/resume.safetensors',400),
      ]),
      input('CORPUS_ASSET',IDS.corpusAsset,'corpus/asset-0001.bin',1000),
      input('SYNTHETIC_TARGET',IDS.target,'targets/target-0001.bin',900),
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
  };
  if(mutate)mutate(value);
  return value;
}

function attestation(normalized,workspaceSha256,{mutate}={}){
  const value={
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
    inputFiles:normalized.inputs.map(value=>({
      relativePath:value.relativePath,
      contentSha256:value.contentSha256,
      bytes:value.bytes,
      readOnly:true,
      symlink:false,
    })),
  };
  if(mutate)mutate(value);
  return value;
}

async function setup({rawWorkspace=workspace(),hostAttestationMutate}={}){
  const normalized=normalizeHsmeDenseStudentSealedWorkspaceV1(rawWorkspace);
  const workspaceSha256=await hsmeDenseStudentSealedWorkspaceV1Digest(
    normalized,
    hashPort,
  );
  let attestCalls=0;
  let executeCalls=0;
  let captured=null;
  const host={
    async attestWorkspace(request){
      attestCalls++;
      captured=request;
      return attestation(
        normalized,
        workspaceSha256,
        {mutate:hostAttestationMutate},
      );
    },
    async executeExactSealedWorkspace(request){
      executeCalls++;
      captured=request;
      return Object.freeze({fakeProtectedHostResult:true});
    },
  };
  const adapter=await createHsmeDenseStudentSealedWorkspaceExecutionAdapterV1(
    normalized,
    workspaceSha256,
    {
      async verifyWorkspace(value,expected){
        return expected===workspaceSha256
          &&JSON.stringify(value)===JSON.stringify(normalized);
      },
    },
    host,
    hashPort,
  );
  return {
    normalized,
    workspaceSha256,
    adapter,
    get attestCalls(){return attestCalls;},
    get executeCalls(){return executeCalls;},
    get captured(){return captured;},
  };
}

test('exact sealed workspace attestation allows one protected host execution',async()=>{
  const fx=await setup();
  const request=executionRequest();
  const result=await fx.adapter.executeExactTrainingLaunch(request);

  assert.deepEqual(result,{fakeProtectedHostResult:true});
  assert.equal(fx.attestCalls,1);
  assert.equal(fx.executeCalls,1);
  assert.deepEqual(fx.captured.executionRequest,request);
  assert.deepEqual(fx.captured.workspace,fx.normalized);
  assert.equal(fx.captured.workspaceSha256,fx.workspaceSha256);
  assert.deepEqual(fx.captured.fixedPaths,{
    workspaceRoot:HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
    manifestPath:HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
    outputRoot:HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  });
});

test('same manifest normalizes and hashes deterministically independent of input order',async()=>{
  const left=normalizeHsmeDenseStudentSealedWorkspaceV1(workspace());
  const raw=workspace();
  raw.inputs.reverse();
  const right=normalizeHsmeDenseStudentSealedWorkspaceV1(raw);
  assert.deepEqual(left,right);
  assert.equal(
    await hsmeDenseStudentSealedWorkspaceV1Digest(left,hashPort),
    await hsmeDenseStudentSealedWorkspaceV1Digest(right,hashPort),
  );
});

test('external workspace digest and origin must both verify before adapter creation',async()=>{
  const raw=workspace();
  const normalized=normalizeHsmeDenseStudentSealedWorkspaceV1(raw);
  const digest=await hsmeDenseStudentSealedWorkspaceV1Digest(normalized,hashPort);
  const host={
    async attestWorkspace(){throw new Error('not reached');},
    async executeExactSealedWorkspace(){throw new Error('not reached');},
  };
  await assert.rejects(
    createHsmeDenseStudentSealedWorkspaceExecutionAdapterV1(
      normalized,
      H('wrong-workspace'),
      {async verifyWorkspace(){return true;}},
      host,
      hashPort,
    ),
    error=>error.code==='hsme_sealed_workspace_digest_mismatch',
  );
  await assert.rejects(
    createHsmeDenseStudentSealedWorkspaceExecutionAdapterV1(
      normalized,
      digest,
      {async verifyWorkspace(){return false;}},
      host,
      hashPort,
    ),
    error=>error.code==='hsme_sealed_workspace_origin_unverified',
  );
});

test('path traversal, absolute paths and writable inputs fail normalization',()=>{
  assert.throws(
    ()=>normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({
      mutate:value=>{value.inputs[0].relativePath='../escape.json';},
    })),
    error=>error.code==='hsme_sealed_workspace_relative_path',
  );
  assert.throws(
    ()=>normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({
      mutate:value=>{value.inputs[0].relativePath='/tmp/escape.json';},
    })),
    error=>error.code==='hsme_sealed_workspace_relative_path',
  );
  assert.throws(
    ()=>normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({
      mutate:value=>{value.inputs[0].readOnly=false;},
    })),
    error=>error.code==='hsme_sealed_workspace_input_readonly',
  );
});

test('resume checkpoint role is exact and bound to launch resume SHA',()=>{
  const resume=H('resume-checkpoint');
  const valid=normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({resume}));
  assert.equal(valid.resumeCheckpointSha256,resume);

  assert.throws(
    ()=>normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({
      mutate:value=>{
        value.resumeCheckpointSha256='NONE';
        value.inputs.push(
          input('RESUME_CHECKPOINT',resume,'checkpoint/resume.safetensors',400),
        );
      },
    })),
    error=>error.code==='hsme_sealed_workspace_resume_forbidden',
  );

  assert.throws(
    ()=>normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({
      resume,
      mutate:value=>{
        value.inputs=value.inputs.filter(
          entry=>entry.role!=='RESUME_CHECKPOINT',
        );
      },
    })),
    error=>error.code==='hsme_sealed_workspace_resume_required',
  );
});

test('fixed argv and manifest identities cannot drift',async()=>{
  const fx=await setup();
  const request={
    ...executionRequest(),
    argv:fixedArgv().map(
      value=>value===IDS.recipe?H('different-recipe'):value,
    ),
  };
  await assert.rejects(
    fx.adapter.executeExactTrainingLaunch(request),
    error=>error.code==='hsme_sealed_workspace_argv_binding',
  );
  assert.equal(fx.attestCalls,0);
  assert.equal(fx.executeCalls,0);
});

test('host raw file SHA or byte-count mismatch blocks before execute',async()=>{
  const fx=await setup({
    hostAttestationMutate:value=>{
      value.inputFiles[0]={
        ...value.inputFiles[0],
        bytes:value.inputFiles[0].bytes+1,
      };
    },
  });
  await assert.rejects(
    fx.adapter.executeExactTrainingLaunch(executionRequest()),
    error=>error.code==='hsme_sealed_workspace_attestation_file_mismatch',
  );
  assert.equal(fx.attestCalls,1);
  assert.equal(fx.executeCalls,0);
});

test('host symlink or enabled-network attestation blocks before execute',async()=>{
  let fx=await setup({
    hostAttestationMutate:value=>{value.noSymlinks=false;},
  });
  await assert.rejects(
    fx.adapter.executeExactTrainingLaunch(executionRequest()),
    error=>error.code==='hsme_sealed_workspace_attestation_isolation',
  );
  assert.equal(fx.executeCalls,0);

  fx=await setup({
    hostAttestationMutate:value=>{value.networkDisabled=false;},
  });
  await assert.rejects(
    fx.adapter.executeExactTrainingLaunch(executionRequest()),
    error=>error.code==='hsme_sealed_workspace_attestation_isolation',
  );
  assert.equal(fx.executeCalls,0);
});

test('input checkpoint raw bytes are content-addressed by exact launch SHA',()=>{
  assert.throws(
    ()=>normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({
      mutate:value=>{
        const entry=value.inputs.find(item=>item.role==='INPUT_CHECKPOINT');
        entry.contentSha256=H('different-input-checkpoint');
      },
    })),
    error=>error.code==='hsme_sealed_workspace_input_checkpoint_binding',
  );
});

test('workspace authority cannot widen',()=>{
  assert.throws(
    ()=>normalizeHsmeDenseStudentSealedWorkspaceV1(workspace({
      mutate:value=>{value.modelFleetPromotionAllowed=true;},
    })),
    error=>error.code==='hsme_sealed_workspace_authority',
  );
});

test('extra Core execution request fields fail before host attestation',async()=>{
  const fx=await setup();
  const request={
    ...executionRequest(),
    environment:{HSME_WORKSPACE_ROOT:'/tmp/override'},
  };
  await assert.rejects(
    fx.adapter.executeExactTrainingLaunch(request),
    error=>error.code==='hsme_sealed_workspace_record',
  );
  assert.equal(fx.attestCalls,0);
  assert.equal(fx.executeCalls,0);
});

test('argv resource ceilings must exactly equal Core execution request ceilings',async()=>{
  const fx=await setup();
  const argv=[...fixedArgv()];
  const index=argv.indexOf('--max-gpu-seconds');
  argv[index+1]='3601';
  const request={
    ...executionRequest(),
    argv,
  };
  await assert.rejects(
    fx.adapter.executeExactTrainingLaunch(request),
    error=>error.code==='hsme_sealed_workspace_resource_ceiling_binding',
  );
  assert.equal(fx.attestCalls,0);
  assert.equal(fx.executeCalls,0);
});

test('identical inputs produce byte-structurally identical host requests',async()=>{
  const left=await setup();
  const right=await setup();
  const request=executionRequest();
  await left.adapter.executeExactTrainingLaunch(request);
  await right.adapter.executeExactTrainingLaunch(request);
  assert.deepEqual(left.captured,right.captured);
  assert.deepEqual(left.captured.executionRequest,request);
  assert.equal(Object.hasOwn(left.captured,'argv'),false);
  assert.equal(Object.hasOwn(left.captured,'environment'),false);
  assert.equal(Object.hasOwn(left.captured,'executable'),false);
});

