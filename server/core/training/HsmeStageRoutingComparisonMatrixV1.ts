import {
  HSME_STAGE_ROUTE_TABLE_V1_SCHEMA,
  hsmeStageRouteTableV1Digest,
  type HsmeStageRouteTableV1,
} from './HsmeStageRouteTableV1.ts';
import {
  HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA,
  hsmeStageTransitionPrefetchScheduleV1Digest,
  type HsmeStageTransitionPrefetchScheduleV1,
} from './HsmeStageTransitionPrefetchScheduleV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_STAGE_ROUTING_CAMPAIGN_POLICY_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_CAMPAIGN_POLICY_V1' as const;
export const HSME_STAGE_ROUTING_CAMPAIGN_POLICY_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-campaign-policy:v1\0' as const;
export const CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_V1' as const;
export const CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:stage-routing-campaign-result:v1\0' as const;
export const HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1' as const;
export const HSME_STAGE_ROUTING_COMPARISON_MATRIX_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-comparison-matrix:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const VARIANTS=Object.freeze([
  'STATIC_SHARED_CONTROL',
  'STAGE_ROUTED',
] as const);

export type HsmeStageRoutingCampaignVariantV1=typeof VARIANTS[number];

export type HsmeStageRoutingCampaignPolicyV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_CAMPAIGN_POLICY_V1_SCHEMA;
  routeTableEvidenceSha256:string;
  scheduleEvidenceSha256:string;
  prototypeSha256:string;
  denseBaselineContentSha256:string;
  routerContentSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  qualityPreservationContractSha256:string;
  fixtureSetSha256:string;
  evaluationContractSha256:string;
  deterministicSeedContractSha256:string;
  caseCount:number;
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  maxWallClockUs:number;
  maxPeakMemoryBytes:number;
  maxFlashBytesMoved:number;
  maxRamBytesMoved:number;
  maxAcceleratorBytesMoved:number;
  maxTransitionStallUs:number;
  networkAllowed:false;
  sameFixtureAcrossVariants:true;
  sameSeedsAcrossVariants:true;
  sameRuntimeAcrossVariants:true;
  reviewState:'STAGE_ROUTING_CAMPAIGN_REVIEWED';
  selectionAllowed:false;
  stageRoutingExecutionAllowed:false;
  routeMutationAllowed:false;
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

export type HsmeStageRoutingQualityValueV1=Readonly<{
  dimension:string;
  valueBps:number;
}>;

export type HsmeStageRoutingHardFailureValueV1=Readonly<{
  dimension:string;
  failureCount:number;
}>;

export type CoreHsmeStageRoutingCampaignMeasurementV1=Readonly<{
  variant:HsmeStageRoutingCampaignVariantV1;
  qualityVector:readonly HsmeStageRoutingQualityValueV1[];
  hardPreservationFailureCounts:
    readonly HsmeStageRoutingHardFailureValueV1[];
  criticalFailureCount:number;
  wallClockUs:number;
  activeWeightsBytes:number;
  peakMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  expertActivationCount:number;
  transitionStallUs:number;
  routerReplayIdentitySha256:string;
  routeTableReplayIdentitySha256:string|'NONE';
  prefetchReplayIdentitySha256:string|'NONE';
  networkBytesDuringExecution:0;
  realTargetDeviceMeasurement:true;
}>;

export type CoreHsmeStageRoutingCampaignResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_V1_SCHEMA;
  state:'STAGE_ROUTING_CAMPAIGN_COMPLETED'|'STAGE_ROUTING_CAMPAIGN_FAILED';
  routeTableEvidenceSha256:string;
  scheduleEvidenceSha256:string;
  campaignPolicySha256:string;
  executionAttemptId:string;
  fixtureSetSha256:string;
  evaluationContractSha256:string;
  deterministicSeedContractSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  rows:readonly CoreHsmeStageRoutingCampaignMeasurementV1[];
  processStarted:boolean;
  realTargetDeviceMeasurement:boolean;
  failureEvidenceSha256:string|'NONE';
  selectionAllowed:false;
  stageRoutingExecutionAllowed:false;
  routeMutationAllowed:false;
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
  hostResultSha256:string;
}>;

export type CoreHsmeStageRoutingCampaignRequestV1=Readonly<{
  routeTable:HsmeStageRouteTableV1;
  routeTableEvidenceSha256:string;
  schedule:HsmeStageTransitionPrefetchScheduleV1;
  scheduleEvidenceSha256:string;
  policy:HsmeStageRoutingCampaignPolicyV1;
  campaignPolicySha256:string;
}>;

export interface CoreHsmeStageRoutingCampaignPortV1{
  executeExactStageRoutingCampaign(
    request:CoreHsmeStageRoutingCampaignRequestV1,
  ):Promise<unknown>;
}

export interface HsmeStageRoutingCampaignRouteTableOriginVerifierV1{
  verifyStageRouteTable(
    routeTable:HsmeStageRouteTableV1,
    expectedRouteTableSha256:string,
  ):Promise<boolean>;
}

