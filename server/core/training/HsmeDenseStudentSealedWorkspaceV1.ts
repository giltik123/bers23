import {
  HSME_DENSE_STUDENT_ENTRYPOINT_V1,
  type HsmeDenseStudentTrainingHashPortV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';
import {
  CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1_SCHEMA,
  type CoreHsmeDenseStudentExecutionRequestV1,
  type CoreHsmeDenseStudentProtectedExecutionPortV1,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';

export const HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1' as const;
export const HSME_DENSE_STUDENT_SEALED_WORKSPACE_DIGEST_DOMAIN =
  'bers:hsme:dense-student-sealed-workspace:v1\0' as const;
export const CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1_SCHEMA =
  'BERS_CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1' as const;

export const HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1 =
  '/run/bers-hsme/dense-student/v1' as const;
export const HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1 =
  '/run/bers-hsme/dense-student/v1/workspace.json' as const;
export const HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1 =
  '/run/bers-hsme/dense-student/v1/inputs' as const;
export const HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1 =
  '/run/bers-hsme/dense-student/v1/output' as const;
export const HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1 =
  'checkpoints/staged.safetensors' as const;
export const HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1 =
  'checkpoints/staged.metadata.json' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const SAFE_RELATIVE_SEGMENT=/^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type HsmeDenseStudentSealedWorkspaceInputRoleV1=
  | 'REPRODUCTION_FIXTURE_JSON'
  | 'TRAINING_RECIPE_JSON'
  | 'INPUT_CHECKPOINT'
  | 'RESUME_CHECKPOINT'
  | 'CORPUS_ASSET'
  | 'SYNTHETIC_TARGET';

export type HsmeDenseStudentSealedWorkspaceInputV1=Readonly<{
  role:HsmeDenseStudentSealedWorkspaceInputRoleV1;
  contentSha256:string;
  relativePath:string;
  bytes:number;
  readOnly:true;
}>;

export type HsmeDenseStudentSealedWorkspaceV1=Readonly<{
  schemaVersion:typeof HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA;
  launchSpecSha256:string;
  repositoryCommitSha:string;
  immutableEnvironmentSha256:string;
  candidateId:string;
  teacherDecisionSha256:string;
  reproductionEvidenceSha256:string;
  corpusRootDigest:string;
  recipeDigest:string;
  inputCheckpointSha256:string;
  resumeCheckpointSha256:string|'NONE';
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
  networkPolicy:'SEALED_INPUTS_ONLY';
  cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS';
  inputs:readonly HsmeDenseStudentSealedWorkspaceInputV1[];
  output:Readonly<{
    stagedCheckpointRelativePath:
      typeof HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1;
    checkpointMetadataRelativePath:
      typeof HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1;
    atomicStagingRequired:true;
  }>;
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

export type CoreHsmeDenseStudentSealedWorkspaceFileAttestationV1=Readonly<{
  relativePath:string;
  contentSha256:string;
  bytes:number;
  readOnly:true;
  symlink:false;
}>;

export type CoreHsmeDenseStudentSealedWorkspaceAttestationV1=Readonly<{
  schemaVersion:
    typeof CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1_SCHEMA;
  workspaceSha256:string;
  workspaceRoot:typeof HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1;
  manifestPath:typeof HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1;
  inputsRoot:typeof HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1;
  outputRoot:typeof HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1;
  networkDisabled:true;
  inputsReadOnly:true;
  outputWritableOnly:true;
  noSymlinks:true;
  inputFiles:readonly CoreHsmeDenseStudentSealedWorkspaceFileAttestationV1[];
}>;

export type CoreHsmeDenseStudentSealedWorkspaceHostRequestV1=Readonly<{
  executionRequest:CoreHsmeDenseStudentExecutionRequestV1;
  workspace:HsmeDenseStudentSealedWorkspaceV1;
  workspaceSha256:string;
  fixedPaths:Readonly<{
    workspaceRoot:typeof HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1;
    manifestPath:typeof HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1;
    inputsRoot:typeof HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1;
    outputRoot:typeof HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1;
  }>;
}>;

export interface HsmeDenseStudentSealedWorkspaceOriginVerifierV1{
  verifyWorkspace(
    workspace:HsmeDenseStudentSealedWorkspaceV1,
    expectedWorkspaceSha256:string,
  ):Promise<boolean>;
}

export interface CoreHsmeDenseStudentSealedWorkspaceHostV1{
  attestWorkspace(
    request:CoreHsmeDenseStudentSealedWorkspaceHostRequestV1,
  ):Promise<unknown>;
  executeExactSealedWorkspace(
    request:CoreHsmeDenseStudentSealedWorkspaceHostRequestV1,
  ):Promise<unknown>;
}

export class HsmeDenseStudentSealedWorkspaceV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentSealedWorkspaceV1Error';
    this.code=code;
  }
}

export function normalizeHsmeDenseStudentSealedWorkspaceV1(
  raw:unknown,
):HsmeDenseStudentSealedWorkspaceV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'launchSpecSha256',
    'repositoryCommitSha',
    'immutableEnvironmentSha256',
    'candidateId',
    'teacherDecisionSha256',
    'reproductionEvidenceSha256',
    'corpusRootDigest',
    'recipeDigest',
    'inputCheckpointSha256',
    'resumeCheckpointSha256',
    'outputStagingAuthorityId',
    'outputStagingPolicySha256',
    'networkPolicy',
    'cacheModelInputPolicy',
    'inputs',
    'output',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'workspace');

  if(record.schemaVersion!==HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA){
    fail('hsme_sealed_workspace_schema','workspace schema unsupported');
  }
  if(
    record.networkPolicy!=='SEALED_INPUTS_ONLY'
    ||record.cacheModelInputPolicy!==
      'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'
  ){
    fail(
      'hsme_sealed_workspace_policy',
      'workspace must remain sealed and content-addressed',
    );
  }
  if(!Array.isArray(record.inputs)||record.inputs.length<3||record.inputs.length>20000){
    fail('hsme_sealed_workspace_inputs','workspace requires 3..20000 inputs');
  }
  const inputs=record.inputs
    .map((value,index)=>normalizeInput(value,'workspace.inputs['+index+']'))
    .sort(compareInputs);
  const paths=inputs.map(value=>value.relativePath);
  if(new Set(paths).size!==paths.length){
    fail('hsme_sealed_workspace_path_duplicate','workspace input paths must be unique');
  }
  assertRequiredInputRoles(inputs,record.resumeCheckpointSha256);

  const inputCheckpointSha256=sha256(
    record.inputCheckpointSha256,
    'workspace.inputCheckpointSha256',
  );
  const inputCheckpoint=singleRole(inputs,'INPUT_CHECKPOINT');
  if(inputCheckpoint.contentSha256!==inputCheckpointSha256){
    fail(
      'hsme_sealed_workspace_input_checkpoint_binding',
      'INPUT_CHECKPOINT raw SHA must equal launch checkpoint identity',
    );
  }

  let resumeCheckpointSha256:string|'NONE';
  if(record.resumeCheckpointSha256==='NONE'){
    resumeCheckpointSha256='NONE';
  }else{
    resumeCheckpointSha256=sha256(
      record.resumeCheckpointSha256,
      'workspace.resumeCheckpointSha256',
    );
    const resume=singleRole(inputs,'RESUME_CHECKPOINT');
    if(resume.contentSha256!==resumeCheckpointSha256){
      fail(
        'hsme_sealed_workspace_resume_checkpoint_binding',
        'RESUME_CHECKPOINT raw SHA must equal launch resume identity',
      );
    }
  }

  const output=exactRecord(record.output,[
    'stagedCheckpointRelativePath',
    'checkpointMetadataRelativePath',
    'atomicStagingRequired',
  ],'workspace.output');
  if(
    output.stagedCheckpointRelativePath!==
      HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1
    ||output.checkpointMetadataRelativePath!==
      HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1
    ||output.atomicStagingRequired!==true
  ){
    fail(
      'hsme_sealed_workspace_output_contract',
      'workspace output paths and atomic staging policy are fixed',
    );
  }

  return deepFreeze({
    schemaVersion:HSME_DENSE_STUDENT_SEALED_WORKSPACE_V1_SCHEMA,
    launchSpecSha256:sha256(record.launchSpecSha256,'workspace.launchSpecSha256'),
    repositoryCommitSha:commitSha(
      record.repositoryCommitSha,
      'workspace.repositoryCommitSha',
    ),
    immutableEnvironmentSha256:sha256(
      record.immutableEnvironmentSha256,
      'workspace.immutableEnvironmentSha256',
    ),
    candidateId:identifier(record.candidateId,'workspace.candidateId',160),
    teacherDecisionSha256:sha256(
      record.teacherDecisionSha256,
      'workspace.teacherDecisionSha256',
    ),
    reproductionEvidenceSha256:sha256(
      record.reproductionEvidenceSha256,
      'workspace.reproductionEvidenceSha256',
    ),
    corpusRootDigest:sha256(
      record.corpusRootDigest,
      'workspace.corpusRootDigest',
    ),
    recipeDigest:sha256(record.recipeDigest,'workspace.recipeDigest'),
    inputCheckpointSha256,
    resumeCheckpointSha256,
    outputStagingAuthorityId:identifier(
      record.outputStagingAuthorityId,
      'workspace.outputStagingAuthorityId',
      160,
    ),
    outputStagingPolicySha256:sha256(
      record.outputStagingPolicySha256,
      'workspace.outputStagingPolicySha256',
    ),
    networkPolicy:'SEALED_INPUTS_ONLY',
    cacheModelInputPolicy:'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS',
    inputs:Object.freeze(inputs),
    output:Object.freeze({
      stagedCheckpointRelativePath:
        HSME_DENSE_STUDENT_STAGED_CHECKPOINT_RELATIVE_PATH_V1,
      checkpointMetadataRelativePath:
        HSME_DENSE_STUDENT_STAGED_METADATA_RELATIVE_PATH_V1,
      atomicStagingRequired:true as const,
    }),
    ...authorityBoundary(record,'workspace'),
  });
}

