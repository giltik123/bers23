import {
  HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
  hsmeFullStudentTrainingRunRequestV1Digest,
  type HsmeFullStudentTrainingRunRequestV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFullStudentTrainingRunRequestV1.ts';
import {
  CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA,
  coreHsmeProtectedTrainingAdmissionV1Digest,
  type CoreHsmeProtectedTrainingAdmissionV1,
} from './HsmeProtectedTrainingAdmissionV1.ts';

export const HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_V1' as const;
export const HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_LAUNCH_SPEC_V1' as const;
export const HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1' as const;

export const HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_DIGEST_DOMAIN =
  'bers:hsme:dense-student-training-toolchain:v1\0' as const;
export const HSME_DENSE_STUDENT_LAUNCH_SPEC_DIGEST_DOMAIN =
  'bers:hsme:dense-student-launch-spec:v1\0' as const;
export const HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_DIGEST_DOMAIN =
  'bers:hsme:dense-student-training-preflight:v1\0' as const;

export const HSME_DENSE_STUDENT_ENTRYPOINT_V1 =
  'scripts/hsme-dense-student-train.py' as const;
export const HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1 =
  'scripts/hsme-dense-student-training.requirements.lock' as const;

export const HSME_DENSE_STUDENT_PYTHON_VERSION_V1 = '3.12' as const;
export const HSME_DENSE_STUDENT_PINNED_PACKAGES_V1 = Object.freeze({
  torch:'2.14.0',
  diffusers:'0.40.0',
  transformers:'5.17.0',
  accelerate:'1.15.0',
  safetensors:'0.8.0',
  numpy:'2.5.3',
  huggingfaceHub:'1.32.0',
  sentencepiece:'0.2.2',
} as const);

const HEX64=/^[0-9a-f]{64}$/;
const COMMIT40=/^[0-9a-f]{40}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeDenseStudentTrainingToolchainV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_V1_SCHEMA;
  pythonVersion:typeof HSME_DENSE_STUDENT_PYTHON_VERSION_V1;
  os:'LINUX';
  arch:'X86_64';
  backendClass:'CUDA_GPU';
  immutableEnvironmentSha256:string;
  packages:Readonly<typeof HSME_DENSE_STUDENT_PINNED_PACKAGES_V1>;
  acceleratorRuntime:Readonly<{
    kind:'CUDA';
    identity:string;
  }>;
  repositoryCommitSha:string;
  entrypoint:Readonly<{
    relativePath:typeof HSME_DENSE_STUDENT_ENTRYPOINT_V1;
    fileSha256:string;
  }>;
  dependencyLock:Readonly<{
    relativePath:typeof HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1;
    fileSha256:string;
  }>;
  deterministicAlgorithmPolicy:'TORCH_DETERMINISTIC_ALGORITHMS_REQUIRED';
  mixedPrecisionPolicy:'BF16_MODEL_FP32_ACCUMULATION_NO_TF32';
  checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY';
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
}>;

export type HsmeDenseStudentLaunchSpecV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA;
  state:'LAUNCH_SPEC_READY_NOT_EXECUTED';
  requestEvidenceSha256:string;
  admissionEvidenceSha256:string;
  toolchainManifestSha256:string;
  candidateId:string;
  backend:Readonly<{
    backendClass:'CUDA_GPU';
    providerId:string;
    accountId:string;
    executionEnvironmentId:string;
  }>;
  repositoryCommitSha:string;
  interpreter:'python3.12';
  entrypointRelativePath:typeof HSME_DENSE_STUDENT_ENTRYPOINT_V1;
  entrypointFileSha256:string;
  dependencyLockRelativePath:typeof HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1;
  dependencyLockFileSha256:string;
  immutableEnvironmentSha256:string;
  acceleratorRuntimeIdentity:string;
  teacherDecisionSha256:string;
  reproductionEvidenceSha256:string;
  corpusRootDigest:string;
  recipeDigest:string;
  checkpointSha256:string;
  resumeCheckpointSha256:string|'NONE';
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
  resourceCeilings:Readonly<{
    maxTrainingExamples:number;
    maxGpuSeconds:number;
    maxTrainingCostMicrousd:number;
  }>;
  targetStepCount:number;
  activeParametersMillions:number;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
  argv:readonly string[];
  processSpawned:false;
  trainingStarted:false;
  checkpointWritten:false;
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  winnerSelectionAllowed:false;
  launchSpecSha256:string;
}>;

