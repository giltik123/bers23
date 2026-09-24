import {
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
  type HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1,
  type HsmeAdapterMoeExpertTrainingPreflightV1,
  type HsmeAdapterMoeExpertTrainingResourceCeilingsV1,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-workspace-inventory:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_SEALED_WORKSPACE_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_SEALED_WORKSPACE_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_SEALED_WORKSPACE_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-sealed-workspace:v1\0' as const;
export const CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_V1' as const;
export const CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:adapter-moe-expert-workspace-result:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-workspace-freeze-receipt:v1\0' as const;

export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1 =
  '/run/bers-hsme/adapter-moe-expert/v1' as const;
export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1 =
  '/run/bers-hsme/adapter-moe-expert/v1/workspace.json' as const;
export const HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1 =
  '/run/bers-hsme/adapter-moe-expert/v1/inputs' as const;
export const HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1 =
  '/run/bers-hsme/adapter-moe-expert/v1/output' as const;
export const HSME_ADAPTER_MOE_EXPERT_STAGED_ARTIFACT_RELATIVE_PATH_V1 =
  'expert/staged.safetensors' as const;
export const HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_RELATIVE_PATH_V1 =
  'expert/staged.metadata.json' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export const HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1=Object.freeze([
  'DENSE_BASELINE_ARTIFACT',
  'TRAINING_CORPUS_BUNDLE',
  'TARGET_MODULE_SET',
  'ADAPTER_CONFIG',
  'REPRODUCTION_CONTRACT',
  'IMMUTABLE_ENVIRONMENT_MANIFEST',
  'TRAINING_TOOLCHAIN',
  'TRAINER_ENTRYPOINT',
] as const);

export type HsmeAdapterMoeExpertWorkspaceInputRoleV1=
  typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1[number];

export type HsmeAdapterMoeExpertWorkspaceInventoryEntryV1=Readonly<{
  role:HsmeAdapterMoeExpertWorkspaceInputRoleV1;
  sourceContentSha256:string;
  bytes:number;
  immutableSourceAuthorityId:string;
  sourceObjectSha256:string;
  readOnly:true;
}>;

export type HsmeAdapterMoeExpertWorkspaceInventoryV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA;
  preflightEvidenceSha256:string;
  expertId:string;
  entries:readonly HsmeAdapterMoeExpertWorkspaceInventoryEntryV1[];
  processSpawned:false;
  trainingStarted:false;
  workspaceMaterializationAllowed:false;
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
}>;