export async function hsmeDenseStudentSealedWorkspaceV1Digest(
  raw:unknown,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const workspace=normalizeHsmeDenseStudentSealedWorkspaceV1(raw);
  return digest(HSME_DENSE_STUDENT_SEALED_WORKSPACE_DIGEST_DOMAIN,workspace,hash);
}

export async function createHsmeDenseStudentSealedWorkspaceExecutionAdapterV1(
  rawWorkspace:unknown,
  expectedWorkspaceSha256:string,
  origin:HsmeDenseStudentSealedWorkspaceOriginVerifierV1,
  host:CoreHsmeDenseStudentSealedWorkspaceHostV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<CoreHsmeDenseStudentProtectedExecutionPortV1>{
  const workspace=normalizeHsmeDenseStudentSealedWorkspaceV1(rawWorkspace);
  if(!HEX64.test(expectedWorkspaceSha256)){
    fail(
      'hsme_sealed_workspace_expected_digest',
      'expected workspace digest must be lowercase SHA-256',
    );
  }
  const workspaceSha256=await hsmeDenseStudentSealedWorkspaceV1Digest(
    workspace,
    hash,
  );
  if(workspaceSha256!==expectedWorkspaceSha256){
    fail(
      'hsme_sealed_workspace_digest_mismatch',
      'workspace digest differs from external expected digest',
    );
  }
  if(!await verify(()=>origin.verifyWorkspace(workspace,workspaceSha256))){
    fail(
      'hsme_sealed_workspace_origin_unverified',
      'workspace origin is not externally trusted',
    );
  }

  return Object.freeze({
    async executeExactTrainingLaunch(executionRequest){
      validateExecutionBinding(executionRequest,workspace);
      const request=deepFreeze({
        executionRequest,
        workspace,
        workspaceSha256,
        fixedPaths:Object.freeze({
          workspaceRoot:HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
          manifestPath:HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
          inputsRoot:HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
          outputRoot:HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
        }),
      });
      const rawAttestation=await host.attestWorkspace(request);
      const attestation=normalizeHostAttestation(rawAttestation);
      validateHostAttestation(attestation,workspace,workspaceSha256);
      return host.executeExactSealedWorkspace(request);
    },
  });
}

function validateExecutionBinding(
  request:CoreHsmeDenseStudentExecutionRequestV1,
  workspace:HsmeDenseStudentSealedWorkspaceV1,
):void{
  const record=exactRecord(request,[
    'schemaVersion',
    'launchSpecSha256',
    'interpreter',
    'argv',
    'repositoryCommitSha',
    'immutableEnvironmentSha256',
    'backend',
    'outputStagingAuthorityId',
    'outputStagingPolicySha256',
    'resourceCeilings',
    'networkPolicy',
    'cacheModelInputPolicy',
  ],'executionRequest');
  if(
    record.schemaVersion!==CORE_HSME_DENSE_STUDENT_EXECUTION_REQUEST_V1_SCHEMA
    ||request.interpreter!=='python3.12'
    ||request.networkPolicy!=='SEALED_INPUTS_ONLY'
    ||request.cacheModelInputPolicy!==
      'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'
    ||request.launchSpecSha256!==workspace.launchSpecSha256
    ||request.repositoryCommitSha!==workspace.repositoryCommitSha
    ||request.immutableEnvironmentSha256!==workspace.immutableEnvironmentSha256
    ||request.outputStagingAuthorityId!==workspace.outputStagingAuthorityId
    ||request.outputStagingPolicySha256!==workspace.outputStagingPolicySha256
  ){
    fail(
      'hsme_sealed_workspace_execution_binding',
      'execution request identity differs from sealed workspace',
    );
  }

  const backend=exactRecord(request.backend,[
    'backendClass','providerId','accountId','executionEnvironmentId',
  ],'executionRequest.backend');
  if(backend.backendClass!=='CUDA_GPU'){
    fail(
      'hsme_sealed_workspace_execution_backend',
      'execution request backend must remain CUDA_GPU',
    );
  }
  identifier(backend.providerId,'executionRequest.backend.providerId',120);
  identifier(backend.accountId,'executionRequest.backend.accountId',160);
  identifier(
    backend.executionEnvironmentId,
    'executionRequest.backend.executionEnvironmentId',
    160,
  );

  const ceilings=exactRecord(request.resourceCeilings,[
    'maxTrainingExamples','maxGpuSeconds','maxTrainingCostMicrousd',
  ],'executionRequest.resourceCeilings');
  const maxTrainingExamples=safeInteger(
    ceilings.maxTrainingExamples,
    'executionRequest.resourceCeilings.maxTrainingExamples',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const maxGpuSeconds=safeInteger(
    ceilings.maxGpuSeconds,
    'executionRequest.resourceCeilings.maxGpuSeconds',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const maxTrainingCostMicrousd=safeInteger(
    ceilings.maxTrainingCostMicrousd,
    'executionRequest.resourceCeilings.maxTrainingCostMicrousd',
    0,
    Number.MAX_SAFE_INTEGER,
  );

  const argv=parseFixedArgv(request.argv);
  if(
    argv.maxTrainingExamples!==maxTrainingExamples
    ||argv.maxGpuSeconds!==maxGpuSeconds
    ||argv.maxTrainingCostMicrousd!==maxTrainingCostMicrousd
  ){
    fail(
      'hsme_sealed_workspace_resource_ceiling_binding',
      'argv resource ceilings differ from Core execution request ceilings',
    );
  }
  if(
    argv.candidateId!==workspace.candidateId
    ||argv.teacherDecisionSha256!==workspace.teacherDecisionSha256
    ||argv.reproductionEvidenceSha256!==workspace.reproductionEvidenceSha256
    ||argv.corpusRootDigest!==workspace.corpusRootDigest
    ||argv.recipeDigest!==workspace.recipeDigest
    ||argv.checkpointSha256!==workspace.inputCheckpointSha256
    ||argv.resumeCheckpointSha256!==workspace.resumeCheckpointSha256
    ||argv.outputStagingAuthorityId!==workspace.outputStagingAuthorityId
    ||argv.outputStagingPolicySha256!==workspace.outputStagingPolicySha256
  ){
    fail(
      'hsme_sealed_workspace_argv_binding',
      'fixed launch argv differs from sealed workspace',
    );
  }
}

function parseFixedArgv(argv:readonly string[]):Readonly<{
  candidateId:string;
  teacherDecisionSha256:string;
  reproductionEvidenceSha256:string;
  corpusRootDigest:string;
  recipeDigest:string;
  checkpointSha256:string;
  resumeCheckpointSha256:string;
  outputStagingAuthorityId:string;
  outputStagingPolicySha256:string;
  maxTrainingExamples:number;
  maxGpuSeconds:number;
  maxTrainingCostMicrousd:number;
}>{
  if(!Array.isArray(argv)||argv.some(value=>typeof value!=='string')){
    fail('hsme_sealed_workspace_argv_shape','launch argv must be a string array');
  }
  const expectedFlags=[
    '--candidate-id',
    '--request-evidence-sha256',
    '--admission-evidence-sha256',
    '--teacher-decision-sha256',
    '--reproduction-evidence-sha256',
    '--corpus-root-digest',
    '--recipe-digest',
    '--checkpoint-sha256',
    '--resume-checkpoint-sha256',
    '--output-staging-authority-id',
    '--output-staging-policy-sha256',
    '--max-training-examples',
    '--max-gpu-seconds',
    '--max-training-cost-microusd',
    '--target-step-count',
    '--active-parameters-millions',
    '--network-policy',
    '--cache-model-input-policy',
  ];
  if(argv.length!==1+expectedFlags.length*2||argv[0]!==HSME_DENSE_STUDENT_ENTRYPOINT_V1){
    fail('hsme_sealed_workspace_argv_shape','launch argv shape is not canonical');
  }
  const values=new Map<string,string>();
  for(let index=0;index<expectedFlags.length;index+=1){
    const flag=argv[1+index*2];
    const value=argv[2+index*2];
    if(flag!==expectedFlags[index]){
      fail('hsme_sealed_workspace_argv_shape','launch argv ordering drift');
    }
    values.set(flag,value);
  }
  if(
    values.get('--network-policy')!=='SEALED_INPUTS_ONLY'
    ||values.get('--cache-model-input-policy')!==
      'READ_ONLY_CONTENT_ADDRESSED_SEALED_INPUTS'
  ){
    fail('hsme_sealed_workspace_argv_policy','launch argv policy drift');
  }
  return Object.freeze({
    candidateId:values.get('--candidate-id')!,
    teacherDecisionSha256:values.get('--teacher-decision-sha256')!,
    reproductionEvidenceSha256:values.get('--reproduction-evidence-sha256')!,
    corpusRootDigest:values.get('--corpus-root-digest')!,
    recipeDigest:values.get('--recipe-digest')!,
    checkpointSha256:values.get('--checkpoint-sha256')!,
    resumeCheckpointSha256:values.get('--resume-checkpoint-sha256')!,
    outputStagingAuthorityId:values.get('--output-staging-authority-id')!,
    outputStagingPolicySha256:values.get('--output-staging-policy-sha256')!,
    maxTrainingExamples:argvInteger(
      values.get('--max-training-examples')!,
      'argv.maxTrainingExamples',
      1,
    ),
    maxGpuSeconds:argvInteger(
      values.get('--max-gpu-seconds')!,
      'argv.maxGpuSeconds',
      1,
    ),
    maxTrainingCostMicrousd:argvInteger(
      values.get('--max-training-cost-microusd')!,
      'argv.maxTrainingCostMicrousd',
      0,
    ),
  });
}

function normalizeHostAttestation(
  raw:unknown,
):CoreHsmeDenseStudentSealedWorkspaceAttestationV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'workspaceSha256',
    'workspaceRoot',
    'manifestPath',
    'inputsRoot',
    'outputRoot',
    'networkDisabled',
    'inputsReadOnly',
    'outputWritableOnly',
    'noSymlinks',
    'inputFiles',
  ],'hostAttestation');
  if(
    record.schemaVersion!==
      CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1_SCHEMA
  ){
    fail('hsme_sealed_workspace_attestation_schema','host attestation schema unsupported');
  }
  for(const [field,expected] of [
    ['workspaceRoot',HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1],
    ['manifestPath',HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1],
    ['inputsRoot',HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1],
    ['outputRoot',HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1],
  ] as const){
    if(record[field]!==expected){
      fail(
        'hsme_sealed_workspace_attestation_path',
        'host fixed path attestation drift: '+field,
      );
    }
  }
  if(
    record.networkDisabled!==true
    ||record.inputsReadOnly!==true
    ||record.outputWritableOnly!==true
    ||record.noSymlinks!==true
  ){
    fail(
      'hsme_sealed_workspace_attestation_isolation',
      'host workspace isolation attestation failed',
    );
  }
  if(!Array.isArray(record.inputFiles)){
    fail('hsme_sealed_workspace_attestation_files','inputFiles must be an array');
  }
  const inputFiles=record.inputFiles
    .map((value,index)=>normalizeFileAttestation(
      value,
      'hostAttestation.inputFiles['+index+']',
    ))
    .sort(compareFileAttestations);
  return deepFreeze({
    schemaVersion:
      CORE_HSME_DENSE_STUDENT_SEALED_WORKSPACE_ATTESTATION_V1_SCHEMA,
    workspaceSha256:sha256(
      record.workspaceSha256,
      'hostAttestation.workspaceSha256',
    ),
    workspaceRoot:HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
    manifestPath:HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
    inputsRoot:HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
    outputRoot:HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
    networkDisabled:true,
    inputsReadOnly:true,
    outputWritableOnly:true,
    noSymlinks:true,
    inputFiles:Object.freeze(inputFiles),
  });
}