export type HsmeDenseStudentTrainingPreflightStateV1=
  | 'TRAINING_PREFLIGHT_INVALID'
  | 'TRAINING_PREFLIGHT_BLOCKED'
  | 'TRAINING_PREFLIGHT_READY_NOT_EXECUTED';

export type HsmeDenseStudentTrainingPreflightV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA;
  state:HsmeDenseStudentTrainingPreflightStateV1;
  blockers:readonly string[];
  requestEvidenceSha256:string|'UNKNOWN';
  admissionEvidenceSha256:string|'UNKNOWN';
  toolchainManifestSha256:string|'UNKNOWN';
  launchSpecSha256:string|'UNKNOWN';
  launchSpec:HsmeDenseStudentLaunchSpecV1|null;
  preflightEvidenceSha256:string|'UNKNOWN';
  processSpawned:false;
  trainingStarted:false;
  checkpointWritten:false;
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeDenseStudentObservedRepositoryIdentityV1=Readonly<{
  repositoryCommitSha:string;
  entrypointFileSha256:string;
  dependencyLockFileSha256:string;
}>;

export interface HsmeDenseStudentTrainingHashPortV1{
  sha256(bytes:Uint8Array):Promise<string>;
}

export class HsmeDenseStudentTrainingToolchainV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentTrainingToolchainV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDenseStudentTrainingToolchainV1(
  raw:unknown,
):HsmeDenseStudentTrainingToolchainV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'pythonVersion',
    'os',
    'arch',
    'backendClass',
    'immutableEnvironmentSha256',
    'packages',
    'acceleratorRuntime',
    'repositoryCommitSha',
    'entrypoint',
    'dependencyLock',
    'deterministicAlgorithmPolicy',
    'mixedPrecisionPolicy',
    'checkpointSerializationPolicy',
    'networkPolicy',
    'cacheModelInputPolicy',
  ],'toolchain');

  if(record.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_V1_SCHEMA){
    fail('hsme_dense_toolchain_schema','toolchain schema is unsupported');
  }
  if(record.pythonVersion!==HSME_DENSE_STUDENT_PYTHON_VERSION_V1){
    fail('hsme_dense_toolchain_python','python version must match the pinned toolchain');
  }
  if(record.os!=='LINUX'||record.arch!=='X86_64'||record.backendClass!=='CUDA_GPU'){
    fail(
      'hsme_dense_toolchain_platform',
      'v1 toolchain is pinned to LINUX/X86_64/CUDA_GPU',
    );
  }

  const packagesRecord=exactRecord(record.packages,[
    'torch',
    'diffusers',
    'transformers',
    'accelerate',
    'safetensors',
    'numpy',
    'huggingfaceHub',
    'sentencepiece',
  ],'toolchain.packages');
  const packages={
    torch:exactPackageVersion(
      packagesRecord.torch,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.torch,
      'toolchain.packages.torch',
    ),
    diffusers:exactPackageVersion(
      packagesRecord.diffusers,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.diffusers,
      'toolchain.packages.diffusers',
    ),
    transformers:exactPackageVersion(
      packagesRecord.transformers,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.transformers,
      'toolchain.packages.transformers',
    ),
    accelerate:exactPackageVersion(
      packagesRecord.accelerate,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.accelerate,
      'toolchain.packages.accelerate',
    ),
    safetensors:exactPackageVersion(
      packagesRecord.safetensors,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.safetensors,
      'toolchain.packages.safetensors',
    ),
    numpy:exactPackageVersion(
      packagesRecord.numpy,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.numpy,
      'toolchain.packages.numpy',
    ),
    huggingfaceHub:exactPackageVersion(
      packagesRecord.huggingfaceHub,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.huggingfaceHub,
      'toolchain.packages.huggingfaceHub',
    ),
    sentencepiece:exactPackageVersion(
      packagesRecord.sentencepiece,
      HSME_DENSE_STUDENT_PINNED_PACKAGES_V1.sentencepiece,
      'toolchain.packages.sentencepiece',
    ),
  } as const;

  const acceleratorRecord=exactRecord(
    record.acceleratorRuntime,
    ['kind','identity'],
    'toolchain.acceleratorRuntime',
  );
  if(acceleratorRecord.kind!=='CUDA'){
    fail('hsme_dense_toolchain_accelerator','v1 accelerator runtime must be CUDA');
  }
  const acceleratorIdentity=identifier(
    acceleratorRecord.identity,
    'toolchain.acceleratorRuntime.identity',
    160,
  );
  rejectFloatingToken(acceleratorIdentity,'toolchain.acceleratorRuntime.identity');

  const entrypointRecord=exactRecord(
    record.entrypoint,
    ['relativePath','fileSha256'],
    'toolchain.entrypoint',
  );
  if(entrypointRecord.relativePath!==HSME_DENSE_STUDENT_ENTRYPOINT_V1){
    fail(
      'hsme_dense_toolchain_entrypoint_path',
      'toolchain entrypoint path must be repository-owned and fixed',
    );
  }
  const lockRecord=exactRecord(
    record.dependencyLock,
    ['relativePath','fileSha256'],
    'toolchain.dependencyLock',
  );
  if(lockRecord.relativePath!==HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1){
    fail(
      'hsme_dense_toolchain_lock_path',
      'dependency lock path must be repository-owned and fixed',
    );
  }

  if(record.deterministicAlgorithmPolicy!=='TORCH_DETERMINISTIC_ALGORITHMS_REQUIRED'){
    fail('hsme_dense_toolchain_determinism','deterministic algorithm policy drift');
  }
  if(record.mixedPrecisionPolicy!=='BF16_MODEL_FP32_ACCUMULATION_NO_TF32'){
    fail('hsme_dense_toolchain_precision','mixed precision policy drift');
  }
  if(record.checkpointSerializationPolicy!=='SAFETENSORS_ATOMIC_STAGING_ONLY'){
    fail('hsme_dense_toolchain_checkpoint','checkpoint serialization policy drift');
  }
  if(record.networkPolicy!=='SEALED_INPUTS_ONLY'){
    fail('hsme_dense_toolchain_network','network policy must be SEALED_INPUTS_ONLY');
  }
  if(record.cacheModelInputPolicy!=='READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'){
    fail('hsme_dense_toolchain_cache','cache/model input policy drift');
  }

  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_V1_SCHEMA,
    pythonVersion:HSME_DENSE_STUDENT_PYTHON_VERSION_V1,
    os:'LINUX',
    arch:'X86_64',
    backendClass:'CUDA_GPU',
    immutableEnvironmentSha256:sha256(
      record.immutableEnvironmentSha256,
      'toolchain.immutableEnvironmentSha256',
    ),
    packages,
    acceleratorRuntime:{
      kind:'CUDA',
      identity:acceleratorIdentity,
    },
    repositoryCommitSha:commitSha(
      record.repositoryCommitSha,
      'toolchain.repositoryCommitSha',
    ),
    entrypoint:{
      relativePath:HSME_DENSE_STUDENT_ENTRYPOINT_V1,
      fileSha256:sha256(
        entrypointRecord.fileSha256,
        'toolchain.entrypoint.fileSha256',
      ),
    },
    dependencyLock:{
      relativePath:HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
      fileSha256:sha256(
        lockRecord.fileSha256,
        'toolchain.dependencyLock.fileSha256',
      ),
    },
    deterministicAlgorithmPolicy:'TORCH_DETERMINISTIC_ALGORITHMS_REQUIRED',
    mixedPrecisionPolicy:'BF16_MODEL_FP32_ACCUMULATION_NO_TF32',
    checkpointSerializationPolicy:'SAFETENSORS_ATOMIC_STAGING_ONLY',
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  });
}

