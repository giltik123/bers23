import {
  HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
  type HsmeFullStudentTrainingRunRequestV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFullStudentTrainingRunRequestV1.ts';

export const CORE_HSME_PROTECTED_TRAINING_ADMISSION_INPUT_V1_SCHEMA =
  'BERS_CORE_HSME_PROTECTED_TRAINING_ADMISSION_INPUT_V1' as const;
export const CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA =
  'BERS_CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1' as const;
export const CORE_HSME_PROTECTED_TRAINING_ADMISSION_DIGEST_DOMAIN =
  'bers:core:hsme:protected-training-admission:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;
const MAX_TTL_MS=86_400_000;

export type CoreHsmeProtectedTrainingScopeV1=Readonly<{
  tenantId:string;
  userId:string;
  projectId:string;
}>;

export type CoreHsmeProtectedTrainingBackendV1=Readonly<{
  backendClass:
    | 'CUDA_GPU'
    | 'ROCM_GPU'
    | 'METAL_GPU'
    | 'TPU'
    | 'OTHER_PROTECTED_ACCELERATOR';
  providerId:string;
  accountId:string;
  executionEnvironmentId:string;
}>;

export type CoreHsmeProtectedTrainingResourceCeilingsV1=Readonly<{
  maxTrainingExamples:number;
  maxGpuSeconds:number;
  maxTrainingCostMicrousd:number;
}>;

export type CoreHsmeProtectedTrainingOutputStagingV1=Readonly<{
  stagingAuthorityId:string;
  policySha256:string;
  promotedModelFleetIdentity:false;
}>;

export type CoreHsmeProtectedTrainingAdmissionInputV1=Readonly<{
  schemaVersion:typeof CORE_HSME_PROTECTED_TRAINING_ADMISSION_INPUT_V1_SCHEMA;
  scope:CoreHsmeProtectedTrainingScopeV1;
  executionClass:'OFFLINE_PROTECTED_TRAINING';
  backend:CoreHsmeProtectedTrainingBackendV1;
  resourceCeilings:CoreHsmeProtectedTrainingResourceCeilingsV1;
  billingAuthorizationRef:string|'NONE';
  toolchainLockSha256:string;
  outputStaging:CoreHsmeProtectedTrainingOutputStagingV1;
  idempotencyKey:string;
  admissionNonce:string;
  issuedAtMs:number;
  expiresAtMs:number;
}>;

export interface CoreHsmeProtectedTrainingRequestOriginVerifierV1{
  verifyTrainingRunRequest(
    request:HsmeFullStudentTrainingRunRequestV1,
    expectedRequestEvidenceSha256:string,
  ):Promise<boolean>;
}

export interface CoreHsmeProtectedTrainingPolicyV1{
  verifyProjectTrainingPolicy(
    scope:CoreHsmeProtectedTrainingScopeV1,
    candidateId:string,
  ):Promise<boolean>;
  verifyBackendBinding(
    backend:CoreHsmeProtectedTrainingBackendV1,
    scope:CoreHsmeProtectedTrainingScopeV1,
  ):Promise<boolean>;
  verifyBillingAuthorization(
    billingAuthorizationRef:string,
    scope:CoreHsmeProtectedTrainingScopeV1,
    maxTrainingCostMicrousd:number,
  ):Promise<boolean>;
  verifyOutputStagingAuthority(
    outputStaging:CoreHsmeProtectedTrainingOutputStagingV1,
    scope:CoreHsmeProtectedTrainingScopeV1,
  ):Promise<boolean>;
}

export interface CoreHsmeProtectedTrainingHashPortV1{
  sha256(bytes:Uint8Array):Promise<string>;
}

export type CoreHsmeProtectedTrainingAdmissionStateV1=
  | 'TRAINING_ADMISSION_INVALID'
  | 'TRAINING_ADMISSION_DENIED'
  | 'TRAINING_ADMISSION_ADMITTED_NOT_STARTED';

export type CoreHsmeProtectedTrainingAdmissionV1=Readonly<{
  schemaVersion:typeof CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA;
  state:CoreHsmeProtectedTrainingAdmissionStateV1;
  blockers:readonly string[];
  requestEvidenceSha256:string|'UNKNOWN';
  candidateId:string|'UNKNOWN';
  scope:CoreHsmeProtectedTrainingScopeV1|null;
  executionClass:'OFFLINE_PROTECTED_TRAINING'|'UNKNOWN';
  backend:CoreHsmeProtectedTrainingBackendV1|null;
  resourceCeilings:CoreHsmeProtectedTrainingResourceCeilingsV1|null;
  billingAuthorizationRef:string|'NONE'|'UNKNOWN';
  toolchainLockSha256:string|'UNKNOWN';
  outputStagingAuthorityId:string|'UNKNOWN';
  outputStagingPolicySha256:string|'UNKNOWN';
  idempotencyKey:string|'UNKNOWN';
  admissionNonce:string|'UNKNOWN';
  issuedAtMs:number|'UNKNOWN';
  expiresAtMs:number|'UNKNOWN';
  admissionEvidenceSha256:string|'UNKNOWN';
  protectedTrainingExecutionAdmitted:boolean;
  trainingStarted:false;
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class CoreHsmeProtectedTrainingAdmissionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='CoreHsmeProtectedTrainingAdmissionV1Error';
    this.code=code;
  }
}

