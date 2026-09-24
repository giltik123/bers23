import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
  type HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1,
  type HsmeAdapterMoeExpertTrainingPreflightV1,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-workspace-inventory:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-workspace:v1\0' as const;
export const CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_V1' as const;
export const CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:adapter-moe-expert-workspace-materialization-result:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-workspace-freeze-receipt:v1\0' as const;

export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1 =
  '.hsme-rd/adapter-moe-expert-v1' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1 =
  '.hsme-rd/adapter-moe-expert-v1/workspace.json' as const;
export const HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1 =
  '.hsme-rd/adapter-moe-expert-v1/inputs' as const;
export const HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1 =
  '.hsme-rd/adapter-moe-expert-v1/output' as const;
export const HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1 =
  '.hsme-rd/adapter-moe-expert-v1/output/expert-delta.bin' as const;
export const HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1 =
  '.hsme-rd/adapter-moe-expert-v1/output/expert-delta.json' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

const ROLES=Object.freeze([
  'DENSE_BASELINE',
  'TRAINING_CORPUS',
  'TARGET_MODULE_SET',
  'ADAPTER_CONFIG',
  'REPRODUCTION_CONTRACT',
  'IMMUTABLE_ENVIRONMENT',
  'TRAINING_TOOLCHAIN',
  'TRAINER_ENTRYPOINT',
  'LICENSE_EVIDENCE',
] as const);

export type HsmeAdapterMoeExpertWorkspaceInputRoleV1=
  typeof ROLES[number];

const DESTINATIONS:Readonly<Record<
  HsmeAdapterMoeExpertWorkspaceInputRoleV1,
  string
>>=Object.freeze({
  DENSE_BASELINE:'inputs/dense-baseline.bin',
  TRAINING_CORPUS:'inputs/training-corpus.bundle',
  TARGET_MODULE_SET:'inputs/target-module-set.json',
  ADAPTER_CONFIG:'inputs/adapter-config.json',
  REPRODUCTION_CONTRACT:'inputs/reproduction-contract.json',
  IMMUTABLE_ENVIRONMENT:'inputs/immutable-environment.lock',
  TRAINING_TOOLCHAIN:'inputs/training-toolchain.lock',
  TRAINER_ENTRYPOINT:'inputs/trainer-entrypoint.bin',
  LICENSE_EVIDENCE:'inputs/license-evidence.json',
});

export type HsmeAdapterMoeExpertWorkspaceInventoryEntryV1=Readonly<{
  role:HsmeAdapterMoeExpertWorkspaceInputRoleV1;
  sourceContentSha256:string;
  bytes:number;
  immutableSourceAuthorityId:string;
  sourceObjectSha256:string;
  destinationRelativePath:string;
  readOnly:true;
}>;

