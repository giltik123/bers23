import {
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
  type HsmeFullStudentTrainingPlanAdmissionV1,
} from './HsmeFullStudentTrainingPlanAdmissionV1';
import {
  HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA,
  hsmeDenseBaselineDecisionV1Digest,
  normalizeHsmeDenseBaselineDecisionV1,
  type HsmeDenseBaselineDecisionV1,
  type HsmeDenseBaselineHashPortV1,
  type HsmeDenseTrainingTargetV1,
} from './HsmeDenseBaselineEvidenceV1';
import {
  HSME_DENSE_BASELINE_DUAL_BUDGET_EVIDENCE_V1_SCHEMA,
  normalizeHsmeDenseDualBudgetEvidenceV1,
  type HsmeDenseDualBudgetCandidateV1,
  type HsmeDenseDualBudgetEvidenceV1,
} from './HsmeDenseBaselineDualBudgetEvidenceV1';
import {
  HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_DIGEST_DOMAIN,
  HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
  hsmeFullStudentTrainingRunRequestReadyPayloadV1,
} from './HsmeFullStudentTrainingRunRequestContractV1';

export const HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA =
  'BERS_HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1' as const;
export {HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA};
export const HSME_FULL_STUDENT_DUAL_BUDGET_BINDING_DIGEST_DOMAIN =
  'bers:hsme:full-student-dual-budget-binding:v1\0' as const;
const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/-]*$/;

export type HsmeFullStudentTrainingRunEnvelopeV1=Readonly<{
  schemaVersion:typeof HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA;
  candidateId:string;
  activeParametersMillions:number;
  targetStepCount:number;
  maxTrainingExamples:number;
  maxGpuSeconds:number;
  maxTrainingCostMicrousd:number;
  toolchainLockSha256:string;
  outputStagingPolicySha256:string;
}>;

