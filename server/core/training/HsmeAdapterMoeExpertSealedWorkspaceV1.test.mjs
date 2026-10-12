import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1,
  HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1,
  HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
  HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1,
  CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA,
  coreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1Digest,
  hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest,
  hsmeAdapterMoeExpertWorkspaceInventoryV1Digest,
  materializeHsmeAdapterMoeExpertSealedWorkspaceV1,
} from './HsmeAdapterMoeExpertSealedWorkspaceV1.ts';

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

const destinations={
  DENSE_BASELINE:'inputs/dense-baseline.bin',
  TRAINING_CORPUS:'inputs/training-corpus.bundle',
  TARGET_MODULE_SET:'inputs/target-module-set.json',
  ADAPTER_CONFIG:'inputs/adapter-config.json',
  REPRODUCTION_CONTRACT:'inputs/reproduction-contract.json',
  IMMUTABLE_ENVIRONMENT:'inputs/immutable-environment.lock',
  TRAINING_TOOLCHAIN:'inputs/training-toolchain.lock',
  TRAINER_ENTRYPOINT:'inputs/trainer-entrypoint.bin',
  LICENSE_EVIDENCE:'inputs/license-evidence.json',
};

function inventory(p,overrides={}){
  const digests={
    DENSE_BASELINE:p.denseBaselineContentSha256,
    TRAINING_CORPUS:p.trainingCorpusRootSha256,
    TARGET_MODULE_SET:p.targetModuleSetSha256,
    ADAPTER_CONFIG:p.adapterConfigSha256,
    REPRODUCTION_CONTRACT:p.reproductionContractSha256,
    IMMUTABLE_ENVIRONMENT:p.immutableEnvironmentSha256,
    TRAINING_TOOLCHAIN:p.trainingToolchainSha256,
    TRAINER_ENTRYPOINT:p.trainerEntrypointSha256,
    LICENSE_EVIDENCE:p.licenseEvidenceSha256,
  };
  return {
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA,
    preflightEvidenceSha256:p.preflightEvidenceSha256,
    expertId:p.expertId,
    entries:Object.keys(destinations).map((role,index)=>({
      role,
      sourceContentSha256:digests[role],
      bytes:1_000+index,
      immutableSourceAuthorityId:'synthetic-source-'+index,
      sourceObjectSha256:h(String((index+1)%10)),
      destinationRelativePath:destinations[role],
      readOnly:true,
    })),
    processSpawned:false,
    trainingStarted:false,
    ...authority(),
    ...overrides,
  };
}

const truePreflightOrigin={
  async verifyTrainingPreflight(){return true;},
};
const falsePreflightOrigin={
  async verifyTrainingPreflight(){return false;},
};
const trueInventoryOrigin={
  async verifyWorkspaceInventory(){return true;},
};
const falseInventoryOrigin={
  async verifyWorkspaceInventory(){return false;},
};
const trueHostOrigin={
  async verifyMaterializationResult(){return true;},
};

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

function fakeHost(mode='OK'){
  const calls=[];
  return {
    calls,
    async materializeExactExpertWorkspace(request){
      calls.push(request);
      const raw={
        schemaVersion:
          CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA,
        state:'EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED',
        preflightEvidenceSha256:request.preflightEvidenceSha256,
        workspaceSha256:request.workspaceSha256,
        inventorySha256:request.inventorySha256,
        fixedPaths:fixedPaths(),
        workspaceManifestFileSha256:h('d'),
        workspaceManifestBytes:2048,
        inputFiles:request.inventory.entries.map(entry=>({
          role:entry.role,
          relativePath:entry.destinationRelativePath,
          contentSha256:entry.sourceContentSha256,
          bytes:entry.bytes,
          readOnly:true,
          symlink:false,
        })),
        inputsReadOnly:true,
        outputWritableOnly:true,
        networkDisabled:true,
        noSymlinks:true,
        atomicManifestWrite:true,
        materializationAttemptId:'synthetic-materialization-001',
        processSpawned:false,
        trainingStarted:false,
        ...authority(),
        hostResultSha256:h('0'),
      };
      if(mode==='PATH_DRIFT'){
        raw.fixedPaths={...raw.fixedPaths,outputRoot:'.hsme-rd/other'};
      }
      if(mode==='PROCESS_STARTED'){
        raw.processSpawned=true;
      }
      if(mode==='INPUT_DRIFT'){
        raw.inputFiles=[
          {...raw.inputFiles[0],contentSha256:h('f')},
          ...raw.inputFiles.slice(1),
        ];
      }
      if(mode==='BAD_DIGEST'){
        return raw;
      }
      if(mode==='PATH_DRIFT'||mode==='PROCESS_STARTED'){
        return raw;
      }
      const hostResultSha256=
        await coreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1Digest(
          raw,
          hash,
        );
      return {...raw,hostResultSha256};
    },
  };
}