export type HsmeAdapterMoeExpertWorkspaceInventoryV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA;
  preflightEvidenceSha256:string;
  expertId:string;
  entries:readonly HsmeAdapterMoeExpertWorkspaceInventoryEntryV1[];
  processSpawned:false;
  trainingStarted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmeAdapterMoeExpertWorkspaceInventoryOriginVerifierV1{
  verifyWorkspaceInventory(
    inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1,
    expectedInventorySha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertWorkspaceFixedPathsV1=Readonly<{
  workspaceRoot:typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1;
  manifestPath:typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1;
  inputsRoot:typeof HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1;
  outputRoot:typeof HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1;
  stagedDeltaPath:typeof HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1;
  stagedMetadataPath:typeof HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1;
}>;

export type HsmeAdapterMoeExpertWorkspaceInputV1=Readonly<{
  role:HsmeAdapterMoeExpertWorkspaceInputRoleV1;
  contentSha256:string;
  relativePath:string;
  bytes:number;
  readOnly:true;
}>;

export type HsmeAdapterMoeExpertWorkspaceV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_V1_SCHEMA;
  preflightEvidenceSha256:string;
  inventorySha256:string;
  experimentPlanSha256:string;
  trainingSpecSha256:string;
  expertId:string;
  specialistHypothesis:string;
  adapterKind:string;
  denseBaselineDecisionSha256:string;
  denseBaselineContentSha256:string;
  immutableEnvironmentSha256:string;
  trainingToolchainSha256:string;
  trainerEntrypointSha256:string;
  resourceCeilings:NonNullable<
    HsmeAdapterMoeExpertTrainingPreflightV1['resourceCeilings']
  >;
  fixedPaths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1;
  inputs:readonly HsmeAdapterMoeExpertWorkspaceInputV1[];
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
  outputWritableOnly:true;
  atomicOutputRequired:true;
  processSpawned:false;
  trainingStarted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type CoreHsmeAdapterMoeExpertWorkspaceMaterializationRequestV1=
  Readonly<{
    preflight:HsmeAdapterMoeExpertTrainingPreflightV1;
    preflightEvidenceSha256:string;
    workspace:HsmeAdapterMoeExpertWorkspaceV1;
    workspaceSha256:string;
    inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1;
    inventorySha256:string;
    fixedPaths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1;
  }>;

export interface CoreHsmeAdapterMoeExpertWorkspaceMaterializationPortV1{
  materializeExactExpertWorkspace(
    request:CoreHsmeAdapterMoeExpertWorkspaceMaterializationRequestV1,
  ):Promise<unknown>;
}

export type CoreHsmeAdapterMoeExpertMaterializedInputV1=Readonly<{
  role:HsmeAdapterMoeExpertWorkspaceInputRoleV1;
  relativePath:string;
  contentSha256:string;
  bytes:number;
  readOnly:true;
  symlink:false;
}>;

export type CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1=
  Readonly<{
    schemaVersion:
      typeof CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA;
    state:'EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED';
    preflightEvidenceSha256:string;
    workspaceSha256:string;
    inventorySha256:string;
    fixedPaths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1;
    workspaceManifestFileSha256:string;
    workspaceManifestBytes:number;
    inputFiles:readonly CoreHsmeAdapterMoeExpertMaterializedInputV1[];
    inputsReadOnly:true;
    outputWritableOnly:true;
    networkDisabled:true;
    noSymlinks:true;
    atomicManifestWrite:true;
    materializationAttemptId:string;
    processSpawned:false;
    trainingStarted:false;
    modelInstallAllowed:false;
    modelFleetPromotionAllowed:false;
    durableModelFleetPromotionAllowed:false;
    productionAuthorityGranted:false;
    providerAuthorityGranted:false;
    billingAuthorityGranted:false;
    projectArtifactMutationAllowed:false;
    aeeExecutionAuthorityGranted:false;
    winnerSelectionAllowed:false;
    hostResultSha256:string;
  }>;

export interface CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultOriginVerifierV1{
  verifyMaterializationResult(
    result:CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1=Readonly<{
  schemaVersion:
    typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA;
  state:'EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED';
  blockers:readonly [];
  preflightEvidenceSha256:string;
  workspaceSha256:string;
  inventorySha256:string;
  expertId:string;
  fixedPaths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1;
  workspaceManifestFileSha256:string;
  workspaceManifestBytes:number;
  inputFiles:readonly CoreHsmeAdapterMoeExpertMaterializedInputV1[];
  inputsReadOnly:true;
  outputWritableOnly:true;
  networkDisabled:true;
  noSymlinks:true;
  atomicManifestWrite:true;
  materializationAttemptId:string;
  hostResultSha256:string;
  processSpawned:false;
  trainingStarted:false;
  furtherWorkspaceMaterializationAllowed:false;
  trainingExecutionAllowed:false;
  prototypeAssemblyAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
  receiptEvidenceSha256:string;
}>;

export class HsmeAdapterMoeExpertSealedWorkspaceV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeExpertSealedWorkspaceV1Error';
    this.code=code;
  }
}

export function normalizeHsmeAdapterMoeExpertWorkspaceInventoryV1(
  raw:unknown,
):HsmeAdapterMoeExpertWorkspaceInventoryV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'preflightEvidenceSha256',
    'expertId',
    'entries',
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
  ],'inventory');
  if(record.schemaVersion!==HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA){
    fail('hsme_adapter_moe_workspace_inventory_schema','inventory schema unsupported');
  }
  if(record.processSpawned!==false||record.trainingStarted!==false){
    fail(
      'hsme_adapter_moe_workspace_inventory_execution',
      'inventory cannot claim execution',
    );
  }
  assertNoAuthority(record,'inventory');
  if(!Array.isArray(record.entries)||record.entries.length!==ROLES.length){
    fail(
      'hsme_adapter_moe_workspace_inventory_entries',
      'inventory requires exactly one entry for every fixed role',
    );
  }
  const entries=record.entries.map((entry,index)=>
    normalizeInventoryEntry(entry,'inventory.entries['+index+']')
  ).sort(compareEntries);
  for(const role of ROLES){
    if(entries.filter(entry=>entry.role===role).length!==1){
      fail(
        'hsme_adapter_moe_workspace_inventory_role_cardinality',
        'inventory requires exactly one '+role,
      );
    }
  }
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA,
    preflightEvidenceSha256:sha256(
      record.preflightEvidenceSha256,
      'inventory.preflightEvidenceSha256',
    ),
    expertId:identifier(record.expertId,'inventory.expertId',120),
    entries:Object.freeze(entries),
    ...nonExecutionBoundary(),
  });
}