export interface HsmeAdapterMoeExpertWorkspaceInventoryOriginVerifierV1{
  verifyWorkspaceInventory(
    inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1,
    expectedInventorySha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertSealedWorkspaceInputV1=Readonly<{
  role:HsmeAdapterMoeExpertWorkspaceInputRoleV1;
  contentSha256:string;
  relativePath:string;
  bytes:number;
  readOnly:true;
}>;

export type HsmeAdapterMoeExpertSealedWorkspaceV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_SEALED_WORKSPACE_V1_SCHEMA;
  preflightEvidenceSha256:string;
  experimentPlanSha256:string;
  trainingSpecSha256:string;
  experimentId:string;
  expertId:string;
  denseBaselineContentSha256:string;
  immutableEnvironmentSha256:string;
  trainingToolchainSha256:string;
  resourceCeilings:HsmeAdapterMoeExpertTrainingResourceCeilingsV1;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
  inputs:readonly HsmeAdapterMoeExpertSealedWorkspaceInputV1[];
  output:Readonly<{
    stagedExpertRelativePath:
      typeof HSME_ADAPTER_MOE_EXPERT_STAGED_ARTIFACT_RELATIVE_PATH_V1;
    stagedMetadataRelativePath:
      typeof HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_RELATIVE_PATH_V1;
    atomicStagingRequired:true;
  }>;
  processSpawned:false;
  trainingStarted:false;
  workspaceMaterializationAllowed:false;
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
}>;

export type HsmeAdapterMoeExpertWorkspaceFixedPathsV1=Readonly<{
  workspaceRoot:typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1;
  manifestPath:typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1;
  inputsRoot:typeof HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1;
  outputRoot:typeof HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1;
}>;

export type CoreHsmeAdapterMoeExpertWorkspaceMaterializationRequestV1=Readonly<{
  workspace:HsmeAdapterMoeExpertSealedWorkspaceV1;
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
  schemaVersion:typeof CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_V1_SCHEMA;
  state:'EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED';
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
  workspaceMaterializationAllowed:false;
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
  hostResultSha256:string;
}>;

export interface CoreHsmeAdapterMoeExpertWorkspaceResultOriginVerifierV1{
  verifyWorkspaceResult(
    result:CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1=Readonly<{
  schemaVersion:
    typeof HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA;
  state:
    |'EXPERT_WORKSPACE_FREEZE_INVALID'
    |'EXPERT_WORKSPACE_FREEZE_BLOCKED'
    |'EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED';
  blockers:readonly string[];
  preflightEvidenceSha256:string|'UNKNOWN';
  experimentPlanSha256:string|'UNKNOWN';
  trainingSpecSha256:string|'UNKNOWN';
  expertId:string|'UNKNOWN';
  workspaceSha256:string|'UNKNOWN';
  inventorySha256:string|'UNKNOWN';
  fixedPaths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1|null;
  workspaceManifestFileSha256:string|'UNKNOWN';
  workspaceManifestBytes:number|'UNKNOWN';
  inputFiles:readonly CoreHsmeAdapterMoeExpertMaterializedInputV1[];
  materializationAttemptId:string|'UNKNOWN';
  hostResultSha256:string|'UNKNOWN';
  processSpawned:false;
  trainingStarted:false;
  workspaceMaterializationAllowed:false;
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
  receiptEvidenceSha256:string|'UNKNOWN';
}>;

export class HsmeAdapterMoeExpertWorkspaceMaterializationV1Error
  extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeExpertWorkspaceMaterializationV1Error';
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
    'workspaceMaterializationAllowed',
    'trainingExecutionAllowed',
    'prototypeAssemblyAllowed',
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
    fail(
      'hsme_adapter_moe_workspace_inventory_schema',
      'inventory schema unsupported',
    );
  }
  if(
    !Array.isArray(record.entries)
    ||record.entries.length!==HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1.length
  ){
    fail(
      'hsme_adapter_moe_workspace_inventory_entries',
      'inventory requires exactly one entry per fixed role',
    );
  }
  assertNoProcessOrAuthority(record,'inventory');

  const entries=record.entries
    .map((entry,index)=>normalizeInventoryEntry(
      entry,
      'inventory.entries['+index+']',
    ))
    .sort(compareRoleValues);

