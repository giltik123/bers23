import {
  HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeAdapterMoeExpertTrainingPreflightV1Digest,
  type HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1,
  type HsmeAdapterMoeExpertTrainingPreflightV1,
  type HsmeAdapterMoeExpertTrainingResourceCeilingsV1,
} from './HsmeAdapterMoeExpertTrainingPreflightV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
  HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
  HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
  hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest,
  type HsmeAdapterMoeExpertWorkspaceFixedPathsV1,
  type HsmeAdapterMoeExpertWorkspaceFreezeReceiptOriginVerifierV1,
  type HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
} from './HsmeAdapterMoeExpertSealedWorkspaceV1.ts';
import {
  HSME_ADAPTER_MOE_EXPERT_ADAPTER_KINDS_V1,
  type HsmeAdapterMoeExpertAdapterKindV1,
} from './HsmeAdapterMoeExpertPackSetV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_REQUEST_V1_SCHEMA =
  'BERS_CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_REQUEST_V1' as const;
export const CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_V1' as const;
export const CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:adapter-moe-expert-training-result:v1\0' as const;
export const HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA =
  'BERS_HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1' as const;
export const HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:adapter-moe-expert-training-run-receipt:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type CoreHsmeAdapterMoeExpertTrainingRequestV1=Readonly<{
  schemaVersion:typeof CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_REQUEST_V1_SCHEMA;
  preflightEvidenceSha256:string;
  workspaceFreezeReceiptSha256:string;
  workspaceSha256:string;
  inventorySha256:string;
  experimentPlanSha256:string;
  trainingSpecSha256:string;
  expertId:string;
  specialistHypothesis:string;
  adapterKind:HsmeAdapterMoeExpertAdapterKindV1;
  denseBaselineDecisionSha256:string;
  denseBaselineContentSha256:string;
  targetModuleSetSha256:string;
  adapterConfigSha256:string;
  trainingCorpusRootSha256:string;
  reproductionContractSha256:string;
  immutableEnvironmentSha256:string;
  trainingToolchainSha256:string;
  trainerEntrypointSha256:string;
  resourceCeilings:HsmeAdapterMoeExpertTrainingResourceCeilingsV1;
  fixedPaths:HsmeAdapterMoeExpertWorkspaceFixedPathsV1;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
  outputPolicy:'STAGED_EXPERT_DELTA_ONLY';
}>;

export type CoreHsmeAdapterMoeStagedExpertDeltaV1=Readonly<{
  expertId:string;
  adapterKind:HsmeAdapterMoeExpertAdapterKindV1;
  denseBaselineContentSha256:string;
  targetModuleSetSha256:string;
  adapterConfigSha256:string;
  artifactSha256:string;
  artifactBytes:number;
  trainableParameters:number;
  artifactMetadataSha256:string;
  trainingSpecSha256:string;
  reproductionContractSha256:string;
  stagedDeltaPath:typeof HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1;
  stagedMetadataPath:typeof HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1;
}>;

export type CoreHsmeAdapterMoeExpertTrainingResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_V1_SCHEMA;
  state:
    |'EXPERT_TRAINING_ATTEMPT_FAILED_TO_START'
    |'EXPERT_TRAINING_ATTEMPT_PROCESS_COMPLETED';
  preflightEvidenceSha256:string;
  workspaceFreezeReceiptSha256:string;
  workspaceSha256:string;
  executionAttemptId:string;
  startedAtMs:number;
  finishedAtMs:number;
  exitCode:number|'NOT_STARTED';
  processSpawned:boolean;
  trainingStarted:boolean;
  consumedTrainingExamples:number;
  consumedGpuSeconds:number;
  consumedTrainingCostMicrousd:number;
  stdoutEvidenceSha256:string;
  stderrEvidenceSha256:string;
  stagedExpertDelta:CoreHsmeAdapterMoeStagedExpertDeltaV1|null;
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

export interface CoreHsmeAdapterMoeExpertTrainingPortV1{
  executeExactExpertTraining(
    request:CoreHsmeAdapterMoeExpertTrainingRequestV1,
  ):Promise<unknown>;
}