export async function hsmeAdapterMoeExpertWorkspaceInventoryV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const inventory=normalizeHsmeAdapterMoeExpertWorkspaceInventoryV1(raw);
  return digest(
    HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_DIGEST_DOMAIN,
    inventory,
    hash,
  );
}

export async function hsmeAdapterMoeExpertWorkspaceV1Digest(
  workspace:HsmeAdapterMoeExpertWorkspaceV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_ADAPTER_MOE_EXPERT_WORKSPACE_DIGEST_DOMAIN,
    workspace,
    hash,
  );
}

export async function materializeHsmeAdapterMoeExpertSealedWorkspaceV1(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  expectedPreflightSha256:string,
  preflightOrigin:HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1,
  rawInventory:unknown,
  expectedInventorySha256:string,
  inventoryOrigin:HsmeAdapterMoeExpertWorkspaceInventoryOriginVerifierV1,
  host:CoreHsmeAdapterMoeExpertWorkspaceMaterializationPortV1,
  resultOrigin:
    CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1>{
  assertReadyPreflight(preflight);

  const preflightEvidenceSha256=
    await hsmeAdapterMoeExpertTrainingPreflightV1Digest(preflight,hash);
  if(
    !HEX64.test(expectedPreflightSha256)
    ||preflightEvidenceSha256!==expectedPreflightSha256
    ||preflightEvidenceSha256!==preflight.preflightEvidenceSha256
  ){
    fail(
      'hsme_adapter_moe_workspace_preflight_digest',
      'preflight digest mismatch',
    );
  }
  if(!await verify(
    ()=>preflightOrigin.verifyTrainingPreflight(
      preflight,
      preflightEvidenceSha256,
    ),
  )){
    fail(
      'hsme_adapter_moe_workspace_preflight_origin',
      'preflight origin unverified',
    );
  }

  const inventory=normalizeHsmeAdapterMoeExpertWorkspaceInventoryV1(
    rawInventory,
  );
  const inventorySha256=
    await hsmeAdapterMoeExpertWorkspaceInventoryV1Digest(inventory,hash);
  if(
    !HEX64.test(expectedInventorySha256)
    ||inventorySha256!==expectedInventorySha256
  ){
    fail(
      'hsme_adapter_moe_workspace_inventory_digest',
      'inventory digest mismatch',
    );
  }
  if(!await verify(
    ()=>inventoryOrigin.verifyWorkspaceInventory(inventory,inventorySha256),
  )){
    fail(
      'hsme_adapter_moe_workspace_inventory_origin',
      'inventory origin unverified',
    );
  }
  validateInventoryBinding(preflight,inventory);

  const fixedPaths=fixedPaths();
  const workspace=deriveWorkspace(
    preflight,
    preflightEvidenceSha256,
    inventory,
    inventorySha256,
    fixedPaths,
  );
  const workspaceSha256=
    await hsmeAdapterMoeExpertWorkspaceV1Digest(workspace,hash);

  let rawResult:unknown;
  try{
    rawResult=await host.materializeExactExpertWorkspace(deepFreeze({
      preflight,
      preflightEvidenceSha256,
      workspace,
      workspaceSha256,
      inventory,
      inventorySha256,
      fixedPaths,
    }));
  }catch{
    fail(
      'hsme_adapter_moe_workspace_host_failed',
      'protected workspace materialization failed',
    );
  }

  const result=normalizeMaterializationResult(rawResult);
  const hostResultSha256=
    await coreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1Digest(
      result,
      hash,
    );
  if(hostResultSha256!==result.hostResultSha256){
    fail(
      'hsme_adapter_moe_workspace_host_rehash',
      'host result digest mismatch',
    );
  }
  if(!await verify(
    ()=>resultOrigin.verifyMaterializationResult(result,hostResultSha256),
  )){
    fail(
      'hsme_adapter_moe_workspace_host_origin',
      'host result origin unverified',
    );
  }
  validateMaterializationBinding(
    preflightEvidenceSha256,
    workspaceSha256,
    inventorySha256,
    fixedPaths,
    inventory,
    result,
  );

  const payload={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
    state:'EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([]) as readonly [],
    preflightEvidenceSha256,
    workspaceSha256,
    inventorySha256,
    expertId:preflight.expertId,
    fixedPaths,
    workspaceManifestFileSha256:result.workspaceManifestFileSha256,
    workspaceManifestBytes:result.workspaceManifestBytes,
    inputFiles:result.inputFiles,
    inputsReadOnly:true as const,
    outputWritableOnly:true as const,
    networkDisabled:true as const,
    noSymlinks:true as const,
    atomicManifestWrite:true as const,
    materializationAttemptId:result.materializationAttemptId,
    hostResultSha256,
    processSpawned:false as const,
    trainingStarted:false as const,
    ...receiptAuthorityBoundary(),
  };
  const receiptEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,receiptEvidenceSha256});
}