  const roles=entries.map(entry=>entry.role);
  if(
    new Set(roles).size!==roles.length
    ||HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1.some(
      role=>!roles.includes(role),
    )
  ){
    fail(
      'hsme_adapter_moe_workspace_inventory_roles',
      'inventory roles must exactly match the fixed role roster',
    );
  }

  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INVENTORY_V1_SCHEMA,
    preflightEvidenceSha256:sha256(
      record.preflightEvidenceSha256,
      'inventory.preflightEvidenceSha256',
    ),
    expertId:identifier(record.expertId,'inventory.expertId',120),
    entries:Object.freeze(entries),
    processSpawned:false,
    trainingStarted:false,
    ...authorityBoundary(),
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

export function deriveHsmeAdapterMoeExpertSealedWorkspaceV1(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1,
):HsmeAdapterMoeExpertSealedWorkspaceV1{
  if(!validReadyPreflightBoundary(preflight)){
    fail(
      'hsme_adapter_moe_workspace_preflight_state',
      'ready exact training preflight required',
    );
  }
  if(
    inventory.preflightEvidenceSha256!==preflight.preflightEvidenceSha256
    ||inventory.expertId!==preflight.expertId
  ){
    fail(
      'hsme_adapter_moe_workspace_inventory_preflight_binding',
      'inventory is not bound to the exact preflight expert',
    );
  }
  validateInventoryContentBinding(preflight,inventory);

  const inputs=inventory.entries.map(entry=>deepFreeze({
    role:entry.role,
    contentSha256:entry.sourceContentSha256,
    relativePath:relativePathForRole(entry.role),
    bytes:entry.bytes,
    readOnly:true as const,
  }));

  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_SEALED_WORKSPACE_V1_SCHEMA,
    preflightEvidenceSha256:preflight.preflightEvidenceSha256,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    experimentId:preflight.experimentId,
    expertId:preflight.expertId,
    denseBaselineContentSha256:preflight.denseBaselineContentSha256,
    immutableEnvironmentSha256:preflight.immutableEnvironmentSha256,
    trainingToolchainSha256:preflight.trainingToolchainSha256,
    resourceCeilings:preflight.resourceCeilings,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    inputs:Object.freeze(inputs),
    output:Object.freeze({
      stagedExpertRelativePath:
        HSME_ADAPTER_MOE_EXPERT_STAGED_ARTIFACT_RELATIVE_PATH_V1,
      stagedMetadataRelativePath:
        HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_RELATIVE_PATH_V1,
      atomicStagingRequired:true as const,
    }),
    processSpawned:false,
    trainingStarted:false,
    ...authorityBoundary(),
  });
}

