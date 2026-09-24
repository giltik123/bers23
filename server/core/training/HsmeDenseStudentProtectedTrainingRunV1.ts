import {
  HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
  HSME_DENSE_STUDENT_ENTRYPOINT_V1,
  HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
  HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeDenseStudentLaunchSpecV1Digest,
  hsmeDenseStudentTrainingPreflightV1Digest,
  type HsmeDenseStudentLaunchSpecV1,
  type HsmeDenseStudentTrainingHashPortV1,
  type HsmeDenseStudentTrainingPreflightV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1' as const;
export const CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1' as const;
export const HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1' as const;

export const CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:dense-student-execution-result:v1\0' as const;
export const HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_DIGEST_DOMAIN =
  'bers:hsme:dense-student-training-run-receipt:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

type BackendBinding=Readonly<{
  backendClass:'CUDA_GPU';
  providerId:string;
  accountId:string;
  executionEnvironmentId:string;
}>;

type ResourceCeilings=Readonly<{
  maxTrainingExamples:number;
  maxGpuSeconds:number;
  maxTrainingCostMicrousd:number;
}>;

export type CoreHsmeDenseStudentExecutionRequestV1=Readonly<{
  schemaVersion:typeof CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1_SCHEMA;
  launchSpecSha256:string;
  interpreter:'python3.12';
  argv:readonly string[];
  repositoryCommitSha:string;
  immutableEnvironmentSha256:string;
  backend:BackendBinding;
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
  resourceCeilings:ResourceCeilings;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
}>;

export type CoreHsmeDenseStudentStagedCheckpointV1=Readonly<{
  checkpointSha256:string;
  checkpointBytes:number;
  checkpointMetadataSha256:string;
  teacherDecisionSha256:string;
  reproductionEvidenceSha256:string;
  corpusRootDigest:string;
  recipeDigest:string;
  inputCheckpointSha256:string;
  resumeCheckpointSha256:string|'NONE';
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
}>;

export type CoreHsmeDenseStudentExecutionResultStateV1=
  | 'EXECUTION_ATTEMPT_FAILED_TO_START'
  | 'EXECUTION_ATTEMPT_PROCESS_COMPLETED';

export type CoreHsmeDenseStudentExecutionResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA;
  state:CoreHsmeDenseStudentExecutionResultStateV1;
  launchSpecSha256:string;
  executionAttemptId:string;
  backend:BackendBinding;
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
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
  stagedCheckpoint:CoreHsmeDenseStudentStagedCheckpointV1|null;
  runnerResultSha256:string;
}>;

export interface CoreHsmeDenseStudentProtectedExecutionPortV1{
  executeExactTrainingLaunch(
    request:CoreHsmeDenseStudentExecutionRequestV1,
  ):Promise<unknown>;
}

export interface CoreHsmeDenseStudentExecutionResultOriginVerifierV1{
  verifyExecutionResult(
    result:CoreHsmeDenseStudentExecutionResultV1,
    expectedRunnerResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeDenseStudentTrainingRunReceiptStateV1=
  | 'TRAINING_RUN_INVALID'
  | 'TRAINING_RUN_BLOCKED'
  | 'TRAINING_RUN_FAILED'
  | 'TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED';

export type HsmeDenseStudentTrainingRunReceiptV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA;
  state:HsmeDenseStudentTrainingRunReceiptStateV1;
  blockers:readonly string[];
  preflightEvidenceSha256:string|'UNKNOWN';
  launchSpecSha256:string|'UNKNOWN';
  requestEvidenceSha256:string|'UNKNOWN';
  admissionEvidenceSha256:string|'UNKNOWN';
  toolchainManifestSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  backend:BackendBinding|null;
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
  outputStagingAuthorityId:string|'UNKNOWN';
  outputStagingPolicySha256:string|'UNKNOWN';
  stagedCheckpointSha256:string|'UNKNOWN';
  stagedCheckpointBytes:number|'UNKNOWN';
  checkpointMetadataSha256:string|'UNKNOWN';
  teacherDecisionSha256:string|'UNKNOWN';
  reproductionEvidenceSha256:string|'UNKNOWN';
  corpusRootDigest:string|'UNKNOWN';
  recipeDigest:string|'UNKNOWN';
  inputCheckpointSha256:string|'UNKNOWN';
  resumeCheckpointSha256:string|'NONE'|'UNKNOWN';
  runnerResultSha256:string|'UNKNOWN';
  receiptEvidenceSha256:string|'UNKNOWN';
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeDenseStudentProtectedTrainingRunV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentProtectedTrainingRunV1Error';
    this.code=code;
  }
}

