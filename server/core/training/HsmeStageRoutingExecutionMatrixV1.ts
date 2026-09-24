import {
  hsmeStageRoutingExperimentPlanV1Digest,
  type HsmeStageRoutingExperimentPlanV1,
} from './HsmeStageRoutingExperimentPlanV1.ts';
import {
  hsmeStageRouteTableV1Digest,
  type HsmeStageRouteTableV1,
} from './HsmeStageRouteTableV1.ts';
import {
  hsmeStageTransitionPrefetchScheduleV1Digest,
  type HsmeStageTransitionPrefetchScheduleV1,
} from './HsmeStageTransitionPrefetchScheduleV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_V1' as const;
export const HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-execution-campaign:v1\0' as const;
export const CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_V1' as const;
export const CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:stage-routing-execution-result:v1\0' as const;
export const HSME_STAGE_ROUTING_EXECUTION_MATRIX_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_EXECUTION_MATRIX_V1' as const;
export const HSME_STAGE_ROUTING_EXECUTION_MATRIX_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-execution-matrix:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const VARIANTS=Object.freeze([
  'STATIC_SHARED_CONTROL',
  'DETERMINISTIC_STAGE_ROUTED',
] as const);
export type HsmeStageRoutingExecutionVariantV1=typeof VARIANTS[number];

export type HsmeStageRoutingExecutionCampaignV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_V1_SCHEMA;
  stageRoutingPlanSha256:string;
  stageRouteTableSha256:string;
  transitionPrefetchScheduleSha256:string;
  fixtureSha256:string;
  inputBatchSha256:string;
  caseCount:number;
  warmupIterations:number;
  measuredIterations:number;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  sameInputsAcrossVariants:true;
  sameStageBoundariesAcrossVariants:true;
  networkDuringExecutionAllowed:false;
  stageRoutingExecutionAllowed:false;
  selectionAllowed:false;
  routeMutationAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export interface HsmeStageRoutingMatrixPlanOriginVerifierV1{
  verifyStageRoutingPlan(
    plan:HsmeStageRoutingExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}
export interface HsmeStageRoutingMatrixRouteTableOriginVerifierV1{
  verifyStageRouteTable(
    table:HsmeStageRouteTableV1,
    expectedTableSha256:string,
  ):Promise<boolean>;
}
export interface HsmeStageRoutingMatrixPrefetchOriginVerifierV1{
  verifyPrefetchSchedule(
    schedule:HsmeStageTransitionPrefetchScheduleV1,
    expectedScheduleSha256:string,
  ):Promise<boolean>;
}
export interface HsmeStageRoutingMatrixCampaignOriginVerifierV1{
  verifyExecutionCampaign(
    campaign:HsmeStageRoutingExecutionCampaignV1,
    expectedCampaignSha256:string,
  ):Promise<boolean>;
}

export type HsmeStageRoutingExecutionMeasurementV1=Readonly<{
  variant:HsmeStageRoutingExecutionVariantV1;
  implementationSha256:string;
  fixtureSha256:string;
  inputBatchSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  qualityPreservationContractSha256:string;
  qualityPreservationEvidenceSha256:string;
  qualityPreservationPass:boolean;
  hardPreservationFailureCount:number;
  criticalFailureCount:number;
  coldEndToEndLatencyUs:number;
  warmEndToEndLatencyUs:number;
  activeWeightsBytes:number;
  peakMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  expertActivationCount:number;
  transitionPrefetchBytes:number;
  transitionStallUs:number;
  deterministicReplayIdentitySha256:string;
  realMeasuredEvidence:true;
  networkBytesDuringExecution:0;
}>;

export type CoreHsmeStageRoutingExecutionRequestV1=Readonly<{
  stageRoutingPlanSha256:string;
  stageRouteTableSha256:string;
  transitionPrefetchScheduleSha256:string;
  campaignSha256:string;
  denseBaselineContentSha256:string;
  routeTableEvidenceSha256:string;
  fixtureSha256:string;
  inputBatchSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  warmupIterations:number;
  measuredIterations:number;
  networkDuringExecutionAllowed:false;
}>;

export interface CoreHsmeStageRoutingExecutionPortV1{
  executeExactStaticVsStageRoutedCampaign(
    request:CoreHsmeStageRoutingExecutionRequestV1,
  ):Promise<unknown>;
}

export type CoreHsmeStageRoutingExecutionResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_V1_SCHEMA;
  state:'STAGE_ROUTING_EXECUTION_CAMPAIGN_COMPLETED';
  stageRoutingPlanSha256:string;
  stageRouteTableSha256:string;
  transitionPrefetchScheduleSha256:string;
  campaignSha256:string;
  executionAttemptId:string;
  rows:readonly HsmeStageRoutingExecutionMeasurementV1[];
  selectionAllowed:false;
  routeMutationAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  hostResultSha256:string;
}>;