export async function hsmeAdapterMoeExpertSealedWorkspaceV1Digest(
  workspace:HsmeAdapterMoeExpertSealedWorkspaceV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    workspace.schemaVersion!==HSME_ADAPTER_MOE_EXPERT_SEALED_WORKSPACE_V1_SCHEMA
    ||workspace.processSpawned!==false
    ||workspace.trainingStarted!==false
    ||workspace.networkPolicy!=='SEALED_INPUTS_ONLY'
    ||workspace.cacheModelInputPolicy!==
      'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'
    ||workspace.inputs.length!==
      HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1.length
  ){
    fail(
      'hsme_adapter_moe_workspace_digest_state',
      'workspace is not a canonical sealed expert workspace',
    );
  }
  return digest(
    HSME_ADAPTER_MOE_EXPERT_SEALED_WORKSPACE_DIGEST_DOMAIN,
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
  resultOrigin:CoreHsmeAdapterMoeExpertWorkspaceResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1>{
  if(!validReadyPreflightBoundary(preflight)){
    return blocked(['EXPERT_WORKSPACE_READY_PREFLIGHT_REQUIRED']);
  }

  let preflightEvidenceSha256:string;
  try{
    preflightEvidenceSha256=
      await hsmeAdapterMoeExpertTrainingPreflightV1Digest(preflight,hash);
  }catch{
    return invalid(['EXPERT_WORKSPACE_PREFLIGHT_REHASH_INVALID']);
  }
  const preflightValues=valuesFromPreflight(preflight,preflightEvidenceSha256);
  if(
    !HEX64.test(expectedPreflightSha256)
    ||preflightEvidenceSha256!==expectedPreflightSha256
    ||preflightEvidenceSha256!==preflight.preflightEvidenceSha256
  ){
    return invalid(
      ['EXPERT_WORKSPACE_PREFLIGHT_REHASH_MISMATCH'],
      preflightValues,
    );
  }
  if(!await verify(()=>preflightOrigin.verifyTrainingPreflight(
    preflight,
    preflightEvidenceSha256,
  ))){
    return invalid(
      ['EXPERT_WORKSPACE_PREFLIGHT_ORIGIN_UNVERIFIED'],
      preflightValues,
    );
  }

  let inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1;
  let inventorySha256:string;
  try{
    inventory=normalizeHsmeAdapterMoeExpertWorkspaceInventoryV1(rawInventory);
    inventorySha256=await hsmeAdapterMoeExpertWorkspaceInventoryV1Digest(
      inventory,
      hash,
    );
  }catch{
    return invalid(
      ['EXPERT_WORKSPACE_INVENTORY_INVALID'],
      preflightValues,
    );
  }
  const common={...preflightValues,inventorySha256};
  if(
    !HEX64.test(expectedInventorySha256)
    ||inventorySha256!==expectedInventorySha256
  ){
    return invalid(
      ['EXPERT_WORKSPACE_INVENTORY_DIGEST_MISMATCH'],
      common,
    );
  }
  if(!await verify(()=>inventoryOrigin.verifyWorkspaceInventory(
    inventory,
    inventorySha256,
  ))){
    return invalid(
      ['EXPERT_WORKSPACE_INVENTORY_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  let workspace:HsmeAdapterMoeExpertSealedWorkspaceV1;
  let workspaceSha256:string;
  try{
    workspace=deriveHsmeAdapterMoeExpertSealedWorkspaceV1(
      preflight,
      inventory,
    );
    workspaceSha256=await hsmeAdapterMoeExpertSealedWorkspaceV1Digest(
      workspace,
      hash,
    );
  }catch{
    return invalid(
      ['EXPERT_WORKSPACE_INVENTORY_PREFLIGHT_BINDING_INVALID'],
      common,
    );
  }

  const fixedPaths=fixedPaths();
  const request=deepFreeze({
    workspace,
    workspaceSha256,
    inventory,
    inventorySha256,
    fixedPaths,
  });

  let rawResult:unknown;
  try{
    rawResult=await host.materializeExactExpertWorkspace(request);
  }catch{
    return blocked(
      ['EXPERT_WORKSPACE_PROTECTED_HOST_FAILED'],
      {...common,workspaceSha256},
    );
  }

  let result:CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1;
  let hostResultSha256:string;
  try{
    result=normalizeCoreHsmeAdapterMoeExpertWorkspaceResultV1(rawResult);
    hostResultSha256=await coreHsmeAdapterMoeExpertWorkspaceResultV1Digest(
      result,
      hash,
    );
  }catch{
    return invalid(
      ['EXPERT_WORKSPACE_HOST_RESULT_INVALID'],
      {...common,workspaceSha256},
    );
  }
  const resultValues={
    ...common,
    workspaceSha256,
    fixedPaths,
    workspaceManifestFileSha256:result.workspaceManifestFileSha256,
    workspaceManifestBytes:result.workspaceManifestBytes,
    inputFiles:result.inputFiles,
    materializationAttemptId:result.materializationAttemptId,
    hostResultSha256,
  };
  if(hostResultSha256!==result.hostResultSha256){
    return invalid(
      ['EXPERT_WORKSPACE_HOST_RESULT_REHASH_MISMATCH'],
      resultValues,
    );
  }
  if(!await verify(()=>resultOrigin.verifyWorkspaceResult(
    result,
    hostResultSha256,
  ))){
    return invalid(
      ['EXPERT_WORKSPACE_HOST_RESULT_ORIGIN_UNVERIFIED'],
      resultValues,
    );
  }

  if(
    result.workspaceSha256!==workspaceSha256
    ||result.inventorySha256!==inventorySha256
    ||!sameFixedPaths(result.fixedPaths,fixedPaths)
    ||result.processSpawned!==false
    ||result.trainingStarted!==false
  ){
    return invalid(
      ['EXPERT_WORKSPACE_HOST_RESULT_BINDING_MISMATCH'],
      resultValues,
    );
  }
  if(!sameMaterializedInputs(result.inputFiles,workspace.inputs)){
    return invalid(
      ['EXPERT_WORKSPACE_HOST_INPUT_ATTESTATION_MISMATCH'],
      resultValues,
    );
  }

  const payload={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
    state:'EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([] as string[]),
    preflightEvidenceSha256,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    expertId:preflight.expertId,
    workspaceSha256,
    inventorySha256,
    fixedPaths,
    workspaceManifestFileSha256:result.workspaceManifestFileSha256,
    workspaceManifestBytes:result.workspaceManifestBytes,
    inputFiles:result.inputFiles,
    materializationAttemptId:result.materializationAttemptId,
    hostResultSha256,
    processSpawned:false as const,
    trainingStarted:false as const,
    ...authorityBoundary(),
  };
  const receiptEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,receiptEvidenceSha256});
}

export function normalizeCoreHsmeAdapterMoeExpertWorkspaceResultV1(
  raw:unknown,
):CoreHsmeAdapterMoeExpertWorkspaceMaterializationResultV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'state',
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
    'workspaceMaterializationAllowed',
    'trainingExecutionAllowed',
    'prototypeAssemblyAllowed',
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
  ],'hostResult');

  if(record.schemaVersion!==CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_V1_SCHEMA){
    fail(
      'hsme_adapter_moe_workspace_host_schema',
      'host result schema unsupported',
    );
  }
  if(record.state!=='EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED'){
    fail(
      'hsme_adapter_moe_workspace_host_state',
      'host result state unsupported',
    );
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
    fail(
      'hsme_adapter_moe_workspace_host_isolation',
      'host result isolation flags are invalid',
    );
  }
  assertNoAuthority(record,'hostResult');

  const fixed=normalizeFixedPaths(record.fixedPaths,'hostResult.fixedPaths');
  if(!Array.isArray(record.inputFiles)){
    fail(
      'hsme_adapter_moe_workspace_host_inputs',
      'host result inputFiles must be an array',
    );
  }
  const inputFiles=record.inputFiles
    .map((value,index)=>normalizeMaterializedInput(
      value,
      'hostResult.inputFiles['+index+']',
    ))
    .sort(compareRoleValues);
  if(
    inputFiles.length!==HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1.length
    ||new Set(inputFiles.map(value=>value.role)).size!==inputFiles.length
  ){
    fail(
      'hsme_adapter_moe_workspace_host_inputs',
      'host result inputFiles must exactly cover fixed roles',
    );
  }

  return deepFreeze({
    schemaVersion:CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_V1_SCHEMA,
    state:'EXPERT_WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED',
    workspaceSha256:sha256(record.workspaceSha256,'hostResult.workspaceSha256'),
    inventorySha256:sha256(record.inventorySha256,'hostResult.inventorySha256'),
    fixedPaths:fixed,
    workspaceManifestFileSha256:sha256(
      record.workspaceManifestFileSha256,
      'hostResult.workspaceManifestFileSha256',
    ),
    workspaceManifestBytes:safeInteger(
      record.workspaceManifestBytes,
      'hostResult.workspaceManifestBytes',
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
      'hostResult.materializationAttemptId',
      180,
    ),
    processSpawned:false,
    trainingStarted:false,
    ...authorityBoundary(),
    hostResultSha256:sha256(
      record.hostResultSha256,
      'hostResult.hostResultSha256',
    ),
  });
}

