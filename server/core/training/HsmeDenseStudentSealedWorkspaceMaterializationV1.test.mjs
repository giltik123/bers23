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
  HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
  hsmeDenseStudentSealedWorkspaceV1Digest,
  normalizeHsmeDenseStudentSealedWorkspaceV1,
} from './HsmeDenseStudentSealedWorkspaceV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA,
  HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
  HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_V1_SCHEMA,
  coreHsmeDenseStudentWorkspaceMaterializationResultV1Digest,
  deriveHsmeDenseStudentSealedWorkspaceFromInventoryV1,
  hsmeDenseStudentWorkspaceFreezeReceiptV1Digest,
  hsmeDenseStudentWorkspaceInputInventoryV1Digest,
  materializeHsmeDenseStudentSealedWorkspaceV1,
  normalizeHsmeDenseStudentWorkspaceInputInventoryV1,
} from './HsmeDenseStudentSealedWorkspaceMaterializationV1.ts';

const hashPort={
  sha256:async bytes=>createHash('sha256').update(bytes).digest('hex'),
};
const H=value=>createHash('sha256').update(value).digest('hex');

const IDS=Object.freeze({
  launch:H('materialization-launch'),
  env:H('materialization-environment'),
  teacher:H('materialization-teacher'),
  reproduction:H('materialization-reproduction-evidence'),
  corpus:H('materialization-corpus-root'),
  recipe:H('materialization-recipe'),
  checkpoint:H('materialization-input-checkpoint'),
  stagingPolicy:H('materialization-staging-policy'),
});