export interface CoreHsmeStageRoutingExecutionResultOriginVerifierV1{
  verifyExecutionResult(
    result:CoreHsmeStageRoutingExecutionResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeStageRoutingExecutionMatrixV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_EXECUTION_MATRIX_V1_SCHEMA;
  state:
    |'STAGE_ROUTING_EXECUTION_MATRIX_INVALID'
    |'STAGE_ROUTING_EXECUTION_MATRIX_BLOCKED'
    |'STAGE_ROUTING_EXECUTION_MATRIX_READY_NOT_DISPOSED';
  blockers:readonly string[];
  stageRoutingPlanSha256:string|'UNKNOWN';
  stageRouteTableSha256:string|'UNKNOWN';
  transitionPrefetchScheduleSha256:string|'UNKNOWN';
  campaignSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  rows:readonly HsmeStageRoutingExecutionMeasurementV1[];
  matrixEvidenceSha256:string|'UNKNOWN';
  furtherStageRoutingExecutionAllowed:false;
  selectionAllowed:false;
  routeMutationAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
}>;

export class HsmeStageRoutingExecutionMatrixV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeStageRoutingExecutionMatrixV1Error';
    this.code=code;
  }
}

export function normalizeHsmeStageRoutingExecutionCampaignV1(
  raw:unknown,
):HsmeStageRoutingExecutionCampaignV1{
  const r=exactRecord(raw,[
    'schemaVersion','stageRoutingPlanSha256','stageRouteTableSha256',
    'transitionPrefetchScheduleSha256','fixtureSha256','inputBatchSha256',
    'caseCount','warmupIterations','measuredIterations',
    'runtimeRepresentationSha256','hardwareClass','sameInputsAcrossVariants',
    'sameStageBoundariesAcrossVariants','networkDuringExecutionAllowed',
    'stageRoutingExecutionAllowed','selectionAllowed','routeMutationAllowed',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'projectArtifactMutationAllowed','aeeExecutionAuthorityGranted',
  ],'campaign');
  if(r.schemaVersion!==HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_V1_SCHEMA){
    fail('hsme_stage_exec_campaign_schema','campaign schema unsupported');
  }
  if(
    r.sameInputsAcrossVariants!==true
    ||r.sameStageBoundariesAcrossVariants!==true
    ||r.networkDuringExecutionAllowed!==false
  ){
    fail('hsme_stage_exec_campaign_boundary','campaign boundary invalid');
  }
  assertNoAuthority(r,'campaign',true);
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_V1_SCHEMA,
    stageRoutingPlanSha256:sha256(
      r.stageRoutingPlanSha256,'campaign.stageRoutingPlanSha256',
    ),
    stageRouteTableSha256:sha256(
      r.stageRouteTableSha256,'campaign.stageRouteTableSha256',
    ),
    transitionPrefetchScheduleSha256:sha256(
      r.transitionPrefetchScheduleSha256,
      'campaign.transitionPrefetchScheduleSha256',
    ),
    fixtureSha256:sha256(r.fixtureSha256,'campaign.fixtureSha256'),
    inputBatchSha256:sha256(r.inputBatchSha256,'campaign.inputBatchSha256'),
    caseCount:safeInteger(r.caseCount,'campaign.caseCount',1,1_000_000),
    warmupIterations:safeInteger(
      r.warmupIterations,'campaign.warmupIterations',0,100_000,
    ),
    measuredIterations:safeInteger(
      r.measuredIterations,'campaign.measuredIterations',1,100_000,
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,'campaign.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'campaign.hardwareClass',160),
    sameInputsAcrossVariants:true,
    sameStageBoundariesAcrossVariants:true,
    networkDuringExecutionAllowed:false,
    ...campaignAuthorityBoundary(),
  });
}