export async function hsmeDenseStudentTrainingToolchainV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const toolchain=normalizeHsmeDenseStudentTrainingToolchainV1(raw);
  return digest(
    HSME_DENSE_STUDENT_TRAINING_TOOLCHAIN_DIGEST_DOMAIN,
    toolchain,
    hash,
  );
}

export async function preflightHsmeDenseStudentTrainingV1(
  request:HsmeFullStudentTrainingRunRequestV1,
  admission:CoreHsmeProtectedTrainingAdmissionV1,
  rawToolchain:unknown,
  observed:HsmeDenseStudentObservedRepositoryIdentityV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentTrainingPreflightV1>{
  if(
    !request
    ||request.schemaVersion!==HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA
  ){
    return invalid(['TRAINING_PREFLIGHT_REQUEST_SCHEMA_INVALID']);
  }
  if(
    !admission
    ||admission.schemaVersion!==CORE_HSME_PROTECTED_TRAINING_ADMISSION_V1_SCHEMA
  ){
    return invalid(['TRAINING_PREFLIGHT_ADMISSION_SCHEMA_INVALID']);
  }

  if(
    admission.state!=='TRAINING_ADMISSION_ADMITTED_NOT_STARTED'
    ||admission.protectedTrainingExecutionAdmitted!==true
  ){
    return blocked(['TRAINING_PREFLIGHT_CORE_ADMISSION_REQUIRED'],{
      requestEvidenceSha256:valueOrUnknown(request.requestEvidenceSha256),
      admissionEvidenceSha256:valueOrUnknown(admission.admissionEvidenceSha256),
    });
  }

  const invalidBlockers:string[]=[];
  if(
    request.state!=='TRAINING_RUN_REQUEST_READY_FOR_CORE_ADMISSION'
    ||request.blockers.length!==0
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_REQUEST_NOT_READY');
  }
  if(admission.blockers.length!==0){
    invalidBlockers.push('TRAINING_PREFLIGHT_ADMISSION_BLOCKERS_PRESENT');
  }
  if(requestAuthorityWidened(request)){
    invalidBlockers.push('TRAINING_PREFLIGHT_REQUEST_AUTHORITY_WIDENING');
  }
  if(admissionAuthorityWidened(admission)){
    invalidBlockers.push('TRAINING_PREFLIGHT_ADMISSION_AUTHORITY_WIDENING');
  }

  let requestEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let admissionEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    requestEvidenceSha256=await hsmeFullStudentTrainingRunRequestV1Digest(
      request,
      hash,
    );
    if(requestEvidenceSha256!==request.requestEvidenceSha256){
      invalidBlockers.push('TRAINING_PREFLIGHT_REQUEST_REHASH_MISMATCH');
    }
  }catch{
    invalidBlockers.push('TRAINING_PREFLIGHT_REQUEST_REHASH_INVALID');
  }
  try{
    admissionEvidenceSha256=await coreHsmeProtectedTrainingAdmissionV1Digest(
      admission,
      hash,
    );
    if(admissionEvidenceSha256!==admission.admissionEvidenceSha256){
      invalidBlockers.push('TRAINING_PREFLIGHT_ADMISSION_REHASH_MISMATCH');
    }
  }catch{
    invalidBlockers.push('TRAINING_PREFLIGHT_ADMISSION_REHASH_INVALID');
  }

  let toolchain:HsmeDenseStudentTrainingToolchainV1|null=null;
  let toolchainManifestSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    toolchain=normalizeHsmeDenseStudentTrainingToolchainV1(rawToolchain);
    toolchainManifestSha256=await hsmeDenseStudentTrainingToolchainV1Digest(
      toolchain,
      hash,
    );
  }catch(error){
    invalidBlockers.push(
      'TRAINING_PREFLIGHT_TOOLCHAIN_INVALID'+errorCodeSuffix(error),
    );
  }

  if(toolchain){
    let observedIdentity:HsmeDenseStudentObservedRepositoryIdentityV1|null=null;
    try{
      observedIdentity=normalizeObservedIdentity(observed);
    }catch(error){
      invalidBlockers.push(
        'TRAINING_PREFLIGHT_OBSERVED_IDENTITY_INVALID'+errorCodeSuffix(error),
      );
    }
    if(observedIdentity){
      if(observedIdentity.repositoryCommitSha!==toolchain.repositoryCommitSha){
        invalidBlockers.push('TRAINING_PREFLIGHT_REPOSITORY_COMMIT_DRIFT');
      }
      if(observedIdentity.entrypointFileSha256!==toolchain.entrypoint.fileSha256){
        invalidBlockers.push('TRAINING_PREFLIGHT_ENTRYPOINT_DIGEST_DRIFT');
      }
      if(
        observedIdentity.dependencyLockFileSha256
        !==toolchain.dependencyLock.fileSha256
      ){
        invalidBlockers.push('TRAINING_PREFLIGHT_DEPENDENCY_LOCK_DIGEST_DRIFT');
      }
    }
  }

  if(
    requestEvidenceSha256!=='UNKNOWN'
    &&admission.requestEvidenceSha256!==requestEvidenceSha256
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_REQUEST_ADMISSION_BINDING_MISMATCH');
  }
  if(admission.candidateId!==request.candidateId){
    invalidBlockers.push('TRAINING_PREFLIGHT_CANDIDATE_BINDING_MISMATCH');
  }
  if(
    toolchainManifestSha256!=='UNKNOWN'
    &&(
      request.toolchainLockSha256!==toolchainManifestSha256
      ||admission.toolchainLockSha256!==toolchainManifestSha256
    )
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_TOOLCHAIN_BINDING_MISMATCH');
  }
  if(admission.outputStagingPolicySha256!==request.outputStagingPolicySha256){
    invalidBlockers.push('TRAINING_PREFLIGHT_STAGING_POLICY_BINDING_MISMATCH');
  }

  if(
    admission.outputStagingAuthorityId==='UNKNOWN'
    ||!validIdentifier(admission.outputStagingAuthorityId,160)
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_STAGING_AUTHORITY_UNRESOLVED');
  }
  if(
    admission.backend===null
    ||admission.backend.backendClass!=='CUDA_GPU'
    ||admission.resourceCeilings===null
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_CORE_ENVELOPE_UNSUPPORTED');
  }
  if(toolchain&&admission.backend&&toolchain.backendClass!==admission.backend.backendClass){
    invalidBlockers.push('TRAINING_PREFLIGHT_BACKEND_TOOLCHAIN_MISMATCH');
  }

  if(
    admission.resourceCeilings
    &&(
      typeof request.maxTrainingExamples!=='number'
      ||typeof request.maxGpuSeconds!=='number'
      ||typeof request.maxTrainingCostMicrousd!=='number'
      ||admission.resourceCeilings.maxTrainingExamples>request.maxTrainingExamples
      ||admission.resourceCeilings.maxGpuSeconds>request.maxGpuSeconds
      ||admission.resourceCeilings.maxTrainingCostMicrousd>request.maxTrainingCostMicrousd
    )
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_RESOURCE_CEILING_WIDENED');
  }

  for(const [name,value] of [
    ['teacherDecisionSha256',request.teacherDecisionSha256],
    ['reproductionEvidenceSha256',request.reproductionEvidenceSha256],
    ['corpusRootDigest',request.corpusRootDigest],
    ['recipeDigest',request.recipeDigest],
    ['checkpointSha256',request.checkpointSha256],
  ] as const){
    if(!knownDigest(value)){
      invalidBlockers.push('TRAINING_PREFLIGHT_LINEAGE_UNRESOLVED:'+name);
    }
  }
  if(
    request.resumeCheckpointSha256!=='UNKNOWN'
    &&!knownDigest(request.resumeCheckpointSha256)
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_RESUME_CHECKPOINT_INVALID');
  }
  if(
    typeof request.targetStepCount!=='number'
    ||typeof request.activeParametersMillions!=='number'
  ){
    invalidBlockers.push('TRAINING_PREFLIGHT_TRAINING_TARGET_UNRESOLVED');
  }

  const common={
    requestEvidenceSha256,
    admissionEvidenceSha256,
    toolchainManifestSha256,
  };
  if(invalidBlockers.length>0||toolchain===null){
    return invalid(invalidBlockers,common);
  }

  const launchPayload=buildLaunchPayload(
    request,
    admission,
    toolchain,
    requestEvidenceSha256 as string,
    admissionEvidenceSha256 as string,
    toolchainManifestSha256 as string,
  );

  let launchSpecSha256:string;
  try{
    launchSpecSha256=await digest(
      HSME_DENSE_STUDENT_LAUNCH_SPEC_DIGEST_DOMAIN,
      launchPayload,
      hash,
    );
  }catch{
    return invalid(['TRAINING_PREFLIGHT_LAUNCH_SPEC_HASH_INVALID'],common);
  }

  const launchSpec=deepFreeze({
    ...launchPayload,
    launchSpecSha256,
  });

  const preflightPayload={
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state:'TRAINING_PREFLIGHT_READY_NOT_EXECUTED' as const,
    blockers:Object.freeze([]) as readonly string[],
    requestEvidenceSha256,
    admissionEvidenceSha256,
    toolchainManifestSha256,
    launchSpecSha256,
    launchSpec,
    ...authorityBoundary(),
  };

  let preflightEvidenceSha256:string;
  try{
    preflightEvidenceSha256=await digest(
      HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_DIGEST_DOMAIN,
      preflightPayload,
      hash,
    );
  }catch{
    return invalid(['TRAINING_PREFLIGHT_OUTPUT_HASH_INVALID'],common);
  }

  return deepFreeze({
    ...preflightPayload,
    preflightEvidenceSha256,
  });
}