export async function coreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1Digest(
  raw:CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=normalizeMaterializationResult(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(
    CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest(
  receipt:HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const {receiptEvidenceSha256:_ignored,...payload}=receipt;
  return digest(
    HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function deriveWorkspace(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  preflightEvidenceSha256:string,
  inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1,
  inventorySha256:string,
  paths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1,
):HsmeAdapterMoeExpertWorkspaceV1{
  if(
    preflight.experimentPlanSha256==='UNKNOWN'
    ||preflight.trainingSpecSha256==='UNKNOWN'
    ||preflight.expertId==='UNKNOWN'
    ||preflight.specialistHypothesis==='UNKNOWN'
    ||preflight.adapterKind==='UNKNOWN'
    ||preflight.denseBaselineDecisionSha256==='UNKNOWN'
    ||preflight.denseBaselineContentSha256==='UNKNOWN'
    ||preflight.immutableEnvironmentSha256==='UNKNOWN'
    ||preflight.trainingToolchainSha256==='UNKNOWN'
    ||preflight.trainerEntrypointSha256==='UNKNOWN'
    ||preflight.resourceCeilings===null
  ){
    fail('hsme_adapter_moe_workspace_preflight_shape','preflight binding incomplete');
  }
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_V1_SCHEMA,
    preflightEvidenceSha256,
    inventorySha256,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    expertId:preflight.expertId,
    specialistHypothesis:preflight.specialistHypothesis,
    adapterKind:preflight.adapterKind,
    denseBaselineDecisionSha256:preflight.denseBaselineDecisionSha256,
    denseBaselineContentSha256:preflight.denseBaselineContentSha256,
    immutableEnvironmentSha256:preflight.immutableEnvironmentSha256,
    trainingToolchainSha256:preflight.trainingToolchainSha256,
    trainerEntrypointSha256:preflight.trainerEntrypointSha256,
    resourceCeilings:preflight.resourceCeilings,
    fixedPaths:paths,
    inputs:Object.freeze(inventory.entries.map(entry=>deepFreeze({
      role:entry.role,
      contentSha256:entry.sourceContentSha256,
      relativePath:entry.destinationRelativePath,
      bytes:entry.bytes,
      readOnly:true as const,
    }))),
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    outputWritableOnly:true,
    atomicOutputRequired:true,
    ...nonExecutionBoundary(),
  });
}

function normalizeMaterializationResult(
  raw:unknown,
):CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'state',
    'preflightEvidenceSha256',
    'workspaceSha256',
    'inventorySha256',
    'fixedPaths',
    'workspaceManifestFileSha256',
    'workspaceManifestBytes',
    'inputFiles',
    'inputsReadOnly',
    'outputWritableOnly',
    'networkDisabled',
    'noSymlinks',
    'atomicManifestWrite',
    'materializationAttemptId',
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
    'hostResultSha256',
  ],'result');
  if(
    record.schemaVersion!==
      CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA
    ||record.state!=='EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED'
  ){
    fail('hsme_adapter_moe_workspace_result_schema','host result schema/state invalid');
  }
  if(
    record.inputsReadOnly!==true
    ||record.outputWritableOnly!==true
    ||record.networkDisabled!==true
    ||record.noSymlinks!==true
    ||record.atomicManifestWrite!==true
    ||record.processSpawned!==false
    ||record.trainingStarted!==false
  ){
    fail('hsme_adapter_moe_workspace_result_boundary','host result boundary invalid');
  }
  assertNoAuthority(record,'result');
  const paths=normalizeFixedPaths(record.fixedPaths);
  if(!Array.isArray(record.inputFiles)||record.inputFiles.length!==ROLES.length){
    fail('hsme_adapter_moe_workspace_result_inputs','host input count invalid');
  }
  const inputFiles=record.inputFiles.map((value,index)=>
    normalizeMaterializedInput(value,'result.inputFiles['+index+']')
  ).sort(compareMaterializedInputs);
  return deepFreeze({
    schemaVersion:
      CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA,
    state:'EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED',
    preflightEvidenceSha256:sha256(
      record.preflightEvidenceSha256,
      'result.preflightEvidenceSha256',
    ),
    workspaceSha256:sha256(record.workspaceSha256,'result.workspaceSha256'),
    inventorySha256:sha256(record.inventorySha256,'result.inventorySha256'),
    fixedPaths:paths,
    workspaceManifestFileSha256:sha256(
      record.workspaceManifestFileSha256,
      'result.workspaceManifestFileSha256',
    ),
    workspaceManifestBytes:safeInteger(
      record.workspaceManifestBytes,
      'result.workspaceManifestBytes',
      1,
      10_000_000,
    ),
    inputFiles:Object.freeze(inputFiles),
    inputsReadOnly:true,
    outputWritableOnly:true,
    networkDisabled:true,
    noSymlinks:true,
    atomicManifestWrite:true,
    materializationAttemptId:identifier(
      record.materializationAttemptId,
      'result.materializationAttemptId',
      160,
    ),
    processSpawned:false,
    trainingStarted:false,
    ...hostAuthorityBoundary(),
    hostResultSha256:sha256(
      record.hostResultSha256,
      'result.hostResultSha256',
    ),
  });
}

