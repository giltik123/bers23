import type {
  CoreHsmeDenseStudentExecutionRequestV1,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';
import {
  HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
  HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1,
  HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1,
  assertCoreHsmeDenseStudentExecutionRequestMatchesSealedWorkspaceV1,
  hsmeDenseStudentSealedWorkspaceV1Digest,
  normalizeHsmeDenseStudentSealedWorkspaceV1,
  type HsmeDenseStudentSealedWorkspaceInputRoleV1,
  type HsmeDenseStudentSealedWorkspaceV1,
} from './HsmeDenseStudentSealedWorkspaceV1.ts';
import type {
  HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_V1' as const;
export const HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_DIGEST_DOMAIN =
  'bers:hsme:dense-student-workspace-input-inventory:v1\0' as const;

export const CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_V1' as const;
export const CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:dense-student-workspace-materialization-result:v1\0' as const;

export const HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1' as const;
export const HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:dense-student-workspace-freeze-receipt:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const SAFE_RELATIVE_SEGMENT=/^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type HsmeDenseStudentWorkspaceInventoryEntryV1=Readonly<{
  role:HsmeDenseStudentSealedWorkspaceInputRoleV1;
  sourceContentSha256:string;
  bytes:number;
  immutableSourceAuthorityId:string;
  sourceObjectSha256:string;
  destinationRelativePath:string;
  readOnly:true;
}>;

export type HsmeDenseStudentWorkspaceInputInventoryV1=Readonly<{
  schemaVersion:
    typeof HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_V1_SCHEMA;
  launchSpecSha256:string;
  candidateId:string;
  teacherDecisionSha256:string;
  reproductionEvidenceSha256:string;
  corpusRootDigest:string;
  recipeDigest:string;
  inputCheckpointSha256:string;
  resumeCheckpointSha256:string|'NONE';
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
  entries:readonly HsmeDenseStudentWorkspaceInventoryEntryV1[];
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

export interface HsmeDenseStudentWorkspaceInputInventoryOriginVerifierV1{
  verifyInputInventory(
    inventory:HsmeDenseStudentWorkspaceInputInventoryV1,
    expectedInventorySha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentWorkspaceFixedPathsV1=Readonly<{
  workspaceRoot:typeof HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1;
  manifestPath:typeof HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1;
  inputsRoot:typeof HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1;
  outputRoot:typeof HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1;
}>;

export type CoreHsmeDenseStudentWorkspaceMaterializationRequestV1=Readonly<{
  executionRequest:CoreHsmeDenseStudentExecutionRequestV1;
  workspace:HsmeDenseStudentSealedWorkspaceV1;
  workspaceSha256:string;
  inventory:HsmeDenseStudentWorkspaceInputInventoryV1;
  inventorySha256:string;
  fixedPaths:HsmeDenseStudentWorkspaceFixedPathsV1;
}>;

export interface CoreHsmeDenseStudentWorkspaceMaterializationPortV1{
  materializeExactSealedWorkspace(
    request:CoreHsmeDenseStudentWorkspaceMaterializationRequestV1,
  ):Promise<unknown>;
}

export type CoreHsmeDenseStudentWorkspaceMaterializedInputV1=Readonly<{
  role:HsmeDenseStudentSealedWorkspaceInputRoleV1;
  relativePath:string;
  contentSha256:string;
  bytes:number;
  readOnly:true;
  symlink:false;
}>;

export type CoreHsmeDenseStudentWorkspaceMaterializationResultV1=Readonly<{
  schemaVersion:
    typeof CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA;
  state:'WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED';
  workspaceSha256:string;
  inventorySha256:string;
  fixedPaths:HsmeDenseStudentWorkspaceFixedPathsV1;
  workspaceManifestFileSha256:string;
  workspaceManifestBytes:number;
  inputFiles:readonly CoreHsmeDenseStudentWorkspaceMaterializedInputV1[];
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

export interface CoreHsmeDenseStudentWorkspaceMaterializationResultOriginVerifierV1{
  verifyMaterializationResult(
    result:CoreHsmeDenseStudentWorkspaceMaterializationResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentWorkspaceFreezeReceiptV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA;
  state:'WORKSPACE_FROZEN_NOT_EXECUTED';
  blockers:readonly [];
  launchSpecSha256:string;
  candidateId:string;
  workspaceSha256:string;
  inventorySha256:string;
  fixedPaths:HsmeDenseStudentWorkspaceFixedPathsV1;
  workspaceManifestFileSha256:string;
  workspaceManifestBytes:number;
  inputFiles:readonly CoreHsmeDenseStudentWorkspaceMaterializedInputV1[];
  inputsReadOnly:true;
  outputWritableOnly:true;
  networkDisabled:true;
  noSymlinks:true;
  atomicManifestWrite:true;
  materializationAttemptId:string;
  hostResultSha256:string;
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
  receiptEvidenceSha256:string;
}>;

export interface HsmeDenseStudentWorkspaceFreezeReceiptOriginVerifierV1{
  verifyFreezeReceipt(
    receipt:HsmeDenseStudentWorkspaceFreezeReceiptV1,
    expectedReceiptEvidenceSha256:string,
  ):Promise<boolean>;
}

export class HsmeDenseStudentSealedWorkspaceMaterializationV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentSealedWorkspaceMaterializationV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDenseStudentWorkspaceInputInventoryV1(
  raw:unknown,
):HsmeDenseStudentWorkspaceInputInventoryV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'launchSpecSha256',
    'candidateId',
    'teacherDecisionSha256',
    'reproductionEvidenceSha256',
    'corpusRootDigest',
    'recipeDigest',
    'inputCheckpointSha256',
    'resumeCheckpointSha256',
    'outputStagingAuthorityId',
    'outputStagingPolicySha256',
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

  if(
    record.schemaVersion!==
      HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_V1_SCHEMA
  ){
    fail('hsme_workspace_inventory_schema','inventory schema unsupported');
  }
  if(!Array.isArray(record.entries)||record.entries.length<3||record.entries.length>20000){
    fail('hsme_workspace_inventory_entries','inventory requires 3..20000 entries');
  }

  const entries=record.entries
    .map((value,index)=>normalizeInventoryEntry(
      value,
      'inventory.entries['+index+']',
    ))
    .sort(compareInventoryEntries);

  const paths=entries.map(value=>value.destinationRelativePath);
  if(new Set(paths).size!==paths.length){
    fail(
      'hsme_workspace_inventory_destination_duplicate',
      'inventory destination paths must be unique',
    );
  }

  const resumeCheckpointSha256=record.resumeCheckpointSha256==='NONE'
    ?'NONE' as const
    :sha256(
      record.resumeCheckpointSha256,
      'inventory.resumeCheckpointSha256',
    );

  assertInventoryRoleCardinality(entries,resumeCheckpointSha256);

  const inputCheckpointSha256=sha256(
    record.inputCheckpointSha256,
    'inventory.inputCheckpointSha256',
  );
  const inputCheckpoint=singleInventoryRole(entries,'INPUT_CHECKPOINT');
  if(inputCheckpoint.sourceContentSha256!==inputCheckpointSha256){
    fail(
      'hsme_workspace_inventory_input_checkpoint_binding',
      'INPUT_CHECKPOINT raw content digest differs from inventory identity',
    );
  }

  if(resumeCheckpointSha256!=='NONE'){
    const resume=singleInventoryRole(entries,'RESUME_CHECKPOINT');
    if(resume.sourceContentSha256!==resumeCheckpointSha256){
      fail(
        'hsme_workspace_inventory_resume_checkpoint_binding',
        'RESUME_CHECKPOINT raw content digest differs from inventory identity',
      );
    }
  }

  assertNoAuthority(record,'inventory');

  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_V1_SCHEMA,
    launchSpecSha256:sha256(
      record.launchSpecSha256,
      'inventory.launchSpecSha256',
    ),
    candidateId:identifier(record.candidateId,'inventory.candidateId',160),
    teacherDecisionSha256:sha256(
      record.teacherDecisionSha256,
      'inventory.teacherDecisionSha256',
    ),
    reproductionEvidenceSha256:sha256(
      record.reproductionEvidenceSha256,
      'inventory.reproductionEvidenceSha256',
    ),
    corpusRootDigest:sha256(
      record.corpusRootDigest,
      'inventory.corpusRootDigest',
    ),
    recipeDigest:sha256(record.recipeDigest,'inventory.recipeDigest'),
    inputCheckpointSha256,
    resumeCheckpointSha256,
    outputStagingAuthorityId:identifier(
      record.outputStagingAuthorityId,
      'inventory.outputStagingAuthorityId',
      160,
    ),
    outputStagingPolicySha256:sha256(
      record.outputStagingPolicySha256,
      'inventory.outputStagingPolicySha256',
    ),
    entries:Object.freeze(entries),
    ...authorityBoundary(),
  });
}

export async function hsmeDenseStudentWorkspaceInputInventoryV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const inventory=normalizeHsmeDenseStudentWorkspaceInputInventoryV1(raw);
  return digest(
    HSME_DENSE_STUDENT_WORKSPACE_INPUT_INVENTORY_DIGEST_DOMAIN,
    inventory,
    hash,
  );
}

export function deriveHsmeDenseStudentSealedWorkspaceFromInventoryV1(
  executionRequest:CoreHsmeDenseStudentExecutionRequestV1,
  inventory:HsmeDenseStudentWorkspaceInputInventoryV1,
):HsmeDenseStudentSealedWorkspaceV1{
  const rawWorkspace={
    schemaVersion:'BERS_HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1',
    launchSpecSha256:inventory.launchSpecSha256,
    repositoryCommitSha:executionRequest.repositoryCommitSha,
    immutableEnvironmentSha256:executionRequest.immutableEnvironmentSha256,
    candidateId:inventory.candidateId,
    teacherDecisionSha256:inventory.teacherDecisionSha256,
    reproductionEvidenceSha256:inventory.reproductionEvidenceSha256,
    corpusRootDigest:inventory.corpusRootDigest,
    recipeDigest:inventory.recipeDigest,
    inputCheckpointSha256:inventory.inputCheckpointSha256,
    resumeCheckpointSha256:inventory.resumeCheckpointSha256,
    outputStagingAuthorityId:inventory.outputStagingAuthorityId,
    outputStagingPolicySha256:inventory.outputStagingPolicySha256,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    inputs:inventory.entries.map(value=>({
      role:value.role,
      contentSha256:value.sourceContentSha256,
      relativePath:value.destinationRelativePath,
      bytes:value.bytes,
      readOnly:true,
    })),
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

  const workspace=normalizeHsmeDenseStudentSealedWorkspaceV1(rawWorkspace);
  return assertCoreHsmeDenseStudentExecutionRequestMatchesSealedWorkspaceV1(
    executionRequest,
    workspace,
  );
}

export async function materializeHsmeDenseStudentSealedWorkspaceV1(
  executionRequest:CoreHsmeDenseStudentExecutionRequestV1,
  rawInventory:unknown,
  expectedInventorySha256:string,
  inventoryOrigin:HsmeDenseStudentWorkspaceInputInventoryOriginVerifierV1,
  host:CoreHsmeDenseStudentWorkspaceMaterializationPortV1,
  resultOrigin:
    CoreHsmeDenseStudentWorkspaceMaterializationResultOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentWorkspaceFreezeReceiptV1>{
  if(!HEX64.test(expectedInventorySha256)){
    fail(
      'hsme_workspace_inventory_expected_digest',
      'expected inventory digest must be lowercase SHA-256',
    );
  }

  const inventory=normalizeHsmeDenseStudentWorkspaceInputInventoryV1(
    rawInventory,
  );
  const inventorySha256=await hsmeDenseStudentWorkspaceInputInventoryV1Digest(
    inventory,
    hash,
  );
  if(inventorySha256!==expectedInventorySha256){
    fail(
      'hsme_workspace_inventory_digest_mismatch',
      'inventory digest differs from externally expected digest',
    );
  }
  if(!await verify(
    ()=>inventoryOrigin.verifyInputInventory(inventory,inventorySha256),
  )){
    fail(
      'hsme_workspace_inventory_origin_unverified',
      'inventory origin is not externally trusted',
    );
  }

  const workspace=deriveHsmeDenseStudentSealedWorkspaceFromInventoryV1(
    executionRequest,
    inventory,
  );
  const workspaceSha256=await hsmeDenseStudentSealedWorkspaceV1Digest(
    workspace,
    hash,
  );
  const manifestBytes=workspaceManifestBytes(workspace);
  const workspaceManifestFileSha256=await rawDigest(manifestBytes,hash);
  const fixedPaths=fixedPathsV1();

  const request=deepFreeze({
    executionRequest,
    workspace,
    workspaceSha256,
    inventory,
    inventorySha256,
    fixedPaths,
  });

  let rawResult:unknown;
  try{
    rawResult=await host.materializeExactSealedWorkspace(request);
  }catch{
    fail(
      'hsme_workspace_materialization_host_failed',
      'protected workspace materializer failed',
    );
  }

  const result=normalizeCoreHsmeDenseStudentWorkspaceMaterializationResultV1(
    rawResult,
  );
  validateMaterializationResultBinding(
    result,
    workspace,
    workspaceSha256,
    inventorySha256,
    workspaceManifestFileSha256,
    manifestBytes.byteLength,
  );

  const hostResultSha256=
    await coreHsmeDenseStudentWorkspaceMaterializationResultV1Digest(
      result,
      hash,
    );
  if(hostResultSha256!==result.hostResultSha256){
    fail(
      'hsme_workspace_materialization_result_rehash_mismatch',
      'protected host materialization result digest mismatch',
    );
  }
  if(!await verify(
    ()=>resultOrigin.verifyMaterializationResult(result,hostResultSha256),
  )){
    fail(
      'hsme_workspace_materialization_result_origin_unverified',
      'protected host materialization result origin is unverified',
    );
  }

  const payload={
    schemaVersion:HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
    state:'WORKSPACE_FROZEN_NOT_EXECUTED' as const,
    blockers:Object.freeze([]) as readonly [],
    launchSpecSha256:inventory.launchSpecSha256,
    candidateId:inventory.candidateId,
    workspaceSha256,
    inventorySha256,
    fixedPaths,
    workspaceManifestFileSha256,
    workspaceManifestBytes:manifestBytes.byteLength,
    inputFiles:result.inputFiles,
    inputsReadOnly:true as const,
    outputWritableOnly:true as const,
    networkDisabled:true as const,
    noSymlinks:true as const,
    atomicManifestWrite:true as const,
    materializationAttemptId:result.materializationAttemptId,
    hostResultSha256,
    ...authorityBoundary(),
  };
  const receiptEvidenceSha256=await digest(
    HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,receiptEvidenceSha256});
}

export function normalizeCoreHsmeDenseStudentWorkspaceMaterializationResultV1(
  raw:unknown,
):CoreHsmeDenseStudentWorkspaceMaterializationResultV1{
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
  ],'materializationResult');

  if(
    record.schemaVersion!==
      CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA
    ||record.state!=='WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED'
  ){
    fail(
      'hsme_workspace_materialization_result_schema',
      'materialization result schema/state unsupported',
    );
  }

  const fixedPaths=normalizeFixedPaths(
    record.fixedPaths,
    'materializationResult.fixedPaths',
  );

  if(!Array.isArray(record.inputFiles)){
    fail(
      'hsme_workspace_materialization_result_files',
      'materialization result inputFiles must be an array',
    );
  }
  const inputFiles=record.inputFiles
    .map((value,index)=>normalizeMaterializedInput(
      value,
      'materializationResult.inputFiles['+index+']',
    ))
    .sort(compareMaterializedInputs);
  const paths=inputFiles.map(value=>value.relativePath);
  if(new Set(paths).size!==paths.length){
    fail(
      'hsme_workspace_materialization_result_file_duplicate',
      'materialization result contains duplicate input paths',
    );
  }

  if(
    record.inputsReadOnly!==true
    ||record.outputWritableOnly!==true
    ||record.networkDisabled!==true
    ||record.noSymlinks!==true
    ||record.atomicManifestWrite!==true
  ){
    fail(
      'hsme_workspace_materialization_result_isolation',
      'materialization result isolation/atomicity proof failed',
    );
  }

  assertNoAuthority(record,'materializationResult');

  return deepFreeze({
    schemaVersion:
      CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_V1_SCHEMA,
    state:'WORKSPACE_MATERIALIZATION_COMPLETED_NOT_EXECUTED',
    workspaceSha256:sha256(
      record.workspaceSha256,
      'materializationResult.workspaceSha256',
    ),
    inventorySha256:sha256(
      record.inventorySha256,
      'materializationResult.inventorySha256',
    ),
    fixedPaths,
    workspaceManifestFileSha256:sha256(
      record.workspaceManifestFileSha256,
      'materializationResult.workspaceManifestFileSha256',
    ),
    workspaceManifestBytes:safeInteger(
      record.workspaceManifestBytes,
      'materializationResult.workspaceManifestBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    inputFiles:Object.freeze(inputFiles),
    inputsReadOnly:true,
    outputWritableOnly:true,
    networkDisabled:true,
    noSymlinks:true,
    atomicManifestWrite:true,
    materializationAttemptId:identifier(
      record.materializationAttemptId,
      'materializationResult.materializationAttemptId',
      160,
    ),
    ...authorityBoundary(),
    hostResultSha256:sha256(
      record.hostResultSha256,
      'materializationResult.hostResultSha256',
    ),
  });
}

export async function coreHsmeDenseStudentWorkspaceMaterializationResultV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=normalizeCoreHsmeDenseStudentWorkspaceMaterializationResultV1(
    raw,
  );
  const {
    hostResultSha256:_ignored,
    ...payload
  }=result;
  return digest(
    CORE_HSME_DENSE_STUDENT_WORKSPACE_MATERIALIZATION_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function hsmeDenseStudentWorkspaceFreezeReceiptV1Digest(
  raw:HsmeDenseStudentWorkspaceFreezeReceiptV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    raw.schemaVersion!==HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA
    ||raw.state!=='WORKSPACE_FROZEN_NOT_EXECUTED'
    ||raw.blockers.length!==0
  ){
    fail(
      'hsme_workspace_freeze_receipt_state',
      'only ready frozen-not-executed receipts are digestible',
    );
  }
  const {receiptEvidenceSha256:_ignored,...payload}=raw;
  return digest(
    HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeInventoryEntry(
  raw:unknown,
  path:string,
):HsmeDenseStudentWorkspaceInventoryEntryV1{
  const record=exactRecord(raw,[
    'role',
    'sourceContentSha256',
    'bytes',
    'immutableSourceAuthorityId',
    'sourceObjectSha256',
    'destinationRelativePath',
    'readOnly',
  ],path);
  const role=enumValue(record.role,[
    'REPRODUCTION_FIXTURE_JSON',
    'TRAINING_RECIPE_JSON',
    'INPUT_CHECKPOINT',
    'RESUME_CHECKPOINT',
    'CORPUS_ASSET',
    'SYNTHETIC_TARGET',
  ] as const,path+'.role');
  if(record.readOnly!==true){
    fail('hsme_workspace_inventory_readonly',path+' must remain read-only');
  }
  return Object.freeze({
    role,
    sourceContentSha256:sha256(
      record.sourceContentSha256,
      path+'.sourceContentSha256',
    ),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    immutableSourceAuthorityId:immutableAuthorityId(
      record.immutableSourceAuthorityId,
      path+'.immutableSourceAuthorityId',
    ),
    sourceObjectSha256:sha256(
      record.sourceObjectSha256,
      path+'.sourceObjectSha256',
    ),
    destinationRelativePath:safeRelativePath(
      record.destinationRelativePath,
      path+'.destinationRelativePath',
    ),
    readOnly:true,
  });
}

function assertInventoryRoleCardinality(
  entries:readonly HsmeDenseStudentWorkspaceInventoryEntryV1[],
  resumeCheckpointSha256:string|'NONE',
):void{
  for(const role of [
    'REPRODUCTION_FIXTURE_JSON',
    'TRAINING_RECIPE_JSON',
    'INPUT_CHECKPOINT',
  ] as const){
    if(entries.filter(value=>value.role===role).length!==1){
      fail(
        'hsme_workspace_inventory_role_cardinality',
        role+' must occur exactly once',
      );
    }
  }
  const resumeCount=entries.filter(value=>value.role==='RESUME_CHECKPOINT').length;
  if(resumeCheckpointSha256==='NONE'){
    if(resumeCount!==0){
      fail(
        'hsme_workspace_inventory_resume_forbidden',
        'resume entry forbidden when resume digest is NONE',
      );
    }
  }else if(resumeCount!==1){
    fail(
      'hsme_workspace_inventory_resume_required',
      'exactly one resume entry is required',
    );
  }
}

function singleInventoryRole(
  entries:readonly HsmeDenseStudentWorkspaceInventoryEntryV1[],
  role:HsmeDenseStudentSealedWorkspaceInputRoleV1,
):HsmeDenseStudentWorkspaceInventoryEntryV1{
  const values=entries.filter(value=>value.role===role);
  if(values.length!==1){
    fail('hsme_workspace_inventory_role_cardinality',role+' cardinality invalid');
  }
  return values[0];
}

function validateMaterializationResultBinding(
  result:CoreHsmeDenseStudentWorkspaceMaterializationResultV1,
  workspace:HsmeDenseStudentSealedWorkspaceV1,
  workspaceSha256:string,
  inventorySha256:string,
  workspaceManifestFileSha256:string,
  workspaceManifestBytes:number,
):void{
  if(
    result.workspaceSha256!==workspaceSha256
    ||result.inventorySha256!==inventorySha256
    ||result.workspaceManifestFileSha256!==workspaceManifestFileSha256
    ||result.workspaceManifestBytes!==workspaceManifestBytes
  ){
    fail(
      'hsme_workspace_materialization_result_binding',
      'materialization result digest/manifest binding drift',
    );
  }
  if(JSON.stringify(result.fixedPaths)!==JSON.stringify(fixedPathsV1())){
    fail(
      'hsme_workspace_materialization_result_fixed_paths',
      'materialization result fixed paths drift',
    );
  }

  const expected=workspace.inputs.map(value=>({
    role:value.role,
    relativePath:value.relativePath,
    contentSha256:value.contentSha256,
    bytes:value.bytes,
    readOnly:true as const,
    symlink:false as const,
  })).sort(compareMaterializedInputs);

  if(JSON.stringify(result.inputFiles)!==JSON.stringify(expected)){
    fail(
      'hsme_workspace_materialization_result_file_roster',
      'materialized input file roster differs from derived workspace',
    );
  }
}

function normalizeMaterializedInput(
  raw:unknown,
  path:string,
):CoreHsmeDenseStudentWorkspaceMaterializedInputV1{
  const record=exactRecord(raw,[
    'role','relativePath','contentSha256','bytes','readOnly','symlink',
  ],path);
  const role=enumValue(record.role,[
    'REPRODUCTION_FIXTURE_JSON',
    'TRAINING_RECIPE_JSON',
    'INPUT_CHECKPOINT',
    'RESUME_CHECKPOINT',
    'CORPUS_ASSET',
    'SYNTHETIC_TARGET',
  ] as const,path+'.role');
  if(record.readOnly!==true||record.symlink!==false){
    fail(
      'hsme_workspace_materialization_result_file_policy',
      path+' must be read-only and not a symlink',
    );
  }
  return Object.freeze({
    role,
    relativePath:safeRelativePath(record.relativePath,path+'.relativePath'),
    contentSha256:sha256(record.contentSha256,path+'.contentSha256'),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    readOnly:true,
    symlink:false,
  });
}

function normalizeFixedPaths(
  raw:unknown,
  path:string,
):HsmeDenseStudentWorkspaceFixedPathsV1{
  const record=exactRecord(raw,[
    'workspaceRoot','manifestPath','inputsRoot','outputRoot',
  ],path);
  const expected=fixedPathsV1();
  for(const key of Object.keys(expected) as (keyof HsmeDenseStudentWorkspaceFixedPathsV1)[]){
    if(record[key]!==expected[key]){
      fail(
        'hsme_workspace_materialization_fixed_path',
        path+'.'+key+' differs from repository-owned ABI',
      );
    }
  }
  return expected;
}

function fixedPathsV1():HsmeDenseStudentWorkspaceFixedPathsV1{
  return Object.freeze({
    workspaceRoot:HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
    manifestPath:HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
    outputRoot:HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  });
}

function workspaceManifestBytes(
  workspace:HsmeDenseStudentSealedWorkspaceV1,
):Uint8Array{
  return new TextEncoder().encode(JSON.stringify(workspace,null,2)+'\n');
}

async function rawDigest(
  bytes:Uint8Array,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(bytes);
  if(!HEX64.test(result)){
    fail(
      'hsme_workspace_materialization_hash_port',
      'hash port returned invalid raw SHA-256',
    );
  }
  return result;
}

function immutableAuthorityId(raw:unknown,path:string):string{
  const value=identifier(raw,path,240);
  if(value.includes('://')||/(^|[/:@._-])(latest|master|main)(?=$|[/:@._-])/i.test(value)){
    fail(
      'hsme_workspace_inventory_source_authority',
      path+' must be immutable and non-networked',
    );
  }
  return value;
}

function safeRelativePath(raw:unknown,path:string):string{
  if(typeof raw!=='string'||raw.length<1||raw.length>400){
    fail('hsme_workspace_inventory_relative_path',path+' is invalid');
  }
  if(
    raw.startsWith('/')
    ||raw.includes('\\')
    ||raw.includes('//')
    ||raw.split('/').some(
      segment=>segment==='.'||segment==='..'||!SAFE_RELATIVE_SEGMENT.test(segment),
    )
  ){
    fail(
      'hsme_workspace_inventory_relative_path',
      path+' must remain below fixed inputs root',
    );
  }
  return raw;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_workspace_materialization_record',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail(
      'hsme_workspace_materialization_record',
      path+' has unknown or missing fields',
    );
  }
  return record;
}

function identifier(raw:unknown,path:string,max:number):string{
  if(
    typeof raw!=='string'
    ||raw.length<1
    ||raw.length>max
    ||raw.trim()!==raw
    ||!IDENTIFIER.test(raw)
  ){
    fail('hsme_workspace_materialization_identifier',path+' is invalid');
  }
  return raw;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail(
      'hsme_workspace_materialization_hash',
      path+' must be lowercase SHA-256',
    );
  }
  return raw;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||Number(raw)<min||Number(raw)>max){
    fail('hsme_workspace_materialization_integer',path+' is out of bounds');
  }
  return Number(raw);
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_workspace_materialization_enum',path+' is unsupported');
  }
  return raw as T[number];
}

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
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
    if(record[field]!==false){
      fail(
        'hsme_workspace_materialization_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function authorityBoundary(){
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

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_workspace_materialization_hash_port',
      'hash port returned invalid SHA-256',
    );
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function compareInventoryEntries(
  a:HsmeDenseStudentWorkspaceInventoryEntryV1,
  b:HsmeDenseStudentWorkspaceInventoryEntryV1,
):number{
  return lexical(a.role,b.role)
    ||lexical(a.destinationRelativePath,b.destinationRelativePath)
    ||lexical(a.sourceObjectSha256,b.sourceObjectSha256);
}

function compareMaterializedInputs(
  a:CoreHsmeDenseStudentWorkspaceMaterializedInputV1,
  b:CoreHsmeDenseStudentWorkspaceMaterializedInputV1,
):number{
  return lexical(a.role,b.role)||lexical(a.relativePath,b.relativePath);
}

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

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
  throw new HsmeDenseStudentSealedWorkspaceMaterializationV1Error(
    code,
    message,
  );
}