function buildLaunchPayload(
  request:HsmeFullStudentTrainingRunRequestV1,
  admission:CoreHsmeProtectedTrainingAdmissionV1,
  toolchain:HsmeDenseStudentTrainingToolchainV1,
  requestEvidenceSha256:string,
  admissionEvidenceSha256:string,
  toolchainManifestSha256:string,
):Omit<HsmeDenseStudentLaunchSpecV1,'launchSpecSha256'>{
  if(
    admission.backend===null
    ||admission.backend.backendClass!=='CUDA_GPU'
    ||admission.resourceCeilings===null
    ||admission.outputStagingAuthorityId==='UNKNOWN'
    ||request.candidateId==='UNKNOWN'
    ||request.teacherDecisionSha256==='UNKNOWN'
    ||request.reproductionEvidenceSha256==='UNKNOWN'
    ||request.corpusRootDigest==='UNKNOWN'
    ||request.recipeDigest==='UNKNOWN'
    ||request.checkpointSha256==='UNKNOWN'
    ||request.outputStagingPolicySha256==='UNKNOWN'
    ||typeof request.targetStepCount!=='number'
    ||typeof request.activeParametersMillions!=='number'
  ){
    fail('hsme_dense_launch_internal','launch payload requires resolved inputs');
  }

  const resumeCheckpointSha256=request.resumeCheckpointSha256==='UNKNOWN'
    ?'NONE' as const
    :request.resumeCheckpointSha256;

  const argv=Object.freeze([
    HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    '--candidate-id',request.candidateId,
    '--request-evidence-sha256',requestEvidenceSha256,
    '--admission-evidence-sha256',admissionEvidenceSha256,
    '--teacher-decision-sha256',request.teacherDecisionSha256,
    '--reproduction-evidence-sha256',request.reproductionEvidenceSha256,
    '--corpus-root-digest',request.corpusRootDigest,
    '--recipe-digest',request.recipeDigest,
    '--checkpoint-sha256',request.checkpointSha256,
    '--resume-checkpoint-sha256',resumeCheckpointSha256,
    '--output-staging-authority-id',admission.outputStagingAuthorityId,
    '--output-staging-policy-sha256',request.outputStagingPolicySha256,
    '--max-training-examples',String(admission.resourceCeilings.maxTrainingExamples),
    '--max-gpu-seconds',String(admission.resourceCeilings.maxGpuSeconds),
    '--max-training-cost-microusd',String(
      admission.resourceCeilings.maxTrainingCostMicrousd,
    ),
    '--target-step-count',String(request.targetStepCount),
    '--active-parameters-millions',String(request.activeParametersMillions),
    '--network-policy','SEALED_INPUTS_ONLY',
    '--cache-model-input-policy','READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
  ]);

  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_LAUNCH_SPEC_V1_SCHEMA,
    state:'LAUNCH_SPEC_READY_NOT_EXECUTED',
    requestEvidenceSha256,
    admissionEvidenceSha256,
    toolchainManifestSha256,
    candidateId:request.candidateId,
    backend:{
      backendClass:'CUDA_GPU',
      providerId:admission.backend.providerId,
      accountId:admission.backend.accountId,
      executionEnvironmentId:admission.backend.executionEnvironmentId,
    },
    repositoryCommitSha:toolchain.repositoryCommitSha,
    interpreter:'python3.12',
    entrypointRelativePath:HSME_DENSE_STUDENT_ENTRYPOINT_V1,
    entrypointFileSha256:toolchain.entrypoint.fileSha256,
    dependencyLockRelativePath:HSME_DENSE_STUDENT_DEPENDENCY_LOCK_V1,
    dependencyLockFileSha256:toolchain.dependencyLock.fileSha256,
    immutableEnvironmentSha256:toolchain.immutableEnvironmentSha256,
    acceleratorRuntimeIdentity:toolchain.acceleratorRuntime.identity,
    teacherDecisionSha256:request.teacherDecisionSha256,
    reproductionEvidenceSha256:request.reproductionEvidenceSha256,
    corpusRootDigest:request.corpusRootDigest,
    recipeDigest:request.recipeDigest,
    checkpointSha256:request.checkpointSha256,
    resumeCheckpointSha256,
    outputStagingAuthorityId:admission.outputStagingAuthorityId,
    outputStagingPolicySha256:request.outputStagingPolicySha256,
    resourceCeilings:admission.resourceCeilings,
    targetStepCount:request.targetStepCount,
    activeParametersMillions:request.activeParametersMillions,
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    argv,
    ...authorityBoundary(),
  });
}