export interface HsmeStageRoutingCampaignScheduleOriginVerifierV1{
  verifyPrefetchSchedule(
    schedule:HsmeStageTransitionPrefetchScheduleV1,
    expectedScheduleSha256:string,
  ):Promise<boolean>;
}

export interface HsmeStageRoutingCampaignPolicyOriginVerifierV1{
  verifyCampaignPolicy(
    policy:HsmeStageRoutingCampaignPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export interface CoreHsmeStageRoutingCampaignResultOriginVerifierV1{
  verifyCampaignResult(
    result:CoreHsmeStageRoutingCampaignResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeStageRoutingComparisonMatrixV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA;
  state:
    |'STAGE_ROUTING_COMPARISON_MATRIX_INVALID'
    |'STAGE_ROUTING_COMPARISON_MATRIX_BLOCKED'
    |'STAGE_ROUTING_COMPARISON_MATRIX_FAILED'
    |'STAGE_ROUTING_COMPARISON_MATRIX_READY_NOT_DISPOSED';
  blockers:readonly string[];
  routeTableEvidenceSha256:string|'UNKNOWN';
  scheduleEvidenceSha256:string|'UNKNOWN';
  campaignPolicySha256:string|'UNKNOWN';
  hostResultSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  routerContentSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  fixtureSetSha256:string|'UNKNOWN';
  evaluationContractSha256:string|'UNKNOWN';
  deterministicSeedContractSha256:string|'UNKNOWN';
  caseCount:number|'UNKNOWN';
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  rows:readonly CoreHsmeStageRoutingCampaignMeasurementV1[];
  matrixEvidenceSha256:string|'UNKNOWN';
  selectionAllowed:false;
  stageRoutingExecutionAllowed:false;
  routeMutationAllowed:false;
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

export class HsmeStageRoutingComparisonMatrixV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeStageRoutingComparisonMatrixV1Error';
    this.code=code;
  }
}

export function normalizeHsmeStageRoutingCampaignPolicyV1(
  raw:unknown,
):HsmeStageRoutingCampaignPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','routeTableEvidenceSha256','scheduleEvidenceSha256',
    'prototypeSha256','denseBaselineContentSha256','routerContentSha256',
    'runtimeRepresentationSha256','hardwareClass',
    'qualityPreservationContractSha256','fixtureSetSha256',
    'evaluationContractSha256','deterministicSeedContractSha256','caseCount',
    'qualityDimensions','hardPreservationDimensions','maxWallClockUs',
    'maxPeakMemoryBytes','maxFlashBytesMoved','maxRamBytesMoved',
    'maxAcceleratorBytesMoved','maxTransitionStallUs','networkAllowed',
    'sameFixtureAcrossVariants','sameSeedsAcrossVariants',
    'sameRuntimeAcrossVariants','reviewState','selectionAllowed',
    'stageRoutingExecutionAllowed','routeMutationAllowed',
    'inferenceExecutionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_STAGE_ROUTING_CAMPAIGN_POLICY_V1_SCHEMA){
    fail('hsme_stage_campaign_policy_schema','campaign policy schema unsupported');
  }
  if(r.reviewState!=='STAGE_ROUTING_CAMPAIGN_REVIEWED'){
    fail('hsme_stage_campaign_policy_review','campaign policy review state invalid');
  }
  if(
    r.networkAllowed!==false
    ||r.sameFixtureAcrossVariants!==true
    ||r.sameSeedsAcrossVariants!==true
    ||r.sameRuntimeAcrossVariants!==true
  ){
    fail('hsme_stage_campaign_policy_boundary','campaign comparison boundary invalid');
  }
  assertNoAuthority(r,'policy');
  const qualityDimensions=identifierSet(
    r.qualityDimensions,'policy.qualityDimensions',1,32,100,
  );
  const hardPreservationDimensions=identifierSet(
    r.hardPreservationDimensions,
    'policy.hardPreservationDimensions',1,24,100,
  );
  if(
    hardPreservationDimensions.some(
      dimension=>!qualityDimensions.includes(dimension),
    )
  ){
    fail(
      'hsme_stage_campaign_policy_hard_dimensions',
      'hard preservation dimensions must be quality dimensions',
    );
  }
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_CAMPAIGN_POLICY_V1_SCHEMA,
    routeTableEvidenceSha256:sha256(
      r.routeTableEvidenceSha256,'policy.routeTableEvidenceSha256',
    ),
    scheduleEvidenceSha256:sha256(
      r.scheduleEvidenceSha256,'policy.scheduleEvidenceSha256',
    ),
    prototypeSha256:sha256(r.prototypeSha256,'policy.prototypeSha256'),
    denseBaselineContentSha256:sha256(
      r.denseBaselineContentSha256,'policy.denseBaselineContentSha256',
    ),
    routerContentSha256:sha256(
      r.routerContentSha256,'policy.routerContentSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,'policy.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'policy.hardwareClass',160),
    qualityPreservationContractSha256:sha256(
      r.qualityPreservationContractSha256,
      'policy.qualityPreservationContractSha256',
    ),
    fixtureSetSha256:sha256(r.fixtureSetSha256,'policy.fixtureSetSha256'),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,'policy.evaluationContractSha256',
    ),
    deterministicSeedContractSha256:sha256(
      r.deterministicSeedContractSha256,
      'policy.deterministicSeedContractSha256',
    ),
    caseCount:safeInteger(r.caseCount,'policy.caseCount',1,1_000_000),
    qualityDimensions:Object.freeze(qualityDimensions),
    hardPreservationDimensions:Object.freeze(hardPreservationDimensions),
    maxWallClockUs:safeInteger(
      r.maxWallClockUs,'policy.maxWallClockUs',1,Number.MAX_SAFE_INTEGER,
    ),
    maxPeakMemoryBytes:safeInteger(
      r.maxPeakMemoryBytes,'policy.maxPeakMemoryBytes',1,Number.MAX_SAFE_INTEGER,
    ),
    maxFlashBytesMoved:safeInteger(
      r.maxFlashBytesMoved,'policy.maxFlashBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    maxRamBytesMoved:safeInteger(
      r.maxRamBytesMoved,'policy.maxRamBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    maxAcceleratorBytesMoved:safeInteger(
      r.maxAcceleratorBytesMoved,
      'policy.maxAcceleratorBytesMoved',0,Number.MAX_SAFE_INTEGER,
    ),
    maxTransitionStallUs:safeInteger(
      r.maxTransitionStallUs,
      'policy.maxTransitionStallUs',0,Number.MAX_SAFE_INTEGER,
    ),
    networkAllowed:false,
    sameFixtureAcrossVariants:true,
    sameSeedsAcrossVariants:true,
    sameRuntimeAcrossVariants:true,
    reviewState:'STAGE_ROUTING_CAMPAIGN_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeStageRoutingCampaignPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_ROUTING_CAMPAIGN_POLICY_DIGEST_DOMAIN,
    normalizeHsmeStageRoutingCampaignPolicyV1(raw),
    hash,
  );
}