export interface HsmeFullStudentTrainingRunRequestOriginVerifierV1{
  verifyTrainingPlan(
    plan:HsmeFullStudentTrainingPlanAdmissionV1,
    expectedPlanEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeFullStudentTrainingRunRequestStateV1=
  | 'TRAINING_RUN_REQUEST_INVALID'
  | 'TRAINING_RUN_REQUEST_BLOCKED'
  | 'TRAINING_RUN_REQUEST_READY_FOR_CORE_ADMISSION';

export type HsmeFullStudentTrainingRunRequestV1=Readonly<{
  schemaVersion:typeof HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA;
  state:HsmeFullStudentTrainingRunRequestStateV1;
  blockers:readonly string[];
  trainingPlanEvidenceSha256:string|'UNKNOWN';
  denseBaselineDecisionSha256:string|'UNKNOWN';
  denseDualBudgetEvidenceSha256:string|'UNKNOWN';
  candidateId:string|'UNKNOWN';
  architectureFamily:'COMPACT_DIT'|'UNKNOWN';
  activeParametersMillions:number|'UNKNOWN';
  targetStepCount:number|'UNKNOWN';
  maxTrainingExamples:number|'UNKNOWN';
  maxGpuSeconds:number|'UNKNOWN';
  maxTrainingCostMicrousd:number|'UNKNOWN';
  toolchainLockSha256:string|'UNKNOWN';
  outputStagingPolicySha256:string|'UNKNOWN';
  teacherDecisionSha256:string|'UNKNOWN';
  reproductionEvidenceSha256:string|'UNKNOWN';
  corpusRootDigest:string|'UNKNOWN';
  recipeDigest:string|'UNKNOWN';
  checkpointSha256:string|'UNKNOWN';
  resumeCheckpointSha256:string|'UNKNOWN';
  dualBudgetSnapshot:Readonly<{
    efficiencyDisposition:'R&D_ONLY'|'UNKNOWN';
    qualityPerInstalledGbStatus:'PENDING'|'MEASURED'|'UNKNOWN';
    mvmState:'NOT_EVALUATED'|'RESIDENT'|'MVM_CANDIDATE'|'UNKNOWN';
    mandatoryInstalledBytes:number|'UNKNOWN';
    firstUseDownloadBytes:number|'UNKNOWN';
    activeWeightsBytes:number|'UNKNOWN';
    peakRamBytes:number|'UNKNOWN';
    peakAcceleratorBytes:number|'UNKNOWN';
    flashBytesMovedPerRun:number|'UNKNOWN';
    unresolvedFields:readonly string[];
  }>;
  requestEvidenceSha256:string|'UNKNOWN';
  coreAdmissionRequired:true;
  coreExecutionTicketPresent:false;
  providerSelectionAllowed:false;
  executionTargetSelectionAllowed:false;
  trainingRunStartAllowed:false;
  trainingOrDistillationExecutionAllowed:false;
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

export class HsmeFullStudentTrainingRunRequestV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFullStudentTrainingRunRequestV1Error';
    this.code=code;
  }
}

export async function buildHsmeFullStudentTrainingRunRequestV1(
  rawPlan:HsmeFullStudentTrainingPlanAdmissionV1,
  rawDenseDecision:unknown,
  rawDualBudgetEvidence:unknown,
  rawEnvelope:unknown,
  origin:HsmeFullStudentTrainingRunRequestOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeFullStudentTrainingRunRequestV1>{
  if(
    !rawPlan
    ||rawPlan.schemaVersion!==HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA
  ){
    return invalid(['TRAINING_RUN_REQUEST_PLAN_SCHEMA_INVALID']);
  }
  if(rawPlan.state!=='TRAINING_PLAN_READY_NOT_AUTHORIZED'){
    return blocked(['TRAINING_RUN_REQUEST_READY_PLAN_REQUIRED'],{
      trainingPlanEvidenceSha256:valueOrUnknown(rawPlan.planEvidenceSha256),
    });
  }

  const invalidBlockers:string[]=[];
  if(!Array.isArray(rawPlan.blockers)||rawPlan.blockers.length!==0){
    invalidBlockers.push('TRAINING_RUN_REQUEST_PLAN_BLOCKERS_PRESENT');
  }
  if(planAuthorityWidened(rawPlan)){
    invalidBlockers.push('TRAINING_RUN_REQUEST_PLAN_AUTHORITY_INVALID');
  }
  if(!digestKnown(rawPlan.planEvidenceSha256)){
    invalidBlockers.push('TRAINING_RUN_REQUEST_PLAN_DIGEST_INVALID');
  }

  let trainingPlanEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  if(invalidBlockers.length===0){
    try{
      trainingPlanEvidenceSha256=await digest(
        HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_DIGEST_DOMAIN,
        trainingPlanPayload(rawPlan),
        hash,
      );
      if(trainingPlanEvidenceSha256!==rawPlan.planEvidenceSha256){
        invalidBlockers.push('TRAINING_RUN_REQUEST_PLAN_REHASH_MISMATCH');
      }else if(!await verifyOrigin(
        ()=>origin.verifyTrainingPlan(rawPlan,trainingPlanEvidenceSha256 as string),
      )){
        invalidBlockers.push('TRAINING_RUN_REQUEST_PLAN_ORIGIN_UNVERIFIED');
      }
    }catch{
      invalidBlockers.push('TRAINING_RUN_REQUEST_PLAN_REHASH_INVALID');
    }
  }
  if(invalidBlockers.length>0){
    return invalid(invalidBlockers,{
      trainingPlanEvidenceSha256,
      teacherDecisionSha256:valueOrUnknown(rawPlan.teacherDecisionSha256),
      reproductionEvidenceSha256:valueOrUnknown(rawPlan.reproductionEvidenceSha256),
      corpusRootDigest:valueOrUnknown(rawPlan.corpusRootDigest),
      recipeDigest:valueOrUnknown(rawPlan.recipeDigest),
      checkpointSha256:valueOrUnknown(rawPlan.checkpointSha256),
      resumeCheckpointSha256:valueOrUnknown(rawPlan.resumeCheckpointSha256),
    });
  }

  let denseDecision:HsmeDenseBaselineDecisionV1;
  let denseBaselineDecisionSha256:string;
  try{
    denseDecision=normalizeHsmeDenseBaselineDecisionV1(rawDenseDecision);
    denseBaselineDecisionSha256=await hsmeDenseBaselineDecisionV1Digest(
      denseDecision,
      hash,
    );
  }catch(error){
    return invalid([
      'TRAINING_RUN_REQUEST_DENSE_DECISION_INVALID'
      +errorCodeSuffix(error),
    ],{
      trainingPlanEvidenceSha256,
      teacherDecisionSha256:rawPlan.teacherDecisionSha256,
      reproductionEvidenceSha256:rawPlan.reproductionEvidenceSha256,
      corpusRootDigest:rawPlan.corpusRootDigest,
      recipeDigest:rawPlan.recipeDigest,
      checkpointSha256:rawPlan.checkpointSha256,
      resumeCheckpointSha256:rawPlan.resumeCheckpointSha256,
    });
  }

  const targetValidation=validateDenseTarget(denseDecision);
  if(targetValidation.blockers.length>0){
    return invalid(targetValidation.blockers,{
      trainingPlanEvidenceSha256,
      denseBaselineDecisionSha256,
      teacherDecisionSha256:rawPlan.teacherDecisionSha256,
      reproductionEvidenceSha256:rawPlan.reproductionEvidenceSha256,
      corpusRootDigest:rawPlan.corpusRootDigest,
      recipeDigest:rawPlan.recipeDigest,
      checkpointSha256:rawPlan.checkpointSha256,
      resumeCheckpointSha256:rawPlan.resumeCheckpointSha256,
    });
  }
  const trainingTarget=targetValidation.trainingTarget as HsmeDenseTrainingTargetV1;

  let dualBudget:HsmeDenseDualBudgetEvidenceV1;
  let denseDualBudgetEvidenceSha256:string;
  let budgetTarget:HsmeDenseDualBudgetCandidateV1;
  try{
    dualBudget=normalizeHsmeDenseDualBudgetEvidenceV1(rawDualBudgetEvidence);
    denseDualBudgetEvidenceSha256=await digest(
      HSME_FULL_STUDENT_DUAL_BUDGET_BINDING_DIGEST_DOMAIN,
      dualBudget,
      hash,
    );
    const matches=dualBudget.candidates.filter(
      value=>value.candidateId===denseDecision.selectedCandidateId,
    );
    if(matches.length!==1){
      throw new HsmeFullStudentTrainingRunRequestV1Error(
        'hsme_training_run_request_dual_budget_target',
        'dual-budget evidence must contain the exact selected dense target once',
      );
    }
    budgetTarget=matches[0];
    if(budgetTarget.efficiencyDisposition!=='R&D_ONLY'){
      throw new HsmeFullStudentTrainingRunRequestV1Error(
        'hsme_training_run_request_dual_budget_disposition',
        'training request target must remain R&D_ONLY before measured product evidence',
      );
    }
  }catch(error){
    return invalid([
      'TRAINING_RUN_REQUEST_DUAL_BUDGET_INVALID'
      +errorCodeSuffix(error),
    ],{
      trainingPlanEvidenceSha256,
      denseBaselineDecisionSha256,
      candidateId:denseDecision.selectedCandidateId,
      teacherDecisionSha256:rawPlan.teacherDecisionSha256,
      reproductionEvidenceSha256:rawPlan.reproductionEvidenceSha256,
      corpusRootDigest:rawPlan.corpusRootDigest,
      recipeDigest:rawPlan.recipeDigest,
      checkpointSha256:rawPlan.checkpointSha256,
      resumeCheckpointSha256:rawPlan.resumeCheckpointSha256,
    });
  }

  let envelope:HsmeFullStudentTrainingRunEnvelopeV1;
  try{
    envelope=normalizeEnvelope(rawEnvelope);
  }catch(error){
    return invalid([
      'TRAINING_RUN_REQUEST_ENVELOPE_INVALID'
      +errorCodeSuffix(error),
    ],{
      trainingPlanEvidenceSha256,
      denseBaselineDecisionSha256,
      denseDualBudgetEvidenceSha256,
      candidateId:denseDecision.selectedCandidateId,
      dualBudgetSnapshot:snapshotBudget(budgetTarget),
      teacherDecisionSha256:rawPlan.teacherDecisionSha256,
      reproductionEvidenceSha256:rawPlan.reproductionEvidenceSha256,
      corpusRootDigest:rawPlan.corpusRootDigest,
      recipeDigest:rawPlan.recipeDigest,
      checkpointSha256:rawPlan.checkpointSha256,
      resumeCheckpointSha256:rawPlan.resumeCheckpointSha256,
    });
  }

  if(envelope.candidateId!==denseDecision.selectedCandidateId){
    return invalid(['TRAINING_RUN_REQUEST_TARGET_IDENTITY_MISMATCH'],{
      trainingPlanEvidenceSha256,
      denseBaselineDecisionSha256,
      denseDualBudgetEvidenceSha256,
      candidateId:envelope.candidateId,
      architectureFamily:'COMPACT_DIT',
      activeParametersMillions:envelope.activeParametersMillions,
      targetStepCount:envelope.targetStepCount,
      maxTrainingExamples:envelope.maxTrainingExamples,
      maxGpuSeconds:envelope.maxGpuSeconds,
      maxTrainingCostMicrousd:envelope.maxTrainingCostMicrousd,
      toolchainLockSha256:envelope.toolchainLockSha256,
      outputStagingPolicySha256:envelope.outputStagingPolicySha256,
      dualBudgetSnapshot:snapshotBudget(budgetTarget),
      teacherDecisionSha256:rawPlan.teacherDecisionSha256,
      reproductionEvidenceSha256:rawPlan.reproductionEvidenceSha256,
      corpusRootDigest:rawPlan.corpusRootDigest,
      recipeDigest:rawPlan.recipeDigest,
      checkpointSha256:rawPlan.checkpointSha256,
      resumeCheckpointSha256:rawPlan.resumeCheckpointSha256,
    });
  }

  const requestBlockers:string[]=[];
  if(!trainingTarget.targetStepCounts.includes(envelope.targetStepCount)){
    requestBlockers.push('TRAINING_RUN_REQUEST_STEP_COUNT_OUTSIDE_TARGET');
  }
  if(
    envelope.activeParametersMillions<trainingTarget.activeParametersMillions.min
    ||envelope.activeParametersMillions>trainingTarget.activeParametersMillions.max
  ){
    requestBlockers.push('TRAINING_RUN_REQUEST_ACTIVE_SCALE_OUTSIDE_TARGET');
  }
  const common=values({
    trainingPlanEvidenceSha256,
    denseBaselineDecisionSha256,
    denseDualBudgetEvidenceSha256,
    candidateId:envelope.candidateId,
    architectureFamily:'COMPACT_DIT',
    activeParametersMillions:envelope.activeParametersMillions,
    targetStepCount:envelope.targetStepCount,
    maxTrainingExamples:envelope.maxTrainingExamples,
    maxGpuSeconds:envelope.maxGpuSeconds,
    maxTrainingCostMicrousd:envelope.maxTrainingCostMicrousd,
    toolchainLockSha256:envelope.toolchainLockSha256,
    outputStagingPolicySha256:envelope.outputStagingPolicySha256,
    teacherDecisionSha256:rawPlan.teacherDecisionSha256,
    reproductionEvidenceSha256:rawPlan.reproductionEvidenceSha256,
    corpusRootDigest:rawPlan.corpusRootDigest,
    recipeDigest:rawPlan.recipeDigest,
    checkpointSha256:rawPlan.checkpointSha256,
    resumeCheckpointSha256:rawPlan.resumeCheckpointSha256,
    dualBudgetSnapshot:snapshotBudget(budgetTarget),
  });
  if(requestBlockers.length>0){
    return blocked(requestBlockers,common);
  }

  const readyPayload=hsmeFullStudentTrainingRunRequestReadyPayloadV1(common);
  let requestEvidenceSha256:string;
  try{
    requestEvidenceSha256=await digest(
      HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_DIGEST_DOMAIN,
      readyPayload,
      hash,
    );
  }catch{
    return invalid(['TRAINING_RUN_REQUEST_OUTPUT_HASH_INVALID'],common);
  }
  return Object.freeze({
    ...readyPayload,
    blockers:Object.freeze([]),
    requestEvidenceSha256,
  });
}

export async function hsmeFullStudentTrainingRunRequestV1Digest(
  request:HsmeFullStudentTrainingRunRequestV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(request.state!=='TRAINING_RUN_REQUEST_READY_FOR_CORE_ADMISSION'){
    throw new HsmeFullStudentTrainingRunRequestV1Error(
      'hsme_training_run_request_digest_state',
      'only READY_FOR_CORE_ADMISSION requests are digestible',
    );
  }
  return digest(
    HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_DIGEST_DOMAIN,
    hsmeFullStudentTrainingRunRequestReadyPayloadV1(request),
    hash,
  );
}

function validateDenseTarget(decision:HsmeDenseBaselineDecisionV1):{
  blockers:readonly string[];
  trainingTarget?:HsmeDenseTrainingTargetV1;
}{
  const blockers:string[]=[];
  if(decision.schemaVersion!==HSME_DENSE_BASELINE_EVIDENCE_V1_SCHEMA){
    blockers.push('TRAINING_RUN_REQUEST_DENSE_SCHEMA_INVALID');
  }
  if(decision.decisionStatus!=='REDESIGN_REQUIRED'){
    blockers.push('TRAINING_RUN_REQUEST_DENSE_DECISION_NOT_R_AND_D');
  }
  if(decision.baselinePin!==undefined){
    blockers.push('TRAINING_RUN_REQUEST_DENSE_BASELINE_ALREADY_PINNED');
  }
  if(!decision.trainingTarget){
    blockers.push('TRAINING_RUN_REQUEST_DENSE_TRAINING_TARGET_MISSING');
    return {blockers:Object.freeze(blockers)};
  }
  const selected=decision.candidates.find(
    value=>value.candidateId===decision.selectedCandidateId,
  );
  if(
    !selected
    ||selected.strategy!=='BERS_DISTILLED_CORE'
    ||selected.verdict!=='SELECTED_FOR_TRAINING'
    ||selected.architectureFamily!=='COMPACT_DIT'
    ||decision.trainingTarget.candidateId!==decision.selectedCandidateId
    ||decision.trainingTarget.architectureFamily!=='COMPACT_DIT'
  ){
    blockers.push('TRAINING_RUN_REQUEST_DENSE_TARGET_IDENTITY_INVALID');
  }
  return {
    blockers:Object.freeze(blockers),
    trainingTarget:decision.trainingTarget,
  };
}

function normalizeEnvelope(raw:unknown):HsmeFullStudentTrainingRunEnvelopeV1{
  const record=exactRecord(raw,[
    'schemaVersion',
    'candidateId',
    'activeParametersMillions',
    'targetStepCount',
    'maxTrainingExamples',
    'maxGpuSeconds',
    'maxTrainingCostMicrousd',
    'toolchainLockSha256',
    'outputStagingPolicySha256',
  ],'runEnvelope');
  if(record.schemaVersion!==HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA){
    fail(
      'hsme_training_run_request_envelope_schema',
      'run envelope schema is unsupported',
    );
  }
  return Object.freeze({
    schemaVersion:HSME_FULL_STUDENT_TRAINING_RUN_ENVELOPE_V1_SCHEMA,
    candidateId:identifier(record.candidateId,'runEnvelope.candidateId',120),
    activeParametersMillions:safeInteger(
      record.activeParametersMillions,
      'runEnvelope.activeParametersMillions',
      1,
      10000,
    ),
    targetStepCount:safeInteger(
      record.targetStepCount,
      'runEnvelope.targetStepCount',
      1,
      100,
    ),
    maxTrainingExamples:safeInteger(
      record.maxTrainingExamples,
      'runEnvelope.maxTrainingExamples',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxGpuSeconds:safeInteger(
      record.maxGpuSeconds,
      'runEnvelope.maxGpuSeconds',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxTrainingCostMicrousd:safeInteger(
      record.maxTrainingCostMicrousd,
      'runEnvelope.maxTrainingCostMicrousd',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    toolchainLockSha256:sha256(record.toolchainLockSha256,'runEnvelope.toolchainLockSha256'),
    outputStagingPolicySha256:sha256(
      record.outputStagingPolicySha256,
      'runEnvelope.outputStagingPolicySha256',
    ),
  });
}

function trainingPlanPayload(value:HsmeFullStudentTrainingPlanAdmissionV1){
  return {
    schemaVersion:HSME_FULL_STUDENT_TRAINING_PLAN_ADMISSION_V1_SCHEMA,
    state:'TRAINING_PLAN_READY_NOT_AUTHORIZED' as const,
    reuseHandoffEvidenceSha256:value.reuseHandoffEvidenceSha256,
    reuseSourceDecisionSha256:value.reuseSourceDecisionSha256,
    reuseFinalDecisionSha256:value.reuseFinalDecisionSha256,
    teacherAdmissionFinalizationSha256:value.teacherAdmissionFinalizationSha256,
    teacherDecisionSha256:value.teacherDecisionSha256,
    teacherAdmissionGateEvidenceSha256:value.teacherAdmissionGateEvidenceSha256,
    selectedTeacherIds:value.selectedTeacherIds,
    reproductionEvidenceSha256:value.reproductionEvidenceSha256,
    corpusShardDigests:value.corpusShardDigests,
    corpusRootDigest:value.corpusRootDigest,
    recipeDigest:value.recipeDigest,
    checkpointSha256:value.checkpointSha256,
    resumeCheckpointSha256:value.resumeCheckpointSha256,
    deterministicTargetCount:value.deterministicTargetCount,
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

function snapshotBudget(value:HsmeDenseDualBudgetCandidateV1){
  const unresolvedFields:string[]=[];
  for(const [name,metric] of [
    ['mandatoryInstalledBytes',value.installed.mandatoryInstalledBytes],
    ['firstUseDownloadBytes',value.installed.firstUseDownloadBytes],
    ['activeWeightsBytes',value.workingMemory.activeWeightsBytes],
    ['peakRamBytes',value.workingMemory.peakRamBytes],
    ['peakAcceleratorBytes',value.workingMemory.peakAcceleratorBytes],
    ['flashBytesMovedPerRun',value.workingMemory.flashBytesMovedPerRun],
  ] as const){
    if(metric==='UNKNOWN')unresolvedFields.push(name);
  }
  return Object.freeze({
    efficiencyDisposition:'R&D_ONLY' as const,
    qualityPerInstalledGbStatus:value.qualityPerInstalledGbStatus,
    mvmState:value.mvmState,
    mandatoryInstalledBytes:value.installed.mandatoryInstalledBytes,
    firstUseDownloadBytes:value.installed.firstUseDownloadBytes,
    activeWeightsBytes:value.workingMemory.activeWeightsBytes,
    peakRamBytes:value.workingMemory.peakRamBytes,
    peakAcceleratorBytes:value.workingMemory.peakAcceleratorBytes,
    flashBytesMovedPerRun:value.workingMemory.flashBytesMovedPerRun,
    unresolvedFields:Object.freeze(unresolvedFields.sort(lexical)),
  });
}

function planAuthorityWidened(value:HsmeFullStudentTrainingPlanAdmissionV1):boolean{
  return value.trainingRunStartAllowed!==false
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

function authorityBoundary(){
  return Object.freeze({
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
  });
}

function emptyBudgetSnapshot(){
  return Object.freeze({
    efficiencyDisposition:'UNKNOWN' as const,
    qualityPerInstalledGbStatus:'UNKNOWN' as const,
    mvmState:'UNKNOWN' as const,
    mandatoryInstalledBytes:'UNKNOWN' as const,
    firstUseDownloadBytes:'UNKNOWN' as const,
    activeWeightsBytes:'UNKNOWN' as const,
    peakRamBytes:'UNKNOWN' as const,
    peakAcceleratorBytes:'UNKNOWN' as const,
    flashBytesMovedPerRun:'UNKNOWN' as const,
    unresolvedFields:Object.freeze([]) as readonly string[],
  });
}

type OutputValues=Partial<Pick<
  HsmeFullStudentTrainingRunRequestV1,
  'trainingPlanEvidenceSha256'|'denseBaselineDecisionSha256'|
  'denseDualBudgetEvidenceSha256'|'candidateId'|'architectureFamily'|
  'activeParametersMillions'|'targetStepCount'|'maxTrainingExamples'|
  'maxGpuSeconds'|'maxTrainingCostMicrousd'|'toolchainLockSha256'|
  'outputStagingPolicySha256'|'teacherDecisionSha256'|
  'reproductionEvidenceSha256'|'corpusRootDigest'|'recipeDigest'|
  'checkpointSha256'|'resumeCheckpointSha256'|'dualBudgetSnapshot'
>>;

function values(input:OutputValues):Required<OutputValues>{
  return {
    trainingPlanEvidenceSha256:input.trainingPlanEvidenceSha256??'UNKNOWN',
    denseBaselineDecisionSha256:input.denseBaselineDecisionSha256??'UNKNOWN',
    denseDualBudgetEvidenceSha256:input.denseDualBudgetEvidenceSha256??'UNKNOWN',
    candidateId:input.candidateId??'UNKNOWN',
    architectureFamily:input.architectureFamily??'UNKNOWN',
    activeParametersMillions:input.activeParametersMillions??'UNKNOWN',
    targetStepCount:input.targetStepCount??'UNKNOWN',
    maxTrainingExamples:input.maxTrainingExamples??'UNKNOWN',
    maxGpuSeconds:input.maxGpuSeconds??'UNKNOWN',
    maxTrainingCostMicrousd:input.maxTrainingCostMicrousd??'UNKNOWN',
    toolchainLockSha256:input.toolchainLockSha256??'UNKNOWN',
    outputStagingPolicySha256:input.outputStagingPolicySha256??'UNKNOWN',
    teacherDecisionSha256:input.teacherDecisionSha256??'UNKNOWN',
    reproductionEvidenceSha256:input.reproductionEvidenceSha256??'UNKNOWN',
    corpusRootDigest:input.corpusRootDigest??'UNKNOWN',
    recipeDigest:input.recipeDigest??'UNKNOWN',
    checkpointSha256:input.checkpointSha256??'UNKNOWN',
    resumeCheckpointSha256:input.resumeCheckpointSha256??'UNKNOWN',
    dualBudgetSnapshot:input.dualBudgetSnapshot??emptyBudgetSnapshot(),
  };
}

function invalid(
  blockers:readonly string[],
  input:OutputValues={},
):HsmeFullStudentTrainingRunRequestV1{
  return Object.freeze({
    schemaVersion:HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
    state:'TRAINING_RUN_REQUEST_INVALID',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    ...values(input),
    requestEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function blocked(
  blockers:readonly string[],
  input:OutputValues={},
):HsmeFullStudentTrainingRunRequestV1{
  return Object.freeze({
    schemaVersion:HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA,
    state:'TRAINING_RUN_REQUEST_BLOCKED',
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    ...values(input),
    requestEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function exactRecord(raw:unknown,allowed:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_training_run_request_exact_schema',path+' must be an object');
  }
  const record=raw as Record<string,unknown>;
  const keys=Object.keys(record);
  if(keys.length!==allowed.length
    ||keys.some(key=>!allowed.includes(key))
    ||allowed.some(key=>!Object.hasOwn(record,key))){
    fail('hsme_training_run_request_exact_schema',path+' has unknown or missing fields');
  }
  return record;
}

function identifier(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'||raw.length<1||raw.length>max||raw.trim()!==raw||!IDENTIFIER.test(raw)){
    fail('hsme_training_run_request_identifier',path+' is invalid');
  }
  return raw;
}

function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_training_run_request_integer',path+' must be a bounded safe integer');
  }
  return raw as number;
}

function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)){
    fail('hsme_training_run_request_hash',path+' must be lowercase SHA-256');
  }
  return raw;
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
    fail('hsme_training_run_request_hash_port','hash port must return lowercase SHA-256');
  }
  return result;
}

async function verifyOrigin(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}

function digestKnown(value:string|'UNKNOWN'):value is string{
  return value!=='UNKNOWN'&&HEX64.test(value);
}

function valueOrUnknown(value:string|'UNKNOWN'):string|'UNKNOWN'{
  return digestKnown(value)?value:'UNKNOWN';
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
  throw new HsmeFullStudentTrainingRunRequestV1Error(code,message);
}
