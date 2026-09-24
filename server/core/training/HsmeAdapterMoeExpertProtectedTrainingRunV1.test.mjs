import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
  HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1,
  HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1,
  HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
  HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
  hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest,
} from './HsmeAdapterMoeExpertSealedWorkspaceV1.ts';
import {
  CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_V1_SCHEMA,
  coreHsmeAdapterMoeExpertTrainingResultV1Digest,
  hsmeAdapterMoeExpertTrainingRunReceiptV1Digest,
  runHsmeAdapterMoeExpertProtectedTrainingV1,
} from './HsmeAdapterMoeExpertProtectedTrainingRunV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};
function h(ch){return ch.repeat(64);}
function authority(){
  return {
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
}

async function preflight(){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state:'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED',
    blockers:[],
    experimentPlanSha256:h('1'),
    trainingSpecSha256:h('2'),
    experimentId:'hsme3-adapter-moe-prototype-001',
    expertId:'fashion-adapter-v1',
    specialistHypothesis:'FASHION',
    adapterKind:'LORA_LOW_RANK',
    denseBaselineDecisionSha256:h('3'),
    denseBaselineContentSha256:h('4'),
    denseBaselinePackageBytes:700_000_000,
    targetModuleSetSha256:h('5'),
    adapterConfigSha256:h('6'),
    trainingCorpusRootSha256:h('7'),
    reproductionContractSha256:h('8'),
    immutableEnvironmentSha256:h('9'),
    trainingToolchainSha256:h('a'),
    trainerEntrypointSha256:h('b'),
    license:'SYNTHETIC-COMMERCIAL-EXPERT-FIXTURE',
    licenseEvidenceSha256:h('c'),
    resourceCeilings:{
      maxTrainingExamples:100_000,
      maxGpuSeconds:14_400,
      maxTrainingCostMicrousd:25_000_000,
      maxStagedArtifactBytes:120_000_000,
      maxTrainableParameters:25_000_000,
    },
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    preflightEvidenceSha256:h('0'),
    trainingExecutionAllowed:false,
    workspaceMaterializationAllowed:false,
    prototypeAssemblyAllowed:false,
    ...authority(),
  };
  const preflightEvidenceSha256=
    await hsmeAdapterMoeExpertTrainingPreflightV1Digest(base,hash);
  return {...base,preflightEvidenceSha256};
}

function fixedPaths(){
  return {
    workspaceRoot:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1,
    manifestPath:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1,
    outputRoot:HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1,
    stagedDeltaPath:HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
    stagedMetadataPath:HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
  };
}

async function workspaceReceipt(p){
  const base={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
    state:'EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED',
    blockers:[],
    preflightEvidenceSha256:p.preflightEvidenceSha256,
    workspaceSha256:h('d'),
    inventorySha256:h('e'),
    expertId:p.expertId,
    fixedPaths:fixedPaths(),
    workspaceManifestFileSha256:h('f'),
    workspaceManifestBytes:2048,
    inputFiles:[],
    inputsReadOnly:true,
    outputWritableOnly:true,
    networkDisabled:true,
    noSymlinks:true,
    atomicManifestWrite:true,
    materializationAttemptId:'synthetic-materialization-001',
    hostResultSha256:h('1'),
    processSpawned:false,
    trainingStarted:false,
    furtherWorkspaceMaterializationAllowed:false,
    trainingExecutionAllowed:false,
    prototypeAssemblyAllowed:false,
    ...authority(),
    receiptEvidenceSha256:h('0'),
  };
  const receiptEvidenceSha256=
    await hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest(base,hash);
  return {...base,receiptEvidenceSha256};
}

const truePreflightOrigin={async verifyTrainingPreflight(){return true;}};
const falsePreflightOrigin={async verifyTrainingPreflight(){return false;}};
const trueWorkspaceOrigin={async verifyWorkspaceFreezeReceipt(){return true;}};
const falseWorkspaceOrigin={async verifyWorkspaceFreezeReceipt(){return false;}};
const trueResultOrigin={async verifyExpertTrainingResult(){return true;}};
const falseResultOrigin={async verifyExpertTrainingResult(){return false;}};