export async function coreHsmeStageRoutingCampaignResultV1Digest(
  raw:CoreHsmeStageRoutingCampaignResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=normalizeHostResult(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(
    CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function collectHsmeStageRoutingComparisonMatrixV1(
  routeTable:HsmeStageRouteTableV1,
  expectedRouteTableSha256:string,
  routeTableOrigin:HsmeStageRoutingCampaignRouteTableOriginVerifierV1,
  schedule:HsmeStageTransitionPrefetchScheduleV1,
  expectedScheduleSha256:string,
  scheduleOrigin:HsmeStageRoutingCampaignScheduleOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeStageRoutingCampaignPolicyOriginVerifierV1,
  host:CoreHsmeStageRoutingCampaignPortV1,
  resultOrigin:CoreHsmeStageRoutingCampaignResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeStageRoutingComparisonMatrixV1>{
  if(!readyRouteTable(routeTable)){
    return blocked(['STAGE_ROUTING_MATRIX_FROZEN_ROUTE_TABLE_REQUIRED']);
  }
  if(!readySchedule(schedule)){
    return blocked(['STAGE_ROUTING_MATRIX_FROZEN_PREFETCH_SCHEDULE_REQUIRED']);
  }

  let routeTableSha:string;
  try{
    routeTableSha=await hsmeStageRouteTableV1Digest(routeTable,hash);
  }catch{
    return invalid(['STAGE_ROUTING_MATRIX_ROUTE_TABLE_REHASH_INVALID']);
  }
  const common={routeTableEvidenceSha256:routeTableSha};
  if(!exactDigest(
    expectedRouteTableSha256,
    routeTableSha,
    routeTable.routeTableEvidenceSha256 as string,
  )){
    return invalid(['STAGE_ROUTING_MATRIX_ROUTE_TABLE_REHASH_MISMATCH'],common);
  }
  if(!await verify(
    ()=>routeTableOrigin.verifyStageRouteTable(routeTable,routeTableSha),
  )){
    return invalid(['STAGE_ROUTING_MATRIX_ROUTE_TABLE_ORIGIN_UNVERIFIED'],common);
  }

  let scheduleSha:string;
  try{
    scheduleSha=await hsmeStageTransitionPrefetchScheduleV1Digest(
      schedule,hash,
    );
  }catch{
    return invalid(['STAGE_ROUTING_MATRIX_SCHEDULE_REHASH_INVALID'],common);
  }
  const withSchedule={...common,scheduleEvidenceSha256:scheduleSha};
  if(!exactDigest(
    expectedScheduleSha256,
    scheduleSha,
    schedule.scheduleEvidenceSha256 as string,
  )){
    return invalid(['STAGE_ROUTING_MATRIX_SCHEDULE_REHASH_MISMATCH'],withSchedule);
  }
  if(!await verify(
    ()=>scheduleOrigin.verifyPrefetchSchedule(schedule,scheduleSha),
  )){
    return invalid(['STAGE_ROUTING_MATRIX_SCHEDULE_ORIGIN_UNVERIFIED'],withSchedule);
  }
  if(
    schedule.routeTableEvidenceSha256!==routeTableSha
    ||schedule.prototypeSha256!==routeTable.prototypeSha256
    ||schedule.routerContentSha256!==routeTable.routerContentSha256
    ||schedule.runtimeRepresentationSha256!==routeTable.runtimeRepresentationSha256
    ||schedule.hardwareClass!==routeTable.hardwareClass
  ){
    return invalid(['STAGE_ROUTING_MATRIX_SCHEDULE_BINDING_MISMATCH'],withSchedule);
  }

  let policy:HsmeStageRoutingCampaignPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeStageRoutingCampaignPolicyV1(rawPolicy);
    policySha=await hsmeStageRoutingCampaignPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['STAGE_ROUTING_MATRIX_POLICY_INVALID'],withSchedule);
  }
  const bound={...withSchedule,campaignPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['STAGE_ROUTING_MATRIX_POLICY_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(()=>policyOrigin.verifyCampaignPolicy(policy,policySha))){
    return invalid(['STAGE_ROUTING_MATRIX_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    policy.routeTableEvidenceSha256!==routeTableSha
    ||policy.scheduleEvidenceSha256!==scheduleSha
    ||policy.prototypeSha256!==routeTable.prototypeSha256
    ||policy.denseBaselineContentSha256!==routeTable.denseBaselineContentSha256
    ||policy.routerContentSha256!==routeTable.routerContentSha256
    ||policy.runtimeRepresentationSha256!==routeTable.runtimeRepresentationSha256
    ||policy.hardwareClass!==routeTable.hardwareClass
    ||policy.qualityPreservationContractSha256!==
      routeTable.qualityPreservationContractSha256
  ){
    return invalid(['STAGE_ROUTING_MATRIX_POLICY_BINDING_MISMATCH'],bound);
  }

  let rawResult:unknown;
  try{
    rawResult=await host.executeExactStageRoutingCampaign(deepFreeze({
      routeTable,
      routeTableEvidenceSha256:routeTableSha,
      schedule,
      scheduleEvidenceSha256:scheduleSha,
      policy,
      campaignPolicySha256:policySha,
    }));
  }catch{
    return failed(
      ['STAGE_ROUTING_MATRIX_HOST_EXECUTION_FAILED'],
      outputValues(routeTable,schedule,policy,bound),
    );
  }

  let result:CoreHsmeStageRoutingCampaignResultV1;
  let hostResultSha256:string;
  try{
    result=normalizeHostResult(rawResult);
    hostResultSha256=await coreHsmeStageRoutingCampaignResultV1Digest(
      result,hash,
    );
  }catch{
    return invalid(
      ['STAGE_ROUTING_MATRIX_HOST_RESULT_INVALID'],
      outputValues(routeTable,schedule,policy,bound),
    );
  }
  const output={
    ...outputValues(routeTable,schedule,policy,bound),
    hostResultSha256,
    executionAttemptId:result.executionAttemptId,
  };
  if(hostResultSha256!==result.hostResultSha256){
    return invalid(['STAGE_ROUTING_MATRIX_HOST_RESULT_REHASH_MISMATCH'],output);
  }
  if(!await verify(
    ()=>resultOrigin.verifyCampaignResult(result,hostResultSha256),
  )){
    return invalid(['STAGE_ROUTING_MATRIX_HOST_RESULT_ORIGIN_UNVERIFIED'],output);
  }
  if(!hostBindingMatches(result,routeTableSha,scheduleSha,policySha,policy)){
    return invalid(['STAGE_ROUTING_MATRIX_HOST_RESULT_BINDING_MISMATCH'],output);
  }
  if(result.state==='STAGE_ROUTING_CAMPAIGN_FAILED'){
    return failed(['STAGE_ROUTING_MATRIX_PROTECTED_CAMPAIGN_FAILED'],output);
  }
  if(!result.processStarted||!result.realTargetDeviceMeasurement){
    return invalid(['STAGE_ROUTING_MATRIX_COMPLETED_EXECUTION_SHAPE_INVALID'],output);
  }

  const rows=[...result.rows].sort(
    (a,b)=>VARIANTS.indexOf(a.variant)-VARIANTS.indexOf(b.variant),
  );
  if(
    rows.length!==VARIANTS.length
    ||rows.some((row,index)=>row.variant!==VARIANTS[index])
  ){
    return invalid(['STAGE_ROUTING_MATRIX_VARIANT_SET_INVALID'],output);
  }
  for(const row of rows){
    const reason=validateCompletedRow(
      row,routeTableSha,scheduleSha,routeTable,policy,
    );
    if(reason!==null){
      return invalid([reason],output);
    }
  }

  const payload={
    schemaVersion:HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
    state:'STAGE_ROUTING_COMPARISON_MATRIX_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    ...output,
    rows:Object.freeze(rows),
    ...authorityBoundary(),
  };
  const matrixEvidenceSha256=await digest(
    HSME_STAGE_ROUTING_COMPARISON_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,matrixEvidenceSha256});
}

export async function hsmeStageRoutingComparisonMatrixV1Digest(
  value:HsmeStageRoutingComparisonMatrixV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='STAGE_ROUTING_COMPARISON_MATRIX_READY_NOT_DISPOSED'
    ||value.matrixEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_stage_routing_matrix_digest_state',
      'only READY_NOT_DISPOSED matrix is digestible',
    );
  }
  const {matrixEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_STAGE_ROUTING_COMPARISON_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeHostResult(
  raw:unknown,
):CoreHsmeStageRoutingCampaignResultV1{
  const r=exactRecord(raw,[
    'schemaVersion','state','routeTableEvidenceSha256',
    'scheduleEvidenceSha256','campaignPolicySha256','executionAttemptId',
    'fixtureSetSha256','evaluationContractSha256',
    'deterministicSeedContractSha256','runtimeRepresentationSha256',
    'hardwareClass','caseCount','rows','processStarted',
    'realTargetDeviceMeasurement','failureEvidenceSha256','selectionAllowed',
    'stageRoutingExecutionAllowed','routeMutationAllowed',
    'inferenceExecutionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed','hostResultSha256',
  ],'result');
  if(r.schemaVersion!==CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_V1_SCHEMA){
    fail('hsme_stage_campaign_result_schema','host result schema unsupported');
  }
  const state=enumValue(
    r.state,
    ['STAGE_ROUTING_CAMPAIGN_COMPLETED','STAGE_ROUTING_CAMPAIGN_FAILED'] as const,
    'result.state',
  );
  assertNoAuthority(r,'result');
  if(typeof r.processStarted!=='boolean'||typeof r.realTargetDeviceMeasurement!=='boolean'){
    fail('hsme_stage_campaign_result_boolean','host execution flags invalid');
  }
  if(!Array.isArray(r.rows)){
    fail('hsme_stage_campaign_result_rows','host rows must be an array');
  }
  const rows=r.rows.map((value,index)=>
    normalizeMeasurement(value,'result.rows['+index+']')
  );
  const failureEvidenceSha256=r.failureEvidenceSha256==='NONE'
    ?'NONE' as const
    :sha256(r.failureEvidenceSha256,'result.failureEvidenceSha256');
  if(
    (state==='STAGE_ROUTING_CAMPAIGN_COMPLETED'
      &&(rows.length!==2
        ||r.processStarted!==true
        ||r.realTargetDeviceMeasurement!==true
        ||failureEvidenceSha256!=='NONE'))
    ||(state==='STAGE_ROUTING_CAMPAIGN_FAILED'
      &&(rows.length!==0
        ||r.realTargetDeviceMeasurement!==false
        ||failureEvidenceSha256==='NONE'))
  ){
    fail('hsme_stage_campaign_result_state','host result state shape invalid');
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_STAGE_ROUTING_CAMPAIGN_RESULT_V1_SCHEMA,
    state,
    routeTableEvidenceSha256:sha256(
      r.routeTableEvidenceSha256,'result.routeTableEvidenceSha256',
    ),
    scheduleEvidenceSha256:sha256(
      r.scheduleEvidenceSha256,'result.scheduleEvidenceSha256',
    ),
    campaignPolicySha256:sha256(
      r.campaignPolicySha256,'result.campaignPolicySha256',
    ),
    executionAttemptId:identifier(
      r.executionAttemptId,'result.executionAttemptId',160,
    ),
    fixtureSetSha256:sha256(r.fixtureSetSha256,'result.fixtureSetSha256'),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,'result.evaluationContractSha256',
    ),
    deterministicSeedContractSha256:sha256(
      r.deterministicSeedContractSha256,
      'result.deterministicSeedContractSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'result.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'result.hardwareClass',160),
    caseCount:safeInteger(r.caseCount,'result.caseCount',1,1_000_000),
    rows:Object.freeze(rows),
    processStarted:r.processStarted,
    realTargetDeviceMeasurement:r.realTargetDeviceMeasurement,
    failureEvidenceSha256,
    ...authorityBoundary(),
    hostResultSha256:sha256(r.hostResultSha256,'result.hostResultSha256'),
  });
}

function normalizeMeasurement(
  raw:unknown,
  path:string,
):CoreHsmeStageRoutingCampaignMeasurementV1{
  const r=exactRecord(raw,[
    'variant','qualityVector','hardPreservationFailureCounts',
    'criticalFailureCount','wallClockUs','activeWeightsBytes',
    'peakMemoryBytes','flashBytesMoved','ramBytesMoved',
    'acceleratorBytesMoved','expertActivationCount','transitionStallUs',
    'routerReplayIdentitySha256','routeTableReplayIdentitySha256',
    'prefetchReplayIdentitySha256','networkBytesDuringExecution',
    'realTargetDeviceMeasurement',
  ],path);
  if(
    r.networkBytesDuringExecution!==0
    ||r.realTargetDeviceMeasurement!==true
  ){
    fail(
      'hsme_stage_campaign_measurement_boundary',
      path+' network/real-measurement boundary invalid',
    );
  }
  if(!Array.isArray(r.qualityVector)||!Array.isArray(r.hardPreservationFailureCounts)){
    fail('hsme_stage_campaign_measurement_vector',path+' vectors must be arrays');
  }
  const qualityVector=r.qualityVector.map((value,index)=>
    normalizeQualityValue(value,path+'.qualityVector['+index+']')
  ).sort((a,b)=>lexical(a.dimension,b.dimension));
  const hardPreservationFailureCounts=r.hardPreservationFailureCounts.map(
    (value,index)=>normalizeHardFailure(
      value,path+'.hardPreservationFailureCounts['+index+']',
    ),
  ).sort((a,b)=>lexical(a.dimension,b.dimension));
  if(
    new Set(qualityVector.map(v=>v.dimension)).size!==qualityVector.length
    ||new Set(hardPreservationFailureCounts.map(v=>v.dimension)).size!==
      hardPreservationFailureCounts.length
  ){
    fail('hsme_stage_campaign_measurement_duplicate',path+' vector dimension duplicate');
  }
  const routeReplay=r.routeTableReplayIdentitySha256==='NONE'
    ?'NONE' as const
    :sha256(
      r.routeTableReplayIdentitySha256,
      path+'.routeTableReplayIdentitySha256',
    );
  const prefetchReplay=r.prefetchReplayIdentitySha256==='NONE'
    ?'NONE' as const
    :sha256(
      r.prefetchReplayIdentitySha256,
      path+'.prefetchReplayIdentitySha256',
    );
  return deepFreeze({
    variant:enumValue(r.variant,VARIANTS,path+'.variant'),
    qualityVector:Object.freeze(qualityVector),
    hardPreservationFailureCounts:Object.freeze(hardPreservationFailureCounts),
    criticalFailureCount:safeInteger(
      r.criticalFailureCount,path+'.criticalFailureCount',0,1_000_000,
    ),
    wallClockUs:safeInteger(
      r.wallClockUs,path+'.wallClockUs',1,Number.MAX_SAFE_INTEGER,
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
      r.acceleratorBytesMoved,path+'.acceleratorBytesMoved',
      0,Number.MAX_SAFE_INTEGER,
    ),
    expertActivationCount:safeInteger(
      r.expertActivationCount,path+'.expertActivationCount',
      0,Number.MAX_SAFE_INTEGER,
    ),
    transitionStallUs:safeInteger(
      r.transitionStallUs,path+'.transitionStallUs',0,Number.MAX_SAFE_INTEGER,
    ),
    routerReplayIdentitySha256:sha256(
      r.routerReplayIdentitySha256,path+'.routerReplayIdentitySha256',
    ),
    routeTableReplayIdentitySha256:routeReplay,
    prefetchReplayIdentitySha256:prefetchReplay,
    networkBytesDuringExecution:0,
    realTargetDeviceMeasurement:true,
  });
}

function normalizeQualityValue(
  raw:unknown,path:string,
):HsmeStageRoutingQualityValueV1{
  const r=exactRecord(raw,['dimension','valueBps'],path);
  return deepFreeze({
    dimension:identifier(r.dimension,path+'.dimension',100),
    valueBps:safeInteger(r.valueBps,path+'.valueBps',0,10_000),
  });
}

function normalizeHardFailure(
  raw:unknown,path:string,
):HsmeStageRoutingHardFailureValueV1{
  const r=exactRecord(raw,['dimension','failureCount'],path);
  return deepFreeze({
    dimension:identifier(r.dimension,path+'.dimension',100),
    failureCount:safeInteger(
      r.failureCount,path+'.failureCount',0,1_000_000,
    ),
  });
}

function validateCompletedRow(
  row:CoreHsmeStageRoutingCampaignMeasurementV1,
  routeTableSha:string,
  scheduleSha:string,
  routeTable:HsmeStageRouteTableV1,
  policy:HsmeStageRoutingCampaignPolicyV1,
):string|null{
  if(
    !sameStringSet(
      row.qualityVector.map(value=>value.dimension),
      policy.qualityDimensions,
    )
    ||!sameStringSet(
      row.hardPreservationFailureCounts.map(value=>value.dimension),
      policy.hardPreservationDimensions,
    )
  ){
    return 'STAGE_ROUTING_MATRIX_QUALITY_DIMENSION_MISMATCH';
  }
  if(
    row.criticalFailureCount>policy.caseCount
    ||row.hardPreservationFailureCounts.some(
      value=>value.failureCount>policy.caseCount,
    )
  ){
    return 'STAGE_ROUTING_MATRIX_FAILURE_COUNT_EXCEEDED';
  }
  if(
    row.wallClockUs>policy.maxWallClockUs
    ||row.peakMemoryBytes>policy.maxPeakMemoryBytes
    ||row.flashBytesMoved>policy.maxFlashBytesMoved
    ||row.ramBytesMoved>policy.maxRamBytesMoved
    ||row.acceleratorBytesMoved>policy.maxAcceleratorBytesMoved
    ||row.transitionStallUs>policy.maxTransitionStallUs
  ){
    return 'STAGE_ROUTING_MATRIX_RESOURCE_CEILING_EXCEEDED';
  }
  if(row.variant==='STATIC_SHARED_CONTROL'){
    if(
      row.expertActivationCount!==0
      ||row.transitionStallUs!==0
      ||row.routeTableReplayIdentitySha256!=='NONE'
      ||row.prefetchReplayIdentitySha256!=='NONE'
    ){
      return 'STAGE_ROUTING_MATRIX_STATIC_CONTROL_ACTIVITY_INVALID';
    }
    return null;
  }
  const maxActivations=checkedMultiply(
    policy.caseCount,
    (routeTable.maxActiveExpertsPerStage as number)*3,
  );
  if(row.expertActivationCount>maxActivations){
    return 'STAGE_ROUTING_MATRIX_STAGE_ACTIVATION_CAP_EXCEEDED';
  }
  if(
    row.routeTableReplayIdentitySha256!==routeTableSha
    ||row.prefetchReplayIdentitySha256!==scheduleSha
  ){
    return 'STAGE_ROUTING_MATRIX_STAGE_REPLAY_BINDING_MISMATCH';
  }
  return null;
}

function hostBindingMatches(
  result:CoreHsmeStageRoutingCampaignResultV1,
  routeTableSha:string,
  scheduleSha:string,
  policySha:string,
  policy:HsmeStageRoutingCampaignPolicyV1,
):boolean{
  return result.routeTableEvidenceSha256===routeTableSha
    &&result.scheduleEvidenceSha256===scheduleSha
    &&result.campaignPolicySha256===policySha
    &&result.fixtureSetSha256===policy.fixtureSetSha256
    &&result.evaluationContractSha256===policy.evaluationContractSha256
    &&result.deterministicSeedContractSha256===
      policy.deterministicSeedContractSha256
    &&result.runtimeRepresentationSha256===policy.runtimeRepresentationSha256
    &&result.hardwareClass===policy.hardwareClass
    &&result.caseCount===policy.caseCount;
}

function readyRouteTable(value:HsmeStageRouteTableV1):boolean{
  return value.schemaVersion===HSME_STAGE_ROUTE_TABLE_V1_SCHEMA
    &&value.state==='STAGE_ROUTE_TABLE_FROZEN_NOT_EXECUTED'
    &&value.routeTableEvidenceSha256!=='UNKNOWN'
    &&value.prototypeSha256!=='UNKNOWN'
    &&value.denseBaselineContentSha256!=='UNKNOWN'
    &&value.routerContentSha256!=='UNKNOWN'
    &&value.runtimeRepresentationSha256!=='UNKNOWN'
    &&value.hardwareClass!=='UNKNOWN'
    &&value.qualityPreservationContractSha256!=='UNKNOWN'
    &&typeof value.maxActiveExpertsPerStage==='number'
    &&value.stageRoutingExecutionAllowed===false
    &&value.inferenceExecutionAllowed===false;
}

function readySchedule(value:HsmeStageTransitionPrefetchScheduleV1):boolean{
  return value.schemaVersion===
      HSME_STAGE_TRANSITION_PREFETCH_SCHEDULE_V1_SCHEMA
    &&value.state==='STAGE_TRANSITION_PREFETCH_SCHEDULE_FROZEN_NOT_EXECUTED'
    &&value.scheduleEvidenceSha256!=='UNKNOWN'
    &&value.routeTableEvidenceSha256!=='UNKNOWN'
    &&value.prototypeSha256!=='UNKNOWN'
    &&value.routerContentSha256!=='UNKNOWN'
    &&value.runtimeRepresentationSha256!=='UNKNOWN'
    &&value.hardwareClass!=='UNKNOWN'
    &&value.movementExecutionAllowed===false
    &&value.stageRoutingExecutionAllowed===false
    &&value.inferenceExecutionAllowed===false;
}

type OutputValues=Partial<Pick<
  HsmeStageRoutingComparisonMatrixV1,
  'routeTableEvidenceSha256'|'scheduleEvidenceSha256'|'campaignPolicySha256'
  |'hostResultSha256'|'executionAttemptId'|'prototypeSha256'
  |'denseBaselineContentSha256'|'routerContentSha256'
  |'runtimeRepresentationSha256'|'hardwareClass'|'fixtureSetSha256'
  |'evaluationContractSha256'|'deterministicSeedContractSha256'
  |'caseCount'|'qualityDimensions'|'hardPreservationDimensions'
>>;

function outputValues(
  routeTable:HsmeStageRouteTableV1,
  _schedule:HsmeStageTransitionPrefetchScheduleV1,
  policy:HsmeStageRoutingCampaignPolicyV1,
  digests:OutputValues,
):OutputValues{
  return {
    ...digests,
    prototypeSha256:routeTable.prototypeSha256,
    denseBaselineContentSha256:routeTable.denseBaselineContentSha256,
    routerContentSha256:routeTable.routerContentSha256,
    runtimeRepresentationSha256:routeTable.runtimeRepresentationSha256,
    hardwareClass:routeTable.hardwareClass,
    fixtureSetSha256:policy.fixtureSetSha256,
    evaluationContractSha256:policy.evaluationContractSha256,
    deterministicSeedContractSha256:policy.deterministicSeedContractSha256,
    caseCount:policy.caseCount,
    qualityDimensions:policy.qualityDimensions,
    hardPreservationDimensions:policy.hardPreservationDimensions,
  };
}

function blocked(
  blockers:readonly string[],values:OutputValues={},
):HsmeStageRoutingComparisonMatrixV1{
  return terminal('STAGE_ROUTING_COMPARISON_MATRIX_BLOCKED',blockers,values);
}
function invalid(
  blockers:readonly string[],values:OutputValues={},
):HsmeStageRoutingComparisonMatrixV1{
  return terminal('STAGE_ROUTING_COMPARISON_MATRIX_INVALID',blockers,values);
}
function failed(
  blockers:readonly string[],values:OutputValues={},
):HsmeStageRoutingComparisonMatrixV1{
  return terminal('STAGE_ROUTING_COMPARISON_MATRIX_FAILED',blockers,values);
}
function terminal(
  state:
    |'STAGE_ROUTING_COMPARISON_MATRIX_INVALID'
    |'STAGE_ROUTING_COMPARISON_MATRIX_BLOCKED'
    |'STAGE_ROUTING_COMPARISON_MATRIX_FAILED',
  blockers:readonly string[],
  values:OutputValues,
):HsmeStageRoutingComparisonMatrixV1{
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    routeTableEvidenceSha256:values.routeTableEvidenceSha256??'UNKNOWN',
    scheduleEvidenceSha256:values.scheduleEvidenceSha256??'UNKNOWN',
    campaignPolicySha256:values.campaignPolicySha256??'UNKNOWN',
    hostResultSha256:values.hostResultSha256??'UNKNOWN',
    executionAttemptId:values.executionAttemptId??'UNKNOWN',
    prototypeSha256:values.prototypeSha256??'UNKNOWN',
    denseBaselineContentSha256:
      values.denseBaselineContentSha256??'UNKNOWN',
    routerContentSha256:values.routerContentSha256??'UNKNOWN',
    runtimeRepresentationSha256:
      values.runtimeRepresentationSha256??'UNKNOWN',
    hardwareClass:values.hardwareClass??'UNKNOWN',
    fixtureSetSha256:values.fixtureSetSha256??'UNKNOWN',
    evaluationContractSha256:
      values.evaluationContractSha256??'UNKNOWN',
    deterministicSeedContractSha256:
      values.deterministicSeedContractSha256??'UNKNOWN',
    caseCount:values.caseCount??'UNKNOWN',
    qualityDimensions:values.qualityDimensions??Object.freeze([]),
    hardPreservationDimensions:
      values.hardPreservationDimensions??Object.freeze([]),
    rows:Object.freeze([]),
    matrixEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    selectionAllowed:false as const,
    stageRoutingExecutionAllowed:false as const,
    routeMutationAllowed:false as const,
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

function assertNoAuthority(record:Record<string,unknown>,path:string):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_stage_campaign_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function identifierSet(
  raw:unknown,path:string,min:number,max:number,maxLength:number,
):string[]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail('hsme_stage_campaign_value',path+' cardinality invalid');
  }
  const values=raw.map((value,index)=>
    identifier(value,path+'['+index+']',maxLength)
  ).sort(lexical);
  if(new Set(values).size!==values.length){
    fail('hsme_stage_campaign_value',path+' contains duplicates');
  }
  return values;
}

function sameStringSet(a:readonly string[],b:readonly string[]):boolean{
  if(a.length!==b.length)return false;
  const left=[...a].sort(lexical);
  const right=[...b].sort(lexical);
  return left.every((value,index)=>value===right[index]);
}

function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}

function exactRecord(
  raw:unknown,fields:readonly string[],path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_stage_campaign_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_stage_campaign_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_stage_campaign_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,values:T,path:string,
):T[number]{
  if(typeof raw!=='string'||!(values as readonly string[]).includes(raw)){
    fail('hsme_stage_campaign_value',path+' is unsupported');
  }
  return raw as T[number];
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_stage_campaign_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_stage_campaign_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_stage_campaign_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_stage_campaign_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_stage_campaign_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
}

function checkedMultiply(a:number,b:number):number{
  const value=a*b;
  if(!Number.isSafeInteger(value)||value<0){
    fail('hsme_stage_campaign_value','activation cap overflow');
  }
  return value;
}

async function digest(
  domain:string,value:unknown,hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(domain+JSON.stringify(value)),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_stage_campaign_hash',
      'hash port must return lowercase SHA-256',
    );
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
  throw new HsmeStageRoutingComparisonMatrixV1Error(code,message);
}