function validateInventoryBinding(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1,
):void{
  if(
    preflight.preflightEvidenceSha256==='UNKNOWN'
    ||inventory.preflightEvidenceSha256!==preflight.preflightEvidenceSha256
    ||preflight.expertId==='UNKNOWN'
    ||inventory.expertId!==preflight.expertId
  ){
    fail('hsme_adapter_moe_workspace_inventory_binding','inventory preflight binding mismatch');
  }
  const expected:Record<HsmeAdapterMoeExpertWorkspaceInputRoleV1,string|'UNKNOWN'>={
    DENSE_BASELINE:preflight.denseBaselineContentSha256,
    TRAINING_CORPUS:preflight.trainingCorpusRootSha256,
    TARGET_MODULE_SET:preflight.targetModuleSetSha256,
    ADAPTER_CONFIG:preflight.adapterConfigSha256,
    REPRODUCTION_CONTRACT:preflight.reproductionContractSha256,
    IMMUTABLE_ENVIRONMENT:preflight.immutableEnvironmentSha256,
    TRAINING_TOOLCHAIN:preflight.trainingToolchainSha256,
    TRAINER_ENTRYPOINT:preflight.trainerEntrypointSha256,
    LICENSE_EVIDENCE:preflight.licenseEvidenceSha256,
  };
  for(const entry of inventory.entries){
    const digest=expected[entry.role];
    if(digest==='UNKNOWN'||entry.sourceContentSha256!==digest){
      fail(
        'hsme_adapter_moe_workspace_inventory_content_binding',
        'inventory '+entry.role+' content digest mismatch',
      );
    }
  }
}