export async function coreHsmeAdapterMoeExpertWorkspaceResultV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=normalizeCoreHsmeAdapterMoeExpertWorkspaceResultV1(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(
    CORE_HSME_ADAPTER_MOE_EXPERT_WORKSPACE_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest(
  receipt:HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    receipt.state!=='EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED'
    ||receipt.receiptEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_adapter_moe_workspace_receipt_digest_state',
      'only frozen workspace receipts are digestible',
    );
  }
  const {receiptEvidenceSha256:_ignored,...payload}=receipt;
  return digest(
    HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
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
    'readOnly',
  ],path);
  if(record.readOnly!==true){
    fail(
      'hsme_adapter_moe_workspace_inventory_readonly',
      path+'.readOnly must be true',
    );
  }
  return deepFreeze({
    role:enumValue(
      record.role,
      HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1,
      path+'.role',
    ),
    sourceContentSha256:sha256(
      record.sourceContentSha256,
      path+'.sourceContentSha256',
    ),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    immutableSourceAuthorityId:identifier(
      record.immutableSourceAuthorityId,
      path+'.immutableSourceAuthorityId',
      180,
    ),
    sourceObjectSha256:sha256(
      record.sourceObjectSha256,
      path+'.sourceObjectSha256',
    ),
    readOnly:true,
  });
}