function fakeExecutor(mode='SUCCESS'){
  const calls=[];
  return {
    calls,
    async executeExactExpertTraining(request){
      calls.push(request);
      const staged={
        expertId:request.expertId,
        adapterKind:request.adapterKind,
        denseBaselineContentSha256:request.denseBaselineContentSha256,
        targetModuleSetSha256:request.targetModuleSetSha256,
        adapterConfigSha256:request.adapterConfigSha256,
        artifactSha256:h('f'),
        artifactBytes:80_000_000,
        trainableParameters:12_000_000,
        artifactMetadataSha256:h('1'),
        trainingSpecSha256:request.trainingSpecSha256,
        reproductionContractSha256:request.reproductionContractSha256,
        stagedDeltaPath:HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
        stagedMetadataPath:HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
      };
      const raw={
        schemaVersion:CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_V1_SCHEMA,
        state:mode==='FAILED_TO_START'
          ?'EXPERT_TRAINING_ATTEMPT_FAILED_TO_START'
          :'EXPERT_TRAINING_ATTEMPT_PROCESS_COMPLETED',
        preflightEvidenceSha256:request.preflightEvidenceSha256,
        workspaceFreezeReceiptSha256:request.workspaceFreezeReceiptSha256,
        workspaceSha256:request.workspaceSha256,
        executionAttemptId:'synthetic-execution-001',
        startedAtMs:1000,
        finishedAtMs:2000,
        exitCode:mode==='FAILED_TO_START'?'NOT_STARTED':mode==='NONZERO'?7:0,
        processSpawned:mode!=='FAILED_TO_START',
        trainingStarted:mode!=='FAILED_TO_START',
        consumedTrainingExamples:mode==='FAILED_TO_START'?0:500,
        consumedGpuSeconds:mode==='FAILED_TO_START'?0:120,
        consumedTrainingCostMicrousd:mode==='FAILED_TO_START'?0:1_000_000,
        stdoutEvidenceSha256:h('2'),
        stderrEvidenceSha256:h('3'),
        stagedExpertDelta:
          mode==='FAILED_TO_START'||mode==='NONZERO'||mode==='NO_DELTA'
            ?null
            :staged,
        ...authority(),
        hostResultSha256:h('0'),
      };
      if(mode==='RESOURCE_OVER'){
        raw.consumedGpuSeconds=99_999;
      }
      if(mode==='BYTES_OVER'){
        raw.stagedExpertDelta={...staged,artifactBytes:130_000_000};
      }
      if(mode==='PARAM_OVER'){
        raw.stagedExpertDelta={...staged,trainableParameters:30_000_000};
      }
      if(mode==='BAD_KIND'){
        raw.stagedExpertDelta={...staged,adapterKind:'FULL_MODEL'};
      }
      if(mode==='NONZERO_WITH_DELTA'){
        raw.exitCode=9;
        raw.stagedExpertDelta=staged;
      }
      if(mode==='BAD_DIGEST'){
        return raw;
      }
      const hostResultSha256=
        await coreHsmeAdapterMoeExpertTrainingResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}

async function run(mode='SUCCESS',overrides={}){
  const p=await preflight();
  const w=await workspaceReceipt(p);
  const executor=overrides.executor??fakeExecutor(mode);
  const result=await runHsmeAdapterMoeExpertProtectedTrainingV1(
    p,
    p.preflightEvidenceSha256,
    overrides.preflightOrigin??truePreflightOrigin,
    w,
    w.receiptEvidenceSha256,
    overrides.workspaceOrigin??trueWorkspaceOrigin,
    executor,
    overrides.resultOrigin??trueResultOrigin,
    hash,
  );
  return {p,w,executor,result};
}

test('exact frozen workspace yields compact staged-delta receipt only',async()=>{
  const {p,result,executor}=await run();
  assert.equal(result.state,'EXPERT_TRAINING_RUN_COMPLETED_DELTA_STAGED_NOT_PACKED');
  assert.deepEqual(result.blockers,[]);
  assert.equal(result.expertId,p.expertId);
  assert.equal(result.stagedExpertDelta.artifactBytes,80_000_000);
  assert.equal(result.expertPackAdmissionAllowed,false);
  assert.equal(result.prototypeAssemblyAllowed,false);
  assert.equal(result.modelInstallAllowed,false);
  assert.equal(executor.calls.length,1);
  const request=executor.calls[0];
  assert.equal(request.outputPolicy,'STAGED_EXPERT_DELTA_ONLY');
  assert.equal(Object.hasOwn(request,'argv'),false);
  assert.equal(Object.hasOwn(request,'command'),false);
  assert.equal(Object.hasOwn(request,'providerId'),false);
  assert.equal(Object.hasOwn(request,'accountId'),false);
  assert.equal(
    await hsmeAdapterMoeExpertTrainingRunReceiptV1Digest(result,hash),
    result.receiptEvidenceSha256,
  );
});

test('resource and compact-artifact ceilings fail closed',async()=>{
  for(const mode of ['RESOURCE_OVER','BYTES_OVER','PARAM_OVER']){
    const {result}=await run(mode);
    assert.equal(result.state,'EXPERT_TRAINING_RUN_INVALID');
  }
});

test('failed-to-start is a failed run with no staged delta',async()=>{
  const {result}=await run('FAILED_TO_START');
  assert.equal(result.state,'EXPERT_TRAINING_RUN_FAILED');
  assert.equal(result.processSpawned,false);
  assert.equal(result.trainingStarted,false);
  assert.equal(result.exitCode,'NOT_STARTED');
  assert.equal(result.stagedExpertDelta,null);
});

test('nonzero exit cannot stage an expert delta',async()=>{
  const {result}=await run('NONZERO_WITH_DELTA');
  assert.equal(result.state,'EXPERT_TRAINING_RUN_INVALID');
  assert.ok(
    result.blockers.includes('EXPERT_TRAINING_RUN_FAILED_PROCESS_DELTA_FORBIDDEN'),
  );
});

test('successful process without staged delta is failed not promoted',async()=>{
  const {result}=await run('NO_DELTA');
  assert.equal(result.state,'EXPERT_TRAINING_RUN_FAILED');
  assert.ok(result.blockers.includes('EXPERT_TRAINING_RUN_STAGED_DELTA_MISSING'));
});

test('preflight workspace and host-result origins are independently required',async()=>{
  let x=await run('SUCCESS',{preflightOrigin:falsePreflightOrigin});
  assert.equal(x.result.state,'EXPERT_TRAINING_RUN_INVALID');
  assert.equal(x.executor.calls.length,0);

  x=await run('SUCCESS',{workspaceOrigin:falseWorkspaceOrigin});
  assert.equal(x.result.state,'EXPERT_TRAINING_RUN_INVALID');
  assert.equal(x.executor.calls.length,0);

  x=await run('SUCCESS',{resultOrigin:falseResultOrigin});
  assert.equal(x.result.state,'EXPERT_TRAINING_RUN_INVALID');
});

test('host digest and canonical adapter kind drift fail closed',async()=>{
  let x=await run('BAD_DIGEST');
  assert.equal(x.result.state,'EXPERT_TRAINING_RUN_INVALID');
  assert.ok(x.result.blockers.includes('EXPERT_TRAINING_RUN_HOST_RESULT_REHASH_MISMATCH'));

  x=await run('BAD_KIND');
  assert.equal(x.result.state,'EXPERT_TRAINING_RUN_INVALID');
  assert.ok(x.result.blockers.includes('EXPERT_TRAINING_RUN_HOST_RESULT_INVALID'));
});