function validateMaterializationBinding(
  preflightSha:string,
  workspaceSha:string,
  inventorySha:string,
  paths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1,
  inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1,
  result:CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1,
):void{
  if(
    result.preflightEvidenceSha256!==preflightSha
    ||result.workspaceSha256!==workspaceSha
    ||result.inventorySha256!==inventorySha
    ||JSON.stringify(result.fixedPaths)!==JSON.stringify(paths)
  ){
    fail('hsme_adapter_moe_workspace_result_binding','host result identity mismatch');
  }
  const expected=inventory.entries.map(entry=>({
    role:entry.role,
    relativePath:entry.destinationRelativePath,
    contentSha256:entry.sourceContentSha256,
    bytes:entry.bytes,
    readOnly:true,
    symlink:false,
  })).sort(compareMaterializedInputs);
  if(JSON.stringify(expected)!==JSON.stringify(result.inputFiles)){
    fail('hsme_adapter_moe_workspace_result_inputs','host materialized inputs drift');
  }
}

function normalizeInventoryEntry(
  raw:unknown,
  path:string,
):HsmeAdapterMoeExpertWorkspaceInventoryEntryV1{
  const record=exactRecord(raw,[
    'role',
    'sourceContentSha256',
    'bytes',
    'immutableSourceAuthorityId',
    'sourceObjectSha256',
    'destinationRelativePath',
    'readOnly',
  ],path);
  const role=enumValue(record.role,ROLES,path+'.role');
  if(record.readOnly!==true){
    fail('hsme_adapter_moe_workspace_inventory_readonly',path+' must be read-only');
  }
  if(record.destinationRelativePath!==DESTINATIONS[role]){
    fail('hsme_adapter_moe_workspace_inventory_path',path+' destination path is not canonical');
  }
  return deepFreeze({
    role,
    sourceContentSha256:sha256(
      record.sourceContentSha256,
      path+'.sourceContentSha256',
    ),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    immutableSourceAuthorityId:identifier(
      record.immutableSourceAuthorityId,
      path+'.immutableSourceAuthorityId',
      160,
    ),
    sourceObjectSha256:sha256(record.sourceObjectSha256,path+'.sourceObjectSha256'),
    destinationRelativePath:DESTINATIONS[role],
    readOnly:true,
  });
}

