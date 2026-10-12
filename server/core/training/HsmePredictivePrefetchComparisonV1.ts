import {
  hsmeAdaptiveResidencyExperimentPlanV1Digest,
  type HsmeAdaptiveResidencyExperimentPlanV1,
} from './HsmeAdaptiveResidencyExperimentPlanV1.ts';
import {
  hsmeDeterministicResidencyScheduleV1Digest,
  type HsmeDeterministicResidencyScheduleV1,
} from './HsmeDeterministicResidencyScheduleV1.ts';
import {
  hsmeAdaptiveResidencyMovementReceiptV1Digest,
  type HsmeAdaptiveResidencyMovementReceiptV1,
} from './HsmeAdaptiveResidencyMovementReceiptV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_PREDICTIVE_PREFETCH_POLICY_V1_SCHEMA =
  'BERS_HSME_PREDICTIVE_PREFETCH_POLICY_V1' as const;
export const HSME_PREDICTIVE_PREFETCH_POLICY_DIGEST_DOMAIN =
  'bers:hsme:predictive-prefetch-policy:v1\0' as const;
export const CORE_HSME_PREDICTIVE_PREFETCH_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_PREDICTIVE_PREFETCH_RESULT_V1' as const;
export const CORE_HSME_PREDICTIVE_PREFETCH_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:predictive-prefetch-result:v1\0' as const;
export const HSME_PREDICTIVE_PREFETCH_COMPARISON_V1_SCHEMA =
  'BERS_HSME_PREDICTIVE_PREFETCH_COMPARISON_V1' as const;
export const HSME_PREDICTIVE_PREFETCH_COMPARISON_DIGEST_DOMAIN =
  'bers:hsme:predictive-prefetch-comparison:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmePredictivePrefetchPolicyV1=Readonly<{
  schemaVersion:typeof HSME_PREDICTIVE_PREFETCH_POLICY_V1_SCHEMA;
  residencyPlanSha256:string;
  deterministicScheduleSha256:string;
  confidenceThresholdBps:number;
  maxPredictionLookaheadStages:number;
  maxPredictivePrefetchBytesPerStage:number;
  maxWastedPrefetchRatioBps:number;
  deterministicPrefetchRequired:true;
  predictivePrefetchAllowed:true;
  predictionMaySuppressDeterministicAssets:false;
  networkDuringExecutionAllowed:false;
  inferenceExecutionAllowed:false;
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

export type HsmePredictiveStageTelemetryV1=Readonly<{
  stageIndex:number;
  stageId:string;
  predictivePrefetchBytes:number;
  predictiveUsefulBytes:number;
  predictiveWastedBytes:number;
  predictionCount:number;
  acceptedPredictionCount:number;
  flashReadBytes:number;
  ramToAcceleratorBytes:number;
  peakRamResidentBytes:number;
  peakAcceleratorResidentBytes:number;
  computeStallMsWaitingForWeights:number;
  networkBytesDuringExecution:0;
}>;

export type CoreHsmePredictivePrefetchRequestV1=Readonly<{
  residencyPlanSha256:string;
  deterministicScheduleSha256:string;
  controlMovementReceiptSha256:string;
  policySha256:string;
  confidenceThresholdBps:number;
  maxPredictionLookaheadStages:number;
  maxPredictivePrefetchBytesPerStage:number;
  maxWastedPrefetchRatioBps:number;
  stages:HsmeDeterministicResidencyScheduleV1['stages'];
  assetBytes:HsmeDeterministicResidencyScheduleV1['assetBytes'];
  maxRamBudgetBytes:number;
  maxAcceleratorBudgetBytes:number;
  networkDuringExecutionAllowed:false;
  inferenceExecutionAllowed:false;
}>;

export interface CoreHsmePredictivePrefetchPortV1{
  executeExactPredictivePrefetch(
    request:CoreHsmePredictivePrefetchRequestV1,
  ):Promise<unknown>;
}

export type CoreHsmePredictivePrefetchResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_PREDICTIVE_PREFETCH_RESULT_V1_SCHEMA;
  state:'PREDICTIVE_PREFETCH_COMPLETED_NO_INFERENCE';
  residencyPlanSha256:string;
  deterministicScheduleSha256:string;
  controlMovementReceiptSha256:string;
  policySha256:string;
  executionAttemptId:string;
  stages:readonly HsmePredictiveStageTelemetryV1[];
  inferenceExecuted:false;
  networkBytesDuringExecution:0;
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

export interface HsmePredictivePlanOriginVerifierV1{
  verifyResidencyPlan(
    plan:HsmeAdaptiveResidencyExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmePredictiveScheduleOriginVerifierV1{
  verifySchedule(
    schedule:HsmeDeterministicResidencyScheduleV1,
    expectedScheduleSha256:string,
  ):Promise<boolean>;
}
export interface HsmePredictiveControlOriginVerifierV1{
  verifyControlReceipt(
    receipt:HsmeAdaptiveResidencyMovementReceiptV1,
    expectedReceiptSha256:string,
  ):Promise<boolean>;
}
export interface HsmePredictivePolicyOriginVerifierV1{
  verifyPredictivePolicy(
    policy:HsmePredictivePrefetchPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}
export interface CoreHsmePredictiveResultOriginVerifierV1{
  verifyPredictiveResult(
    result:CoreHsmePredictivePrefetchResultV1,
    expectedResultSha256:string,
  ):Promise<boolean>;
}

export type HsmePredictivePrefetchComparisonV1=Readonly<{
  schemaVersion:typeof HSME_PREDICTIVE_PREFETCH_COMPARISON_V1_SCHEMA;
  state:
    |'PREDICTIVE_PREFETCH_COMPARISON_INVALID'
    |'PREDICTIVE_PREFETCH_COMPARISON_BLOCKED'
    |'PREDICTIVE_PREFETCH_COMPARISON_READY_NOT_DISPOSED';
  blockers:readonly string[];
  residencyPlanSha256:string|'UNKNOWN';
  deterministicScheduleSha256:string|'UNKNOWN';
  controlMovementReceiptSha256:string|'UNKNOWN';
  policySha256:string|'UNKNOWN';
  predictiveHostResultSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  stages:readonly HsmePredictiveStageTelemetryV1[];
  controlFlashReadBytes:number|'UNKNOWN';
  predictiveFlashReadBytes:number|'UNKNOWN';
  controlComputeStallMs:number|'UNKNOWN';
  predictiveComputeStallMs:number|'UNKNOWN';
  totalPredictivePrefetchBytes:number|'UNKNOWN';
  totalPredictiveUsefulBytes:number|'UNKNOWN';
  totalPredictiveWastedBytes:number|'UNKNOWN';
  predictiveWastedRatioBps:number|'UNKNOWN';
  peakRamResidentBytes:number|'UNKNOWN';
  peakAcceleratorResidentBytes:number|'UNKNOWN';
  networkBytesDuringExecution:0;
  inferenceExecuted:false;
  comparisonEvidenceSha256:string|'UNKNOWN';
  dispositionAllowed:false;
  inferenceExecutionAllowed:false;
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

export class HsmePredictivePrefetchComparisonV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmePredictivePrefetchComparisonV1Error';
    this.code=code;
  }
}

export function normalizeHsmePredictivePrefetchPolicyV1(
  raw:unknown,
):HsmePredictivePrefetchPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','residencyPlanSha256','deterministicScheduleSha256',
    'confidenceThresholdBps','maxPredictionLookaheadStages',
    'maxPredictivePrefetchBytesPerStage','maxWastedPrefetchRatioBps',
    'deterministicPrefetchRequired','predictivePrefetchAllowed',
    'predictionMaySuppressDeterministicAssets','networkDuringExecutionAllowed',
    'inferenceExecutionAllowed','modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_PREDICTIVE_PREFETCH_POLICY_V1_SCHEMA){
    fail('hsme_predictive_policy_schema','predictive policy schema unsupported');
  }
  if(
    r.deterministicPrefetchRequired!==true
    ||r.predictivePrefetchAllowed!==true
    ||r.predictionMaySuppressDeterministicAssets!==false
    ||r.networkDuringExecutionAllowed!==false
  ){
    fail('hsme_predictive_policy_boundary','predictive policy boundary invalid');
  }
  assertPolicyNoAuthority(r);
  return deepFreeze({
    schemaVersion:HSME_PREDICTIVE_PREFETCH_POLICY_V1_SCHEMA,
    residencyPlanSha256:sha256(r.residencyPlanSha256,'policy.residencyPlanSha256'),
    deterministicScheduleSha256:sha256(
      r.deterministicScheduleSha256,'policy.deterministicScheduleSha256',
    ),
    confidenceThresholdBps:safeInteger(
      r.confidenceThresholdBps,'policy.confidenceThresholdBps',1,10000,
    ),
    maxPredictionLookaheadStages:safeInteger(
      r.maxPredictionLookaheadStages,'policy.maxPredictionLookaheadStages',1,64,
    ),
    maxPredictivePrefetchBytesPerStage:safeInteger(
      r.maxPredictivePrefetchBytesPerStage,
      'policy.maxPredictivePrefetchBytesPerStage',1,Number.MAX_SAFE_INTEGER,
    ),
    maxWastedPrefetchRatioBps:safeInteger(
      r.maxWastedPrefetchRatioBps,'policy.maxWastedPrefetchRatioBps',0,10000,
    ),
    deterministicPrefetchRequired:true,
    predictivePrefetchAllowed:true,
    predictionMaySuppressDeterministicAssets:false,
    networkDuringExecutionAllowed:false,
    ...policyAuthorityBoundary(),
  });
}

export async function hsmePredictivePrefetchPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_PREDICTIVE_PREFETCH_POLICY_DIGEST_DOMAIN,
    normalizeHsmePredictivePrefetchPolicyV1(raw),hash,
  );
}

export async function compareHsmePredictivePrefetchV1(
  plan:HsmeAdaptiveResidencyExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmePredictivePlanOriginVerifierV1,
  schedule:HsmeDeterministicResidencyScheduleV1,
  expectedScheduleSha256:string,
  scheduleOrigin:HsmePredictiveScheduleOriginVerifierV1,
  control:HsmeAdaptiveResidencyMovementReceiptV1,
  expectedControlSha256:string,
  controlOrigin:HsmePredictiveControlOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmePredictivePolicyOriginVerifierV1,
  host:CoreHsmePredictivePrefetchPortV1,
  resultOrigin:CoreHsmePredictiveResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmePredictivePrefetchComparisonV1>{
  if(
    plan.state!=='ADAPTIVE_RESIDENCY_PLAN_FROZEN_NOT_EXECUTED'
    ||schedule.state!=='DETERMINISTIC_RESIDENCY_SCHEDULE_READY_NOT_EXECUTED'
    ||control.state!=='ADAPTIVE_RESIDENCY_MOVEMENT_READY_NOT_INFERRED'
  ){
    return blocked(['PREDICTIVE_PREFETCH_READY_INPUTS_REQUIRED']);
  }
  let planSha:string,scheduleSha:string,controlSha:string;
  try{
    planSha=await hsmeAdaptiveResidencyExperimentPlanV1Digest(plan,hash);
    scheduleSha=await hsmeDeterministicResidencyScheduleV1Digest(schedule,hash);
    controlSha=await hsmeAdaptiveResidencyMovementReceiptV1Digest(control,hash);
  }catch{
    return invalid(['PREDICTIVE_PREFETCH_INPUT_REHASH_INVALID']);
  }
  const common={
    residencyPlanSha256:planSha,
    deterministicScheduleSha256:scheduleSha,
    controlMovementReceiptSha256:controlSha,
  };
  if(
    !HEX64.test(expectedPlanSha256)||planSha!==expectedPlanSha256
    ||planSha!==plan.planEvidenceSha256
    ||!HEX64.test(expectedScheduleSha256)||scheduleSha!==expectedScheduleSha256
    ||scheduleSha!==schedule.scheduleEvidenceSha256
    ||!HEX64.test(expectedControlSha256)||controlSha!==expectedControlSha256
    ||controlSha!==control.receiptEvidenceSha256
  ){
    return invalid(['PREDICTIVE_PREFETCH_INPUT_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyResidencyPlan(plan,planSha))){
    return invalid(['PREDICTIVE_PREFETCH_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>scheduleOrigin.verifySchedule(schedule,scheduleSha))){
    return invalid(['PREDICTIVE_PREFETCH_SCHEDULE_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>controlOrigin.verifyControlReceipt(control,controlSha))){
    return invalid(['PREDICTIVE_PREFETCH_CONTROL_ORIGIN_UNVERIFIED'],common);
  }
  if(
    schedule.residencyPlanSha256!==planSha
    ||control.residencyPlanSha256!==planSha
    ||control.deterministicScheduleSha256!==scheduleSha
  ){
    return invalid(['PREDICTIVE_PREFETCH_INPUT_BINDING_MISMATCH'],common);
  }

  let policy:HsmePredictivePrefetchPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmePredictivePrefetchPolicyV1(rawPolicy);
    policySha=await hsmePredictivePrefetchPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['PREDICTIVE_PREFETCH_POLICY_INVALID'],common);
  }
  if(
    !HEX64.test(expectedPolicySha256)||policySha!==expectedPolicySha256
    ||policy.residencyPlanSha256!==planSha
    ||policy.deterministicScheduleSha256!==scheduleSha
  ){
    return invalid(['PREDICTIVE_PREFETCH_POLICY_BINDING_MISMATCH'],{
      ...common,policySha256:policySha,
    });
  }
  if(!await verify(()=>policyOrigin.verifyPredictivePolicy(policy,policySha))){
    return invalid(['PREDICTIVE_PREFETCH_POLICY_ORIGIN_UNVERIFIED'],{
      ...common,policySha256:policySha,
    });
  }
  if(
    plan.predictivePrefetchAllowed!==true
    ||typeof plan.maxPredictionLookaheadStages!=='number'
    ||typeof plan.maxPredictivePrefetchBytesPerStage!=='number'
    ||typeof plan.maxWastedPrefetchRatioBps!=='number'
    ||policy.maxPredictionLookaheadStages>plan.maxPredictionLookaheadStages
    ||policy.maxPredictivePrefetchBytesPerStage>
      plan.maxPredictivePrefetchBytesPerStage
    ||policy.maxWastedPrefetchRatioBps>plan.maxWastedPrefetchRatioBps
  ){
    return invalid(['PREDICTIVE_PREFETCH_POLICY_CAP_ESCALATION'],{
      ...common,policySha256:policySha,
    });
  }
  if(
    typeof plan.maxRamBudgetBytes!=='number'
    ||typeof plan.maxAcceleratorBudgetBytes!=='number'
  ){
    return invalid(['PREDICTIVE_PREFETCH_PLAN_BUDGET_INVALID'],{
      ...common,policySha256:policySha,
    });
  }

  const request:CoreHsmePredictivePrefetchRequestV1=deepFreeze({
    residencyPlanSha256:planSha,
    deterministicScheduleSha256:scheduleSha,
    controlMovementReceiptSha256:controlSha,
    policySha256:policySha,
    confidenceThresholdBps:policy.confidenceThresholdBps,
    maxPredictionLookaheadStages:policy.maxPredictionLookaheadStages,
    maxPredictivePrefetchBytesPerStage:
      policy.maxPredictivePrefetchBytesPerStage,
    maxWastedPrefetchRatioBps:policy.maxWastedPrefetchRatioBps,
    stages:schedule.stages,
    assetBytes:schedule.assetBytes,
    maxRamBudgetBytes:plan.maxRamBudgetBytes,
    maxAcceleratorBudgetBytes:plan.maxAcceleratorBudgetBytes,
    networkDuringExecutionAllowed:false,
    inferenceExecutionAllowed:false,
  });

  let rawResult:unknown;
  try{rawResult=await host.executeExactPredictivePrefetch(request);}
  catch{return invalid(['PREDICTIVE_PREFETCH_HOST_FAILED'],{...common,policySha256:policySha});}
  let result:CoreHsmePredictivePrefetchResultV1;
  let resultSha:string;
  try{
    result=normalizeCoreHsmePredictivePrefetchResultV1(rawResult);
    resultSha=await coreHsmePredictivePrefetchResultV1Digest(result,hash);
  }catch{
    return invalid(['PREDICTIVE_PREFETCH_HOST_RESULT_INVALID'],{...common,policySha256:policySha});
  }
  if(resultSha!==result.hostResultSha256){
    return invalid(['PREDICTIVE_PREFETCH_HOST_RESULT_REHASH_MISMATCH'],{
      ...common,policySha256:policySha,predictiveHostResultSha256:resultSha,
    });
  }
  if(!await verify(()=>resultOrigin.verifyPredictiveResult(result,resultSha))){
    return invalid(['PREDICTIVE_PREFETCH_HOST_RESULT_ORIGIN_UNVERIFIED'],{
      ...common,policySha256:policySha,predictiveHostResultSha256:resultSha,
    });
  }
  if(
    result.residencyPlanSha256!==planSha
    ||result.deterministicScheduleSha256!==scheduleSha
    ||result.controlMovementReceiptSha256!==controlSha
    ||result.policySha256!==policySha
    ||result.stages.length!==schedule.stages.length
  ){
    return invalid(['PREDICTIVE_PREFETCH_HOST_BINDING_MISMATCH'],{
      ...common,policySha256:policySha,predictiveHostResultSha256:resultSha,
    });
  }

  for(let i=0;i<result.stages.length;i+=1){
    const row=result.stages[i],expected=schedule.stages[i];
    if(row.stageIndex!==expected.stageIndex||row.stageId!==expected.stageId){
      return invalid(['PREDICTIVE_PREFETCH_STAGE_BINDING_MISMATCH'],{
        ...common,policySha256:policySha,predictiveHostResultSha256:resultSha,
      });
    }
    if(
      row.predictivePrefetchBytes>policy.maxPredictivePrefetchBytesPerStage
      ||checkedAdd(row.predictiveUsefulBytes,row.predictiveWastedBytes)>
        row.predictivePrefetchBytes
      ||row.peakRamResidentBytes>plan.maxRamBudgetBytes
      ||row.peakAcceleratorResidentBytes>plan.maxAcceleratorBudgetBytes
      ||row.acceptedPredictionCount>row.predictionCount
    ){
      return invalid(['PREDICTIVE_PREFETCH_STAGE_BUDGET_OR_ACCOUNTING_INVALID'],{
        ...common,policySha256:policySha,predictiveHostResultSha256:resultSha,
      });
    }
  }

  const totalPredictivePrefetchBytes=sum(result.stages,'predictivePrefetchBytes');
  const totalPredictiveUsefulBytes=sum(result.stages,'predictiveUsefulBytes');
  const totalPredictiveWastedBytes=sum(result.stages,'predictiveWastedBytes');
  const predictiveWastedRatioBps=totalPredictivePrefetchBytes===0
    ?0
    :Math.floor(totalPredictiveWastedBytes*10000/totalPredictivePrefetchBytes);
  if(predictiveWastedRatioBps>policy.maxWastedPrefetchRatioBps){
    return invalid(['PREDICTIVE_PREFETCH_WASTED_RATIO_EXCEEDED'],{
      ...common,policySha256:policySha,predictiveHostResultSha256:resultSha,
    });
  }

  const payload={
    schemaVersion:HSME_PREDICTIVE_PREFETCH_COMPARISON_V1_SCHEMA,
    state:'PREDICTIVE_PREFETCH_COMPARISON_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    ...common,
    policySha256:policySha,
    predictiveHostResultSha256:resultSha,
    executionAttemptId:result.executionAttemptId,
    stages:result.stages,
    controlFlashReadBytes:control.totalFlashReadBytes,
    predictiveFlashReadBytes:sum(result.stages,'flashReadBytes'),
    controlComputeStallMs:control.totalComputeStallMsWaitingForWeights,
    predictiveComputeStallMs:
      sum(result.stages,'computeStallMsWaitingForWeights'),
    totalPredictivePrefetchBytes,
    totalPredictiveUsefulBytes,
    totalPredictiveWastedBytes,
    predictiveWastedRatioBps,
    peakRamResidentBytes:Math.max(...result.stages.map(v=>v.peakRamResidentBytes)),
    peakAcceleratorResidentBytes:
      Math.max(...result.stages.map(v=>v.peakAcceleratorResidentBytes)),
    networkBytesDuringExecution:0 as const,
    inferenceExecuted:false as const,
    ...authorityBoundary(),
  };
  const comparisonEvidenceSha256=await digest(
    HSME_PREDICTIVE_PREFETCH_COMPARISON_DIGEST_DOMAIN,payload,hash,
  );
  return deepFreeze({...payload,comparisonEvidenceSha256});
}

export function normalizeCoreHsmePredictivePrefetchResultV1(
  raw:unknown,
):CoreHsmePredictivePrefetchResultV1{
  const r=exactRecord(raw,[
    'schemaVersion','state','residencyPlanSha256',
    'deterministicScheduleSha256','controlMovementReceiptSha256','policySha256',
    'executionAttemptId','stages','inferenceExecuted',
    'networkBytesDuringExecution','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed','hostResultSha256',
  ],'result');
  if(
    r.schemaVersion!==CORE_HSME_PREDICTIVE_PREFETCH_RESULT_V1_SCHEMA
    ||r.state!=='PREDICTIVE_PREFETCH_COMPLETED_NO_INFERENCE'
    ||r.inferenceExecuted!==false
    ||r.networkBytesDuringExecution!==0
  ){
    fail('hsme_predictive_result_boundary','predictive host result boundary invalid');
  }
  assertNoAuthority(r);
  if(!Array.isArray(r.stages)||r.stages.length<1||r.stages.length>128){
    fail('hsme_predictive_result_stages','predictive stages invalid');
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_PREDICTIVE_PREFETCH_RESULT_V1_SCHEMA,
    state:'PREDICTIVE_PREFETCH_COMPLETED_NO_INFERENCE',
    residencyPlanSha256:sha256(r.residencyPlanSha256,'result.residencyPlanSha256'),
    deterministicScheduleSha256:sha256(
      r.deterministicScheduleSha256,'result.deterministicScheduleSha256',
    ),
    controlMovementReceiptSha256:sha256(
      r.controlMovementReceiptSha256,'result.controlMovementReceiptSha256',
    ),
    policySha256:sha256(r.policySha256,'result.policySha256'),
    executionAttemptId:identifier(r.executionAttemptId,'result.executionAttemptId',160),
    stages:Object.freeze(r.stages.map((v,i)=>normalizePredictiveStage(
      v,'result.stages['+i+']',
    ))),
    inferenceExecuted:false,
    networkBytesDuringExecution:0,
    ...hostAuthorityBoundary(),
    hostResultSha256:sha256(r.hostResultSha256,'result.hostResultSha256'),
  });
}

export async function coreHsmePredictivePrefetchResultV1Digest(
  result:CoreHsmePredictivePrefetchResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const normalized=normalizeCoreHsmePredictivePrefetchResultV1(result);
  const {hostResultSha256:_ignored,...payload}=normalized;
  return digest(CORE_HSME_PREDICTIVE_PREFETCH_RESULT_DIGEST_DOMAIN,payload,hash);
}

export async function hsmePredictivePrefetchComparisonV1Digest(
  value:HsmePredictivePrefetchComparisonV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='PREDICTIVE_PREFETCH_COMPARISON_READY_NOT_DISPOSED'
    ||value.comparisonEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_predictive_comparison_digest_state','only READY_NOT_DISPOSED comparison is digestible');
  }
  const {comparisonEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_PREDICTIVE_PREFETCH_COMPARISON_DIGEST_DOMAIN,payload,hash);
}

function normalizePredictiveStage(raw:unknown,path:string):HsmePredictiveStageTelemetryV1{
  const fields=[
    'stageIndex','stageId','predictivePrefetchBytes','predictiveUsefulBytes',
    'predictiveWastedBytes','predictionCount','acceptedPredictionCount',
    'flashReadBytes','ramToAcceleratorBytes','peakRamResidentBytes',
    'peakAcceleratorResidentBytes','computeStallMsWaitingForWeights',
    'networkBytesDuringExecution',
  ];
  const r=exactRecord(raw,fields,path);
  if(r.networkBytesDuringExecution!==0){
    fail('hsme_predictive_network','network bytes must remain zero');
  }
  const n=(name:string)=>safeInteger(r[name],path+'.'+name,0,Number.MAX_SAFE_INTEGER);
  return deepFreeze({
    stageIndex:n('stageIndex'),
    stageId:identifier(r.stageId,path+'.stageId',120),
    predictivePrefetchBytes:n('predictivePrefetchBytes'),
    predictiveUsefulBytes:n('predictiveUsefulBytes'),
    predictiveWastedBytes:n('predictiveWastedBytes'),
    predictionCount:n('predictionCount'),
    acceptedPredictionCount:n('acceptedPredictionCount'),
    flashReadBytes:n('flashReadBytes'),
    ramToAcceleratorBytes:n('ramToAcceleratorBytes'),
    peakRamResidentBytes:n('peakRamResidentBytes'),
    peakAcceleratorResidentBytes:n('peakAcceleratorResidentBytes'),
    computeStallMsWaitingForWeights:n('computeStallMsWaitingForWeights'),
    networkBytesDuringExecution:0,
  });
}

type PartialOutput=Partial<Pick<
  HsmePredictivePrefetchComparisonV1,
  'residencyPlanSha256'|'deterministicScheduleSha256'
  |'controlMovementReceiptSha256'|'policySha256'
  |'predictiveHostResultSha256'
>>;
function invalid(blockers:readonly string[],values:PartialOutput={}){
  return terminal('PREDICTIVE_PREFETCH_COMPARISON_INVALID',blockers,values);
}
function blocked(blockers:readonly string[],values:PartialOutput={}){
  return terminal('PREDICTIVE_PREFETCH_COMPARISON_BLOCKED',blockers,values);
}
function terminal(
  state:'PREDICTIVE_PREFETCH_COMPARISON_INVALID'|'PREDICTIVE_PREFETCH_COMPARISON_BLOCKED',
  blockers:readonly string[],values:PartialOutput,
):HsmePredictivePrefetchComparisonV1{
  return deepFreeze({
    schemaVersion:HSME_PREDICTIVE_PREFETCH_COMPARISON_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort()),
    residencyPlanSha256:values.residencyPlanSha256??'UNKNOWN',
    deterministicScheduleSha256:values.deterministicScheduleSha256??'UNKNOWN',
    controlMovementReceiptSha256:values.controlMovementReceiptSha256??'UNKNOWN',
    policySha256:values.policySha256??'UNKNOWN',
    predictiveHostResultSha256:values.predictiveHostResultSha256??'UNKNOWN',
    executionAttemptId:'UNKNOWN',
    stages:Object.freeze([]),
    controlFlashReadBytes:'UNKNOWN',
    predictiveFlashReadBytes:'UNKNOWN',
    controlComputeStallMs:'UNKNOWN',
    predictiveComputeStallMs:'UNKNOWN',
    totalPredictivePrefetchBytes:'UNKNOWN',
    totalPredictiveUsefulBytes:'UNKNOWN',
    totalPredictiveWastedBytes:'UNKNOWN',
    predictiveWastedRatioBps:'UNKNOWN',
    peakRamResidentBytes:'UNKNOWN',
    peakAcceleratorResidentBytes:'UNKNOWN',
    networkBytesDuringExecution:0,
    inferenceExecuted:false,
    comparisonEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}
function policyAuthorityBoundary(){
  return Object.freeze({
    inferenceExecutionAllowed:false as const,
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
function assertPolicyNoAuthority(r:Record<string,unknown>):void{
  for(const key of Object.keys(policyAuthorityBoundary())){
    if(r[key]!==false) fail('hsme_predictive_policy_authority','policy authority widening');
  }
}
function authorityBoundary(){
  return Object.freeze({
    dispositionAllowed:false as const,
    inferenceExecutionAllowed:false as const,
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
function hostAuthorityBoundary(){
  const {dispositionAllowed:_d,inferenceExecutionAllowed:_i,...rest}=authorityBoundary();
  return rest;
}
function assertNoAuthority(r:Record<string,unknown>):void{
  for(const key of Object.keys(hostAuthorityBoundary())){
    if(r[key]!==false) fail('hsme_predictive_authority','authority widening');
  }
}
type PredictiveNumericKey=
  |'predictivePrefetchBytes'|'predictiveUsefulBytes'|'predictiveWastedBytes'
  |'flashReadBytes'|'computeStallMsWaitingForWeights';
function sum(rows:readonly HsmePredictiveStageTelemetryV1[],key:PredictiveNumericKey):number{
  return rows.reduce((s,row)=>checkedAdd(s,row[key]),0);
}
function checkedAdd(a:number,b:number):number{
  const v=a+b;
  if(!Number.isSafeInteger(v)||v<0) fail('hsme_predictive_value','safe integer overflow');
  return v;
}
function exactRecord(raw:unknown,fields:readonly string[],path:string):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)) fail('hsme_predictive_schema',path+' must be object');
  const r=raw as Record<string,unknown>,keys=Object.keys(r);
  if(keys.length!==fields.length||keys.some(k=>!fields.includes(k))||fields.some(k=>!Object.hasOwn(r,k))){
    fail('hsme_predictive_schema',path+' unknown or missing fields');
  }
  return r;
}
function identifier(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'||raw.length<1||raw.length>max||!IDENTIFIER.test(raw)){
    fail('hsme_predictive_value',path+' invalid identifier');
  }
  return raw;
}
function sha256(raw:unknown,path:string):string{
  if(typeof raw!=='string'||!HEX64.test(raw)) fail('hsme_predictive_value',path+' invalid SHA-256');
  return raw;
}
function safeInteger(raw:unknown,path:string,min:number,max:number):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max) fail('hsme_predictive_value',path+' invalid integer');
  return raw as number;
}
async function digest(domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1):Promise<string>{
  const d=await hash.sha256(new TextEncoder().encode(domain+JSON.stringify(value)));
  if(!HEX64.test(d)) fail('hsme_predictive_hash','hash port invalid');
  return d;
}
async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>)) deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{
  throw new HsmePredictivePrefetchComparisonV1Error(code,message);
}