export async function runHsmeDenseStudentProtectedTrainingV1(
  preflight:HsmeDenseStudentTrainingPreflightV1,
  executor:CoreHsmeDenseStudentProtectedExecutionPortV1,
  resultOrigin:CoreHsmeDenseStudentExecutionResultOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentTrainingRunReceiptV1>{
  if(
    !preflight
    ||preflight.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA
  ){
    return invalid(['TRAINING_RUN_PREFLIGHT_SCHEMA_INVALID']);
  }
  if(
    preflight.state!=='TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    ||preflight.launchSpec===null
  ){
    return blocked(['TRAINING_RUN_READY_PREFLIGHT_REQUIRED'],{
      preflightEvidenceSha256:valueOrUnknown(preflight.preflightEvidenceSha256),
      launchSpecSha256:valueOrUnknown(preflight.launchSpecSha256),
      requestEvidenceSha256:valueOrUnknown(preflight.requestEvidenceSha256),
      admissionEvidenceSha256:valueOrUnknown(preflight.admissionEvidenceSha256),
      toolchainManifestSha256:valueOrUnknown(preflight.toolchainManifestSha256),
    });
  }

  const launchSpec=preflight.launchSpec;
  const invalidBlockers:string[]=[];
  if(preflight.blockers.length!==0){
    invalidBlockers.push('TRAINING_RUN_PREFLIGHT_BLOCKERS_PRESENT');
  }
  if(preflightAuthorityWidened(preflight)){
    invalidBlockers.push('TRAINING_RUN_PREFLIGHT_AUTHORITY_WIDENING');
  }
  if(
    launchSpec.schemaVersion!==HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA
    ||launchSpec.state!=='LAUNCH_SPEC_READY_NOT_EXECUTED'
  ){
    invalidBlockers.push('TRAINING_RUN_LAUNCH_SPEC_STATE_INVALID');
  }
  if(launchAuthorityWidened(launchSpec)){
    invalidBlockers.push('TRAINING_RUN_LAUNCH_AUTHORITY_WIDENING');
  }

  let launchSpecSha256:string|'UNKNOWN'='UNKNOWN';
  let preflightEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    launchSpecSha256=await hsmeDenseStudentLaunchSpecV1Digest(launchSpec,hash);
    if(
      launchSpecSha256!==launchSpec.launchSpecSha256
      ||launchSpecSha256!==preflight.launchSpecSha256
    ){
      invalidBlockers.push('TRAINING_RUN_LAUNCH_SPEC_REHASH_MISMATCH');
    }
  }catch{
    invalidBlockers.push('TRAINING_RUN_LAUNCH_SPEC_REHASH_INVALID');
  }
  try{
    preflightEvidenceSha256=await hsmeDenseStudentTrainingPreflightV1Digest(
      preflight,
      hash,
    );
    if(preflightEvidenceSha256!==preflight.preflightEvidenceSha256){
      invalidBlockers.push('TRAINING_RUN_PREFLIGHT_REHASH_MISMATCH');
    }
  }catch{
    invalidBlockers.push('TRAINING_RUN_PREFLIGHT_REHASH_INVALID');
  }

  validateExactLaunchContract(launchSpec,invalidBlockers);
  const common=receiptValuesFromLaunch(preflight,launchSpec,{
    preflightEvidenceSha256,
    launchSpecSha256,
  });
  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,common);
  }

  const executionRequest=buildExecutionRequest(
    launchSpec,
    launchSpecSha256 as string,
  );

  let rawResult:unknown;
  try{
    rawResult=await executor.executeExactTrainingLaunch(executionRequest);
  }catch{
    return failed(['TRAINING_RUN_PROTECTED_EXECUTOR_FAILED'],common);
  }

  let result:CoreHsmeDenseStudentExecutionResultV1;
  try{
    result=normalizeExecutionResult(rawResult);
  }catch(error){
    return invalid([
      'TRAINING_RUN_EXECUTION_RESULT_INVALID'+errorCodeSuffix(error),
    ],common);
  }

  let runnerResultSha256:string;
  try{
    runnerResultSha256=await coreHsmeDenseStudentExecutionResultV1Digest(
      result,
      hash,
    );
  }catch{
    return invalid(['TRAINING_RUN_EXECUTION_RESULT_REHASH_INVALID'],{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }
  if(runnerResultSha256!==result.runnerResultSha256){
    return invalid(['TRAINING_RUN_EXECUTION_RESULT_REHASH_MISMATCH'],{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }
  if(!await verify(
    ()=>resultOrigin.verifyExecutionResult(result,runnerResultSha256),
  )){
    return invalid(['TRAINING_RUN_EXECUTION_RESULT_ORIGIN_UNVERIFIED'],{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }

  const resultBlockers:string[]=[];
  validateResultBinding(result,launchSpec,resultBlockers);
  validateResourceConsumption(result,launchSpec.resourceCeilings,resultBlockers);
  if(resultBlockers.length>0){
    return invalid(resultBlockers,{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }

  if(result.state==='EXECUTION_ATTEMPT_FAILED_TO_START'){
    if(
      result.processSpawned!==false
      ||result.trainingStarted!==false
      ||result.exitCode!=='NOT_STARTED'
      ||result.stagedCheckpoint!==null
    ){
      return invalid(['TRAINING_RUN_FAILED_TO_START_SHAPE_INVALID'],{
        ...common,
        ...receiptValuesFromResult(result),
      });
    }
    return failed(['TRAINING_RUN_PROCESS_NOT_STARTED'],{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }

  if(
    result.processSpawned!==true
    ||result.trainingStarted!==true
    ||typeof result.exitCode!=='number'
  ){
    return invalid(['TRAINING_RUN_PROCESS_COMPLETION_SHAPE_INVALID'],{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }

  if(result.exitCode!==0){
    if(result.stagedCheckpoint!==null){
      return invalid(['TRAINING_RUN_FAILED_PROCESS_CHECKPOINT_FORBIDDEN'],{
        ...common,
        ...receiptValuesFromResult(result),
      });
    }
    return failed(['TRAINING_RUN_PROCESS_EXIT_NONZERO'],{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }

  if(result.stagedCheckpoint===null){
    return failed(['TRAINING_RUN_CHECKPOINT_EVIDENCE_MISSING'],{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }

  const checkpointBlockers:string[]=[];
  validateCheckpointLineage(
    result.stagedCheckpoint,
    launchSpec,
    checkpointBlockers,
  );
  if(checkpointBlockers.length>0){
    return invalid(checkpointBlockers,{
      ...common,
      ...receiptValuesFromResult(result),
    });
  }

  const completedPayload={
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
    state:'TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED' as const,
    blockers:Object.freeze([]) as readonly string[],
    ...common,
    ...receiptValuesFromResult(result),
    ...receiptValuesFromCheckpoint(result.stagedCheckpoint),
    ...promotionBoundary(),
  };
  const receiptEvidenceSha256=await digest(
    HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_DIGEST_DOMAIN,
    completedPayload,
    hash,
  );
  return deepFreeze({
    ...completedPayload,
    receiptEvidenceSha256,
  });
}

export async function coreHsmeDenseStudentExecutionResultV1Digest(
  raw:CoreHsmeDenseStudentExecutionResultV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const result=normalizeExecutionResult(raw);
  return digest(
    CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_DIGEST_DOMAIN,
    executionResultPayload(result),
    hash,
  );
}

export async function hsmeDenseStudentTrainingRunReceiptV1Digest(
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  if(
    receipt.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA
    ||receipt.state!=='TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED'
    ||receipt.blockers.length!==0
  ){
    throw new HsmeDenseStudentProtectedTrainingRunV1Error(
      'hsme_training_run_receipt_digest_state',
      'only completed staged-not-promoted receipts are digestible',
    );
  }
  return digest(
    HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_DIGEST_DOMAIN,
    completedReceiptDigestPayload(receipt),
    hash,
  );
}

function completedReceiptDigestPayload(
  value:HsmeDenseStudentTrainingRunReceiptV1,
):Omit<HsmeDenseStudentTrainingRunReceiptV1,'receiptEvidenceSha256'>{
  if(
    value.backend===null
    ||value.executionAttemptId==='UNKNOWN'
    ||value.startedAtMs==='UNKNOWN'
    ||value.finishedAtMs==='UNKNOWN'
    ||value.exitCode==='UNKNOWN'
    ||value.consumedTrainingExamples==='UNKNOWN'
    ||value.consumedGpuSeconds==='UNKNOWN'
    ||value.consumedTrainingCostMicrousd==='UNKNOWN'
    ||value.stdoutEvidenceSha256==='UNKNOWN'
    ||value.stderrEvidenceSha256==='UNKNOWN'
    ||value.outputStagingAuthorityId==='UNKNOWN'
    ||value.outputStagingPolicySha256==='UNKNOWN'
    ||value.stagedCheckpointSha256==='UNKNOWN'
    ||value.stagedCheckpointBytes==='UNKNOWN'
    ||value.checkpointMetadataSha256==='UNKNOWN'
    ||value.teacherDecisionSha256==='UNKNOWN'
    ||value.reproductionEvidenceSha256==='UNKNOWN'
    ||value.corpusRootDigest==='UNKNOWN'
    ||value.recipeDigest==='UNKNOWN'
    ||value.inputCheckpointSha256==='UNKNOWN'
    ||value.resumeCheckpointSha256==='UNKNOWN'
    ||value.runnerResultSha256==='UNKNOWN'
  ){
    throw new HsmeDenseStudentProtectedTrainingRunV1Error(
      'hsme_training_run_receipt_digest_incomplete',
      'completed receipt is missing content-addressed fields',
    );
  }
  return {
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
    state:'TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED',
    blockers:value.blockers,
    preflightEvidenceSha256:value.preflightEvidenceSha256,
    launchSpecSha256:value.launchSpecSha256,
    requestEvidenceSha256:value.requestEvidenceSha256,
    admissionEvidenceSha256:value.admissionEvidenceSha256,
    toolchainManifestSha256:value.toolchainManifestSha256,
    backend:value.backend,
    outputStagingAuthorityId:value.outputStagingAuthorityId,
    outputStagingPolicySha256:value.outputStagingPolicySha256,
    teacherDecisionSha256:value.teacherDecisionSha256,
    reproductionEvidenceSha256:value.reproductionEvidenceSha256,
    corpusRootDigest:value.corpusRootDigest,
    recipeDigest:value.recipeDigest,
    inputCheckpointSha256:value.inputCheckpointSha256,
    resumeCheckpointSha256:value.resumeCheckpointSha256,
    executionAttemptId:value.executionAttemptId,
    startedAtMs:value.startedAtMs,
    finishedAtMs:value.finishedAtMs,
    exitCode:value.exitCode,
    processSpawned:value.processSpawned,
    trainingStarted:value.trainingStarted,
    consumedTrainingExamples:value.consumedTrainingExamples,
    consumedGpuSeconds:value.consumedGpuSeconds,
    consumedTrainingCostMicrousd:value.consumedTrainingCostMicrousd,
    stdoutEvidenceSha256:value.stdoutEvidenceSha256,
    stderrEvidenceSha256:value.stderrEvidenceSha256,
    runnerResultSha256:value.runnerResultSha256,
    stagedCheckpointSha256:value.stagedCheckpointSha256,
    stagedCheckpointBytes:value.stagedCheckpointBytes,
    checkpointMetadataSha256:value.checkpointMetadataSha256,
    checkpointPromotionAllowed:value.checkpointPromotionAllowed,
    modelInstallAllowed:value.modelInstallAllowed,
    modelFleetPromotionAllowed:value.modelFleetPromotionAllowed,
    productionAuthorityGranted:value.productionAuthorityGranted,
    providerAuthorityGranted:value.providerAuthorityGranted,
    billingAuthorityGranted:value.billingAuthorityGranted,
    projectArtifactMutationAllowed:value.projectArtifactMutationAllowed,
    aeeExecutionAuthorityGranted:value.aeeExecutionAuthorityGranted,
    durableModelFleetPromotionAllowed:value.durableModelFleetPromotionAllowed,
    winnerSelectionAllowed:value.winnerSelectionAllowed,
  };
}

function buildExecutionRequest(
  launch:HsmeDenseStudentLaunchSpecV1,
  launchSpecSha256:string,
):CoreHsmeDenseStudentExecutionRequestV1{
  return deepFreeze({
    schemaVersion:CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1_SCHEMA,
    launchSpecSha256,
    interpreter:'python3.12',
    argv:Object.freeze([...launch.argv]),
    repositoryCommitSha:launch.repositoryCommitSha,
    immutableEnvironmentSha256:launch.immutableEnvironmentSha256,
    backend:launch.backend,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    resourceCeilings:launch.resourceCeilings,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  });
}

function validateExactLaunchContract(
  launch:HsmeDenseStudentLaunchSpecV1,
  blockers:string[],
):void{
  if(
    launch.interpreter!=='python3.12'
    ||launch.entrypointRelativePath!==HSME_DENSE_STUDENT_ENTRYPOINT_V1
    ||launch.dependencyLockRelativePath!==HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1
  ){
    blockers.push('TRAINING_RUN_FIXED_EXECUTABLE_IDENTITY_DRIFT');
  }
  if(
    launch.networkPolicy!=='SEALED_INPUTS_ONLY'
    ||launch.cacheModelInputPolicy!=='READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'
  ){
    blockers.push('TRAINING_RUN_SEALED_INPUT_POLICY_DRIFT');
  }
  const expected=expectedArgv(launch);
  if(!sameStrings(launch.argv,expected)){
    blockers.push('TRAINING_RUN_FIXED_ARGV_DRIFT');
  }
}

function expectedArgv(launch:HsmeDenseStudentLaunchSpecV1):readonly string[]{
  return Object.freeze([
    HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    '--candidate-id',launch.candidateId,
    '--request-evidence-sha256',launch.requestEvidenceSha256,
    '--admission-evidence-sha256',launch.admissionEvidenceSha256,
    '--teacher-decision-sha256',launch.teacherDecisionSha256,
    '--reproduction-evidence-sha256',launch.reproductionEvidenceSha256,
    '--corpus-root-digest',launch.corpusRootDigest,
    '--recipe-digest',launch.recipeDigest,
    '--checkpoint-sha256',launch.checkpointSha256,
    '--resume-checkpoint-sha256',launch.resumeCheckpointSha256,
    '--output-staging-authority-id',launch.outputStagingAuthorityId,
    '--output-staging-policy-sha256',launch.outputStagingPolicySha256,
    '--max-training-examples',String(launch.resourceCeilings.maxTrainingExamples),
    '--max-gpu-seconds',String(launch.resourceCeilings.maxGpuSeconds),
    '--max-training-cost-microusd',String(
      launch.resourceCeilings.maxTrainingCostMicrousd,
    ),
    '--target-step-count',String(launch.targetStepCount),
    '--active-parameters-millions',String(launch.activeParametersMillions),
    '--network-policy','SEALED_INPUTS_ONLY',
    '--cache-model-input-policy','READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  ]);
}

function normalizeExecutionResult(
  raw:unknown,
):CoreHsmeDenseStudentExecutionResultV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'state',
    'launchSpecSha256',
    'executionAttemptId',
    'backend',
    'outputStagingAuthorityId',
    'outputStagingPolicySha256',
    'startedAtMs',
    'finishedAtMs',
    'exitCode',
    'processSpawned',
    'trainingStarted',
    'consumedTrainingExamples',
    'consumedGpuSeconds',
    'consumedTrainingCostMicrousd',
    'stdoutEvidenceSha256',
    'stderrEvidenceSha256',
    'stagedCheckpoint',
    'runnerResultSha256',
  ],'executionResult');
  if(record.schemaVersion!==CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA){
    fail('hsme_training_run_result_schema','execution result schema unsupported');
  }
  const state=enumValue(
    record.state,
    ['EXECUTION_ATTEMPT_FAILED_TO_START','EXECUTION_ATTEMPT_PROCESS_COMPLETED'] as const,
    'executionResult.state',
  );
  const backend=normalizeBackend(record.backend,'executionResult.backend');
  const startedAtMs=safeInteger(
    record.startedAtMs,
    'executionResult.startedAtMs',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const finishedAtMs=safeInteger(
    record.finishedAtMs,
    'executionResult.finishedAtMs',
    startedAtMs,
    Number.MAX_SAFE_INTEGER,
  );
  const exitCode=record.exitCode==='NOT_STARTED'
    ?'NOT_STARTED' as const
    :safeInteger(record.exitCode,'executionResult.exitCode',0,255);
  const processSpawned=bool(record.processSpawned,'executionResult.processSpawned');
  const trainingStarted=bool(record.trainingStarted,'executionResult.trainingStarted');
  if(trainingStarted&&!processSpawned){
    fail('hsme_training_run_result_process_order','training cannot start before process spawn');
  }
  const checkpoint=record.stagedCheckpoint===null
    ?null
    :normalizeCheckpoint(record.stagedCheckpoint);

  return deepFreeze({
    schemaVersion:CORE_HSME_DENSE_STUDENT_EXECUTION_RESULT_V1_SCHEMA,
    state,
    launchSpecSha256:sha256(
      record.launchSpecSha256,
      'executionResult.launchSpecSha256',
    ),
    executionAttemptId:identifier(
      record.executionAttemptId,
      'executionResult.executionAttemptId',
      200,
    ),
    backend,
    outputStagingAuthorityId:identifier(
      record.outputStagingAuthorityId,
      'executionResult.outputStagingAuthorityId',
      160,
    ),
    outputStagingPolicySha256:sha256(
      record.outputStagingPolicySha256,
      'executionResult.outputStagingPolicySha256',
    ),
    startedAtMs,
    finishedAtMs,
    exitCode,
    processSpawned,
    trainingStarted,
    consumedTrainingExamples:safeInteger(
      record.consumedTrainingExamples,
      'executionResult.consumedTrainingExamples',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    consumedGpuSeconds:safeInteger(
      record.consumedGpuSeconds,
      'executionResult.consumedGpuSeconds',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    consumedTrainingCostMicrousd:safeInteger(
      record.consumedTrainingCostMicrousd,
      'executionResult.consumedTrainingCostMicrousd',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    stdoutEvidenceSha256:sha256(
      record.stdoutEvidenceSha256,
      'executionResult.stdoutEvidenceSha256',
    ),
    stderrEvidenceSha256:sha256(
      record.stderrEvidenceSha256,
      'executionResult.stderrEvidenceSha256',
    ),
    stagedCheckpoint:checkpoint,
    runnerResultSha256:sha256(
      record.runnerResultSha256,
      'executionResult.runnerResultSha256',
    ),
  });
}

function normalizeCheckpoint(raw:unknown):CoreHsmeDenseStudentStagedCheckpointV1{
  const record=exactRecord(raw,[
    'checkpointSha256',
    'checkpointBytes',
    'checkpointMetadataSha256',
    'teacherDecisionSha256',
    'reproductionEvidenceSha256',
    'corpusRootDigest',
    'recipeDigest',
    'inputCheckpointSha256',
    'resumeCheckpointSha256',
    'outputStagingAuthorityId',
    'outputStagingPolicySha256',
  ],'executionResult.stagedCheckpoint');
  const resume=record.resumeCheckpointSha256==='NONE'
    ?'NONE' as const
    :sha256(
      record.resumeCheckpointSha256,
      'executionResult.stagedCheckpoint.resumeCheckpointSha256',
    );
  return Object.freeze({
    checkpointSha256:sha256(
      record.checkpointSha256,
      'executionResult.stagedCheckpoint.checkpointSha256',
    ),
    checkpointBytes:safeInteger(
      record.checkpointBytes,
      'executionResult.stagedCheckpoint.checkpointBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    checkpointMetadataSha256:sha256(
      record.checkpointMetadataSha256,
      'executionResult.stagedCheckpoint.checkpointMetadataSha256',
    ),
    teacherDecisionSha256:sha256(
      record.teacherDecisionSha256,
      'executionResult.stagedCheckpoint.teacherDecisionSha256',
    ),
    reproductionEvidenceSha256:sha256(
      record.reproductionEvidenceSha256,
      'executionResult.stagedCheckpoint.reproductionEvidenceSha256',
    ),
    corpusRootDigest:sha256(
      record.corpusRootDigest,
      'executionResult.stagedCheckpoint.corpusRootDigest',
    ),
    recipeDigest:sha256(
      record.recipeDigest,
      'executionResult.stagedCheckpoint.recipeDigest',
    ),
    inputCheckpointSha256:sha256(
      record.inputCheckpointSha256,
      'executionResult.stagedCheckpoint.inputCheckpointSha256',
    ),
    resumeCheckpointSha256:resume,
    outputStagingAuthorityId:identifier(
      record.outputStagingAuthorityId,
      'executionResult.stagedCheckpoint.outputStagingAuthorityId',
      160,
    ),
    outputStagingPolicySha256:sha256(
      record.outputStagingPolicySha256,
      'executionResult.stagedCheckpoint.outputStagingPolicySha256',
    ),
  });
}

function executionResultPayload(
  value:CoreHsmeDenseStudentExecutionResultV1,
):Omit<CoreHsmeDenseStudentExecutionResultV1,'runnerResultSha256'>{
  return {
    schemaVersion:value.schemaVersion,
    state:value.state,
    launchSpecSha256:value.launchSpecSha256,
    executionAttemptId:value.executionAttemptId,
    backend:value.backend,
    outputStagingAuthorityId:value.outputStagingAuthorityId,
    outputStagingPolicySha256:value.outputStagingPolicySha256,
    startedAtMs:value.startedAtMs,
    finishedAtMs:value.finishedAtMs,
    exitCode:value.exitCode,
    processSpawned:value.processSpawned,
    trainingStarted:value.trainingStarted,
    consumedTrainingExamples:value.consumedTrainingExamples,
    consumedGpuSeconds:value.consumedGpuSeconds,
    consumedTrainingCostMicrousd:value.consumedTrainingCostMicrousd,
    stdoutEvidenceSha256:value.stdoutEvidenceSha256,
    stderrEvidenceSha256:value.stderrEvidenceSha256,
    stagedCheckpoint:value.stagedCheckpoint,
  };
}

function validateResultBinding(
  result:CoreHsmeDenseStudentExecutionResultV1,
  launch:HsmeDenseStudentLaunchSpecV1,
  blockers:string[],
):void{
  if(result.launchSpecSha256!==launch.launchSpecSha256){
    blockers.push('TRAINING_RUN_RESULT_LAUNCH_BINDING_MISMATCH');
  }
  if(!sameBackend(result.backend,launch.backend)){
    blockers.push('TRAINING_RUN_RESULT_BACKEND_BINDING_MISMATCH');
  }
  if(result.outputStagingAuthorityId!==launch.outputStagingAuthorityId){
    blockers.push('TRAINING_RUN_RESULT_STAGING_AUTHORITY_MISMATCH');
  }
  if(result.outputStagingPolicySha256!==launch.outputStagingPolicySha256){
    blockers.push('TRAINING_RUN_RESULT_STAGING_POLICY_MISMATCH');
  }
}

function validateResourceConsumption(
  result:CoreHsmeDenseStudentExecutionResultV1,
  ceilings:ResourceCeilings,
  blockers:string[],
):void{
  if(result.consumedTrainingExamples>ceilings.maxTrainingExamples){
    blockers.push('TRAINING_RUN_RESOURCE_EXAMPLES_OVERRUN');
  }
  if(result.consumedGpuSeconds>ceilings.maxGpuSeconds){
    blockers.push('TRAINING_RUN_RESOURCE_GPU_SECONDS_OVERRUN');
  }
  if(result.consumedTrainingCostMicrousd>ceilings.maxTrainingCostMicrousd){
    blockers.push('TRAINING_RUN_RESOURCE_COST_OVERRUN');
  }
}

function validateCheckpointLineage(
  checkpoint:CoreHsmeDenseStudentStagedCheckpointV1,
  launch:HsmeDenseStudentLaunchSpecV1,
  blockers:string[],
):void{
  if(checkpoint.teacherDecisionSha256!==launch.teacherDecisionSha256){
    blockers.push('TRAINING_RUN_CHECKPOINT_TEACHER_LINEAGE_MISMATCH');
  }
  if(checkpoint.reproductionEvidenceSha256!==launch.reproductionEvidenceSha256){
    blockers.push('TRAINING_RUN_CHECKPOINT_REPRODUCTION_LINEAGE_MISMATCH');
  }
  if(checkpoint.corpusRootDigest!==launch.corpusRootDigest){
    blockers.push('TRAINING_RUN_CHECKPOINT_CORPUS_LINEAGE_MISMATCH');
  }
  if(checkpoint.recipeDigest!==launch.recipeDigest){
    blockers.push('TRAINING_RUN_CHECKPOINT_RECIPE_LINEAGE_MISMATCH');
  }
  if(checkpoint.inputCheckpointSha256!==launch.checkpointSha256){
    blockers.push('TRAINING_RUN_CHECKPOINT_INPUT_LINEAGE_MISMATCH');
  }
  if(checkpoint.resumeCheckpointSha256!==launch.resumeCheckpointSha256){
    blockers.push('TRAINING_RUN_CHECKPOINT_RESUME_LINEAGE_MISMATCH');
  }
  if(checkpoint.outputStagingAuthorityId!==launch.outputStagingAuthorityId){
    blockers.push('TRAINING_RUN_CHECKPOINT_STAGING_AUTHORITY_MISMATCH');
  }
  if(checkpoint.outputStagingPolicySha256!==launch.outputStagingPolicySha256){
    blockers.push('TRAINING_RUN_CHECKPOINT_STAGING_POLICY_MISMATCH');
  }
}

function receiptValuesFromLaunch(
  preflight:HsmeDenseStudentTrainingPreflightV1,
  launch:HsmeDenseStudentLaunchSpecV1,
  digests:{
    preflightEvidenceSha256:string|'UNKNOWN';
    launchSpecSha256:string|'UNKNOWN';
  },
):PartialReceiptValues{
  return {
    preflightEvidenceSha256:digests.preflightEvidenceSha256,
    launchSpecSha256:digests.launchSpecSha256,
    requestEvidenceSha256:valueOrUnknown(preflight.requestEvidenceSha256),
    admissionEvidenceSha256:valueOrUnknown(preflight.admissionEvidenceSha256),
    toolchainManifestSha256:valueOrUnknown(preflight.toolchainManifestSha256),
    backend:launch.backend,
    outputStagingAuthorityId:launch.outputStagingAuthorityId,
    outputStagingPolicySha256:launch.outputStagingPolicySha256,
    teacherDecisionSha256:launch.teacherDecisionSha256,
    reproductionEvidenceSha256:launch.reproductionEvidenceSha256,
    corpusRootDigest:launch.corpusRootDigest,
    recipeDigest:launch.recipeDigest,
    inputCheckpointSha256:launch.checkpointSha256,
    resumeCheckpointSha256:launch.resumeCheckpointSha256,
  };
}

function receiptValuesFromResult(
  result:CoreHsmeDenseStudentExecutionResultV1,
):PartialReceiptValues{
  return {
    executionAttemptId:result.executionAttemptId,
    backend:result.backend,
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
    outputStagingAuthorityId:result.outputStagingAuthorityId,
    outputStagingPolicySha256:result.outputStagingPolicySha256,
    runnerResultSha256:result.runnerResultSha256,
    ...(result.stagedCheckpoint
      ?receiptValuesFromCheckpoint(result.stagedCheckpoint)
      :{}),
  };
}

function receiptValuesFromCheckpoint(
  checkpoint:CoreHsmeDenseStudentStagedCheckpointV1,
):PartialReceiptValues{
  return {
    stagedCheckpointSha256:checkpoint.checkpointSha256,
    stagedCheckpointBytes:checkpoint.checkpointBytes,
    checkpointMetadataSha256:checkpoint.checkpointMetadataSha256,
    teacherDecisionSha256:checkpoint.teacherDecisionSha256,
    reproductionEvidenceSha256:checkpoint.reproductionEvidenceSha256,
    corpusRootDigest:checkpoint.corpusRootDigest,
    recipeDigest:checkpoint.recipeDigest,
    inputCheckpointSha256:checkpoint.inputCheckpointSha256,
    resumeCheckpointSha256:checkpoint.resumeCheckpointSha256,
  };
}

function promotionBoundary(){
  return Object.freeze({
    checkpointPromotionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    durableModelFleetPromotionAllowed:false as const,
    winnerSelectionAllowed:false as const,
  });
}

type PartialReceiptValues=Partial<Omit<
  HsmeDenseStudentTrainingRunReceiptV1,
  'schemaVersion'|'state'|'blockers'|'receiptEvidenceSha256'|
  'checkpointPromotionAllowed'|'modelInstallAllowed'|'modelFleetPromotionAllowed'|
  'productionAuthorityGranted'|'providerAuthorityGranted'|'billingAuthorityGranted'|
  'projectArtifactMutationAllowed'|'aeeExecutionAuthorityGranted'|
  'durableModelFleetPromotionAllowed'|'winnerSelectionAllowed'
>>;

function invalid(
  blockers:readonly string[],
  values:PartialReceiptValues={},
):HsmeDenseStudentTrainingRunReceiptV1{
  return terminal('TRAINING_RUN_INVALID',blockers,values);
}

function blocked(
  blockers:readonly string[],
  values:PartialReceiptValues={},
):HsmeDenseStudentTrainingRunReceiptV1{
  return terminal('TRAINING_RUN_BLOCKED',blockers,values);
}

function failed(
  blockers:readonly string[],
  values:PartialReceiptValues={},
):HsmeDenseStudentTrainingRunReceiptV1{
  return terminal('TRAINING_RUN_FAILED',blockers,values);
}

function terminal(
  state:'TRAINING_RUN_INVALID'|'TRAINING_RUN_BLOCKED'|'TRAINING_RUN_FAILED',
  blockers:readonly string[],
  values:PartialReceiptValues,
):HsmeDenseStudentTrainingRunReceiptV1{
  return Object.freeze({
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    preflightEvidenceSha256:values.preflightEvidenceSha256??'UNKNOWN',
    launchSpecSha256:values.launchSpecSha256??'UNKNOWN',
    requestEvidenceSha256:values.requestEvidenceSha256??'UNKNOWN',
    admissionEvidenceSha256:values.admissionEvidenceSha256??'UNKNOWN',
    toolchainManifestSha256:values.toolchainManifestSha256??'UNKNOWN',
    executionAttemptId:values.executionAttemptId??'UNKNOWN',
    backend:values.backend??null,
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
    outputStagingAuthorityId:values.outputStagingAuthorityId??'UNKNOWN',
    outputStagingPolicySha256:values.outputStagingPolicySha256??'UNKNOWN',
    stagedCheckpointSha256:values.stagedCheckpointSha256??'UNKNOWN',
    stagedCheckpointBytes:values.stagedCheckpointBytes??'UNKNOWN',
    checkpointMetadataSha256:values.checkpointMetadataSha256??'UNKNOWN',
    teacherDecisionSha256:values.teacherDecisionSha256??'UNKNOWN',
    reproductionEvidenceSha256:values.reproductionEvidenceSha256??'UNKNOWN',
    corpusRootDigest:values.corpusRootDigest??'UNKNOWN',
    recipeDigest:values.recipeDigest??'UNKNOWN',
    inputCheckpointSha256:values.inputCheckpointSha256??'UNKNOWN',
    resumeCheckpointSha256:values.resumeCheckpointSha256??'UNKNOWN',
    runnerResultSha256:values.runnerResultSha256??'UNKNOWN',
    receiptEvidenceSha256:'UNKNOWN',
    ...promotionBoundary(),
  });
}

function preflightAuthorityWidened(
  value:HsmeDenseStudentTrainingPreflightV1,
):boolean{
  return value.processSpawned!==false
    ||value.trainingStarted!==false
    ||value.checkpointWritten!==false
    ||value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.winnerSelectionAllowed!==false;
}

function launchAuthorityWidened(value:HsmeDenseStudentLaunchSpecV1):boolean{
  return value.processSpawned!==false
    ||value.trainingStarted!==false
    ||value.checkpointWritten!==false
    ||value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.winnerSelectionAllowed!==false;
}

function normalizeBackend(raw:unknown,path:string):BackendBinding{
  const record=exactRecord(raw,[
    'backendClass','providerId','accountId','executionEnvironmentId',
  ],path);
  if(record.backendClass!=='CUDA_GPU'){
    fail('hsme_training_run_backend','backend must remain CUDA_GPU');
  }
  return Object.freeze({
    backendClass:'CUDA_GPU',
    providerId:identifier(record.providerId,path+'.providerId',120),
    accountId:identifier(record.accountId,path+'.accountId',160),
    executionEnvironmentId:identifier(
      record.executionEnvironmentId,
      path+'.executionEnvironmentId',
      160,
    ),
  });
}

function sameBackend(a:BackendBinding,b:BackendBinding):boolean{
  return a.backendClass===b.backendClass
    &&a.providerId===b.providerId
    &&a.accountId===b.accountId
    &&a.executionEnvironmentId===b.executionEnvironmentId;
}

function exactRecord(
  raw:unknown,
  allowed:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_training_run_exact_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==allowed.length
    ||keys.some(key=>!allowed.includes(key))
    ||allowed.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_training_run_exact_schema',path+' has unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_training_run_enum',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  if(
    typeof raw!=='string'
    ||raw.length<1
    ||raw.length>max
    ||raw.trim()!==raw
    ||!IDENTIFIER.test(raw)
  ){
    fail('hsme_training_run_identifier',path+' is invalid');
  }
  return raw;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_training_run_hash',path+' must be lowercase SHA-256');
  }
  return raw;
}

function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_training_run_integer',path+' must be a bounded safe integer');
  }
  return raw as number;
}

function bool(raw:unknown,path:string):boolean{
  if(typeof raw!=='boolean')fail('hsme_training_run_boolean',path+' must be boolean');
  return raw;
}

function sameStrings(a:readonly string[],b:readonly string[]):boolean{
  return a.length===b.length&&a.every((value,index)=>value===b[index]);
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return typeof value==='string'&&HEX64.test(value)?value:'UNKNOWN';
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
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
    fail('hsme_training_run_hash_port','hash port must return lowercase SHA-256');
  }
  return result;
}

function errorCodeSuffix(error:unknown):string{
  if(error&&typeof error==='object'&&'code' in error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='string'&&code.length>0)return ':'+code;
  }
  return '';
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

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function fail(code:string,message:string):never{
  throw new HsmeDenseStudentProtectedTrainingRunV1Error(code,message);
}