export async function hsmeStageRoutingExecutionCampaignV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_ROUTING_EXECUTION_CAMPAIGN_DIGEST_DOMAIN,
    normalizeHsmeStageRoutingExecutionCampaignV1(raw),hash,
  );
}

export async function executeHsmeStageRoutingComparisonMatrixV1(
  plan:HsmeStageRoutingExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeStageRoutingMatrixPlanOriginVerifierV1,
  table:HsmeStageRouteTableV1,
  expectedTableSha256:string,
  tableOrigin:HsmeStageRoutingMatrixRouteTableOriginVerifierV1,
  schedule:HsmeStageTransitionPrefetchScheduleV1,
  expectedScheduleSha256:string,
  scheduleOrigin:HsmeStageRoutingMatrixPrefetchOriginVerifierV1,
  rawCampaign:unknown,
  expectedCampaignSha256:string,
  campaignOrigin:HsmeStageRoutingMatrixCampaignOriginVerifierV1,
  host:CoreHsmeStageRoutingExecutionPortV1,
  resultOrigin:CoreHsmeStageRoutingExecutionResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeStageRoutingExecutionMatrixV1>{
  if(
    plan.state!=='STAGE_ROUTING_PLAN_FROZEN_NOT_EXECUTED'
    ||plan.planEvidenceSha256==='UNKNOWN'
    ||table.state!=='STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED'
    ||table.routeTableEvidenceSha256==='UNKNOWN'
    ||schedule.state!=='STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED'
    ||schedule.scheduleEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['STAGE_ROUTING_EXECUTION_READY_INPUTS_REQUIRED']);
  }

  let planSha:string;
  let tableSha:string;
  let scheduleSha:string;
  try{
    planSha=await hsmeStageRoutingExperimentPlanV1Digest(plan,hash);
    tableSha=await hsmeStageRouteTableV1Digest(table,hash);
    scheduleSha=await hsmeStageTransitionPrefetchScheduleV1Digest(schedule,hash);
  }catch{
    return invalid(['STAGE_ROUTING_EXECUTION_INPUT_REHASH_INVALID']);
  }
  const common={
    stageRoutingPlanSha256:planSha,
    stageRouteTableSha256:tableSha,
    transitionPrefetchScheduleSha256:scheduleSha,
  };
  if(
    !exactDigest(expectedPlanSha256,planSha,plan.planEvidenceSha256)
    ||!exactDigest(expectedTableSha256,tableSha,table.routeTableEvidenceSha256)
    ||!exactDigest(
      expectedScheduleSha256,scheduleSha,schedule.scheduleEvidenceSha256,
    )
  ){
    return invalid(['STAGE_ROUTING_EXECUTION_INPUT_REHASH_MISMATCH'],common);
  }
  if(!await verify(()=>planOrigin.verifyStageRoutingPlan(plan,planSha))){
    return invalid(['STAGE_ROUTING_EXECUTION_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(()=>tableOrigin.verifyStageRouteTable(table,tableSha))){
    return invalid(['STAGE_ROUTING_EXECUTION_TABLE_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(
    ()=>scheduleOrigin.verifyPrefetchSchedule(schedule,scheduleSha),
  )){
    return invalid(['STAGE_ROUTING_EXECUTION_PREFETCH_ORIGIN_UNVERIFIED'],common);
  }
  if(
    table.stageRoutingPlanSha256!==planSha
    ||schedule.routeTableEvidenceSha256!==tableSha
    ||table.prototypeSha256!==plan.prototypeSha256
    ||table.denseBaselineContentSha256!==plan.denseBaselineContentSha256
    ||table.routerContentSha256!==plan.routerContentSha256
    ||table.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
    ||table.hardwareClass!==plan.hardwareClass
    ||schedule.prototypeSha256!==plan.prototypeSha256
    ||schedule.routerContentSha256!==plan.routerContentSha256
    ||schedule.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
    ||schedule.hardwareClass!==plan.hardwareClass
  ){
    return invalid(['STAGE_ROUTING_EXECUTION_CHAIN_BINDING_MISMATCH'],common);
  }

  let campaign:HsmeStageRoutingExecutionCampaignV1;
  let campaignSha:string;
  try{
    campaign=normalizeHsmeStageRoutingExecutionCampaignV1(rawCampaign);
    campaignSha=await hsmeStageRoutingExecutionCampaignV1Digest(campaign,hash);
  }catch{
    return invalid(['STAGE_ROUTING_EXECUTION_CAMPAIGN_INVALID'],common);
  }
  const bound={...common,campaignSha256:campaignSha};
  if(!exactDigest(expectedCampaignSha256,campaignSha,campaignSha)){
    return invalid(['STAGE_ROUTING_EXECUTION_CAMPAIGN_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>campaignOrigin.verifyExecutionCampaign(campaign,campaignSha),
  )){
    return invalid(['STAGE_ROUTING_EXECUTION_CAMPAIGN_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    campaign.stageRoutingPlanSha256!==planSha
    ||campaign.stageRouteTableSha256!==tableSha
    ||campaign.transitionPrefetchScheduleSha256!==scheduleSha
    ||campaign.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
    ||campaign.hardwareClass!==plan.hardwareClass
  ){
    return invalid(['STAGE_ROUTING_EXECUTION_CAMPAIGN_BINDING_MISMATCH'],bound);
  }

  const request:CoreHsmeStageRoutingExecutionRequestV1=deepFreeze({
    stageRoutingPlanSha256:planSha,
    stageRouteTableSha256:tableSha,
    transitionPrefetchScheduleSha256:scheduleSha,
    campaignSha256:campaignSha,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    routeTableEvidenceSha256:tableSha,
    fixtureSha256:campaign.fixtureSha256,
    inputBatchSha256:campaign.inputBatchSha256,
    runtimeRepresentationSha256:campaign.runtimeRepresentationSha256,
    hardwareClass:campaign.hardwareClass,
    caseCount:campaign.caseCount,
    warmupIterations:campaign.warmupIterations,
    measuredIterations:campaign.measuredIterations,
    networkDuringExecutionAllowed:false,
  });

  let rawResult:unknown;
  try{
    rawResult=await host.executeExactStaticVsStageRoutedCampaign(request);
  }catch{
    return invalid(['STAGE_ROUTING_EXECUTION_HOST_FAILED'],bound);
  }
  let result:CoreHsmeStageRoutingExecutionResultV1;
  let hostResultSha:string;
  try{
    result=normalizeCoreHsmeStageRoutingExecutionResultV1(rawResult);
    hostResultSha=await coreHsmeStageRoutingExecutionResultV1Digest(result,hash);
  }catch{
    return invalid(['STAGE_ROUTING_EXECUTION_HOST_RESULT_INVALID'],bound);
  }
  if(hostResultSha!==result.hostResultSha256){
    return invalid(['STAGE_ROUTING_EXECUTION_HOST_RESULT_REHASH_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>resultOrigin.verifyExecutionResult(result,hostResultSha),
  )){
    return invalid(['STAGE_ROUTING_EXECUTION_HOST_RESULT_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    result.stageRoutingPlanSha256!==planSha
    ||result.stageRouteTableSha256!==tableSha
    ||result.transitionPrefetchScheduleSha256!==scheduleSha
    ||result.campaignSha256!==campaignSha
    ||result.rows.length!==2
  ){
    return invalid(['STAGE_ROUTING_EXECUTION_HOST_BINDING_MISMATCH'],bound);
  }

  const rows=[...result.rows].sort(
    (a,b)=>VARIANTS.indexOf(a.variant)-VARIANTS.indexOf(b.variant),
  );
  if(rows[0].variant!==VARIANTS[0]||rows[1].variant!==VARIANTS[1]){
    return invalid(['STAGE_ROUTING_EXECUTION_ROW_CARDINALITY_INVALID'],bound);
  }
  for(const row of rows){
    if(
      row.fixtureSha256!==campaign.fixtureSha256
      ||row.inputBatchSha256!==campaign.inputBatchSha256
      ||row.runtimeRepresentationSha256!==campaign.runtimeRepresentationSha256
      ||row.hardwareClass!==campaign.hardwareClass
      ||row.caseCount!==campaign.caseCount
      ||row.qualityPreservationContractSha256!==
        plan.qualityPreservationContractSha256
    ){
      return invalid(['STAGE_ROUTING_EXECUTION_ROW_BINDING_MISMATCH'],bound);
    }
  }
  const control=rows[0];
  const routed=rows[1];
  if(
    control.implementationSha256!==plan.denseBaselineContentSha256
    ||control.expertActivationCount!==0
    ||control.transitionPrefetchBytes!==0
  ){
    return invalid(['STAGE_ROUTING_EXECUTION_CONTROL_IDENTITY_INVALID'],bound);
  }
  if(routed.implementationSha256!==tableSha){
    return invalid(['STAGE_ROUTING_EXECUTION_ROUTED_IDENTITY_INVALID'],bound);
  }

  const payload={
    schemaVersion:HSME_STAGE_ROUTING_EXECUTION_MATRIX_V1_SCHEMA,
    state:'STAGE_ROUTING_EXECUTION_MATRIX_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    stageRoutingPlanSha256:planSha,
    stageRouteTableSha256:tableSha,
    transitionPrefetchScheduleSha256:scheduleSha,
    campaignSha256:campaignSha,
    executionAttemptId:result.executionAttemptId,
    rows:Object.freeze(rows),
    ...matrixAuthorityBoundary(),
  };
  const matrixEvidenceSha256=await digest(
    HSME_STAGE_ROUTING_EXECUTION_MATRIX_DIGEST_DOMAIN,payload,hash,
  );
  return deepFreeze({...payload,matrixEvidenceSha256});
}

export function normalizeCoreHsmeStageRoutingExecutionResultV1(
  raw:unknown,
):CoreHsmeStageRoutingExecutionResultV1{
  const r=exactRecord(raw,[
    'schemaVersion','state','stageRoutingPlanSha256','stageRouteTableSha256',
    'transitionPrefetchScheduleSha256','campaignSha256','executionAttemptId',
    'rows','selectionAllowed','routeMutationAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','hostResultSha256',
  ],'result');
  if(
    r.schemaVersion!==CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_V1_SCHEMA
    ||r.state!=='STAGE_ROUTING_EXECUTION_CAMPAIGN_COMPLETED'
  ){
    fail('hsme_stage_exec_result_schema','host result schema/state unsupported');
  }
  assertNoAuthority(r,'result',false);
  if(!Array.isArray(r.rows)||r.rows.length!==2){
    fail('hsme_stage_exec_result_rows','host result must contain exactly two rows');
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_V1_SCHEMA,
    state:'STAGE_ROUTING_EXECUTION_CAMPAIGN_COMPLETED',
    stageRoutingPlanSha256:sha256(
      r.stageRoutingPlanSha256,'result.stageRoutingPlanSha256',
    ),
    stageRouteTableSha256:sha256(
      r.stageRouteTableSha256,'result.stageRouteTableSha256',
    ),
    transitionPrefetchScheduleSha256:sha256(
      r.transitionPrefetchScheduleSha256,
      'result.transitionPrefetchScheduleSha256',
    ),
    campaignSha256:sha256(r.campaignSha256,'result.campaignSha256'),
    executionAttemptId:identifier(
      r.executionAttemptId,'result.executionAttemptId',160,
    ),
    rows:Object.freeze(r.rows.map((value,index)=>
      normalizeMeasurement(value,'result.rows['+index+']')
    )),
    ...hostAuthorityBoundary(),
    hostResultSha256:sha256(r.hostResultSha256,'result.hostResultSha256'),
  });
}

export async function coreHsmeStageRoutingExecutionResultV1Digest(
  raw:CoreHsmeStageRoutingExecutionResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=normalizeCoreHsmeStageRoutingExecutionResultV1(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(CORE_HSME_STAGE_ROUTING_EXECUTION_RESULT_DIGEST_DOMAIN,payload,hash);
}

export async function hsmeStageRoutingExecutionMatrixV1Digest(
  value:HsmeStageRoutingExecutionMatrixV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='STAGE_ROUTING_EXECUTION_MATRIX_READY_NOT_DISPOSED'
    ||value.matrixEvidenceSha256==='UNKNOWN'
  ){
    fail('hsme_stage_exec_matrix_digest_state','only READY_NOT_DISPOSED matrix is digestible');
  }
  const {matrixEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_STAGE_ROUTING_EXECUTION_MATRIX_DIGEST_DOMAIN,payload,hash);
}

function normalizeMeasurement(
  raw:unknown,path:string,
):HsmeStageRoutingExecutionMeasurementV1{
  const r=exactRecord(raw,[
    'variant','implementationSha256','fixtureSha256','inputBatchSha256',
    'runtimeRepresentationSha256','hardwareClass','caseCount',
    'qualityPreservationContractSha256','qualityPreservationEvidenceSha256',
    'qualityPreservationPass','hardPreservationFailureCount',
    'criticalFailureCount','coldEndToEndLatencyUs','warmEndToEndLatencyUs',
    'activeWeightsBytes','peakMemoryBytes','flashBytesMoved','ramBytesMoved',
    'acceleratorBytesMoved','expertActivationCount','transitionPrefetchBytes',
    'transitionStallUs','deterministicReplayIdentitySha256',
    'realMeasuredEvidence','networkBytesDuringExecution',
  ],path);
  if(
    r.realMeasuredEvidence!==true
    ||r.networkBytesDuringExecution!==0
    ||typeof r.qualityPreservationPass!=='boolean'
  ){
    fail('hsme_stage_exec_measurement_boundary',path+' measurement boundary invalid');
  }
  return deepFreeze({
    variant:enumValue(r.variant,VARIANTS,path+'.variant'),
    implementationSha256:sha256(r.implementationSha256,path+'.implementationSha256'),
    fixtureSha256:sha256(r.fixtureSha256,path+'.fixtureSha256'),
    inputBatchSha256:sha256(r.inputBatchSha256,path+'.inputBatchSha256'),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,path+'.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,path+'.hardwareClass',160),
    caseCount:safeInteger(r.caseCount,path+'.caseCount',1,1_000_000),
    qualityPreservationContractSha256:sha256(
      r.qualityPreservationContractSha256,
      path+'.qualityPreservationContractSha256',
    ),
    qualityPreservationEvidenceSha256:sha256(
      r.qualityPreservationEvidenceSha256,
      path+'.qualityPreservationEvidenceSha256',
    ),
    qualityPreservationPass:r.qualityPreservationPass,
    hardPreservationFailureCount:safeInteger(
      r.hardPreservationFailureCount,
      path+'.hardPreservationFailureCount',0,Number.MAX_SAFE_INTEGER,
    ),
    criticalFailureCount:safeInteger(
      r.criticalFailureCount,path+'.criticalFailureCount',0,Number.MAX_SAFE_INTEGER,
    ),
    coldEndToEndLatencyUs:safeInteger(
      r.coldEndToEndLatencyUs,path+'.coldEndToEndLatencyUs',1,Number.MAX_SAFE_INTEGER,
    ),
    warmEndToEndLatencyUs:safeInteger(
      r.warmEndToEndLatencyUs,path+'.warmEndToEndLatencyUs',1,Number.MAX_SAFE_INTEGER,
    ),
    activeWeightsBytes:safeInteger(
      r.activeWeightsBytes,path+'.activeWeightsBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    peakMemoryBytes:safeInteger(
      r.peakMemoryBytes,path+'.peakMemoryBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    flashBytesMoved:safeInteger(
      r.flashBytesMoved,path+'.flashBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    ramBytesMoved:safeInteger(
      r.ramBytesMoved,path+'.ramBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    acceleratorBytesMoved:safeInteger(
      r.acceleratorBytesMoved,path+'.acceleratorBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    expertActivationCount:safeInteger(
      r.expertActivationCount,path+'.expertActivationCount',0,Number.MAX_SAFE_INTEGER,
    ),
    transitionPrefetchBytes:safeInteger(
      r.transitionPrefetchBytes,path+'.transitionPrefetchBytes',0,Number.MAX_SAFE_INTEGER,
    ),
    transitionStallUs:safeInteger(
      r.transitionStallUs,path+'.transitionStallUs',0,Number.MAX_SAFE_INTEGER,
    ),
    deterministicReplayIdentitySha256:sha256(
      r.deterministicReplayIdentitySha256,
      path+'.deterministicReplayIdentitySha256',
    ),
    realMeasuredEvidence:true,
    networkBytesDuringExecution:0,
  });
}

type PartialOutput=Partial<Pick<
  HsmeStageRoutingExecutionMatrixV1,
  'stageRoutingPlanSha256'|'stageRouteTableSha256'
  |'transitionPrefetchScheduleSha256'|'campaignSha256'
>>;
function blocked(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageRoutingExecutionMatrixV1{
  return terminal('STAGE_ROUTING_EXECUTION_MATRIX_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],values:PartialOutput={},
):HsmeStageRoutingExecutionMatrixV1{
  return terminal('STAGE_ROUTING_EXECUTION_MATRIX_INVALID',blockers,values);
}
function terminal(
  state:
    |'STAGE_ROUTING_EXECUTION_MATRIX_INVALID'
    |'STAGE_ROUTING_EXECUTION_MATRIX_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeStageRoutingExecutionMatrixV1{
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_EXECUTION_MATRIX_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    stageRoutingPlanSha256:values.stageRoutingPlanSha256??'UNKNOWN',
    stageRouteTableSha256:values.stageRouteTableSha256??'UNKNOWN',
    transitionPrefetchScheduleSha256:
      values.transitionPrefetchScheduleSha256??'UNKNOWN',
    campaignSha256:values.campaignSha256??'UNKNOWN',
    executionAttemptId:'UNKNOWN',rows:Object.freeze([]),
    matrixEvidenceSha256:'UNKNOWN',...matrixAuthorityBoundary(),
  });
}
function campaignAuthorityBoundary(){
  return Object.freeze({
    stageRoutingExecutionAllowed:false as const,
    selectionAllowed:false as const,
    routeMutationAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    aeeExecutionAuthorityGranted:false as const,
  });
}
function hostAuthorityBoundary(){
  const {stageRoutingExecutionAllowed:_e,...rest}=campaignAuthorityBoundary();
  return rest;
}
function matrixAuthorityBoundary(){
  return Object.freeze({
    furtherStageRoutingExecutionAllowed:false as const,
    ...hostAuthorityBoundary(),
  });
}
function assertNoAuthority(
  r:Record<string,unknown>,path:string,includeExecution:boolean,
):void{
  const fields=includeExecution
    ?Object.keys(campaignAuthorityBoundary())
    :Object.keys(hostAuthorityBoundary());
  for(const field of fields){
    if(r[field]!==false){
      fail('hsme_stage_exec_authority',path+'.'+field+' must remain false');
    }
  }
}
function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}
function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_stage_exec_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_stage_exec_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail('hsme_stage_exec_schema',path+' contains unknown or missing fields');
  }
  return r;
}
function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_stage_exec_value',path+' is unsupported');
  }
  return raw as T[number];
}
function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_stage_exec_value',path+' must be an identifier');
  }
  return value;
}
function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail('hsme_stage_exec_value',path+' must be lowercase SHA-256');
  }
  return value;
}
function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_stage_exec_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_stage_exec_value',path+' is invalid');
  }
  return value;
}
function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail('hsme_stage_exec_value',path+' must be a bounded safe integer');
  }
  return raw as number;
}
async function digest(
  domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail('hsme_stage_exec_hash','hash port must return lowercase SHA-256');
  }
  return result;
}
async function verify(run:()=>Promise<boolean>):Promise<boolean>{
  try{return await run()===true;}catch{return false;}
}
function lexical(a:string,b:string):number{
  return a<b?-1:a>b?1:0;
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
  throw new HsmeStageRoutingExecutionMatrixV1Error(code,message);
}