function normalizeMaterializedInput(
  raw:unknown,
  path:string,
):CoreHsmeAdapterMoeExpertMaterializedInputV1{
  const record=exactRecord(raw,[
    'role','relativePath','contentSha256','bytes','readOnly','symlink',
  ],path);
  const role=enumValue(record.role,ROLES,path+'.role');
  if(
    record.relativePath!==DESTINATIONS[role]
    ||record.readOnly!==true
    ||record.symlink!==false
  ){
    fail('hsme_adapter_moe_workspace_result_input_boundary',path+' boundary invalid');
  }
  return deepFreeze({
    role,
    relativePath:DESTINATIONS[role],
    contentSha256:sha256(record.contentSha256,path+'.contentSha256'),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    readOnly:true,
    symlink:false,
  });
}

function normalizeFixedPaths(
  raw:unknown,
):HsmeAdapterMoeExpertWorkspaceFixedPathsV1{
  const record=exactRecord(raw,[
    'workspaceRoot','manifestPath','inputsRoot','outputRoot',
    'stagedDeltaPath','stagedMetadataPath',
  ],'fixedPaths');
  const expected=fixedPaths();
  for(const [key,value] of Object.entries(expected)){
    if(record[key]!==value){
      fail('hsme_adapter_moe_workspace_fixed_path','fixed path drift: '+key);
    }
  }
  return expected;
}

function fixedPaths():HsmeAdapterMoeExpertWorkspaceFixedPathsV1{
  return deepFreeze({
    workspaceRoot:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1,
    manifestPath:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1,
    outputRoot:HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1,
    stagedDeltaPath:HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
    stagedMetadataPath:HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
  });
}

function assertReadyPreflight(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
):void{
  if(
    preflight.schemaVersion!==HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA
    ||preflight.state!=='ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    ||preflight.blockers.length!==0
    ||preflight.preflightEvidenceSha256==='UNKNOWN'
    ||preflight.trainingExecutionAllowed!==false
    ||preflight.workspaceMaterializationAllowed!==false
    ||preflight.prototypeAssemblyAllowed!==false
  ){
    fail('hsme_adapter_moe_workspace_preflight_state','ready preflight required');
  }
}

function nonExecutionBoundary(){
  return Object.freeze({
    processSpawned:false as const,
    trainingStarted:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function hostAuthorityBoundary(){
  const {processSpawned:_p,trainingStarted:_t,...rest}=nonExecutionBoundary();
  return rest;
}

function receiptAuthorityBoundary(){
  return Object.freeze({
    furtherWorkspaceMaterializationAllowed:false as const,
    trainingExecutionAllowed:false as const,
    prototypeAssemblyAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(hostAuthorityBoundary())){
    if(record[field]!==false){
      fail('hsme_adapter_moe_workspace_authority',path+'.'+field+' must remain false');
    }
  }
}

function compareEntries(
  left:HsmeAdapterMoeExpertWorkspaceInventoryEntryV1,
  right:HsmeAdapterMoeExpertWorkspaceInventoryEntryV1,
):number{
  return ROLES.indexOf(left.role)-ROLES.indexOf(right.role);
}

function compareMaterializedInputs(
  left:{role:HsmeAdapterMoeExpertWorkspaceInputRoleV1},
  right:{role:HsmeAdapterMoeExpertWorkspaceInputRoleV1},
):number{
  return ROLES.indexOf(left.role)-ROLES.indexOf(right.role);
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_adapter_moe_workspace_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_workspace_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_adapter_moe_workspace_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_adapter_moe_workspace_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_workspace_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_adapter_moe_workspace_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_workspace_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_workspace_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_adapter_moe_workspace_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_adapter_moe_workspace_hash','hash port must return lowercase SHA-256');
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(code:string,message:string):never{
  throw new HsmeAdapterMoeExpertSealedWorkspaceV1Error(code,message);
}