function normalizeObservedIdentity(
  raw:HsmeDenseStudentObservedRepositoryIdentityV1,
):HsmeDenseStudentObservedRepositoryIdentityV1{
  const record=exactRecord(raw,[
    'repositoryCommitSha',
    'entrypointFileSha256',
    'dependencyLockFileSha256',
  ],'observed');
  return Object.freeze({
    repositoryCommitSha:commitSha(
      record.repositoryCommitSha,
      'observed.repositoryCommitSha',
    ),
    entrypointFileSha256:sha256(
      record.entrypointFileSha256,
      'observed.entrypointFileSha256',
    ),
    dependencyLockFileSha256:sha256(
      record.dependencyLockFileSha256,
      'observed.dependencyLockFileSha256',
    ),
  });
}

function requestAuthorityWidened(
  value:HsmeFullStudentTrainingRunRequestV1,
):boolean{
  return value.coreAdmissionRequired!==true
    ||value.coreExecutionTicketPresent!==false
    ||value.providerSelectionAllowed!==false
    ||value.executionTargetSelectionAllowed!==false
    ||value.trainingRunStartAllowed!==false
    ||value.trainingOrDistillationExecutionAllowed!==false
    ||value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.durableModelFleetPromotionAllowed!==false
    ||value.winnerSelectionAllowed!==false;
}