function validateHostAttestation(
  attestation:CoreHsmeDenseStudentSealedWorkspaceAttestationV1,
  workspace:HsmeDenseStudentSealedWorkspaceV1,
  workspaceSha256:string,
):void{
  if(attestation.workspaceSha256!==workspaceSha256){
    fail(
      'hsme_sealed_workspace_attestation_digest',
      'host attested a different workspace digest',
    );
  }
  const expected=workspace.inputs.map(value=>({
    relativePath:value.relativePath,
    contentSha256:value.contentSha256,
    bytes:value.bytes,
    readOnly:true as const,
    symlink:false as const,
  })).sort(compareFileAttestations);
  if(JSON.stringify(attestation.inputFiles)!==JSON.stringify(expected)){
    fail(
      'hsme_sealed_workspace_attestation_file_mismatch',
      'host input file SHA/bytes/permissions roster differs from manifest',
    );
  }
}

function normalizeInput(
  raw:unknown,
  path:string,
):HsmeDenseStudentSealedWorkspaceInputV1{
  const record=exactRecord(raw,[
    'role','contentSha256','relativePath','bytes','readOnly',
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
    fail('hsme_sealed_workspace_input_readonly',path+' must remain read-only');
  }
  return Object.freeze({
    role,
    contentSha256:sha256(record.contentSha256,path+'.contentSha256'),
    relativePath:safeRelativePath(record.relativePath,path+'.relativePath'),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    readOnly:true,
  });
}

function normalizeFileAttestation(
  raw:unknown,
  path:string,
):CoreHsmeDenseStudentSealedWorkspaceFileAttestationV1{
  const record=exactRecord(raw,[
    'relativePath','contentSha256','bytes','readOnly','symlink',
  ],path);
  if(record.readOnly!==true||record.symlink!==false){
    fail(
      'hsme_sealed_workspace_attestation_file_policy',
      path+' must be read-only and not a symlink',
    );
  }
  return Object.freeze({
    relativePath:safeRelativePath(record.relativePath,path+'.relativePath'),
    contentSha256:sha256(record.contentSha256,path+'.contentSha256'),
    bytes:safeInteger(record.bytes,path+'.bytes',1,Number.MAX_SAFE_INTEGER),
    readOnly:true,
    symlink:false,
  });
}

function assertRequiredInputRoles(
  inputs:readonly HsmeDenseStudentSealedWorkspaceInputV1[],
  rawResume:unknown,
):void{
  for(const role of [
    'REPRODUCTION_FIXTURE_JSON',
    'TRAINING_RECIPE_JSON',
    'INPUT_CHECKPOINT',
  ] as const){
    if(inputs.filter(value=>value.role===role).length!==1){
      fail(
        'hsme_sealed_workspace_role_cardinality',
        role+' must occur exactly once',
      );
    }
  }
  const resumeCount=inputs.filter(value=>value.role==='RESUME_CHECKPOINT').length;
  if(rawResume==='NONE'){
    if(resumeCount!==0){
      fail(
        'hsme_sealed_workspace_resume_forbidden',
        'RESUME_CHECKPOINT is forbidden when launch resume is NONE',
      );
    }
  }else if(resumeCount!==1){
    fail(
      'hsme_sealed_workspace_resume_required',
      'exactly one RESUME_CHECKPOINT is required by launch',
    );
  }
}

function singleRole(
  inputs:readonly HsmeDenseStudentSealedWorkspaceInputV1[],
  role:HsmeDenseStudentSealedWorkspaceInputRoleV1,
):HsmeDenseStudentSealedWorkspaceInputV1{
  const values=inputs.filter(value=>value.role===role);
  if(values.length!==1){
    fail('hsme_sealed_workspace_role_cardinality',role+' cardinality invalid');
  }
  return values[0];
}

function safeRelativePath(raw:unknown,path:string):string{
  if(typeof raw!=='string'||raw.length<1||raw.length>400){
    fail('hsme_sealed_workspace_relative_path',path+' is invalid');
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
      'hsme_sealed_workspace_relative_path',
      path+' must stay below the fixed inputs root',
    );
  }
  return raw;
}