function normalizeMaterializedInput(
  raw:unknown,
  path:string,
):CoreHsmeAdapterMoeExpertMaterializedInputV1{
  const record=exactRecord(raw,[
    'role',
    'relativePath',
    'contentSha256',
    'bytes',
    'readOnly',
    'symlink',
  ],path);
  const role=enumValue(
    record.role,
    HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1,
    path+'.role',
  );
  if(
    record.relativePath!==relativePathForRole(role)
    ||record.readOnly!==true
    ||record.symlink!==false
  ){
    fail(
      'hsme_adapter_moe_workspace_host_input_shape',
      path+' fixed path/read-only/symlink contract invalid',
    );
  }
  return deepFreeze({
    role,
    relativePath:relativePathForRole(role),
    contentSha256:sha256(record.contentSha256,path+'.contentSha256'),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    readOnly:true,
    symlink:false,
  });
}

function validateInventoryContentBinding(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1&ReadyPreflight,
  inventory:HsmeAdapterMoeExpertWorkspaceInventoryV1,
):void{
  const expected:Record<HsmeAdapterMoeExpertWorkspaceInputRoleV1,string>={
    DENSE_BASELINE_ARTIFACT:preflight.denseBaselineContentSha256,
    TRAINING_CORPUS_BUNDLE:preflight.trainingCorpusRootSha256,
    TARGET_MODULE_SET:preflight.targetModuleSetSha256,
    ADAPTER_CONFIG:preflight.adapterConfigSha256,
    REPRODUCTION_CONTRACT:preflight.reproductionContractSha256,
    IMMUTABLE_ENVIRONMENT_MANIFEST:preflight.immutableEnvironmentSha256,
    TRAINING_TOOLCHAIN:preflight.trainingToolchainSha256,
    TRAINER_ENTRYPOINT:preflight.trainerEntrypointSha256,
  };
  for(const entry of inventory.entries){
    if(entry.sourceContentSha256!==expected[entry.role]){
      fail(
        'hsme_adapter_moe_workspace_inventory_content_binding',
        entry.role+' source digest differs from exact preflight binding',
      );
    }
  }
}

function relativePathForRole(
  role:HsmeAdapterMoeExpertWorkspaceInputRoleV1,
):string{
  switch(role){
    case 'DENSE_BASELINE_ARTIFACT':
      return 'baseline/dense-baseline.safetensors';
    case 'TRAINING_CORPUS_BUNDLE':
      return 'corpus/training-corpus.bundle';
    case 'TARGET_MODULE_SET':
      return 'config/target-modules.json';
    case 'ADAPTER_CONFIG':
      return 'config/adapter-config.json';
    case 'REPRODUCTION_CONTRACT':
      return 'contracts/reproduction.json';
    case 'IMMUTABLE_ENVIRONMENT_MANIFEST':
      return 'environment/environment.manifest.json';
    case 'TRAINING_TOOLCHAIN':
      return 'toolchain/training-toolchain.lock';
    case 'TRAINER_ENTRYPOINT':
      return 'toolchain/trainer.entrypoint';
  }
  const exhaustive:never=role;
  return exhaustive;
}

function fixedPaths():HsmeAdapterMoeExpertWorkspaceFixedPathsV1{
  return Object.freeze({
    workspaceRoot:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1,
    manifestPath:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1,
    outputRoot:HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1,
  });
}