function admissionAuthorityWidened(
  value:CoreHsmeProtectedTrainingAdmissionV1,
):boolean{
  return value.protectedTrainingExecutionAdmitted!==true
    ||value.trainingStarted!==false
    ||value.checkpointPromotionAllowed!==false
    ||value.modelInstallAllowed!==false
    ||value.modelFleetPromotionAllowed!==false
    ||value.productionAuthorityGranted!==false
    ||value.providerAuthorityGranted!==false
    ||value.billingAuthorityGranted!==false
    ||value.projectArtifactMutationAllowed!==false
    ||value.aeeExecutionAuthorityGranted!==false
    ||value.winnerSelectionAllowed!==false;
}

function authorityBoundary(){
  return Object.freeze({
    processSpawned:false as const,
    trainingStarted:false as const,
    checkpointWritten:false as const,
    checkpointPromotionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    winnerSelectionAllowed:false as const,
  });
}

type TerminalValues=Partial<Pick<
  HsmeDenseStudentTrainingPreflightV1,
  'requestEvidenceSha256'|'admissionEvidenceSha256'|'toolchainManifestSha256'
>>;

function invalid(
  blockers:readonly string[],
  values:TerminalValues={},
):HsmeDenseStudentTrainingPreflightV1{
  return terminal('TRAINING_PREFLIGHT_INVALID',blockers,values);
}