function authorityBoundary(record:Record<string,unknown>,path:string){
  for(const field of [
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
        'hsme_sealed_workspace_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
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

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_sealed_workspace_record',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(record,key))
  ){
    fail('hsme_sealed_workspace_record',path+' has unknown or missing fields');
  }
  return record;
}

function identifier(raw:unknown,path:string,max:number):string{
  if(
    typeof raw!=='string'
    ||raw.length<1
    ||raw.length>max
    ||!IDENTIFIER.test(raw)
    ||/latest|master|main/i.test(raw)
  ){
    fail('hsme_sealed_workspace_identifier',path+' is invalid or floating');
  }
  return raw;
}

function commitSha(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!/^[0-9a-f]{40}$/.test(raw)){
    fail('hsme_sealed_workspace_commit',path+' must be lowercase commit SHA');
  }
  return raw;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_sealed_workspace_hash',path+' must be lowercase SHA-256');
  }
  return raw;
}

function argvInteger(
  raw:string,
  path:string,
  min:number,
):number{
  if(!/^(0|[1-9][0-9]*)$/.test(raw)){
    fail('hsme_sealed_workspace_argv_integer',path+' is not canonical decimal');
  }
  const value=Number(raw);
  if(!Number.isSafeInteger(value)||value<min){
    fail('hsme_sealed_workspace_argv_integer',path+' is out of bounds');
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(!Number.isSafeInteger(raw)||Number(raw)<min||Number(raw)>max){
    fail('hsme_sealed_workspace_integer',path+' is out of bounds');
  }
  return Number(raw);
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_sealed_workspace_enum',path+' is unsupported');
  }
  return raw as T[number];
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
    fail('hsme_sealed_workspace_hash_port','hash port returned invalid SHA-256');
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function compareInputs(
  a:HsmeDenseStudentSealedWorkspaceInputV1,
  b:HsmeDenseStudentSealedWorkspaceInputV1,
):number{
  return lexical(a.role,b.role)||lexical(a.relativePath,b.relativePath);
}

function compareFileAttestations(
  a:CoreHsmeDenseStudentSealedWorkspaceFileAttestationV1,
  b:CoreHsmeDenseStudentSealedWorkspaceFileAttestationV1,
):number{
  return lexical(a.relativePath,b.relativePath);
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
  throw new HsmeDenseStudentSealedWorkspaceV1Error(code,message);
}
