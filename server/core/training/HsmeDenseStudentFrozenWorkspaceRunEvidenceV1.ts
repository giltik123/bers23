import {
  HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1,
  HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1,
  createHsmeDenseStudentSealedWorkspaceExecutionAdapterV1,
  hsmeDenseStudentSealedWorkspaceV1Digest,
  normalizeHsmeDenseStudentSealedWorkspaceV1,
  type CoreHsmeDenseStudentSealedWorkspaceHostV1,
  type HsmeDenseStudentSealedWorkspaceOriginVerifierV1,
  type HsmeDenseStudentSealedWorkspaceV1,
} from './HsmeDenseStudentSealedWorkspaceV1.ts';
import {
  HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA,
  hsmeDenseStudentWorkspaceFreezeReceiptV1Digest,
  type HsmeDenseStudentWorkspaceFreezeReceiptOriginVerifierV1,
  type HsmeDenseStudentWorkspaceFreezeReceiptV1,
} from './HsmeDenseStudentSealedWorkspaceMaterializationV1.ts';
import {
  HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA,
  hsmeDenseStudentTrainingRunReceiptV1Digest,
  runHsmeDenseStudentProtectedTrainingV1,
  type CoreHsmeDenseStudentExecutionResultOriginVerifierV1,
  type HsmeDenseStudentTrainingRunReceiptV1,
} from './HsmeDenseStudentProtectedTrainingRunV1.ts';
import {
  HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA,
  hsmeDenseStudentLaunchSpecV1Digest,
  hsmeDenseStudentTrainingPreflightV1Digest,
  type HsmeDenseStudentTrainingHashPortV1,
  type HsmeDenseStudentTrainingPreflightV1,
} from './HsmeDenseStudentTrainingToolchainV1.ts';

export const HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1_SCHEMA =
  'BERS_HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1' as const;
export const HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:dense-student-frozen-workspace-run-evidence:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export type HsmeDenseStudentFrozenWorkspaceRunEvidenceStateV1=
  | 'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID'
  | 'FROZEN_WORKSPACE_RUN_EVIDENCE_BLOCKED'
  | 'FROZEN_WORKSPACE_RUN_EVIDENCE_READY';

export type HsmeDenseStudentFrozenWorkspaceRunEvidenceV1=Readonly<{
  schemaVersion:
    typeof HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1_SCHEMA;
  state:HsmeDenseStudentFrozenWorkspaceRunEvidenceStateV1;
  blockers:readonly string[];
  freezeReceiptEvidenceSha256:string|'UNKNOWN';
  workspaceSha256:string|'UNKNOWN';
  preflightEvidenceSha256:string|'UNKNOWN';
  launchSpecSha256:string|'UNKNOWN';
  trainingRunReceiptSha256:string|'UNKNOWN';
  materializationAttemptId:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  candidateId:string|'UNKNOWN';
  targetStepCount:number|'UNKNOWN';
  backend:Readonly<{
    backendClass:'CUDA_GPU';
    providerId:string;
    accountId:string;
    executionEnvironmentId:string;
  }>|null;
  startedAtMs:number|'UNKNOWN';
  finishedAtMs:number|'UNKNOWN';
  consumedTrainingExamples:number|'UNKNOWN';
  consumedGpuSeconds:number|'UNKNOWN';
  consumedTrainingCostMicrousd:number|'UNKNOWN';
  stdoutEvidenceSha256:string|'UNKNOWN';
  stderrEvidenceSha256:string|'UNKNOWN';
  stagedCheckpointSha256:string|'UNKNOWN';
  stagedCheckpointBytes:number|'UNKNOWN';
  checkpointMetadataSha256:string|'UNKNOWN';
  teacherDecisionSha256:string|'UNKNOWN';
  reproductionEvidenceSha256:string|'UNKNOWN';
  corpusRootDigest:string|'UNKNOWN';
  recipeDigest:string|'UNKNOWN';
  inputCheckpointSha256:string|'UNKNOWN';
  resumeCheckpointSha256:string|'NONE'|'UNKNOWN';
  realProtectedExecution:boolean;
  checkpointPromotionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
  evidenceSha256:string;
}>;