function normalizeFixedPaths(
  raw:unknown,
  path:string,
):HsmeAdapterMoeExpertWorkspaceFixedPathsV1{
  const record=exactRecord(raw,[
    'workspaceRoot',
    'manifestPath',
    'inputsRoot',
    'outputRoot',
  ],path);
  if(
    record.workspaceRoot!==HSME_ADAPTER_MOE_EXPERT_WORKSPACE_ROOT_V1
    ||record.manifestPath!==HSME_ADAPTER_MOE_EXPERT_WORKSPACE_MANIFEST_V1
    ||record.inputsRoot!==HSME_ADAPTER_MOE_EXPERT_INPUTS_ROOT_V1
    ||record.outputRoot!==HSME_ADAPTER_MOE_EXPERT_OUTPUT_ROOT_V1
  ){
    fail(
      'hsme_adapter_moe_workspace_fixed_paths',
      path+' differs from fixed HSME expert workspace roots',
    );
  }
  return fixedPaths();
}

function sameFixedPaths(
  left:HsmeAdapterMoeExpertWorkspaceFixedPathsV1,
  right:HsmeAdapterMoeExpertWorkspaceFixedPathsV1,
):boolean{
  return left.workspaceRoot===right.workspaceRoot
    &&left.manifestPath===right.manifestPath
    &&left.inputsRoot===right.inputsRoot
    &&left.outputRoot===right.outputRoot;
}

function sameMaterializedInputs(
  actual:readonly CoreHsmeAdapterMoeExpertMaterializedInputV1[],
  expected:readonly HsmeAdapterMoeExpertSealedWorkspaceInputV1[],
):boolean{
  if(actual.length!==expected.length){
    return false;
  }
  const sortedExpected=[...expected].sort(compareRoleValues);
  for(let index=0;index<actual.length;index+=1){
    const left=actual[index];
    const right=sortedExpected[index];
    if(
      left.role!==right.role
      ||left.relativePath!==right.relativePath
      ||left.contentSha256!==right.contentSha256
      ||left.bytes!==right.bytes
      ||left.readOnly!==true
      ||left.symlink!==false
    ){
      return false;
    }
  }
  return true;
}

type ReadyPreflight=Readonly<{
  experimentPlanSha256:string;
  trainingSpecSha256:string;
  experimentId:string;
  expertId:string;
  denseBaselineContentSha256:string;
  targetModuleSetSha256:string;
  adapterConfigSha256:string;
  trainingCorpusRootSha256:string;
  reproductionContractSha256:string;
  immutableEnvironmentSha256:string;
  trainingToolchainSha256:string;
  trainerEntrypointSha256:string;
  resourceCeilings:HsmeAdapterMoeExpertTrainingResourceCeilingsV1;
  preflightEvidenceSha256:string;
}>;

function validReadyPreflightBoundary(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
):preflight is HsmeAdapterMoeExpertTrainingPreflightV1&ReadyPreflight{
  return preflight.state===
      'ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    &&preflight.blockers.length===0
    &&preflight.experimentPlanSha256!=='UNKNOWN'
    &&preflight.trainingSpecSha256!=='UNKNOWN'
    &&preflight.experimentId!=='UNKNOWN'
    &&preflight.expertId!=='UNKNOWN'
    &&preflight.denseBaselineContentSha256!=='UNKNOWN'
    &&preflight.targetModuleSetSha256!=='UNKNOWN'
    &&preflight.adapterConfigSha256!=='UNKNOWN'
    &&preflight.trainingCorpusRootSha256!=='UNKNOWN'
    &&preflight.reproductionContractSha256!=='UNKNOWN'
    &&preflight.immutableEnvironmentSha256!=='UNKNOWN'
    &&preflight.trainingToolchainSha256!=='UNKNOWN'
    &&preflight.trainerEntrypointSha256!=='UNKNOWN'
    &&preflight.resourceCeilings!==null
    &&preflight.preflightEvidenceSha256!=='UNKNOWN'
    &&preflight.trainingExecutionAllowed===false
    &&preflight.workspaceMaterializationAllowed===false
    &&preflight.prototypeAssemblyAllowed===false
    &&preflight.modelInstallAllowed===false
    &&preflight.modelFleetPromotionAllowed===false
    &&preflight.durableModelFleetPromotionAllowed===false
    &&preflight.productionAuthorityGranted===false
    &&preflight.providerAuthorityGranted===false
    &&preflight.billingAuthorityGranted===false
    &&preflight.projectArtifactMutationAllowed===false
    &&preflight.aeeExecutionAuthorityGranted===false
    &&preflight.winnerSelectionAllowed===false;
}