function blocked(
  blockers:readonly string[],
  values:TerminalValues={},
):HsmeDenseStudentTrainingPreflightV1{
  return terminal('TRAINING_PREFLIGHT_BLOCKED',blockers,values);
}

function terminal(
  state:'TRAINING_PREFLIGHT_INVALID'|'TRAINING_PREFLIGHT_BLOCKED',
  blockers:readonly string[],
  values:TerminalValues,
):HsmeDenseStudentTrainingPreflightV1{
  return Object.freeze({
    schemaVersion:HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    requestEvidenceSha256:values.requestEvidenceSha256??'UNKNOWN',
    admissionEvidenceSha256:values.admissionEvidenceSha256??'UNKNOWN',
    toolchainManifestSha256:values.toolchainManifestSha256??'UNKNOWN',
    launchSpecSha256:'UNKNOWN',
    launchSpec:null,
    preflightEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function exactRecord(
  raw:unknown,
  allowed:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_dense_exact_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==allowed.length
    ||keys.some(key=>!allowed.includes(key))
    ||allowed.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_dense_exact_schema',path+' has unknown or missing fields');
  }
  return record;
}

function exactPackageVersion(
  raw:unknown,
  expected:string,
  path:string,
):string{
  if(raw!==expected){
    fail('hsme_dense_package_version',path+' must equal exact pinned version '+expected);
  }
  return expected;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_dense_hash',path+' must be lowercase SHA-256');
  }
  return raw;
}

function commitSha(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!COMMIT40.test(raw)){
    fail('hsme_dense_commit',path+' must be lowercase 40-hex Git commit SHA');
  }
  return raw;
}

function identifier(raw:unknown,path:string,max:number):string{
  if(
    typeof raw!=='string'
    ||raw.length<1
    ||raw.length>max
    ||raw.trim()!==raw
    ||!IDENTIFIER.test(raw)
  ){
    fail('hsme_dense_identifier',path+' is invalid');
  }
  return raw;
}

function validIdentifier(raw:string,max:number):boolean{
  return raw.length>0&&raw.length<=max&&raw.trim()===raw&&IDENTIFIER.test(raw);
}

function rejectFloatingToken(raw:string,path:string):void{
  const lower=raw.toLowerCase();
  if(
    lower.includes('latest')
    ||lower.includes('unknown')
    ||/[<>=*~^]/.test(raw)
  ){
    fail('hsme_dense_floating_identity',path+' must be exact and immutable');
  }
}

function knownDigest(value:string|'UNKNOWN'):value is string{
  return value!=='UNKNOWN'&&HEX64.test(value);
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return knownDigest(value)?value:'UNKNOWN';
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
    fail('hsme_dense_hash_port','hash port must return lowercase SHA-256');
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
  throw new HsmeDenseStudentTrainingToolchainV1Error(code,message);
}