export type HsmeDenseStudentRealProtectedRunBindingV1=Readonly<{
  freezeReceiptEvidenceSha256:string;
  workspaceSha256:string;
  preflightEvidenceSha256:string;
  launchSpecSha256:string;
  materializationAttemptId:string;
  executionAttemptId:string;
  trainingRunReceiptSha256:string;
}>;

export interface HsmeDenseStudentRealProtectedRunOriginVerifierV1{
  verifyRealProtectedRun(
    receipt:HsmeDenseStudentTrainingRunReceiptV1,
    binding:HsmeDenseStudentRealProtectedRunBindingV1,
  ):Promise<boolean>;
}

export class HsmeDenseStudentFrozenWorkspaceRunEvidenceV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeDenseStudentFrozenWorkspaceRunEvidenceV1Error';
    this.code=code;
  }
}

export async function runHsmeDenseStudentFrozenWorkspaceEvidenceV1(
  preflight:HsmeDenseStudentTrainingPreflightV1,
  rawWorkspace:unknown,
  expectedWorkspaceSha256:string,
  workspaceOrigin:HsmeDenseStudentSealedWorkspaceOriginVerifierV1,
  freezeReceipt:HsmeDenseStudentWorkspaceFreezeReceiptV1,
  expectedFreezeReceiptEvidenceSha256:string,
  freezeOrigin:HsmeDenseStudentWorkspaceFreezeReceiptOriginVerifierV1,
  host:CoreHsmeDenseStudentSealedWorkspaceHostV1,
  executionResultOrigin:CoreHsmeDenseStudentExecutionResultOriginVerifierV1,
  realRunOrigin:HsmeDenseStudentRealProtectedRunOriginVerifierV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentFrozenWorkspaceRunEvidenceV1>{
  const blockers:string[]=[];

  let preflightEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  let launchSpecSha256:string|'UNKNOWN'='UNKNOWN';
  if(
    !preflight
    ||preflight.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_PREFLIGHT_V1_SCHEMA
    ||preflight.state!=='TRAINING_PREFLIGHT_READY_NOT_EXECUTED'
    ||preflight.launchSpec===null
    ||preflight.blockers.length!==0
  ){
    blockers.push('FROZEN_RUN_READY_PREFLIGHT_REQUIRED');
  }else{
    try{
      preflightEvidenceSha256=
        await hsmeDenseStudentTrainingPreflightV1Digest(preflight,hash);
      if(preflightEvidenceSha256!==preflight.preflightEvidenceSha256){
        blockers.push('FROZEN_RUN_PREFLIGHT_REHASH_MISMATCH');
      }
    }catch{
      blockers.push('FROZEN_RUN_PREFLIGHT_REHASH_INVALID');
    }
    try{
      launchSpecSha256=await hsmeDenseStudentLaunchSpecV1Digest(
        preflight.launchSpec,
        hash,
      );
      if(
        launchSpecSha256!==preflight.launchSpecSha256
        ||launchSpecSha256!==preflight.launchSpec.launchSpecSha256
      ){
        blockers.push('FROZEN_RUN_LAUNCH_REHASH_MISMATCH');
      }
    }catch{
      blockers.push('FROZEN_RUN_LAUNCH_REHASH_INVALID');
    }
  }

  let workspace:HsmeDenseStudentSealedWorkspaceV1|null=null;
  let workspaceSha256:string|'UNKNOWN'='UNKNOWN';
  try{
    workspace=normalizeHsmeDenseStudentSealedWorkspaceV1(rawWorkspace);
    workspaceSha256=await hsmeDenseStudentSealedWorkspaceV1Digest(
      workspace,
      hash,
    );
  }catch{
    blockers.push('FROZEN_RUN_WORKSPACE_INVALID');
  }
  if(!HEX64.test(expectedWorkspaceSha256)){
    blockers.push('FROZEN_RUN_EXPECTED_WORKSPACE_DIGEST_INVALID');
  }else if(
    workspaceSha256!=='UNKNOWN'
    &&workspaceSha256!==expectedWorkspaceSha256
  ){
    blockers.push('FROZEN_RUN_WORKSPACE_DIGEST_MISMATCH');
  }else if(workspace!==null&&workspaceSha256!=='UNKNOWN'){
    if(!await verify(
      ()=>workspaceOrigin.verifyWorkspace(workspace as HsmeDenseStudentSealedWorkspaceV1,workspaceSha256 as string),
    )){
      blockers.push('FROZEN_RUN_WORKSPACE_ORIGIN_UNVERIFIED');
    }
  }

  let freezeReceiptEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  if(
    !freezeReceipt
    ||freezeReceipt.schemaVersion!==
      HSME_DENSE_STUDENT_WORKSPACE_FREEZE_RECEIPT_V1_SCHEMA
    ||freezeReceipt.state!=='WORKSPACE_FROZEN_NOT_EXECUTED'
    ||freezeReceipt.blockers.length!==0
    ||freezeReceipt.processSpawned!==false
    ||freezeReceipt.trainingStarted!==false
  ){
    blockers.push('FROZEN_RUN_ACCEPTED_FREEZE_RECEIPT_REQUIRED');
  }else{
    try{
      freezeReceiptEvidenceSha256=
        await hsmeDenseStudentWorkspaceFreezeReceiptV1Digest(
          freezeReceipt,
          hash,
        );
      if(
        freezeReceiptEvidenceSha256!==freezeReceipt.receiptEvidenceSha256
        ||freezeReceiptEvidenceSha256!==expectedFreezeReceiptEvidenceSha256
      ){
        blockers.push('FROZEN_RUN_FREEZE_RECEIPT_REHASH_MISMATCH');
      }else if(!await verify(
        ()=>freezeOrigin.verifyFreezeReceipt(
          freezeReceipt,
          freezeReceiptEvidenceSha256 as string,
        ),
      )){
        blockers.push('FROZEN_RUN_FREEZE_RECEIPT_ORIGIN_UNVERIFIED');
      }
    }catch{
      blockers.push('FROZEN_RUN_FREEZE_RECEIPT_REHASH_INVALID');
    }
  }

  if(workspace!==null){
    await validateWorkspaceFreezeAndPreflightBinding(
      preflight,
      workspace,
      workspaceSha256,
      freezeReceipt,
      freezeReceiptEvidenceSha256,
      blockers,
      hash,
    );
  }

  const common=commonEvidenceValues({
    freezeReceiptEvidenceSha256,
    workspaceSha256,
    preflightEvidenceSha256,
    launchSpecSha256,
    materializationAttemptId:
      freezeReceipt?.materializationAttemptId??'UNKNOWN',
    candidateId:workspace?.candidateId??'UNKNOWN',
    targetStepCount:
      preflight?.launchSpec?.targetStepCount??'UNKNOWN',
    teacherDecisionSha256:workspace?.teacherDecisionSha256??'UNKNOWN',
    reproductionEvidenceSha256:
      workspace?.reproductionEvidenceSha256??'UNKNOWN',
    corpusRootDigest:workspace?.corpusRootDigest??'UNKNOWN',
    recipeDigest:workspace?.recipeDigest??'UNKNOWN',
    inputCheckpointSha256:workspace?.inputCheckpointSha256??'UNKNOWN',
    resumeCheckpointSha256:workspace?.resumeCheckpointSha256??'UNKNOWN',
  });

  if(blockers.length>0||workspace===null||workspaceSha256==='UNKNOWN'){
    return evidence(
      'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID',
      blockers,
      common,
      false,
      hash,
    );
  }

  let executor;
  try{
    executor=await createHsmeDenseStudentSealedWorkspaceExecutionAdapterV1(
      workspace,
      workspaceSha256,
      workspaceOrigin,
      host,
      hash,
    );
  }catch(error){
    return evidence(
      'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID',
      ['FROZEN_RUN_EXECUTION_ADAPTER_INVALID'+errorCodeSuffix(error)],
      common,
      false,
      hash,
    );
  }

  const receipt=await runHsmeDenseStudentProtectedTrainingV1(
    preflight,
    executor,
    executionResultOrigin,
    hash,
  );
  if(
    receipt.schemaVersion!==HSME_DENSE_STUDENT_TRAINING_RUN_RECEIPT_V1_SCHEMA
    ||receipt.state!=='TRAINING_RUN_COMPLETED_CHECKPOINT_STAGED_NOT_PROMOTED'
    ||receipt.blockers.length!==0
  ){
    return evidence(
      'FROZEN_WORKSPACE_RUN_EVIDENCE_BLOCKED',
      Object.freeze([
        'FROZEN_RUN_COMPLETED_STAGED_RECEIPT_REQUIRED',
        ...receipt.blockers.map(value=>'RUN_RECEIPT:'+value),
      ]),
      {
        ...common,
        ...runReceiptValues(receipt),
      },
      false,
      hash,
    );
  }

  let trainingRunReceiptSha256:string;
  try{
    trainingRunReceiptSha256=await hsmeDenseStudentTrainingRunReceiptV1Digest(
      receipt,
      hash,
    );
  }catch{
    return evidence(
      'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID',
      ['FROZEN_RUN_RECEIPT_REHASH_INVALID'],
      {...common,...runReceiptValues(receipt)},
      false,
      hash,
    );
  }
  if(trainingRunReceiptSha256!==receipt.receiptEvidenceSha256){
    return evidence(
      'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID',
      ['FROZEN_RUN_RECEIPT_REHASH_MISMATCH'],
      {...common,...runReceiptValues(receipt),trainingRunReceiptSha256},
      false,
      hash,
    );
  }

  const receiptBindingBlockers:string[]=[];
  validateCompletedReceiptBinding(
    preflight,
    workspace,
    freezeReceipt,
    receipt,
    preflightEvidenceSha256,
    launchSpecSha256,
    receiptBindingBlockers,
  );
  if(receiptBindingBlockers.length>0){
    return evidence(
      'FROZEN_WORKSPACE_RUN_EVIDENCE_INVALID',
      receiptBindingBlockers,
      {...common,...runReceiptValues(receipt),trainingRunReceiptSha256},
      false,
      hash,
    );
  }

  const binding=deepFreeze({
    freezeReceiptEvidenceSha256:freezeReceiptEvidenceSha256 as string,
    workspaceSha256,
    preflightEvidenceSha256:preflightEvidenceSha256 as string,
    launchSpecSha256:launchSpecSha256 as string,
    materializationAttemptId:freezeReceipt.materializationAttemptId,
    executionAttemptId:receipt.executionAttemptId as string,
    trainingRunReceiptSha256,
  });
  const realProtectedExecution=await verify(
    ()=>realRunOrigin.verifyRealProtectedRun(receipt,binding),
  );
  if(!realProtectedExecution){
    return evidence(
      'FROZEN_WORKSPACE_RUN_EVIDENCE_BLOCKED',
      ['FROZEN_RUN_REAL_PROTECTED_ORIGIN_UNVERIFIED'],
      {...common,...runReceiptValues(receipt),trainingRunReceiptSha256},
      false,
      hash,
    );
  }

  return evidence(
    'FROZEN_WORKSPACE_RUN_EVIDENCE_READY',
    [],
    {...common,...runReceiptValues(receipt),trainingRunReceiptSha256},
    true,
    hash,
  );
}

export async function hsmeDenseStudentFrozenWorkspaceRunEvidenceV1Digest(
  value:HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<string>{
  const {evidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

async function validateWorkspaceFreezeAndPreflightBinding(
  preflight:HsmeDenseStudentTrainingPreflightV1,
  workspace:HsmeDenseStudentSealedWorkspaceV1,
  workspaceSha256:string|'UNKNOWN',
  freeze:HsmeDenseStudentWorkspaceFreezeReceiptV1,
  freezeReceiptEvidenceSha256:string|'UNKNOWN',
  blockers:string[],
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<void>{
  if(
    freeze.workspaceSha256!==workspaceSha256
    ||freeze.launchSpecSha256!==workspace.launchSpecSha256
    ||freeze.candidateId!==workspace.candidateId
  ){
    blockers.push('FROZEN_RUN_FREEZE_WORKSPACE_BINDING_MISMATCH');
  }
  if(
    freeze.fixedPaths.workspaceRoot!==HSME_DENSE_STUDENT_SEALED_WORKSPACE_ROOT_V1
    ||freeze.fixedPaths.manifestPath!==
      HSME_DENSE_STUDENT_SEALED_WORKSPACE_MANIFEST_V1
    ||freeze.fixedPaths.inputsRoot!==HSME_DENSE_STUDENT_SEALED_INPUTS_ROOT_V1
    ||freeze.fixedPaths.outputRoot!==HSME_DENSE_STUDENT_SEALED_OUTPUT_ROOT_V1
  ){
    blockers.push('FROZEN_RUN_FREEZE_FIXED_PATHS_MISMATCH');
  }

  const manifestBytes=new TextEncoder().encode(
    JSON.stringify(workspace,null,2)+'\n',
  );
  const manifestSha=await hash.sha256(manifestBytes);
  if(
    !HEX64.test(manifestSha)
    ||freeze.workspaceManifestFileSha256!==manifestSha
    ||freeze.workspaceManifestBytes!==manifestBytes.byteLength
  ){
    blockers.push('FROZEN_RUN_FREEZE_MANIFEST_BINDING_MISMATCH');
  }

  if(
    freezeReceiptEvidenceSha256==='UNKNOWN'
    ||freeze.receiptEvidenceSha256!==freezeReceiptEvidenceSha256
  ){
    blockers.push('FROZEN_RUN_FREEZE_RECEIPT_DIGEST_UNRESOLVED');
  }

  const launch=preflight?.launchSpec;
  if(
    launch===null
    ||launch===undefined
    ||launch.launchSpecSha256!==workspace.launchSpecSha256
    ||launch.candidateId!==workspace.candidateId
    ||launch.repositoryCommitSha!==workspace.repositoryCommitSha
    ||launch.immutableEnvironmentSha256!==workspace.immutableEnvironmentSha256
    ||launch.teacherDecisionSha256!==workspace.teacherDecisionSha256
    ||launch.reproductionEvidenceSha256!==workspace.reproductionEvidenceSha256
    ||launch.corpusRootDigest!==workspace.corpusRootDigest
    ||launch.recipeDigest!==workspace.recipeDigest
    ||launch.checkpointSha256!==workspace.inputCheckpointSha256
    ||launch.resumeCheckpointSha256!==workspace.resumeCheckpointSha256
    ||launch.outputStagingAuthorityId!==workspace.outputStagingAuthorityId
    ||launch.outputStagingPolicySha256!==workspace.outputStagingPolicySha256
  ){
    blockers.push('FROZEN_RUN_PREFLIGHT_WORKSPACE_BINDING_MISMATCH');
  }
}

function validateCompletedReceiptBinding(
  preflight:HsmeDenseStudentTrainingPreflightV1,
  workspace:HsmeDenseStudentSealedWorkspaceV1,
  freeze:HsmeDenseStudentWorkspaceFreezeReceiptV1,
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
  preflightEvidenceSha256:string|'UNKNOWN',
  launchSpecSha256:string|'UNKNOWN',
  blockers:string[],
):void{
  const launch=preflight.launchSpec;
  if(launch===null){
    blockers.push('FROZEN_RUN_LAUNCH_MISSING');
    return;
  }
  if(
    receipt.preflightEvidenceSha256!==preflightEvidenceSha256
    ||receipt.launchSpecSha256!==launchSpecSha256
    ||receipt.launchSpecSha256!==workspace.launchSpecSha256
  ){
    blockers.push('FROZEN_RUN_RECEIPT_PREFLIGHT_BINDING_MISMATCH');
  }
  if(
    receipt.teacherDecisionSha256!==workspace.teacherDecisionSha256
    ||receipt.reproductionEvidenceSha256!==workspace.reproductionEvidenceSha256
    ||receipt.corpusRootDigest!==workspace.corpusRootDigest
    ||receipt.recipeDigest!==workspace.recipeDigest
    ||receipt.inputCheckpointSha256!==workspace.inputCheckpointSha256
    ||receipt.resumeCheckpointSha256!==workspace.resumeCheckpointSha256
  ){
    blockers.push('FROZEN_RUN_RECEIPT_LINEAGE_MISMATCH');
  }
  if(
    receipt.outputStagingAuthorityId!==workspace.outputStagingAuthorityId
    ||receipt.outputStagingPolicySha256!==workspace.outputStagingPolicySha256
  ){
    blockers.push('FROZEN_RUN_RECEIPT_STAGING_BINDING_MISMATCH');
  }
  if(
    receipt.backend===null
    ||receipt.backend.backendClass!=='CUDA_GPU'
    ||JSON.stringify(receipt.backend)!==JSON.stringify(launch.backend)
  ){
    blockers.push('FROZEN_RUN_RECEIPT_BACKEND_BINDING_MISMATCH');
  }
  if(
    typeof receipt.consumedTrainingExamples!=='number'
    ||typeof receipt.consumedGpuSeconds!=='number'
    ||typeof receipt.consumedTrainingCostMicrousd!=='number'
    ||receipt.consumedTrainingExamples>launch.resourceCeilings.maxTrainingExamples
    ||receipt.consumedGpuSeconds>launch.resourceCeilings.maxGpuSeconds
    ||receipt.consumedTrainingCostMicrousd>
      launch.resourceCeilings.maxTrainingCostMicrousd
  ){
    blockers.push('FROZEN_RUN_RECEIPT_RESOURCE_CEILING_MISMATCH');
  }
  if(
    receipt.processSpawned!==true
    ||receipt.trainingStarted!==true
    ||receipt.exitCode!==0
    ||receipt.checkpointPromotionAllowed!==false
    ||receipt.modelInstallAllowed!==false
    ||receipt.modelFleetPromotionAllowed!==false
    ||receipt.durableModelFleetPromotionAllowed!==false
    ||receipt.productionAuthorityGranted!==false
    ||receipt.projectArtifactMutationAllowed!==false
    ||receipt.aeeExecutionAuthorityGranted!==false
    ||receipt.winnerSelectionAllowed!==false
  ){
    blockers.push('FROZEN_RUN_RECEIPT_AUTHORITY_OR_COMPLETION_INVALID');
  }
  if(
    freeze.processSpawned!==false
    ||freeze.trainingStarted!==false
    ||freeze.materializationAttemptId.length<1
  ){
    blockers.push('FROZEN_RUN_FREEZE_PREEXECUTION_STATE_INVALID');
  }
}

type EvidenceValues=Partial<Pick<
  HsmeDenseStudentFrozenWorkspaceRunEvidenceV1,
  'freezeReceiptEvidenceSha256'|'workspaceSha256'|'preflightEvidenceSha256'|
  'launchSpecSha256'|'trainingRunReceiptSha256'|'materializationAttemptId'|
  'executionAttemptId'|'candidateId'|'targetStepCount'|'backend'|
  'startedAtMs'|'finishedAtMs'|'consumedTrainingExamples'|
  'consumedGpuSeconds'|'consumedTrainingCostMicrousd'|
  'stdoutEvidenceSha256'|'stderrEvidenceSha256'|'stagedCheckpointSha256'|
  'stagedCheckpointBytes'|'checkpointMetadataSha256'|
  'teacherDecisionSha256'|'reproductionEvidenceSha256'|'corpusRootDigest'|
  'recipeDigest'|'inputCheckpointSha256'|'resumeCheckpointSha256'
>>;

function commonEvidenceValues(input:EvidenceValues):Required<EvidenceValues>{
  return {
    freezeReceiptEvidenceSha256:
      input.freezeReceiptEvidenceSha256??'UNKNOWN',
    workspaceSha256:input.workspaceSha256??'UNKNOWN',
    preflightEvidenceSha256:input.preflightEvidenceSha256??'UNKNOWN',
    launchSpecSha256:input.launchSpecSha256??'UNKNOWN',
    trainingRunReceiptSha256:input.trainingRunReceiptSha256??'UNKNOWN',
    materializationAttemptId:input.materializationAttemptId??'UNKNOWN',
    executionAttemptId:input.executionAttemptId??'UNKNOWN',
    candidateId:input.candidateId??'UNKNOWN',
    targetStepCount:input.targetStepCount??'UNKNOWN',
    backend:input.backend??null,
    startedAtMs:input.startedAtMs??'UNKNOWN',
    finishedAtMs:input.finishedAtMs??'UNKNOWN',
    consumedTrainingExamples:input.consumedTrainingExamples??'UNKNOWN',
    consumedGpuSeconds:input.consumedGpuSeconds??'UNKNOWN',
    consumedTrainingCostMicrousd:
      input.consumedTrainingCostMicrousd??'UNKNOWN',
    stdoutEvidenceSha256:input.stdoutEvidenceSha256??'UNKNOWN',
    stderrEvidenceSha256:input.stderrEvidenceSha256??'UNKNOWN',
    stagedCheckpointSha256:input.stagedCheckpointSha256??'UNKNOWN',
    stagedCheckpointBytes:input.stagedCheckpointBytes??'UNKNOWN',
    checkpointMetadataSha256:input.checkpointMetadataSha256??'UNKNOWN',
    teacherDecisionSha256:input.teacherDecisionSha256??'UNKNOWN',
    reproductionEvidenceSha256:
      input.reproductionEvidenceSha256??'UNKNOWN',
    corpusRootDigest:input.corpusRootDigest??'UNKNOWN',
    recipeDigest:input.recipeDigest??'UNKNOWN',
    inputCheckpointSha256:input.inputCheckpointSha256??'UNKNOWN',
    resumeCheckpointSha256:input.resumeCheckpointSha256??'UNKNOWN',
  };
}

function runReceiptValues(
  receipt:HsmeDenseStudentTrainingRunReceiptV1,
):EvidenceValues{
  return {
    executionAttemptId:valueOrUnknown(receipt.executionAttemptId),
    backend:receipt.backend,
    startedAtMs:receipt.startedAtMs,
    finishedAtMs:receipt.finishedAtMs,
    consumedTrainingExamples:receipt.consumedTrainingExamples,
    consumedGpuSeconds:receipt.consumedGpuSeconds,
    consumedTrainingCostMicrousd:receipt.consumedTrainingCostMicrousd,
    stdoutEvidenceSha256:valueOrUnknown(receipt.stdoutEvidenceSha256),
    stderrEvidenceSha256:valueOrUnknown(receipt.stderrEvidenceSha256),
    stagedCheckpointSha256:valueOrUnknown(receipt.stagedCheckpointSha256),
    stagedCheckpointBytes:receipt.stagedCheckpointBytes,
    checkpointMetadataSha256:valueOrUnknown(
      receipt.checkpointMetadataSha256,
    ),
    teacherDecisionSha256:valueOrUnknown(receipt.teacherDecisionSha256),
    reproductionEvidenceSha256:valueOrUnknown(
      receipt.reproductionEvidenceSha256,
    ),
    corpusRootDigest:valueOrUnknown(receipt.corpusRootDigest),
    recipeDigest:valueOrUnknown(receipt.recipeDigest),
    inputCheckpointSha256:valueOrUnknown(receipt.inputCheckpointSha256),
    resumeCheckpointSha256:
      receipt.resumeCheckpointSha256==='NONE'
        ?'NONE'
        :valueOrUnknown(receipt.resumeCheckpointSha256),
  };
}

async function evidence(
  state:HsmeDenseStudentFrozenWorkspaceRunEvidenceStateV1,
  blockers:readonly string[],
  input:EvidenceValues,
  realProtectedExecution:boolean,
  hash:HsmeDenseStudentTrainingHashPortV1,
):Promise<HsmeDenseStudentFrozenWorkspaceRunEvidenceV1>{
  const payload={
    schemaVersion:HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    ...commonEvidenceValues(input),
    realProtectedExecution,
    checkpointPromotionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  };
  const evidenceSha256=await digest(
    HSME_DENSE_STUDENT_FROZEN_WORKSPACE_RUN_EVIDENCE_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,evidenceSha256});
}

function valueOrUnknown(
  value:string|'UNKNOWN',
):string|'UNKNOWN'{
  return value!=='UNKNOWN'&&HEX64.test(value)?value:'UNKNOWN';
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
    throw new HsmeDenseStudentFrozenWorkspaceRunEvidenceV1Error(
      'hsme_frozen_run_hash_port',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function errorCodeSuffix(error:unknown):string{
  if(error&&typeof error==='object'&&'code' in error){
    const code=(error as {code?:unknown}).code;
    if(typeof code==='string'&&code.length>0)return ':'+code;
  }
  return '';
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