function fixedArgv({resume='NONE'}={}){
  return Object.freeze([
    HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    '--candidate-id','bers-dense-core-v1-training-target',
    '--request-evidence-sha256',H('materialization-request'),
    '--admission-evidence-sha256',H('materialization-admission'),
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
    repositoryCommitSha:'b'.repeat(40),
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

function entry(
  role,
  sourceContentSha256,
  destinationRelativePath,
  {
    bytes=100,
    authority='artifact-store:immutable:v1',
    objectSha=H(role+'|'+destinationRelativePath),
  }={},
){
  return {
    role,
    sourceContentSha256,
    bytes,
    immutableSourceAuthorityId:authority,
    sourceObjectSha256:objectSha,
    destinationRelativePath,
    readOnly:true,
  };
}

function inventory({resume='NONE',mutate}={}){
  const value={
    schemaVersion:HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_V1_SCHEMA,
    launchSpecSha256:IDS.launch,
    candidateId:'bers-dense-core-v1-training-target',
    teacherDecisionSha256:IDS.teacher,
    reproductionEvidenceSha256:IDS.reproduction,
    corpusRootDigest:IDS.corpus,
    recipeDigest:IDS.recipe,
    inputCheckpointSha256:IDS.checkpoint,
    resumeCheckpointSha256:resume,
    outputStagingAuthorityId:'hsme-staging:training-candidate',
    outputStagingPolicySha256:IDS.stagingPolicy,
    entries:[
      entry(
        'REPRODUCTION_FIXTURE_JSON',
        H('reproduction-fixture-file'),
        'reproduction/fixture.json',
      ),
      entry(
        'TRAINING_RECIPE_JSON',
        H('training-recipe-file'),
        'recipe/training.json',
      ),
      entry(
        'INPUT_CHECKPOINT',
        IDS.checkpoint,
        'checkpoint/input.safetensors',
        {bytes:500},
      ),
      ...(resume==='NONE'?[]:[
        entry(
          'RESUME_CHECKPOINT',
          resume,
          'checkpoint/resume.safetensors',
          {bytes:400},
        ),
      ]),
      entry(
        'CORPUS_ASSET',
        H('corpus-asset-file'),
        'corpus/asset-0001.bin',
        {bytes:1000},
      ),
      entry(
        'SYNTHETIC_TARGET',
        H('synthetic-target-file'),
        'targets/target-0001.bin',
        {bytes:900},
      ),
    ],
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
  };
  if(mutate)mutate(value);
  return value;
}

function fixedPaths(){
  return {
    workspaceRoot:HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
    manifestPath:HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
    outputRoot:HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  };
}

function manifestBytes(workspace){
  return new TextEncoder().encode(JSON.stringify(workspace,null,2)+'\n');
}

async function hostResult(request,{mutate}={}){
  const manifest=manifestBytes(request.workspace);
  const base={
    schemaVersion:
      CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA,
    state:'WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED',
    workspaceSha256:request.workspaceSha256,
    inventorySha256:request.inventorySha256,
    fixedPaths:fixedPaths(),
    workspaceManifestFileSha256:await hashPort.sha256(manifest),
    workspaceManifestBytes:manifest.byteLength,
    inputFiles:request.workspace.inputs.map(value=>({
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
    materializationAttemptId:'workspace-materialization:0001',
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
    hostResultSha256:H('placeholder-host-result'),
  };
  if(mutate)mutate(base);
  const hostResultSha256=
    await coreHsmeDenseStudentWorkspaceMaterializationResultV1Digest(
      base,
      hashPort,
    );
  return Object.freeze({...base,hostResultSha256});
}

async function setup({
  rawInventory=inventory(),
  execution=executionRequest(),
  hostMutate,
  inventoryTrusted=true,
  resultTrusted=true,
}={}){
  const normalized=
    normalizeHsmeDenseStudentWorkspaceInputInventoryV1(rawInventory);
  const inventorySha256=
    await hsmeDenseStudentWorkspaceInputInventoryV1Digest(
      normalized,
      hashPort,
    );
  let hostCalls=0;
  let captured=null;
  const host={
    async materializeExactSealedWorkspace(request){
      hostCalls+=1;
      captured=request;
      return hostResult(request,{mutate:hostMutate});
    },
  };
  const inventoryOrigin={
    calls:0,
    async verifyInputInventory(value,expected){
      this.calls+=1;
      return inventoryTrusted
        &&expected===inventorySha256
        &&JSON.stringify(value)===JSON.stringify(normalized);
    },
  };
  const resultOrigin={
    calls:0,
    async verifyMaterializationResult(result,expected){
      this.calls+=1;
      return resultTrusted&&result.hostResultSha256===expected;
    },
  };
  return {
    normalized,
    inventorySha256,
    host,
    inventoryOrigin,
    resultOrigin,
    execution,
    get hostCalls(){return hostCalls;},
    get captured(){return captured;},
  };
}

test('exact trusted inventory materializes one deterministic frozen-not-executed workspace',async()=>{
  const fx=await setup();
  const receipt=await materializeHsmeDenseStudentSealedWorkspaceV1(
    fx.execution,
    fx.normalized,
    fx.inventorySha256,
    fx.inventoryOrigin,
    fx.host,
    fx.resultOrigin,
    hashPort,
  );

  assert.equal(
    receipt.schemaVersion,
    HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
  );
  assert.equal(receipt.state,'WORKSPACE_FROZEN_NOT_EXECUTED');
  assert.deepEqual(receipt.blockers,[]);
  assert.equal(fx.inventoryOrigin.calls,1);
  assert.equal(fx.hostCalls,1);
  assert.equal(fx.resultOrigin.calls,1);
  assert.equal(receipt.processSpawned,false);
  assert.equal(receipt.trainingStarted,false);
  assert.deepEqual(receipt.fixedPaths,fixedPaths());
  assert.match(receipt.workspaceSha256,/^[0-9a-f]{64}$/);
  assert.match(receipt.hostResultSha256,/^[0-9a-f]{64}$/);
  assert.match(receipt.receiptEvidenceSha256,/^[0-9a-f]{64}$/);

  const derived=normalizeHsmeDenseStudentSealedWorkspaceV1(
    fx.captured.workspace,
  );
  assert.equal(
    await hsmeDenseStudentSealedWorkspaceV1Digest(derived,hashPort),
    receipt.workspaceSha256,
  );
  assert.equal(
    await hsmeDenseStudentWorkspaceFreezeReceiptV1Digest(receipt,hashPort),
    receipt.receiptEvidenceSha256,
  );
});

test('workspace is derived from inventory and Core request, never caller supplied',async()=>{
  const fx=await setup();
  const receipt=await materializeHsmeDenseStudentSealedWorkspaceV1(
    fx.execution,
    fx.normalized,
    fx.inventorySha256,
    fx.inventoryOrigin,
    fx.host,
    fx.resultOrigin,
    hashPort,
  );
  const workspace=fx.captured.workspace;
  assert.equal(workspace.repositoryCommitSha,fx.execution.repositoryCommitSha);
  assert.equal(
    workspace.immutableEnvironmentSha256,
    fx.execution.immutableEnvironmentSha256,
  );
  assert.equal(workspace.candidateId,fx.normalized.candidateId);
  assert.equal(workspace.teacherDecisionSha256,fx.normalized.teacherDecisionSha256);
  assert.equal(receipt.workspaceSha256,fx.captured.workspaceSha256);
  assert.equal(Object.hasOwn(fx.captured,'workspaceOverride'),false);
  assert.equal(Object.hasOwn(fx.captured,'environment'),false);
  assert.equal(Object.hasOwn(fx.captured,'executable'),false);
});

test('inventory ordering does not change normalized inventory, workspace or freeze receipt',async()=>{
  const leftRaw=inventory();
  const rightRaw=inventory();
  rightRaw.entries.reverse();

  const left=await setup({rawInventory:leftRaw});
  const right=await setup({rawInventory:rightRaw});
  assert.deepEqual(left.normalized,right.normalized);
  assert.equal(left.inventorySha256,right.inventorySha256);

  const leftReceipt=await materializeHsmeDenseStudentSealedWorkspaceV1(
    left.execution,left.normalized,left.inventorySha256,
    left.inventoryOrigin,left.host,left.resultOrigin,hashPort,
  );
  const rightReceipt=await materializeHsmeDenseStudentSealedWorkspaceV1(
    right.execution,right.normalized,right.inventorySha256,
    right.inventoryOrigin,right.host,right.resultOrigin,hashPort,
  );
  assert.deepEqual(left.captured.workspace,right.captured.workspace);
  assert.deepEqual(leftReceipt,rightReceipt);
});

test('identical exact inputs produce byte-structurally identical freeze receipts',async()=>{
  const fx=await setup();
  const first=await materializeHsmeDenseStudentSealedWorkspaceV1(
    fx.execution,fx.normalized,fx.inventorySha256,
    fx.inventoryOrigin,fx.host,fx.resultOrigin,hashPort,
  );
  const second=await materializeHsmeDenseStudentSealedWorkspaceV1(
    fx.execution,fx.normalized,fx.inventorySha256,
    fx.inventoryOrigin,fx.host,fx.resultOrigin,hashPort,
  );
  assert.deepEqual(first,second);
});

test('external inventory digest and origin fail before protected host materialization',async()=>{
  let fx=await setup();
  await assert.rejects(
    materializeHsmeDenseStudentSealedWorkspaceV1(
      fx.execution,
      fx.normalized,
      H('wrong-inventory'),
      fx.inventoryOrigin,
      fx.host,
      fx.resultOrigin,
      hashPort,
    ),
    error=>error.code==='hsme_workspace_inventory_digest_mismatch',
  );
  assert.equal(fx.hostCalls,0);

  fx=await setup({inventoryTrusted:false});
  await assert.rejects(
    materializeHsmeDenseStudentSealedWorkspaceV1(
      fx.execution,
      fx.normalized,
      fx.inventorySha256,
      fx.inventoryOrigin,
      fx.host,
      fx.resultOrigin,
      hashPort,
    ),
    error=>error.code==='hsme_workspace_inventory_origin_unverified',
  );
  assert.equal(fx.hostCalls,0);
});

test('Core request to inventory semantic drift fails before host materialization',async()=>{
  const raw=inventory({
    mutate:value=>{value.recipeDigest=H('different-recipe');},
  });
  const fx=await setup({rawInventory:raw});
  await assert.rejects(
    materializeHsmeDenseStudentSealedWorkspaceV1(
      fx.execution,
      fx.normalized,
      fx.inventorySha256,
      fx.inventoryOrigin,
      fx.host,
      fx.resultOrigin,
      hashPort,
    ),
    error=>error.code==='hsme_sealed_workspace_argv_binding',
  );
  assert.equal(fx.hostCalls,0);
});

test('checkpoint raw SHA, resume law and destination path fail closed in inventory normalization',()=>{
  assert.throws(
    ()=>normalizeHsmeDenseStudentWorkspaceInputInventoryV1(inventory({
      mutate:value=>{
        value.entries.find(x=>x.role==='INPUT_CHECKPOINT').sourceContentSha256=
          H('different-checkpoint');
      },
    })),
    error=>error.code==='hsme_workspace_inventory_input_checkpoint_binding',
  );

  const resume=H('resume-checkpoint');
  assert.throws(
    ()=>normalizeHsmeDenseStudentWorkspaceInputInventoryV1(inventory({
      resume,
      mutate:value=>{
        value.entries=value.entries.filter(x=>x.role!=='RESUME_CHECKPOINT');
      },
    })),
    error=>error.code==='hsme_workspace_inventory_resume_required',
  );

  assert.throws(
    ()=>normalizeHsmeDenseStudentWorkspaceInputInventoryV1(inventory({
      mutate:value=>{value.entries[0].destinationRelativePath='../escape.json';},
    })),
    error=>error.code==='hsme_workspace_inventory_relative_path',
  );
});

test('mutable or network source authority fails closed',()=>{
  for(const authority of [
    'artifact-store:latest',
    'artifact-store:refs/main',
    'https://example.invalid/object',
  ]){
    assert.throws(
      ()=>normalizeHsmeDenseStudentWorkspaceInputInventoryV1(inventory({
        mutate:value=>{value.entries[0].immutableSourceAuthorityId=authority;},
      })),
      error=>error.code==='hsme_workspace_inventory_source_authority',
      authority,
    );
  }
});

test('host raw SHA or byte roster drift fails before freeze receipt',async()=>{
  const fx=await setup({
    hostMutate:value=>{
      value.inputFiles[0]={
        ...value.inputFiles[0],
        bytes:value.inputFiles[0].bytes+1,
      };
    },
  });
  await assert.rejects(
    materializeHsmeDenseStudentSealedWorkspaceV1(
      fx.execution,fx.normalized,fx.inventorySha256,
      fx.inventoryOrigin,fx.host,fx.resultOrigin,hashPort,
    ),
    error=>error.code==='hsme_workspace_materialization_result_file_roster',
  );
});

test('host network, symlink, atomicity or process-start claims fail closed',async()=>{
  for(const mutate of [
    value=>{value.networkDisabled=false;},
    value=>{value.inputFiles[0]={...value.inputFiles[0],symlink:true};},
    value=>{value.atomicManifestWrite=false;},
    value=>{value.processSpawned=true;},
    value=>{value.trainingStarted=true;},
  ]){
    const fx=await setup({hostMutate:mutate});
    await assert.rejects(
      materializeHsmeDenseStudentSealedWorkspaceV1(
        fx.execution,fx.normalized,fx.inventorySha256,
        fx.inventoryOrigin,fx.host,fx.resultOrigin,hashPort,
      ),
      error=>
        error.code==='hsme_workspace_materialization_result_isolation'
        ||error.code==='hsme_workspace_materialization_result_file_policy'
        ||error.code==='hsme_workspace_materialization_authority',
    );
  }
});

test('unverified protected materialization result origin fails closed',async()=>{
  const fx=await setup({resultTrusted:false});
  await assert.rejects(
    materializeHsmeDenseStudentSealedWorkspaceV1(
      fx.execution,fx.normalized,fx.inventorySha256,
      fx.inventoryOrigin,fx.host,fx.resultOrigin,hashPort,
    ),
    error=>error.code==='hsme_workspace_materialization_result_origin_unverified',
  );
});

test('freeze receipt grants no execution, install, promotion or production authority',async()=>{
  const fx=await setup();
  const receipt=await materializeHsmeDenseStudentSealedWorkspaceV1(
    fx.execution,fx.normalized,fx.inventorySha256,
    fx.inventoryOrigin,fx.host,fx.resultOrigin,hashPort,
  );
  for(const field of [
    'processSpawned',
    'trainingStarted',
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
    assert.equal(receipt[field],false,field);
  }
});

test('direct workspace derivation is rejected when request resource ceilings or argv drift',()=>{
  const normalized=normalizeHsmeDenseStudentWorkspaceInputInventoryV1(inventory());
  const request={
    ...executionRequest(),
    resourceCeilings:{
      ...executionRequest().resourceCeilings,
      maxGpuSeconds:3601,
    },
  };
  assert.throws(
    ()=>deriveHsmeDenseStudentSealedWorkspaceFromInventoryV1(
      request,
      normalized,
    ),
    error=>error.code==='hsme_sealed_workspace_resource_ceiling_binding',
  );
});