export async function admitCoreHsmeProtectedTrainingV1(
  request:HsmeFullStudentTrainingRunRequestV1,
  rawInput:unknown,
  origin:CoreHsmeProtectedTrainingRequestOriginVerifierV1,
  policy:CoreHsmeProtectedTrainingPolicyV1,
  hash:CoreHsmeProtectedTrainingHashPortV1,
):Promise<CoreHsmeProtectedTrainingAdmissionV1>{
  if(!request||request.schemaVersion!==HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA){
    return invalid(['CORE_TRAINING_REQUEST_SCHEMA_INVALID']);
  }
  if(request.state!=='TRAINING_RUN_REQUEST_READY_FOR_CORE_ADMISSION'){
    return denied(['CORE_TRAINING_REQUEST_NOT_READY'],{
      requestEvidenceSha256:valueOrUnknown(request.requestEvidenceSha256),
      candidateId:valueOrUnknownIdentifier(request.candidateId),
    });
  }

  const invalidBlockers:string[]=[];
  if(!Array.isArray(request.blockers)||request.blockers.length!==0){
    invalidBlockers.push('CORE_TRAINING_REQUEST_BLOCKERS_PRESENT');
  }
  if(
    request.coreAdmissionRequired!==true
    ||request.coreExecutionTicketPresent!==false
    ||request.providerSelectionAllowed!==false
    ||request.executionTargetSelectionAllowed!==false
    ||request.trainingRunStartAllowed!==false
    ||request.trainingOrDistillationExecutionAllowed!==false
    ||request.checkpointPromotionAllowed!==false
    ||request.modelInstallAllowed!==false
    ||request.modelFleetPromotionAllowed!==false
    ||request.productionAuthorityGranted!==false
    ||request.providerAuthorityGranted!==false
    ||request.billingAuthorityGranted!==false
    ||request.projectArtifactMutationAllowed!==false
    ||request.aeeExecutionAuthorityGranted!==false
    ||request.durableModelFleetPromotionAllowed!==false
    ||request.winnerSelectionAllowed!==false
  ){
    invalidBlockers.push('CORE_TRAINING_REQUEST_AUTHORITY_WIDENING');
  }
  for(const value of [
    request.trainingPlanEvidenceSha256,
    request.denseBaselineDecisionSha256,
    request.denseDualBudgetEvidenceSha256,
    request.toolchainLockSha256,
    request.outputStagingPolicySha256,
    request.teacherDecisionSha256,
    request.reproductionEvidenceSha256,
    request.corpusRootDigest,
    request.recipeDigest,
    request.checkpointSha256,
  ]){
    if(!digestKnown(value)){
      invalidBlockers.push('CORE_TRAINING_REQUEST_PROVENANCE_INCOMPLETE');
      break;
    }
  }
  if(
    request.resumeCheckpointSha256!=='UNKNOWN'
    &&!digestKnown(request.resumeCheckpointSha256)
  ){
    invalidBlockers.push('CORE_TRAINING_REQUEST_RESUME_DIGEST_INVALID');
  }
  if(
    request.candidateId==='UNKNOWN'
    ||request.architectureFamily!=='COMPACT_DIT'
    ||request.activeParametersMillions==='UNKNOWN'
    ||request.targetStepCount==='UNKNOWN'
    ||request.maxTrainingExamples==='UNKNOWN'
    ||request.maxGpuSeconds==='UNKNOWN'
    ||request.maxTrainingCostMicrousd==='UNKNOWN'
  ){
    invalidBlockers.push('CORE_TRAINING_REQUEST_EXECUTION_ENVELOPE_INCOMPLETE');
  }
  if(request.dualBudgetSnapshot.efficiencyDisposition!=='R&D_ONLY'){
    invalidBlockers.push('CORE_TRAINING_REQUEST_NOT_R_AND_D_ONLY');
  }

  let requestEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  if(invalidBlockers.length===0){
    try{
      requestEvidenceSha256=await digest(
        HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_DIGEST_DOMAIN,
        trainingRequestPayload(request),
        hash,
      );
      if(requestEvidenceSha256!==request.requestEvidenceSha256){
        invalidBlockers.push('CORE_TRAINING_REQUEST_REHASH_MISMATCH');
      }else if(!await verify(
        ()=>origin.verifyTrainingRunRequest(request,requestEvidenceSha256 as string),
      )){
        invalidBlockers.push('CORE_TRAINING_REQUEST_ORIGIN_UNVERIFIED');
      }
    }catch{
      invalidBlockers.push('CORE_TRAINING_REQUEST_REHASH_INVALID');
    }
  }
  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,{
      requestEvidenceSha256,
      candidateId:valueOrUnknownIdentifier(request.candidateId),
    });
  }

  let input:CoreHsmeProtectedTrainingAdmissionInputV1;
  try{
    input=normalizeAdmissionInput(rawInput);
  }catch(error){
    return invalid([
      'CORE_TRAINING_ADMISSION_INPUT_INVALID'+errorCodeSuffix(error),
    ],{
      requestEvidenceSha256,
      candidateId:request.candidateId,
    });
  }

  const common=outputValues(requestEvidenceSha256,request.candidateId,input);

  if(input.toolchainLockSha256!==request.toolchainLockSha256){
    return invalid(['CORE_TRAINING_TOOLCHAIN_BINDING_MISMATCH'],common);
  }
  if(input.outputStaging.policySha256!==request.outputStagingPolicySha256){
    return invalid(['CORE_TRAINING_STAGING_POLICY_BINDING_MISMATCH'],common);
  }
  if(input.outputStaging.promotedModelFleetIdentity!==false){
    return invalid(['CORE_TRAINING_STAGING_MODEL_FLEET_ALIAS_FORBIDDEN'],common);
  }

  const requestMaxExamples=request.maxTrainingExamples as number;
  const requestMaxGpuSeconds=request.maxGpuSeconds as number;
  const requestMaxCost=request.maxTrainingCostMicrousd as number;
  const deniedBlockers:string[]=[];
  if(
    input.resourceCeilings.maxTrainingExamples>requestMaxExamples
    ||input.resourceCeilings.maxGpuSeconds>requestMaxGpuSeconds
    ||input.resourceCeilings.maxTrainingCostMicrousd>requestMaxCost
  ){
    deniedBlockers.push('CORE_TRAINING_RESOURCE_ESCALATION_DENIED');
  }
  if(
    input.resourceCeilings.maxTrainingCostMicrousd>0
    &&input.billingAuthorizationRef==='NONE'
  ){
    deniedBlockers.push('CORE_TRAINING_BILLING_AUTHORIZATION_REQUIRED');
  }

  const projectAllowed=await verify(
    ()=>policy.verifyProjectTrainingPolicy(input.scope,request.candidateId as string),
  );
  if(!projectAllowed){
    deniedBlockers.push('CORE_TRAINING_PROJECT_POLICY_DENIED');
  }
  const backendAllowed=await verify(
    ()=>policy.verifyBackendBinding(input.backend,input.scope),
  );
  if(!backendAllowed){
    deniedBlockers.push('CORE_TRAINING_BACKEND_DENIED');
  }
  const stagingAllowed=await verify(
    ()=>policy.verifyOutputStagingAuthority(input.outputStaging,input.scope),
  );
  if(!stagingAllowed){
    deniedBlockers.push('CORE_TRAINING_STAGING_AUTHORITY_DENIED');
  }
  if(
    input.billingAuthorizationRef!=='NONE'
    ||input.resourceCeilings.maxTrainingCostMicrousd>0
  ){
    const billingAllowed=await verify(
      ()=>policy.verifyBillingAuthorization(
        input.billingAuthorizationRef,
        input.scope,
        input.resourceCeilings.maxTrainingCostMicrousd,
      ),
    );
    if(!billingAllowed){
      deniedBlockers.push('CORE_TRAINING_BILLING_AUTHORIZATION_DENIED');
    }
  }

  if(deniedBlockers.length>0){
    return denied(deniedBlockers,common);
  }

  const admittedPayload={
    schemaVersion:CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA,
    state:'TRAINING_ADMISSION_ADMITTED_NOT_STARTED' as const,
    ...common,
    protectedTrainingExecutionAdmitted:true,
    ...authorityBoundary(),
  };
  let admissionEvidenceSha256:string;
  try{
    admissionEvidenceSha256=await digest(
      CORE_HSME_PROTECTED_TRAINING_ADMISSION_DIGEST_DOMAIN,
      admittedPayload,
      hash,
    );
  }catch{
    return invalid(['CORE_TRAINING_ADMISSION_OUTPUT_HASH_INVALID'],common);
  }
  return Object.freeze({
    ...admittedPayload,
    blockers:Object.freeze([]),
    admissionEvidenceSha256,
  });
}

