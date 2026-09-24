export const HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1_SCHEMA =
  'BERS_HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_V1' as const;
export const HSME_FULL_STUDENT_TRAINING_RUN_REQUEST_DIGEST_DOMAIN =
  'bers:hsme:full-student-training-run-request:v1\0' as const;

export type HsmeFullStudentTrainingRunRequestReadyPayloadSourceV1=Readonly<{
  trainingPlanEvidenceSha256:unknown;
  denseBaselineDecisionSha256:unknown;
  denseDualBudgetEvidenceSha256:unknown;
  candidateId:unknown;
  architectureFamily:unknown;
  activeParametersMillions:unknown;
  targetStepCount:unknown;
  maxTrainingExamples:unknown;
  maxGpuSeconds:unknown;
  maxTrainingCostMicrousd:unknown;
  toolchainLockSha256:unknown;
  outputStagingPolicySha256:unknown;
  teacherDecisionSha256:unknown;
  reproductionEvidenceSha256:unknown;
  corpusRootDigest:unknown;
  recipeDigest:unknown;
  checkpointSha256:unknown;
  resumeCheckpointSha256:unknown;
  dualBudgetSnapshot:unknown;
}>;

export function hsmeFullStudentTrainingRunRequestReadyPayloadV1(
  value:HsmeFullStudentTrainingRunRequestReadyPayloadSourceV1,
){
  return Object.freeze({
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
  });
}