export interface CoreHsmeAdapterMoeExpertTrainingResultOriginVerifierV1{
  verifyExpertTrainingResult(
    result:CoreHsmeAdapterMoeExpertTrainingResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeAdapterMoeExpertTrainingRunReceiptV1=Readonly<{
  schemaVersion:typeof HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA;
  state:
    |'EXPERT_TRAINING_RUN_INVALID'
    |'EXPERT_TRAINING_RUN_FAILED'
    |'EXPERT_TRAINING_RUN_COMPLETED_DELTA_STAGED_NOT_PACKED';
  blockers:readonly string[];
  preflightEvidenceSha256:string|'UNKNOWN';
  workspaceFreezeReceiptSha256:string|'UNKNOWN';
  workspaceSha256:string|'UNKNOWN';
  inventorySha256:string|'UNKNOWN';
  experimentPlanSha256:string|'UNKNOWN';
  trainingSpecSha256:string|'UNKNOWN';
  expertId:string|'UNKNOWN';
  specialistHypothesis:string|'UNKNOWN';
  adapterKind:HsmeAdapterMoeExpertAdapterKindV1|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  startedAtMs:number|'UNKNOWN';
  finishedAtMs:number|'UNKNOWN';
  exitCode:number|'NOT_STARTED'|'UNKNOWN';
  processSpawned:boolean;
  trainingStarted:boolean;
  consumedTrainingExamples:number|'UNKNOWN';
  consumedGpuSeconds:number|'UNKNOWN';
  consumedTrainingCostMicrousd:number|'UNKNOWN';
  stdoutEvidenceSha256:string|'UNKNOWN';
  stderrEvidenceSha256:string|'UNKNOWN';
  stagedExpertDelta:CoreHsmeAdapterMoeStagedExpertDeltaV1|null;
  hostResultSha256:string|'UNKNOWN';
  receiptEvidenceSha256:string|'UNKNOWN';
  expertPackAdmissionAllowed:false;
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

export interface HsmeAdapterMoeExpertTrainingRunReceiptOriginVerifierV1{
  verifyTrainingRunReceipt(
    receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
    expectedReceiptEvidenceSha256:string,
  ):Promise<boolean>;
}

export class HsmeAdapterMoeExpertProtectedTrainingRunV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeAdapterMoeExpertProtectedTrainingRunV1Error';
    this.code=code;
  }
}

export async function runHsmeAdapterMoeExpertProtectedTrainingV1(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  expectedPreflightSha256:string,
  preflightOrigin:HsmeAdapterMoeExpertTrainingPreflightOriginVerifierV1,
  workspaceReceipt:HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
  expectedWorkspaceReceiptSha256:string,
  workspaceOrigin:HsmeAdapterMoeExpertWorkspaceFreezeReceiptOriginVerifierV1,
  executor:CoreHsmeAdapterMoeExpertTrainingPortV1,
  resultOrigin:CoreHsmeAdapterMoeExpertTrainingResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeAdapterMoeExpertTrainingRunReceiptV1>{
  if(!isReadyPreflight(preflight)){
    return blocked(['EXPERT_TRAINING_RUN_READY_PREFLIGHT_REQUIRED']);
  }
  if(!isFrozenWorkspaceReceipt(workspaceReceipt)){
    return blocked(['EXPERT_TRAINING_RUN_FROZEN_WORKSPACE_REQUIRED'],{
      preflightEvidenceSha256:preflight.preflightEvidenceSha256,
    });
  }

  let preflightEvidenceSha256:string;
  try{
    preflightEvidenceSha256=
      await hsmeAdapterMoeExpertTrainingPreflightV1Digest(preflight,hash);
  }catch{
    return invalid(['EXPERT_TRAINING_RUN_PREFLIGHT_REHASH_INVALID']);
  }
  if(
    !HEX64.test(expectedPreflightSha256)
    ||preflightEvidenceSha256!==expectedPreflightSha256
    ||preflightEvidenceSha256!==preflight.preflightEvidenceSha256
  ){
    return invalid(['EXPERT_TRAINING_RUN_PREFLIGHT_REHASH_MISMATCH'],{
      preflightEvidenceSha256,
    });
  }
  if(!await verify(
    ()=>preflightOrigin.verifyTrainingPreflight(
      preflight,
      preflightEvidenceSha256,
    ),
  )){
    return invalid(['EXPERT_TRAINING_RUN_PREFLIGHT_ORIGIN_UNVERIFIED'],{
      preflightEvidenceSha256,
    });
  }

  let workspaceFreezeReceiptSha256:string;
  try{
    workspaceFreezeReceiptSha256=
      await hsmeAdapterMoeExpertWorkspaceFreezeReceiptV1Digest(
        workspaceReceipt,
        hash,
      );
  }catch{
    return invalid(['EXPERT_TRAINING_RUN_WORKSPACE_RECEIPT_REHASH_INVALID'],{
      preflightEvidenceSha256,
    });
  }
  const common=commonValues(
    preflight,
    preflightEvidenceSha256,
    workspaceReceipt,
    workspaceFreezeReceiptSha256,
  );
  if(
    !HEX64.test(expectedWorkspaceReceiptSha256)
    ||workspaceFreezeReceiptSha256!==expectedWorkspaceReceiptSha256
    ||workspaceFreezeReceiptSha256!==workspaceReceipt.receiptEvidenceSha256
  ){
    return invalid(
      ['EXPERT_TRAINING_RUN_WORKSPACE_RECEIPT_REHASH_MISMATCH'],
      common,
    );
  }
  if(!await verify(
    ()=>workspaceOrigin.verifyWorkspaceFreezeReceipt(
      workspaceReceipt,
      workspaceFreezeReceiptSha256,
    ),
  )){
    return invalid(
      ['EXPERT_TRAINING_RUN_WORKSPACE_RECEIPT_ORIGIN_UNVERIFIED'],
      common,
    );
  }
  if(
    workspaceReceipt.preflightEvidenceSha256!==preflightEvidenceSha256
    ||workspaceReceipt.expertId!==preflight.expertId
    ||workspaceReceipt.processSpawned!==false
    ||workspaceReceipt.trainingStarted!==false
  ){
    return invalid(['EXPERT_TRAINING_RUN_WORKSPACE_BINDING_MISMATCH'],common);
  }

  const request=buildExecutionRequest(
    preflight,
    preflightEvidenceSha256,
    workspaceReceipt,
    workspaceFreezeReceiptSha256,
  );

  let rawResult:unknown;
  try{
    rawResult=await executor.executeExactExpertTraining(request);
  }catch{
    return failed(['EXPERT_TRAINING_RUN_PROTECTED_EXECUTOR_FAILED'],common);
  }

  let result:CoreHsmeAdapterMoeExpertTrainingResultV1;
  let hostResultSha256:string;
  try{
    result=normalizeExpertTrainingResult(rawResult);
    hostResultSha256=
      await coreHsmeAdapterMoeExpertTrainingResultV1Digest(result,hash);
  }catch{
    return invalid(['EXPERT_TRAINING_RUN_HOST_RESULT_INVALID'],common);
  }
  const resultValues={...common,...valuesFromResult(result,hostResultSha256)};
  if(hostResultSha256!==result.hostResultSha256){
    return invalid(['EXPERT_TRAINING_RUN_HOST_RESULT_REHASH_MISMATCH'],resultValues);
  }
  if(!await verify(
    ()=>resultOrigin.verifyExpertTrainingResult(result,hostResultSha256),
  )){
    return invalid(['EXPERT_TRAINING_RUN_HOST_RESULT_ORIGIN_UNVERIFIED'],resultValues);
  }
  if(
    result.preflightEvidenceSha256!==preflightEvidenceSha256
    ||result.workspaceFreezeReceiptSha256!==workspaceFreezeReceiptSha256
    ||result.workspaceSha256!==workspaceReceipt.workspaceSha256
  ){
    return invalid(['EXPERT_TRAINING_RUN_HOST_RESULT_BINDING_MISMATCH'],resultValues);
  }
  if(!withinResourceCeilings(result,preflight.resourceCeilings)){
    return invalid(['EXPERT_TRAINING_RUN_RESOURCE_CEILING_EXCEEDED'],resultValues);
  }

  if(result.state==='EXPERT_TRAINING_ATTEMPT_FAILED_TO_START'){
    if(
      result.processSpawned!==false
      ||result.trainingStarted!==false
      ||result.exitCode!=='NOT_STARTED'
      ||result.stagedExpertDelta!==null
      ||result.consumedTrainingExamples!==0
      ||result.consumedGpuSeconds!==0
      ||result.consumedTrainingCostMicrousd!==0
    ){
      return invalid(['EXPERT_TRAINING_RUN_FAILED_TO_START_SHAPE_INVALID'],resultValues);
    }
    return failed(['EXPERT_TRAINING_RUN_PROCESS_NOT_STARTED'],resultValues);
  }

  if(
    result.processSpawned!==true
    ||result.trainingStarted!==true
    ||typeof result.exitCode!=='number'
  ){
    return invalid(['EXPERT_TRAINING_RUN_COMPLETION_SHAPE_INVALID'],resultValues);
  }

  if(result.exitCode!==0){
    if(result.stagedExpertDelta!==null){
      return invalid(['EXPERT_TRAINING_RUN_FAILED_PROCESS_DELTA_FORBIDDEN'],resultValues);
    }
    return failed(['EXPERT_TRAINING_RUN_PROCESS_EXIT_NONZERO'],resultValues);
  }

  if(result.stagedExpertDelta===null){
    return failed(['EXPERT_TRAINING_RUN_STAGED_DELTA_MISSING'],resultValues);
  }
  if(!validStagedDelta(result.stagedExpertDelta,preflight)){
    return invalid(['EXPERT_TRAINING_RUN_STAGED_DELTA_BINDING_INVALID'],resultValues);
  }

  const payload={
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
    state:'EXPERT_TRAINING_RUN_COMPLETED_DELTA_STAGED_NOT_PACKED' as const,
    blockers:Object.freeze([] as string[]),
    preflightEvidenceSha256,
    workspaceFreezeReceiptSha256,
    workspaceSha256:workspaceReceipt.workspaceSha256,
    inventorySha256:workspaceReceipt.inventorySha256,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    expertId:preflight.expertId,
    specialistHypothesis:preflight.specialistHypothesis,
    adapterKind:preflight.adapterKind,
    executionAttemptId:result.executionAttemptId,
    startedAtMs:result.startedAtMs,
    finishedAtMs:result.finishedAtMs,
    exitCode:result.exitCode,
    processSpawned:result.processSpawned,
    trainingStarted:result.trainingStarted,
    consumedTrainingExamples:result.consumedTrainingExamples,
    consumedGpuSeconds:result.consumedGpuSeconds,
    consumedTrainingCostMicrousd:result.consumedTrainingCostMicrousd,
    stdoutEvidenceSha256:result.stdoutEvidenceSha256,
    stderrEvidenceSha256:result.stderrEvidenceSha256,
    stagedExpertDelta:result.stagedExpertDelta,
    hostResultSha256,
    ...receiptAuthorityBoundary(),
  };
  const receiptEvidenceSha256=await digest(
    HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,receiptEvidenceSha256});
}

export async function coreHsmeAdapterMoeExpertTrainingResultV1Digest(
  raw:CoreHsmeAdapterMoeExpertTrainingResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=normalizeExpertTrainingResult(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(
    CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function hsmeAdapterMoeExpertTrainingRunReceiptV1Digest(
  receipt:HsmeAdapterMoeExpertTrainingRunReceiptV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    receipt.state!=='EXPERT_TRAINING_RUN_COMPLETED_DELTA_STAGED_NOT_PACKED'
    ||receipt.receiptEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_adapter_moe_expert_run_receipt_digest_state',
      'only completed staged-delta receipts are digestible',
    );
  }
  const {receiptEvidenceSha256:_ignored,...payload}=receipt;
  return digest(
    HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function buildExecutionRequest(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  preflightSha:string,
  workspace:HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
  workspaceReceiptSha:string,
):CoreHsmeAdapterMoeExpertTrainingRequestV1{
  if(
    preflight.experimentPlanSha256==='UNKNOWN'
    ||preflight.trainingSpecSha256==='UNKNOWN'
    ||preflight.expertId==='UNKNOWN'
    ||preflight.specialistHypothesis==='UNKNOWN'
    ||preflight.adapterKind==='UNKNOWN'
    ||preflight.denseBaselineDecisionSha256==='UNKNOWN'
    ||preflight.denseBaselineContentSha256==='UNKNOWN'
    ||preflight.targetModuleSetSha256==='UNKNOWN'
    ||preflight.adapterConfigSha256==='UNKNOWN'
    ||preflight.trainingCorpusRootSha256==='UNKNOWN'
    ||preflight.reproductionContractSha256==='UNKNOWN'
    ||preflight.immutableEnvironmentSha256==='UNKNOWN'
    ||preflight.trainingToolchainSha256==='UNKNOWN'
    ||preflight.trainerEntrypointSha256==='UNKNOWN'
    ||preflight.resourceCeilings===null
  ){
    fail('hsme_adapter_moe_expert_run_preflight_shape','preflight is incomplete');
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_REQUEST_V1_SCHEMA,
    preflightEvidenceSha256:preflightSha,
    workspaceFreezeReceiptSha256:workspaceReceiptSha,
    workspaceSha256:workspace.workspaceSha256,
    inventorySha256:workspace.inventorySha256,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    expertId:preflight.expertId,
    specialistHypothesis:preflight.specialistHypothesis,
    adapterKind:preflight.adapterKind,
    denseBaselineDecisionSha256:preflight.denseBaselineDecisionSha256,
    denseBaselineContentSha256:preflight.denseBaselineContentSha256,
    targetModuleSetSha256:preflight.targetModuleSetSha256,
    adapterConfigSha256:preflight.adapterConfigSha256,
    trainingCorpusRootSha256:preflight.trainingCorpusRootSha256,
    reproductionContractSha256:preflight.reproductionContractSha256,
    immutableEnvironmentSha256:preflight.immutableEnvironmentSha256,
    trainingToolchainSha256:preflight.trainingToolchainSha256,
    trainerEntrypointSha256:preflight.trainerEntrypointSha256,
    resourceCeilings:preflight.resourceCeilings,
    fixedPaths:workspace.fixedPaths,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    outputPolicy:'STAGED_EXPERT_DELTA_ONLY',
  });
}

function normalizeExpertTrainingResult(
  raw:unknown,
):CoreHsmeAdapterMoeExpertTrainingResultV1{
  const record=exactRecord(raw,[
    'schemaVersion','state','preflightEvidenceSha256',
    'workspaceFreezeReceiptSha256','workspaceSha256','executionAttemptId',
    'startedAtMs','finishedAtMs','exitCode','processSpawned','trainingStarted',
    'consumedTrainingExamples','consumedGpuSeconds',
    'consumedTrainingCostMicrousd','stdoutEvidenceSha256','stderrEvidenceSha256',
    'stagedExpertDelta','modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed','hostResultSha256',
  ],'result');
  if(record.schemaVersion!==CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_V1_SCHEMA){
    fail('hsme_adapter_moe_expert_run_result_schema','host result schema unsupported');
  }
  const state=enumValue(record.state,[
    'EXPERT_TRAINING_ATTEMPT_FAILED_TO_START',
    'EXPERT_TRAINING_ATTEMPT_PROCESS_COMPLETED',
  ] as const,'result.state');
  if(typeof record.processSpawned!=='boolean'||typeof record.trainingStarted!=='boolean'){
    fail('hsme_adapter_moe_expert_run_result_value','execution flags must be boolean');
  }
  assertNoAuthority(record,'result');
  const exitCode=record.exitCode==='NOT_STARTED'
    ?'NOT_STARTED' as const
    :safeInteger(record.exitCode,'result.exitCode',0,255);
  const stagedExpertDelta=record.stagedExpertDelta===null
    ?null
    :normalizeStagedDelta(record.stagedExpertDelta);
  const startedAtMs=safeInteger(record.startedAtMs,'result.startedAtMs',0,Number.MAX_SAFE_INTEGER);
  const finishedAtMs=safeInteger(record.finishedAtMs,'result.finishedAtMs',startedAtMs,Number.MAX_SAFE_INTEGER);
  return deepFreeze({
    schemaVersion:CORE_HSME_ADAPTER_MOE_EXPERT_TRAINING_RESULT_V1_SCHEMA,
    state,
    preflightEvidenceSha256:sha256(record.preflightEvidenceSha256,'result.preflightEvidenceSha256'),
    workspaceFreezeReceiptSha256:sha256(record.workspaceFreezeReceiptSha256,'result.workspaceFreezeReceiptSha256'),
    workspaceSha256:sha256(record.workspaceSha256,'result.workspaceSha256'),
    executionAttemptId:identifier(record.executionAttemptId,'result.executionAttemptId',160),
    startedAtMs,
    finishedAtMs,
    exitCode,
    processSpawned:record.processSpawned,
    trainingStarted:record.trainingStarted,
    consumedTrainingExamples:safeInteger(record.consumedTrainingExamples,'result.consumedTrainingExamples',0,Number.MAX_SAFE_INTEGER),
    consumedGpuSeconds:safeInteger(record.consumedGpuSeconds,'result.consumedGpuSeconds',0,Number.MAX_SAFE_INTEGER),
    consumedTrainingCostMicrousd:safeInteger(record.consumedTrainingCostMicrousd,'result.consumedTrainingCostMicrousd',0,Number.MAX_SAFE_INTEGER),
    stdoutEvidenceSha256:sha256(record.stdoutEvidenceSha256,'result.stdoutEvidenceSha256'),
    stderrEvidenceSha256:sha256(record.stderrEvidenceSha256,'result.stderrEvidenceSha256'),
    stagedExpertDelta,
    ...hostAuthorityBoundary(),
    hostResultSha256:sha256(record.hostResultSha256,'result.hostResultSha256'),
  });
}

function normalizeStagedDelta(raw:unknown):CoreHsmeAdapterMoeStagedExpertDeltaV1{
  const record=exactRecord(raw,[
    'expertId','adapterKind','denseBaselineContentSha256','targetModuleSetSha256',
    'adapterConfigSha256','artifactSha256','artifactBytes','trainableParameters',
    'artifactMetadataSha256','trainingSpecSha256','reproductionContractSha256',
    'stagedDeltaPath','stagedMetadataPath',
  ],'stagedExpertDelta');
  if(
    record.stagedDeltaPath!==HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1
    ||record.stagedMetadataPath!==HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1
  ){
    fail('hsme_adapter_moe_expert_run_staged_path','staged expert paths drifted');
  }
  return deepFreeze({
    expertId:identifier(record.expertId,'stagedExpertDelta.expertId',120),
    adapterKind:enumValue(
      record.adapterKind,
      HSME_ADAPTER_MOE_EXPERT_ADAPTER_KINDS_V1,
      'stagedExpertDelta.adapterKind',
    ),
    denseBaselineContentSha256:sha256(record.denseBaselineContentSha256,'stagedExpertDelta.denseBaselineContentSha256'),
    targetModuleSetSha256:sha256(record.targetModuleSetSha256,'stagedExpertDelta.targetModuleSetSha256'),
    adapterConfigSha256:sha256(record.adapterConfigSha256,'stagedExpertDelta.adapterConfigSha256'),
    artifactSha256:sha256(record.artifactSha256,'stagedExpertDelta.artifactSha256'),
    artifactBytes:safeInteger(record.artifactBytes,'stagedExpertDelta.artifactBytes',1,Number.MAX_SAFE_INTEGER),
    trainableParameters:safeInteger(record.trainableParameters,'stagedExpertDelta.trainableParameters',1,Number.MAX_SAFE_INTEGER),
    artifactMetadataSha256:sha256(record.artifactMetadataSha256,'stagedExpertDelta.artifactMetadataSha256'),
    trainingSpecSha256:sha256(record.trainingSpecSha256,'stagedExpertDelta.trainingSpecSha256'),
    reproductionContractSha256:sha256(record.reproductionContractSha256,'stagedExpertDelta.reproductionContractSha256'),
    stagedDeltaPath:HSME_ADAPTER_MOE_EXPERT_STAGED_DELTA_PATH_V1,
    stagedMetadataPath:HSME_ADAPTER_MOE_EXPERT_STAGED_METADATA_PATH_V1,
  });
}

function withinResourceCeilings(
  result:CoreHsmeAdapterMoeExpertTrainingResultV1,
  ceilings:HsmeAdapterMoeExpertTrainingResourceCeilingsV1|null,
):boolean{
  return ceilings!==null
    &&result.consumedTrainingExamples<=ceilings.maxTrainingExamples
    &&result.consumedGpuSeconds<=ceilings.maxGpuSeconds
    &&result.consumedTrainingCostMicrousd<=ceilings.maxTrainingCostMicrousd;
}

function validStagedDelta(
  delta:CoreHsmeAdapterMoeStagedExpertDeltaV1,
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
):boolean{
  return preflight.resourceCeilings!==null
    &&preflight.expertId!=='UNKNOWN'
    &&preflight.adapterKind!=='UNKNOWN'
    &&preflight.denseBaselineContentSha256!=='UNKNOWN'
    &&preflight.targetModuleSetSha256!=='UNKNOWN'
    &&preflight.adapterConfigSha256!=='UNKNOWN'
    &&preflight.trainingSpecSha256!=='UNKNOWN'
    &&preflight.reproductionContractSha256!=='UNKNOWN'
    &&typeof preflight.denseBaselinePackageBytes==='number'
    &&delta.expertId===preflight.expertId
    &&delta.adapterKind===preflight.adapterKind
    &&delta.denseBaselineContentSha256===preflight.denseBaselineContentSha256
    &&delta.targetModuleSetSha256===preflight.targetModuleSetSha256
    &&delta.adapterConfigSha256===preflight.adapterConfigSha256
    &&delta.trainingSpecSha256===preflight.trainingSpecSha256
    &&delta.reproductionContractSha256===preflight.reproductionContractSha256
    &&delta.artifactBytes<=preflight.resourceCeilings.maxStagedArtifactBytes
    &&delta.artifactBytes<preflight.denseBaselinePackageBytes
    &&delta.trainableParameters<=preflight.resourceCeilings.maxTrainableParameters;
}

function isReadyPreflight(
  value:HsmeAdapterMoeExpertTrainingPreflightV1,
):boolean{
  return value.schemaVersion===HSME_ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_V1_SCHEMA
    &&value.state==='ADAPTER_MOE_EXPERT_TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.preflightEvidenceSha256!=='UNKNOWN'
    &&value.trainingExecutionAllowed===false;
}

function isFrozenWorkspaceReceipt(
  value:HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
):boolean{
  return value.schemaVersion===HSME_ADAPTER_MOE_EXPERT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA
    &&value.state==='EXPERT_WORKSPACE_FROZEN_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.processSpawned===false
    &&value.trainingStarted===false
    &&value.trainingExecutionAllowed===false;
}

type PartialOutput=Partial<Pick<
  HsmeAdapterMoeExpertTrainingRunReceiptV1,
  'preflightEvidenceSha256'|'workspaceFreezeReceiptSha256'|'workspaceSha256'
  |'inventorySha256'|'experimentPlanSha256'|'trainingSpecSha256'
  |'expertId'|'specialistHypothesis'|'adapterKind'|'executionAttemptId'
  |'startedAtMs'|'finishedAtMs'|'exitCode'|'processSpawned'|'trainingStarted'
  |'consumedTrainingExamples'|'consumedGpuSeconds'
  |'consumedTrainingCostMicrousd'|'stdoutEvidenceSha256'
  |'stderrEvidenceSha256'|'stagedExpertDelta'|'hostResultSha256'
>>;

function commonValues(
  preflight:HsmeAdapterMoeExpertTrainingPreflightV1,
  preflightSha:string,
  workspace:HsmeAdapterMoeExpertWorkspaceFreezeReceiptV1,
  workspaceReceiptSha:string,
):PartialOutput{
  return {
    preflightEvidenceSha256:preflightSha,
    workspaceFreezeReceiptSha256:workspaceReceiptSha,
    workspaceSha256:workspace.workspaceSha256,
    inventorySha256:workspace.inventorySha256,
    experimentPlanSha256:preflight.experimentPlanSha256,
    trainingSpecSha256:preflight.trainingSpecSha256,
    expertId:preflight.expertId,
    specialistHypothesis:preflight.specialistHypothesis,
    adapterKind:preflight.adapterKind,
  };
}

function valuesFromResult(
  result:CoreHsmeAdapterMoeExpertTrainingResultV1,
  hostResultSha256:string,
):PartialOutput{
  return {
    executionAttemptId:result.executionAttemptId,
    startedAtMs:result.startedAtMs,
    finishedAtMs:result.finishedAtMs,
    exitCode:result.exitCode,
    processSpawned:result.processSpawned,
    trainingStarted:result.trainingStarted,
    consumedTrainingExamples:result.consumedTrainingExamples,
    consumedGpuSeconds:result.consumedGpuSeconds,
    consumedTrainingCostMicrousd:result.consumedTrainingCostMicrousd,
    stdoutEvidenceSha256:result.stdoutEvidenceSha256,
    stderrEvidenceSha256:result.stderrEvidenceSha256,
    stagedExpertDelta:result.stagedExpertDelta,
    hostResultSha256,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertTrainingRunReceiptV1{
  return terminal('EXPERT_TRAINING_RUN_FAILED',blockers,values);
}

function failed(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertTrainingRunReceiptV1{
  return terminal('EXPERT_TRAINING_RUN_FAILED',blockers,values);
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeAdapterMoeExpertTrainingRunReceiptV1{
  return terminal('EXPERT_TRAINING_RUN_INVALID',blockers,values);
}

function terminal(
  state:'EXPERT_TRAINING_RUN_INVALID'|'EXPERT_TRAINING_RUN_FAILED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeAdapterMoeExpertTrainingRunReceiptV1{
  return deepFreeze({
    schemaVersion:HSME_ADAPTER_MOE_EXPERT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    preflightEvidenceSha256:values.preflightEvidenceSha256??'UNKNOWN',
    workspaceFreezeReceiptSha256:values.workspaceFreezeReceiptSha256??'UNKNOWN',
    workspaceSha256:values.workspaceSha256??'UNKNOWN',
    inventorySha256:values.inventorySha256??'UNKNOWN',
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    trainingSpecSha256:values.trainingSpecSha256??'UNKNOWN',
    expertId:values.expertId??'UNKNOWN',
    specialistHypothesis:values.specialistHypothesis??'UNKNOWN',
    adapterKind:values.adapterKind??'UNKNOWN',
    executionAttemptId:values.executionAttemptId??'UNKNOWN',
    startedAtMs:values.startedAtMs??'UNKNOWN',
    finishedAtMs:values.finishedAtMs??'UNKNOWN',
    exitCode:values.exitCode??'UNKNOWN',
    processSpawned:values.processSpawned??false,
    trainingStarted:values.trainingStarted??false,
    consumedTrainingExamples:values.consumedTrainingExamples??'UNKNOWN',
    consumedGpuSeconds:values.consumedGpuSeconds??'UNKNOWN',
    consumedTrainingCostMicrousd:values.consumedTrainingCostMicrousd??'UNKNOWN',
    stdoutEvidenceSha256:values.stdoutEvidenceSha256??'UNKNOWN',
    stderrEvidenceSha256:values.stderrEvidenceSha256??'UNKNOWN',
    stagedExpertDelta:values.stagedExpertDelta??null,
    hostResultSha256:values.hostResultSha256??'UNKNOWN',
    receiptEvidenceSha256:'UNKNOWN',
    ...receiptAuthorityBoundary(),
  });
}

function hostAuthorityBoundary(){
  return Object.freeze({
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

function receiptAuthorityBoundary(){
  return Object.freeze({
    expertPackAdmissionAllowed:false as const,
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
      fail('hsme_adapter_moe_expert_run_authority',path+'.'+field+' must remain false');
    }
  }
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_adapter_moe_expert_run_schema',path+' must be an object');
  }
  const prototype=Object.getPrototypeOf(raw);
  if(prototype!==Object.prototype&&prototype!==null){
    fail('hsme_adapter_moe_expert_run_schema',path+' must be a plain object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_adapter_moe_expert_run_schema',path+' contains unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_adapter_moe_expert_run_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_adapter_moe_expert_run_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_adapter_moe_expert_run_value',path+' must be lowercase SHA-256');
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_adapter_moe_expert_run_value',path+' must be a string');
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail('hsme_adapter_moe_expert_run_value',path+' is invalid');
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
    fail('hsme_adapter_moe_expert_run_value',path+' must be a bounded safe integer');
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
    fail('hsme_adapter_moe_expert_run_hash','hash port must return lowercase SHA-256');
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
  throw new HsmeAdapterMoeExpertProtectedTrainingRunV1Error(code,message);
}