function normalizeAdmissionInput(
  raw:unknown,
):CoreHsmeProtectedTrainingAdmissionInputV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'scope',
    'executionClass',
    'backend',
    'resourceCeilings',
    'billingAuthorizationRef',
    'toolchainLockSha256',
    'outputStaging',
    'idempotencyKey',
    'admissionNonce',
    'issuedAtMs',
    'expiresAtMs',
  ],'admission');
  if(record.schemaVersion!==CORE_HSME_PROTECTED_TRAINING_ADMISSION_INPUT_V1_SCHEMA){
    fail('core_training_admission_schema','admission input schema is unsupported');
  }
  if(record.executionClass!=='OFFLINE_PROTECTED_TRAINING'){
    fail('core_training_execution_class','executionClass must be OFFLINE_PROTECTED_TRAINING');
  }
  const scopeRecord=exactRecord(
    record.scope,
    ['tenantId','userId','projectId'],
    'admission.scope',
  );
  const scope=Object.freeze({
    tenantId:identifier(scopeRecord.tenantId,'admission.scope.tenantId',120),
    userId:identifier(scopeRecord.userId,'admission.scope.userId',120),
    projectId:identifier(scopeRecord.projectId,'admission.scope.projectId',120),
  });
  const backendRecord=exactRecord(
    record.backend,
    ['backendClass','providerId','accountId','executionEnvironmentId'],
    'admission.backend',
  );
  const backendClass=enumValue(
    backendRecord.backendClass,
    ['CUDA_GPU','ROCM_GPU','METAL_GPU','TPU','OTHER_PROTECTED_ACCELERATOR'] as const,
    'admission.backend.backendClass',
  );
  const backend=Object.freeze({
    backendClass,
    providerId:identifier(backendRecord.providerId,'admission.backend.providerId',120),
    accountId:identifier(backendRecord.accountId,'admission.backend.accountId',160),
    executionEnvironmentId:identifier(
      backendRecord.executionEnvironmentId,
      'admission.backend.executionEnvironmentId',
      160,
    ),
  });
  const resourcesRecord=exactRecord(
    record.resourceCeilings,
    ['maxTrainingExamples','maxGpuSeconds','maxTrainingCostMicrousd'],
    'admission.resourceCeilings',
  );
  const resourceCeilings=Object.freeze({
    maxTrainingExamples:safeInteger(
      resourcesRecord.maxTrainingExamples,
      'admission.resourceCeilings.maxTrainingExamples',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxGpuSeconds:safeInteger(
      resourcesRecord.maxGpuSeconds,
      'admission.resourceCeilings.maxGpuSeconds',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxTrainingCostMicrousd:safeInteger(
      resourcesRecord.maxTrainingCostMicrousd,
      'admission.resourceCeilings.maxTrainingCostMicrousd',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
  });
  const billingAuthorizationRef=record.billingAuthorizationRef==='NONE'
    ?'NONE' as const
    :identifier(
      record.billingAuthorizationRef,
      'admission.billingAuthorizationRef',
      200,
    );
  const outputRecord=exactRecord(
    record.outputStaging,
    ['stagingAuthorityId','policySha256','promotedModelFleetIdentity'],
    'admission.outputStaging',
  );
  if(outputRecord.promotedModelFleetIdentity!==false){
    fail(
      'core_training_staging_model_fleet_alias',
      'output staging cannot be a promoted ModelFleet identity',
    );
  }
  const outputStaging=Object.freeze({
    stagingAuthorityId:identifier(
      outputRecord.stagingAuthorityId,
      'admission.outputStaging.stagingAuthorityId',
      160,
    ),
    policySha256:sha256(
      outputRecord.policySha256,
      'admission.outputStaging.policySha256',
    ),
    promotedModelFleetIdentity:false as const,
  });
  const issuedAtMs=safeInteger(
    record.issuedAtMs,
    'admission.issuedAtMs',
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const expiresAtMs=safeInteger(
    record.expiresAtMs,
    'admission.expiresAtMs',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if(expiresAtMs<=issuedAtMs||expiresAtMs-issuedAtMs>MAX_TTL_MS){
    fail(
      'core_training_admission_ttl',
      'admission expiry must be after issue time and within the bounded TTL',
    );
  }

  return Object.freeze({
    schemaVersion:CORE_HSME_PROTECTED_TRAINING_ADMISSION_INPUT_V1_SCHEMA,
    scope,
    executionClass:'OFFLINE_PROTECTED_TRAINING',
    backend,
    resourceCeilings,
    billingAuthorizationRef,
    toolchainLockSha256:sha256(
      record.toolchainLockSha256,
      'admission.toolchainLockSha256',
    ),
    outputStaging,
    idempotencyKey:identifier(record.idempotencyKey,'admission.idempotencyKey',200),
    admissionNonce:identifier(record.admissionNonce,'admission.admissionNonce',200),
    issuedAtMs,
    expiresAtMs,
  });
}

function trainingRequestPayload(value:HsmeFullStudentTrainingRunRequestV1){
  return {
    schemaVersion:HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
    state:'TRAINING_RUN_REQUEST_READY_FOR_CORE_ADMISSION' as const,
    trainingPlanEvidenceSha256:value.trainingPlanEvidenceSha256,
    denseBaselineDecisionSha256:value.denseBaselineDecisionSha256,
    denseDualBudgetEvidenceSha256:value.denseDualBudgetEvidenceSha256,
    candidateId:value.candidateId,
    architectureFamily:value.architectureFamily,
    activeParametersMillions:value.activeParametersMillions,
    targetStepCount:value.targetStepCount,
    maxTrainingExamples:value.maxTrainingExamples,
    maxGpuSeconds:value.maxGpuSeconds,
    maxTrainingCostMicrousd:value.maxTrainingCostMicrousd,
    toolchainLockSha256:value.toolchainLockSha256,
    outputStagingPolicySha256:value.outputStagingPolicySha256,
    teacherDecisionSha256:value.teacherDecisionSha256,
    reproductionEvidenceSha256:value.reproductionEvidenceSha256,
    corpusRootDigest:value.corpusRootDigest,
    recipeDigest:value.recipeDigest,
    checkpointSha256:value.checkpointSha256,
    resumeCheckpointSha256:value.resumeCheckpointSha256,
    dualBudgetSnapshot:value.dualBudgetSnapshot,
    coreAdmissionRequired:true as const,
    coreExecutionTicketPresent:false as const,
    providerSelectionAllowed:false as const,
    executionTargetSelectionAllowed:false as const,
    trainingRunStartAllowed:false as const,
    trainingOrDistillationExecutionAllowed:false as const,
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
  };
}

export async function coreHsmeProtectedTrainingAdmissionV1Digest(
  admission:CoreHsmeProtectedTrainingAdmissionV1,
  hash:CoreHsmeProtectedTrainingHashPortV1,
):Promise<string>{
  if(
    admission.state!=='TRAINING_ADMISSION_ADMITTED_NOT_STARTED'
    ||admission.protectedTrainingExecutionAdmitted!==true
  ){
    throw new CoreHsmeProtectedTrainingAdmissionV1Error(
      'core_training_admission_digest_state',
      'only ADMITTED_NOT_STARTED admission records are digestible',
    );
  }
  const payload={
    schemaVersion:CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA,
    state:'TRAINING_ADMISSION_ADMITTED_NOT_STARTED' as const,
    requestEvidenceSha256:admission.requestEvidenceSha256,
    candidateId:admission.candidateId,
    scope:admission.scope,
    executionClass:admission.executionClass,
    backend:admission.backend,
    resourceCeilings:admission.resourceCeilings,
    billingAuthorizationRef:admission.billingAuthorizationRef,
    toolchainLockSha256:admission.toolchainLockSha256,
    outputStagingAuthorityId:admission.outputStagingAuthorityId,
    outputStagingPolicySha256:admission.outputStagingPolicySha256,
    idempotencyKey:admission.idempotencyKey,
    admissionNonce:admission.admissionNonce,
    issuedAtMs:admission.issuedAtMs,
    expiresAtMs:admission.expiresAtMs,
    protectedTrainingExecutionAdmitted:true as const,
    ...authorityBoundary(),
  };
  return digest(
    CORE_HSME_PROTECTED_TRAINING_ADMISSION_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function outputValues(
  requestEvidenceSha256:string,
  candidateId:string,
  input:CoreHsmeProtectedTrainingAdmissionInputV1,
){
  return {
    requestEvidenceSha256,
    candidateId,
    scope:input.scope,
    executionClass:'OFFLINE_PROTECTED_TRAINING' as const,
    backend:input.backend,
    resourceCeilings:input.resourceCeilings,
    billingAuthorizationRef:input.billingAuthorizationRef,
    toolchainLockSha256:input.toolchainLockSha256,
    outputStagingAuthorityId:input.outputStaging.stagingAuthorityId,
    outputStagingPolicySha256:input.outputStaging.policySha256,
    idempotencyKey:input.idempotencyKey,
    admissionNonce:input.admissionNonce,
    issuedAtMs:input.issuedAtMs,
    expiresAtMs:input.expiresAtMs,
  };
}

function authorityBoundary(){
  return Object.freeze({
    trainingStarted:false as const,
    checkpointPromotionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

type PartialOutput=Partial<Pick<
  CoreHsmeProtectedTrainingAdmissionV1,
  'requestEvidenceSha256'|'candidateId'|'scope'|'executionClass'|'backend'|
  'resourceCeilings'|'billingAuthorizationRef'|'toolchainLockSha256'|
  'outputStagingAuthorityId'|'outputStagingPolicySha256'|'idempotencyKey'|
  'admissionNonce'|'issuedAtMs'|
  'expiresAtMs'
>>;

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):CoreHsmeProtectedTrainingAdmissionV1{
  return terminal('TRAINING_ADMISSION_INVALID',blockers,values);
}

function denied(
  blockers:readonly string[],
  values:PartialOutput={},
):CoreHsmeProtectedTrainingAdmissionV1{
  return terminal('TRAINING_ADMISSION_DENIED',blockers,values);
}

function terminal(
  state:'TRAINING_ADMISSION_INVALID'|'TRAINING_ADMISSION_DENIED',
  blockers:readonly string[],
  values:PartialOutput,
):CoreHsmeProtectedTrainingAdmissionV1{
  return Object.freeze({
    schemaVersion:CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    requestEvidenceSha256:values.requestEvidenceSha256??'UNKNOWN',
    candidateId:values.candidateId??'UNKNOWN',
    scope:values.scope??null,
    executionClass:values.executionClass??'UNKNOWN',
    backend:values.backend??null,
    resourceCeilings:values.resourceCeilings??null,
    billingAuthorizationRef:values.billingAuthorizationRef??'UNKNOWN',
    toolchainLockSha256:values.toolchainLockSha256??'UNKNOWN',
    outputStagingAuthorityId:values.outputStagingAuthorityId??'UNKNOWN',
    outputStagingPolicySha256:values.outputStagingPolicySha256??'UNKNOWN',
    idempotencyKey:values.idempotencyKey??'UNKNOWN',
    admissionNonce:values.admissionNonce??'UNKNOWN',
    issuedAtMs:values.issuedAtMs??'UNKNOWN',
    expiresAtMs:values.expiresAtMs??'UNKNOWN',
    admissionEvidenceSha256:'UNKNOWN',
    protectedTrainingExecutionAdmitted:false,
    ...authorityBoundary(),
  });
}

function exactRecord(
  raw:unknown,
  allowed:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('core_training_exact_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==allowed.length
    ||keys.some(key=>!allowed.includes(key))
    ||allowed.some(key=>!Object.hasOwn(record,key))
  ){
    fail('core_training_exact_schema',path+' has unknown or missing fields');
  }
  return record;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('core_training_value_invalid',path+' is unsupported');
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
    fail('core_training_identifier_invalid',path+' is invalid');
  }
  return raw;
}

function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('core_training_integer_invalid',path+' must be a bounded safe integer');
  }
  return raw as number;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('core_training_hash_invalid',path+' must be lowercase SHA-256');
  }
  return raw;
}

async function digest(
  domain:string,
  value:unknown,
  hash:CoreHsmeProtectedTrainingHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('core_training_hash_port_invalid','hash port must return lowercase SHA-256');
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function digestKnown(value:string|'UNKNOWN'):value is string{
  return value!=='UNKNOWN'&&HEX64.test(value);
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return digestKnown(value)?value:'UNKNOWN';
}

function valueOrUnknownIdentifier(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return value!=='UNKNOWN'&&IDENTIFIER.test(value)?value:'UNKNOWN';
}

function errorCodeSuffix(error:unknown):string{
  if(error&&typeof error==='object'&&'code' in error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='string'&&code.length>0)return ':'+code;
  }
  return '';
}

function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}

function fail(code:string,message:string):never{
  throw new CoreHsmeProtectedTrainingAdmissionV1Error(code,message);
}
