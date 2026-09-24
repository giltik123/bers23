import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import {
  CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_V1_SCHEMA,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1,
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1,
  HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1,
  HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1,
  coreHsmeAdapterMoeExpertWorkspaceResultV1Digest,
  hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest,
  hsmeAdapterMoeExpertWorkspaceInventoryV1Digest,
  materializeHsmeAdapterMoeExpertSealedWorkspaceV1,
} from './HsmeAdapterMoeExpertWorkspaceMaterializationV1.ts';

const hash={
  async sha256(bytes){
    return createHash('sha256').update(bytes).digest('hex');
  },
};

function h(ch){return ch.repeat(64);}

function authority(){
  return {
    workspaceMaterializationAllowed:false,
    trainingExecutionAllowed:false,
    prototypeAssemblyAllowed:false,
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
    ...authority(),
  };
  const preflightEvidenceSha256=
    await hsmeAdapterMoeExpertTrainingPreflightV1Digest(base,hash);
  return {...base,preflightEvidenceSha256};
}

const contentByRole=(p)=>({
  DENSE_BASELINE_ARTIFACT:p.denseBaselineContentSha256,
  TRAINING_CORPUS_BUNDLE:p.trainingCorpusRootSha256,
  TARGET_MODULE_SET:p.targetModuleSetSha256,
  ADAPTER_CONFIG:p.adapterConfigSha256,
  REPRODUCTION_CONTRACT:p.reproductionContractSha256,
  IMMUTABLE_ENVIRONMENT_MANIFEST:p.immutableEnvironmentSha256,
  TRAINING_TOOLCHAIN:p.trainingToolchainSha256,
  TRAINER_ENTRYPOINT:p.trainerEntrypointSha256,
});