type PartialOutput=Partial<Pick<
  HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
  'preflightEvidenceSha256'
  |'experimentPlanSha256'
  |'trainingSpecSha256'
  |'expertId'
  |'workspaceSha256'
  |'inventorySha256'
  |'fixedPaths'
  |'workspaceManifestFileSha256'
  |'workspaceManifestBytes'
  |'inputFiles'
  |'materializationAttemptId'
  |'hostResultSha256'
>>;

function valuesFromPreflight(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1&ReadyPreflight,
  preflightEvidenceSha256:string,
):PartialOutput{
  return {
    preflightEvidenceSha256,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    expertId:preflight.expertId,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1{
  return terminal('EXPERT_WORKSPACE_FREEZE_BLOCKED',blockers,values);
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1{
  return terminal('EXPERT_WORKSPACE_FREEZE_INVALID',blockers,values);
}

function terminal(
  state:'EXPERT_WORKSPACE_FREEZE_INVALID'|'EXPERT_WORKSPACE_FREEZE_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    preflightEvidenceSha256:values.preflightEvidenceSha256??'UNKNOWN',
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    trainingSpecSha256:values.trainingSpecSha256??'UNKNOWN',
    expertId:values.expertId??'UNKNOWN',
    workspaceSha256:values.workspaceSha256??'UNKNOWN',
    inventorySha256:values.inventorySha256??'UNKNOWN',
    fixedPaths:values.fixedPaths??null,
    workspaceManifestFileSha256:
      values.workspaceManifestFileSha256??'UNKNOWN',
    workspaceManifestBytes:values.workspaceManifestBytes??'UNKNOWN',
    inputFiles:values.inputFiles??Object.freeze([]),
    materializationAttemptId:values.materializationAttemptId??'UNKNOWN',
    hostResultSha256:values.hostResultSha256??'UNKNOWN',
    processSpawned:false,
    trainingStarted:false,
    ...authorityBoundary(),
    receiptEvidenceSha256:'UNKNOWN',
  });
}

function assertNoProcessOrAuthority(
  record:Record<string,unknown>,
  path:string,
):void{
  if(record.processSpawned!==false||record.trainingStarted!==false){
    fail(
      'hsme_adapter_moe_workspace_process_state',
      path+' cannot claim process/training start',
    );
  }
  assertNoAuthority(record,path);
}

function assertNoAuthority(
  record:Record<string,unknown>,
  path:string,
):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_adapter_moe_workspace_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function authorityBoundary(){
  return Object.freeze({
    workspaceMaterializationAllowed:false as const,
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

function compareRoleValues(
  left:{role:HsmeAdapterMoeExpertWorkspaceInputRoleV1},
  right:{role:HsmeAdapterMoeExpertWorkspaceInputRoleV1},
):number{
  return HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1.indexOf(left.role)
    -HSME_ADAPTER_MOE_EXPERT_WORKSPACE_INPUT_ROLES_V1.indexOf(right.role);
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
    fail(
      'hsme_adapter_moe_workspace_schema',
      path+' contains unknown or missing fields',
    );
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
    fail(
      'hsme_adapter_moe_workspace_value',
      path+' must be lowercase SHA-256',
    );
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
    fail(
      'hsme_adapter_moe_workspace_value',
      path+' must be a bounded safe integer',
    );
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
    fail(
      'hsme_adapter_moe_workspace_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function lexical(left:string,right:string):number{
  return left<right?-1:left>right?1:0;
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
  throw new HsmeAdapterMoeExpertWorkspaceMaterializationV1Error(code,message);
}