async function run(p,inv,host=fakeHost(),overrides={}){
  const inventorySha256=
    await hsmeAdapterMoeExpertWorkspaceInventoryV1Digest(inv,hash);
  return materializeHsmeAdapterMoeExpertSealedWorkspaceV1(
    p,
    p.preflightEvidenceSha256,
    overrides.preflightOrigin??truePreflightOrigin,
    inv,
    inventorySha256,
    overrides.inventoryOrigin??trueInventoryOrigin,
    host,
    trueHostOrigin,
    hash,
  );
}

test('exact preflight and content-addressed inventory freeze one sealed no-execution workspace',async()=>{
  const p=await preflight();
  const inv=inventory(p);
  const host=fakeHost();
  const receipt=await run(p,inv,host);

  assert.equal(receipt.state,'EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED');
  assert.equal(receipt.expertId,p.expertId);
  assert.equal(receipt.inputFiles.length,9);
  assert.equal(receipt.inputsReadOnly,true);
  assert.equal(receipt.outputWritableOnly,true);
  assert.equal(receipt.networkDisabled,true);
  assert.equal(receipt.noSymlinks,true);
  assert.equal(receipt.processSpawned,false);
  assert.equal(receipt.trainingStarted,false);
  assert.equal(receipt.trainingExecutionAllowed,false);
  assert.equal(receipt.prototypeAssemblyAllowed,false);
  assert.equal(receipt.modelInstallAllowed,false);
  assert.equal(host.calls.length,1);
  assert.equal(host.calls[0].fixedPaths.outputRoot,HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1);
  assert.equal(
    await hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest(receipt,hash),
    receipt.receiptEvidenceSha256,
  );
});

test('inventory entry order does not change canonical workspace identity',async()=>{
  const p=await preflight();
  const a=inventory(p);
  const b={...a,entries:[...a.entries].reverse()};
  const hostA=fakeHost();
  const hostB=fakeHost();
  const first=await run(p,a,hostA);
  const second=await run(p,b,hostB);

  assert.equal(first.inventorySha256,second.inventorySha256);
  assert.equal(first.workspaceSha256,second.workspaceSha256);
  assert.deepEqual(first.inputFiles,second.inputFiles);
});

test('preflight and inventory exact origins are mandatory before host invocation',async()=>{
  const p=await preflight();
  const inv=inventory(p);
  const host=fakeHost();

  await assert.rejects(
    ()=>run(p,inv,host,{preflightOrigin:falsePreflightOrigin}),
    /preflight origin unverified/,
  );
  assert.equal(host.calls.length,0);

  await assert.rejects(
    ()=>run(p,inv,host,{inventoryOrigin:falseInventoryOrigin}),
    /inventory origin unverified/,
  );
  assert.equal(host.calls.length,0);
});

test('inventory cannot rebind preflight content or caller-select a destination path',async()=>{
  const p=await preflight();

  const contentDrift=inventory(p);
  contentDrift.entries[0]={
    ...contentDrift.entries[0],
    sourceContentSha256:h('f'),
  };
  await assert.rejects(
    ()=>run(p,contentDrift),
    /content digest mismatch/,
  );

  const pathDrift=inventory(p);
  pathDrift.entries[0]={
    ...pathDrift.entries[0],
    destinationRelativePath:'inputs/other.bin',
  };
  await assert.rejects(
    async()=>{
      const digest=
        await hsmeAdapterMoeExpertWorkspaceInventoryV1Digest(pathDrift,hash);
      return materializeHsmeAdapterMoeExpertSealedWorkspaceV1(
        p,p.preflightEvidenceSha256,truePreflightOrigin,
        pathDrift,digest,trueInventoryOrigin,fakeHost(),trueHostOrigin,hash,
      );
    },
    /destination path is not canonical/,
  );
});

test('host cannot drift fixed paths inputs or execution boundary',async()=>{
  const p=await preflight();
  const inv=inventory(p);

  await assert.rejects(()=>run(p,inv,fakeHost('PATH_DRIFT')));
  await assert.rejects(()=>run(p,inv,fakeHost('PROCESS_STARTED')));
  await assert.rejects(()=>run(p,inv,fakeHost('INPUT_DRIFT')),/materialized inputs drift/);
});

test('host-result digest drift fails closed',async()=>{
  const p=await preflight();
  const inv=inventory(p);
  await assert.rejects(
    ()=>run(p,inv,fakeHost('BAD_DIGEST')),
    /host result digest mismatch/,
  );
});