function rawInventory(p,{reverse=false,entriesOverride=null}={}){
  const digestMap=contentByRole(p);
  const entries=HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1.map(
    (role,index)=>({
      role,
      sourceContentSha256:digestMap[role],
      bytes:10_000+index,
      immutableSourceAuthorityId:'fixture-source-'+String(index+1),
      sourceObjectSha256:h(String((index%8)+1)),
      readOnly:true,
    }),
  );
  return {
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA,
    preflightEvidenceSha256:p.preflightEvidenceSha256,
    expertId:p.expertId,
    entries:entriesOverride??(reverse?[...entries].reverse():entries),
    processSpawned:false,
    trainingStarted:false,
    ...authority(),
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
const trueResultOrigin={
  async verifyWorkspaceResult(){return true;},
};
const falseResultOrigin={
  async verifyWorkspaceResult(){return false;},
};

function fakeHost(options={}){
  const calls=[];
  return {
    calls,
    async materializeExactExpertWorkspace(request){
      calls.push(request);
      const inputFiles=request.workspace.inputs.map(input=>({
        role:input.role,
        relativePath:input.relativePath,
        contentSha256:input.contentSha256,
        bytes:input.bytes,
        readOnly:true,
        symlink:false,
      }));
      const raw={
        schemaVersion:CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_V1_SCHEMA,
        state:'EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED',
        workspaceSha256:request.workspaceSha256,
        inventorySha256:request.inventorySha256,
        fixedPaths:request.fixedPaths,
        workspaceManifestFileSha256:h('d'),
        workspaceManifestBytes:4096,
        inputFiles,
        inputsReadOnly:true,
        outputWritableOnly:true,
        networkDisabled:true,
        noSymlinks:true,
        atomicManifestWrite:true,
        materializationAttemptId:'synthetic-materialization-attempt-001',
        processSpawned:false,
        trainingStarted:false,
        ...authority(),
        hostResultSha256:h('0'),
        ...(options.patch??{}),
      };
      if(options.keepWrongDigest===true){
        return raw;
      }
      const hostResultSha256=
        await coreHsmeAdapterMoeExpertWorkspaceResultV1Digest(raw,hash);
      return {...raw,hostResultSha256};
    },
  };
}

async function fixture({reverse=false}={}){
  const p=await preflight();
  const inventory=rawInventory(p,{reverse});
  const inventorySha=await hsmeAdapterMoeExpertWorkspaceInventoryV1Digest(
    inventory,
    hash,
  );
  return {p,inventory,inventorySha};
}

async function materialize(f,host,overrides={}){
  return materializeHsmeAdapterMoeExpertSealedWorkspaceV1(
    overrides.preflight??f.p,
    overrides.preflightSha??f.p.preflightEvidenceSha256,
    overrides.preflightOrigin??truePreflightOrigin,
    overrides.inventory??f.inventory,
    overrides.inventorySha??f.inventorySha,
    overrides.inventoryOrigin??trueInventoryOrigin,
    host,
    overrides.resultOrigin??trueResultOrigin,
    hash,
  );
}

test('exact trusted preflight materializes deterministic fixed-path workspace without execution',async()=>{
  const reversed=await fixture({reverse:true});
  const canonical=await fixture({reverse:false});
  assert.equal(reversed.inventorySha,canonical.inventorySha);

  const hostA=fakeHost();
  const hostB=fakeHost();
  const first=await materialize(reversed,hostA);
  const second=await materialize(canonical,hostB);

  assert.equal(first.state,'EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED');
  assert.deepEqual(first.blockers,[]);
  assert.equal(first.preflightEvidenceSha256,reversed.p.preflightEvidenceSha256);
  assert.equal(first.inventorySha256,reversed.inventorySha);
  assert.equal(first.fixedPaths.workspaceRoot,HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1);
  assert.equal(first.fixedPaths.manifestPath,HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1);
  assert.equal(first.fixedPaths.inputsRoot,HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1);
  assert.equal(first.fixedPaths.outputRoot,HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1);
  assert.equal(first.inputFiles.length,8);
  assert.equal(first.processSpawned,false);
  assert.equal(first.trainingStarted,false);
  assert.equal(first.trainingExecutionAllowed,false);
  assert.equal(first.workspaceMaterializationAllowed,false);
  assert.equal(hostA.calls.length,1);
  assert.deepEqual(
    hostA.calls[0].workspace.inputs.map(value=>value.relativePath),
    [
      'baseline/dense-baseline.safetensors',
      'corpus/training-corpus.bundle',
      'config/target-modules.json',
      'config/adapter-config.json',
      'contracts/reproduction.json',
      'environment/environment.manifest.json',
      'toolchain/training-toolchain.lock',
      'toolchain/trainer.entrypoint',
    ],
  );
  assert.deepEqual(first,second);
  assert.equal(
    await hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest(first,hash),
    first.receiptEvidenceSha256,
  );
});

test('untrusted preflight fails before materialization host invocation',async()=>{
  const f=await fixture();
  const host=fakeHost();
  const result=await materialize(f,host,{
    preflightOrigin:falsePreflightOrigin,
  });
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(result.blockers.includes('EXPERT_WORKSPACE_PREFLIGHT_ORIGIN_UNVERIFIED'));
  assert.equal(host.calls.length,0);
});

test('untrusted inventory fails before materialization host invocation',async()=>{
  const f=await fixture();
  const host=fakeHost();
  const result=await materialize(f,host,{
    inventoryOrigin:falseInventoryOrigin,
  });
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(result.blockers.includes('EXPERT_WORKSPACE_INVENTORY_ORIGIN_UNVERIFIED'));
  assert.equal(host.calls.length,0);
});

test('role content drift from exact preflight fails closed',async()=>{
  const f=await fixture();
  const entries=f.inventory.entries.map(entry=>
    entry.role==='TARGET_MODULE_SET'
      ?{...entry,sourceContentSha256:h('f')}
      :entry
  );
  const inventory=rawInventory(f.p,{entriesOverride:entries});
  const inventorySha=await hsmeAdapterMoeExpertWorkspaceInventoryV1Digest(
    inventory,
    hash,
  );
  const host=fakeHost();
  const result=await materialize(f,host,{inventory,inventorySha});
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(
    result.blockers.includes(
      'EXPERT_WORKSPACE_INVENTORY_PREFLIGHT_BINDING_INVALID',
    ),
  );
  assert.equal(host.calls.length,0);
});

test('missing or duplicate fixed roles are invalid inventory',async()=>{
  const f=await fixture();
  const entries=[...f.inventory.entries];
  const missing=rawInventory(f.p,{entriesOverride:entries.slice(0,-1)});
  let result=await materialize(f,fakeHost(),{
    inventory:missing,
    inventorySha:h('0'),
  });
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(result.blockers.includes('EXPERT_WORKSPACE_INVENTORY_INVALID'));

  const duplicateEntries=[
    ...entries.slice(0,-1),
    {...entries[0]},
  ];
  const duplicate=rawInventory(f.p,{entriesOverride:duplicateEntries});
  result=await materialize(f,fakeHost(),{
    inventory:duplicate,
    inventorySha:h('0'),
  });
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(result.blockers.includes('EXPERT_WORKSPACE_INVENTORY_INVALID'));
});

test('host input attestation drift is invalid even with self-consistent host digest',async()=>{
  const f=await fixture();
  const host=fakeHost({
    patch:{
      inputFiles:f.inventory.entries.map((entry,index)=>({
        role:entry.role,
        relativePath:[
          'baseline/dense-baseline.safetensors',
          'corpus/training-corpus.bundle',
          'config/target-modules.json',
          'config/adapter-config.json',
          'contracts/reproduction.json',
          'environment/environment.manifest.json',
          'toolchain/training-toolchain.lock',
          'toolchain/trainer.entrypoint',
        ][index],
        contentSha256:index===0?h('f'):entry.sourceContentSha256,
        bytes:entry.bytes,
        readOnly:true,
        symlink:false,
      })),
    },
  });
  const result=await materialize(f,host);
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(
    result.blockers.includes('EXPERT_WORKSPACE_HOST_INPUT_ATTESTATION_MISMATCH'),
  );
});

test('host exact-origin refusal and result digest drift fail closed',async()=>{
  const f=await fixture();

  let result=await materialize(f,fakeHost(),{
    resultOrigin:falseResultOrigin,
  });
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(
    result.blockers.includes('EXPERT_WORKSPACE_HOST_RESULT_ORIGIN_UNVERIFIED'),
  );

  result=await materialize(f,fakeHost({keepWrongDigest:true}));
  assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
  assert.ok(
    result.blockers.includes('EXPERT_WORKSPACE_HOST_RESULT_REHASH_MISMATCH'),
  );
});

test('host cannot widen path symlink network or process semantics',async()=>{
  const f=await fixture();
  const invalidPatches=[
    {
      fixedPaths:{
        workspaceRoot:'/tmp/other',
        manifestPath:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1,
        inputsRoot:HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1,
        outputRoot:HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1,
      },
    },
    {networkDisabled:false},
    {noSymlinks:false},
    {processSpawned:true},
    {trainingStarted:true},
  ];
  for(const patch of invalidPatches){
    const result=await materialize(
      f,
      fakeHost({patch,keepWrongDigest:true}),
    );
    assert.equal(result.state,'EXPERT_WORKSPACE_FREEZE_INVALID');
    assert.ok(
      result.blockers.includes('EXPERT_WORKSPACE_HOST_RESULT_INVALID'),
    );
  }
});
