import {
  HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA,
  hsmeSpatialSparsityExperimentPlanV1Digest,
  type HsmeSpatialSparsityExperimentPlanV1,
  type HsmeSpatialVariantV1,
} from './HsmeSpatialSparsityExperimentPlanV1.ts';
import {
  HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA,
  hsmeSpatialComputeMapRosterV1Digest,
  type HsmeSpatialComputeMapCandidateV1,
  type HsmeSpatialComputeMapRosterV1,
} from './HsmeSpatialComputeMapRosterV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_V1_SCHEMA =
  'BERS_HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_V1' as const;
export const HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_DIGEST_DOMAIN =
  'bers:hsme:spatial-execution-campaign-policy:v1\0' as const;
export const CORE_HSME_SPATIAL_EXECUTION_RESULT_V1_SCHEMA =
  'BERS_CORE_HSME_SPATIAL_EXECUTION_RESULT_V1' as const;
export const CORE_HSME_SPATIAL_EXECUTION_RESULT_DIGEST_DOMAIN =
  'bers:core:hsme:spatial-execution-result:v1\0' as const;
export const HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA =
  'BERS_HSME_SPATIAL_EXECUTION_MATRIX_V1' as const;
export const HSME_SPATIAL_EXECUTION_MATRIX_DIGEST_DOMAIN =
  'bers:hsme:spatial-execution-matrix:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeSpatialExecutionQualityValueV1=Readonly<{
  dimension:string;
  valueBps:number;
}>;

export type HsmeSpatialExecutionHardFailureV1=Readonly<{
  dimension:string;
  failureCount:number;
}>;

export type HsmeSpatialExecutionCampaignPolicyV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_V1_SCHEMA;
  experimentPlanSha256:string;
  computeMapRosterSha256:string;
  prototypeSha256:string;
  denseBaselineContentSha256:string;
  fixtureSetSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
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
  maxNetworkBytesDuringExecution:0;
  sameFixtureAcrossVariants:true;
  sameSeedsAcrossVariants:true;
  sameRuntimeAcrossVariants:true;
  reviewState:'SPATIAL_EXECUTION_CAMPAIGN_REVIEWED';
  selectionAllowed:false;
  spatialExecutionAllowed:false;
  spatialMapMutationAllowed:false;
  inferenceExecutionAllowed:false;
  fashionGeometryAuthorityGranted:false;
  projectMutationAllowed:false;
  artifactAuthorityGranted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type CoreHsmeSpatialExecutionMeasurementV1=Readonly<{
  variant:HsmeSpatialVariantV1;
  implementationSha256:string;
  mapReplayIdentitySha256:string;
  qualityVector:readonly HsmeSpatialExecutionQualityValueV1[];
  hardPreservationFailureCounts:
    readonly HsmeSpatialExecutionHardFailureV1[];
  criticalFailureCount:number;
  wallClockUs:number;
  fullComputeTokenWork:number;
  cheapPathTokenWork:number;
  prunedTokenWork:number;
  activeWeightsBytes:number;
  peakMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  networkBytesDuringExecution:0;
  realTargetDeviceMeasurement:true;
}>;

export type CoreHsmeSpatialExecutionResultV1=Readonly<{
  schemaVersion:typeof CORE_HSME_SPATIAL_EXECUTION_RESULT_V1_SCHEMA;
  state:'SPATIAL_EXECUTION_CAMPAIGN_COMPLETED'|'SPATIAL_EXECUTION_CAMPAIGN_FAILED';
  experimentPlanSha256:string;
  computeMapRosterSha256:string;
  campaignPolicySha256:string;
  executionAttemptId:string;
  fixtureSetSha256:string;
  evaluationContractSha256:string;
  deterministicSeedContractSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  caseCount:number;
  rows:readonly CoreHsmeSpatialExecutionMeasurementV1[];
  processStarted:boolean;
  realTargetDeviceMeasurement:boolean;
  failureEvidenceSha256:string|'NONE';
  selectionAllowed:false;
  spatialExecutionAllowed:false;
  spatialMapMutationAllowed:false;
  inferenceExecutionAllowed:false;
  fashionGeometryAuthorityGranted:false;
  projectMutationAllowed:false;
  artifactAuthorityGranted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
  hostResultSha256:string;
}>;

export type CoreHsmeSpatialExecutionRequestV1=Readonly<{
  experimentPlan:HsmeSpatialSparsityExperimentPlanV1;
  experimentPlanSha256:string;
  computeMapRoster:HsmeSpatialComputeMapRosterV1;
  computeMapRosterSha256:string;
  policy:HsmeSpatialExecutionCampaignPolicyV1;
  campaignPolicySha256:string;
}>;

export interface CoreHsmeSpatialExecutionPortV1{
  executeExactSpatialCampaign(
    request:CoreHsmeSpatialExecutionRequestV1,
  ):Promise<unknown>;
}

export interface HsmeSpatialExecutionPlanOriginVerifierV1{
  verifySpatialExperimentPlan(
    plan:HsmeSpatialSparsityExperimentPlanV1,
    expectedPlanSha256:string,
  ):Promise<boolean>;
}

export interface HsmeSpatialExecutionRosterOriginVerifierV1{
  verifySpatialComputeMapRoster(
    roster:HsmeSpatialComputeMapRosterV1,
    expectedRosterSha256:string,
  ):Promise<boolean>;
}

export interface HsmeSpatialExecutionCampaignPolicyOriginVerifierV1{
  verifySpatialExecutionCampaignPolicy(
    policy:HsmeSpatialExecutionCampaignPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export interface CoreHsmeSpatialExecutionResultOriginVerifierV1{
  verifySpatialExecutionResult(
    result:CoreHsmeSpatialExecutionResultV1,
    expectedHostResultSha256:string,
  ):Promise<boolean>;
}

export type HsmeSpatialExecutionMatrixV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA;
  state:
    |'SPATIAL_EXECUTION_MATRIX_INVALID'
    |'SPATIAL_EXECUTION_MATRIX_BLOCKED'
    |'SPATIAL_EXECUTION_MATRIX_FAILED'
    |'SPATIAL_EXECUTION_MATRIX_READY_NOT_DISPOSED';
  blockers:readonly string[];
  experimentPlanSha256:string|'UNKNOWN';
  computeMapRosterSha256:string|'UNKNOWN';
  campaignPolicySha256:string|'UNKNOWN';
  hostResultSha256:string|'UNKNOWN';
  executionAttemptId:string|'UNKNOWN';
  prototypeSha256:string|'UNKNOWN';
  denseBaselineContentSha256:string|'UNKNOWN';
  fixtureSetSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  evaluationContractSha256:string|'UNKNOWN';
  deterministicSeedContractSha256:string|'UNKNOWN';
  caseCount:number|'UNKNOWN';
  qualityDimensions:readonly string[];
  hardPreservationDimensions:readonly string[];
  rows:readonly CoreHsmeSpatialExecutionMeasurementV1[];
  matrixEvidenceSha256:string|'UNKNOWN';
  selectionAllowed:false;
  spatialExecutionAllowed:false;
  spatialMapMutationAllowed:false;
  inferenceExecutionAllowed:false;
  fashionGeometryAuthorityGranted:false;
  projectMutationAllowed:false;
  artifactAuthorityGranted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeSpatialExecutionMatrixV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSpatialExecutionMatrixV1Error';
    this.code=code;
  }
}

export function normalizeHsmeSpatialExecutionCampaignPolicyV1(
  raw:unknown,
):HsmeSpatialExecutionCampaignPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','experimentPlanSha256','computeMapRosterSha256',
    'prototypeSha256','denseBaselineContentSha256','fixtureSetSha256',
    'runtimeRepresentationSha256','hardwareClass',
    'evaluationContractSha256','deterministicSeedContractSha256',
    'caseCount','qualityDimensions','hardPreservationDimensions',
    'maxWallClockUs','maxPeakMemoryBytes','maxFlashBytesMoved',
    'maxRamBytesMoved','maxAcceleratorBytesMoved',
    'maxNetworkBytesDuringExecution','sameFixtureAcrossVariants',
    'sameSeedsAcrossVariants','sameRuntimeAcrossVariants','reviewState',
    'selectionAllowed','spatialExecutionAllowed','spatialMapMutationAllowed',
    'inferenceExecutionAllowed','fashionGeometryAuthorityGranted',
    'projectMutationAllowed','artifactAuthorityGranted',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_V1_SCHEMA){
    fail(
      'hsme_spatial_execution_policy_schema',
      'spatial execution campaign policy schema unsupported',
    );
  }
  if(r.reviewState!=='SPATIAL_EXECUTION_CAMPAIGN_REVIEWED'){
    fail(
      'hsme_spatial_execution_policy_review',
      'spatial execution campaign policy review state invalid',
    );
  }
  if(
    r.maxNetworkBytesDuringExecution!==0
    ||r.sameFixtureAcrossVariants!==true
    ||r.sameSeedsAcrossVariants!==true
    ||r.sameRuntimeAcrossVariants!==true
  ){
    fail(
      'hsme_spatial_execution_policy_boundary',
      'campaign comparison boundary invalid',
    );
  }
  assertNoAuthority(r,'policy');
  const qualityDimensions=identifierSet(
    r.qualityDimensions,'policy.qualityDimensions',1,32,100,
  );
  const hardPreservationDimensions=identifierSet(
    r.hardPreservationDimensions,
    'policy.hardPreservationDimensions',
    1,
    32,
    100,
  );
  if(
    hardPreservationDimensions.some(
      dimension=>!qualityDimensions.includes(dimension),
    )
  ){
    fail(
      'hsme_spatial_execution_policy_dimensions',
      'hard preservation dimensions must be quality dimensions',
    );
  }
  return deepFreeze({
    schemaVersion:HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_V1_SCHEMA,
    experimentPlanSha256:sha256(
      r.experimentPlanSha256,'policy.experimentPlanSha256',
    ),
    computeMapRosterSha256:sha256(
      r.computeMapRosterSha256,'policy.computeMapRosterSha256',
    ),
    prototypeSha256:sha256(
      r.prototypeSha256,'policy.prototypeSha256',
    ),
    denseBaselineContentSha256:sha256(
      r.denseBaselineContentSha256,
      'policy.denseBaselineContentSha256',
    ),
    fixtureSetSha256:sha256(
      r.fixtureSetSha256,'policy.fixtureSetSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'policy.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'policy.hardwareClass',160),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,
      'policy.evaluationContractSha256',
    ),
    deterministicSeedContractSha256:sha256(
      r.deterministicSeedContractSha256,
      'policy.deterministicSeedContractSha256',
    ),
    caseCount:safeInteger(
      r.caseCount,'policy.caseCount',1,1_000_000,
    ),
    qualityDimensions:Object.freeze(qualityDimensions),
    hardPreservationDimensions:Object.freeze(hardPreservationDimensions),
    maxWallClockUs:safeInteger(
      r.maxWallClockUs,'policy.maxWallClockUs',1,Number.MAX_SAFE_INTEGER,
    ),
    maxPeakMemoryBytes:safeInteger(
      r.maxPeakMemoryBytes,
      'policy.maxPeakMemoryBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxFlashBytesMoved:safeInteger(
      r.maxFlashBytesMoved,
      'policy.maxFlashBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxRamBytesMoved:safeInteger(
      r.maxRamBytesMoved,
      'policy.maxRamBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxAcceleratorBytesMoved:safeInteger(
      r.maxAcceleratorBytesMoved,
      'policy.maxAcceleratorBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    maxNetworkBytesDuringExecution:0,
    sameFixtureAcrossVariants:true,
    sameSeedsAcrossVariants:true,
    sameRuntimeAcrossVariants:true,
    reviewState:'SPATIAL_EXECUTION_CAMPAIGN_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeSpatialExecutionCampaignPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPATIAL_EXECUTION_CAMPAIGN_POLICY_DIGEST_DOMAIN,
    normalizeHsmeSpatialExecutionCampaignPolicyV1(raw),
    hash,
  );
}

export function normalizeCoreHsmeSpatialExecutionResultV1(
  raw:unknown,
):CoreHsmeSpatialExecutionResultV1{
  const r=exactRecord(raw,[
    'schemaVersion','state','experimentPlanSha256',
    'computeMapRosterSha256','campaignPolicySha256',
    'executionAttemptId','fixtureSetSha256','evaluationContractSha256',
    'deterministicSeedContractSha256','runtimeRepresentationSha256',
    'hardwareClass','caseCount','rows','processStarted',
    'realTargetDeviceMeasurement','failureEvidenceSha256',
    'selectionAllowed','spatialExecutionAllowed','spatialMapMutationAllowed',
    'inferenceExecutionAllowed','fashionGeometryAuthorityGranted',
    'projectMutationAllowed','artifactAuthorityGranted',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
    'hostResultSha256',
  ],'result');
  if(r.schemaVersion!==CORE_HSME_SPATIAL_EXECUTION_RESULT_V1_SCHEMA){
    fail(
      'hsme_spatial_execution_result_schema',
      'host result schema unsupported',
    );
  }
  const state=enumValue(
    r.state,
    [
      'SPATIAL_EXECUTION_CAMPAIGN_COMPLETED',
      'SPATIAL_EXECUTION_CAMPAIGN_FAILED',
    ] as const,
    'result.state',
  );
  assertNoAuthority(r,'result');
  if(
    typeof r.processStarted!=='boolean'
    ||typeof r.realTargetDeviceMeasurement!=='boolean'
    ||!Array.isArray(r.rows)
  ){
    fail(
      'hsme_spatial_execution_result_shape',
      'host execution flags/rows invalid',
    );
  }
  const rows=r.rows.map((value,index)=>
    normalizeMeasurement(value,'result.rows['+index+']')
  );
  const failureEvidenceSha256=r.failureEvidenceSha256==='NONE'
    ?'NONE' as const
    :sha256(
      r.failureEvidenceSha256,
      'result.failureEvidenceSha256',
    );
  if(
    (
      state==='SPATIAL_EXECUTION_CAMPAIGN_COMPLETED'
      &&(
        r.processStarted!==true
        ||r.realTargetDeviceMeasurement!==true
        ||rows.length<2
        ||rows.length>3
        ||failureEvidenceSha256!=='NONE'
      )
    )
    ||(
      state==='SPATIAL_EXECUTION_CAMPAIGN_FAILED'
      &&(
        rows.length!==0
        ||r.realTargetDeviceMeasurement!==false
        ||failureEvidenceSha256==='NONE'
      )
    )
  ){
    fail(
      'hsme_spatial_execution_result_state',
      'host result state shape invalid',
    );
  }
  return deepFreeze({
    schemaVersion:CORE_HSME_SPATIAL_EXECUTION_RESULT_V1_SCHEMA,
    state,
    experimentPlanSha256:sha256(
      r.experimentPlanSha256,'result.experimentPlanSha256',
    ),
    computeMapRosterSha256:sha256(
      r.computeMapRosterSha256,'result.computeMapRosterSha256',
    ),
    campaignPolicySha256:sha256(
      r.campaignPolicySha256,'result.campaignPolicySha256',
    ),
    executionAttemptId:identifier(
      r.executionAttemptId,'result.executionAttemptId',160,
    ),
    fixtureSetSha256:sha256(
      r.fixtureSetSha256,'result.fixtureSetSha256',
    ),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,
      'result.evaluationContractSha256',
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
    caseCount:safeInteger(
      r.caseCount,'result.caseCount',1,1_000_000,
    ),
    rows:Object.freeze(rows),
    processStarted:r.processStarted,
    realTargetDeviceMeasurement:r.realTargetDeviceMeasurement,
    failureEvidenceSha256,
    ...authorityBoundary(),
    hostResultSha256:sha256(
      r.hostResultSha256,'result.hostResultSha256',
    ),
  });
}

export async function coreHsmeSpatialExecutionResultV1Digest(
  raw:CoreHsmeSpatialExecutionResultV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=normalizeCoreHsmeSpatialExecutionResultV1(raw);
  const {hostResultSha256:_ignored,...payload}=result;
  return digest(
    CORE_HSME_SPATIAL_EXECUTION_RESULT_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

export async function collectHsmeSpatialExecutionMatrixV1(
  plan:HsmeSpatialSparsityExperimentPlanV1,
  expectedPlanSha256:string,
  planOrigin:HsmeSpatialExecutionPlanOriginVerifierV1,
  roster:HsmeSpatialComputeMapRosterV1,
  expectedRosterSha256:string,
  rosterOrigin:HsmeSpatialExecutionRosterOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeSpatialExecutionCampaignPolicyOriginVerifierV1,
  host:CoreHsmeSpatialExecutionPortV1,
  resultOrigin:CoreHsmeSpatialExecutionResultOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSpatialExecutionMatrixV1>{
  if(!readyPlan(plan)){
    return blocked(['SPATIAL_EXECUTION_FROZEN_PLAN_REQUIRED']);
  }
  if(!readyRoster(roster)){
    return blocked(['SPATIAL_EXECUTION_FROZEN_MAP_ROSTER_REQUIRED']);
  }

  let planSha:string;
  let rosterSha:string;
  try{
    planSha=await hsmeSpatialSparsityExperimentPlanV1Digest(plan,hash);
    rosterSha=await hsmeSpatialComputeMapRosterV1Digest(roster,hash);
  }catch{
    return invalid(['SPATIAL_EXECUTION_INPUT_REHASH_INVALID']);
  }

  const common={
    experimentPlanSha256:planSha,
    computeMapRosterSha256:rosterSha,
  };
  if(
    !exactDigest(
      expectedPlanSha256,
      planSha,
      plan.planEvidenceSha256 as string,
    )
    ||!exactDigest(
      expectedRosterSha256,
      rosterSha,
      roster.rosterEvidenceSha256 as string,
    )
  ){
    return invalid(['SPATIAL_EXECUTION_INPUT_REHASH_MISMATCH'],common);
  }
  if(!await verify(
    ()=>planOrigin.verifySpatialExperimentPlan(plan,planSha),
  )){
    return invalid(['SPATIAL_EXECUTION_PLAN_ORIGIN_UNVERIFIED'],common);
  }
  if(!await verify(
    ()=>rosterOrigin.verifySpatialComputeMapRoster(roster,rosterSha),
  )){
    return invalid(['SPATIAL_EXECUTION_ROSTER_ORIGIN_UNVERIFIED'],common);
  }
  if(
    roster.experimentPlanSha256!==planSha
    ||roster.prototypeSha256!==plan.prototypeSha256
    ||roster.runtimeRepresentationSha256!==plan.runtimeRepresentationSha256
    ||roster.hardwareClass!==plan.hardwareClass
    ||roster.fixtureSetSha256!==plan.fixtureSetSha256
    ||roster.gridWidth!==plan.gridWidth
    ||roster.gridHeight!==plan.gridHeight
    ||roster.candidates.length!==plan.variants.length
  ){
    return invalid(['SPATIAL_EXECUTION_ROSTER_BINDING_MISMATCH'],common);
  }

  let policy:HsmeSpatialExecutionCampaignPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeSpatialExecutionCampaignPolicyV1(rawPolicy);
    policySha=await hsmeSpatialExecutionCampaignPolicyV1Digest(
      policy,
      hash,
    );
  }catch{
    return invalid(['SPATIAL_EXECUTION_CAMPAIGN_POLICY_INVALID'],common);
  }
  const bound={...common,campaignPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(
      ['SPATIAL_EXECUTION_CAMPAIGN_POLICY_DIGEST_MISMATCH'],
      bound,
    );
  }
  if(!await verify(
    ()=>policyOrigin.verifySpatialExecutionCampaignPolicy(
      policy,
      policySha,
    ),
  )){
    return invalid(
      ['SPATIAL_EXECUTION_CAMPAIGN_POLICY_ORIGIN_UNVERIFIED'],
      bound,
    );
  }
  if(!policyBindsInputs(policy,plan,planSha,rosterSha)){
    return invalid(
      ['SPATIAL_EXECUTION_CAMPAIGN_POLICY_BINDING_MISMATCH'],
      bound,
    );
  }

  let rawResult:unknown;
  try{
    rawResult=await host.executeExactSpatialCampaign(deepFreeze({
      experimentPlan:plan,
      experimentPlanSha256:planSha,
      computeMapRoster:roster,
      computeMapRosterSha256:rosterSha,
      policy,
      campaignPolicySha256:policySha,
    }));
  }catch{
    return failed(
      ['SPATIAL_EXECUTION_HOST_EXECUTION_FAILED'],
      resolvedValues(plan,planSha,rosterSha,policy,policySha),
    );
  }

  let result:CoreHsmeSpatialExecutionResultV1;
  let hostResultSha256:string;
  try{
    result=normalizeCoreHsmeSpatialExecutionResultV1(rawResult);
    hostResultSha256=await coreHsmeSpatialExecutionResultV1Digest(
      result,
      hash,
    );
  }catch{
    return invalid(
      ['SPATIAL_EXECUTION_HOST_RESULT_INVALID'],
      resolvedValues(plan,planSha,rosterSha,policy,policySha),
    );
  }

  const values={
    ...resolvedValues(plan,planSha,rosterSha,policy,policySha),
    hostResultSha256,
    executionAttemptId:result.executionAttemptId,
  };
  if(hostResultSha256!==result.hostResultSha256){
    return invalid(
      ['SPATIAL_EXECUTION_HOST_RESULT_REHASH_MISMATCH'],
      values,
    );
  }
  if(!await verify(
    ()=>resultOrigin.verifySpatialExecutionResult(
      result,
      hostResultSha256,
    ),
  )){
    return invalid(
      ['SPATIAL_EXECUTION_HOST_RESULT_ORIGIN_UNVERIFIED'],
      values,
    );
  }
  if(
    result.experimentPlanSha256!==planSha
    ||result.computeMapRosterSha256!==rosterSha
    ||result.campaignPolicySha256!==policySha
    ||result.fixtureSetSha256!==policy.fixtureSetSha256
    ||result.evaluationContractSha256!==policy.evaluationContractSha256
    ||result.deterministicSeedContractSha256!==
      policy.deterministicSeedContractSha256
    ||result.runtimeRepresentationSha256!==
      policy.runtimeRepresentationSha256
    ||result.hardwareClass!==policy.hardwareClass
    ||result.caseCount!==policy.caseCount
  ){
    return invalid(
      ['SPATIAL_EXECUTION_HOST_RESULT_BINDING_MISMATCH'],
      values,
    );
  }
  if(result.state==='SPATIAL_EXECUTION_CAMPAIGN_FAILED'){
    return failed(
      ['SPATIAL_EXECUTION_PROTECTED_CAMPAIGN_FAILED'],
      values,
    );
  }

  const rows=[...result.rows].sort(
    (a,b)=>variantIndex(a.variant,plan)-variantIndex(b.variant,plan),
  );
  if(
    rows.length!==plan.variants.length
    ||rows.some(
      (row,index)=>row.variant!==plan.variants[index],
    )
  ){
    return invalid(
      ['SPATIAL_EXECUTION_VARIANT_SET_INVALID'],
      values,
    );
  }

  for(const row of rows){
    const candidate=roster.candidates.find(
      value=>value.variant===row.variant,
    );
    if(candidate===undefined){
      return invalid(
        ['SPATIAL_EXECUTION_MAP_CANDIDATE_MISSING'],
        values,
      );
    }
    const reason=validateMeasurement(
      row,
      candidate,
      plan,
      policy,
    );
    if(reason!==null){
      return invalid([reason],values);
    }
  }

  const payload={
    schemaVersion:HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA,
    state:'SPATIAL_EXECUTION_MATRIX_READY_NOT_DISPOSED' as const,
    blockers:Object.freeze([] as string[]),
    experimentPlanSha256:planSha,
    computeMapRosterSha256:rosterSha,
    campaignPolicySha256:policySha,
    hostResultSha256,
    executionAttemptId:result.executionAttemptId,
    prototypeSha256:plan.prototypeSha256 as string,
    denseBaselineContentSha256:
      plan.denseBaselineContentSha256 as string,
    fixtureSetSha256:plan.fixtureSetSha256 as string,
    runtimeRepresentationSha256:
      plan.runtimeRepresentationSha256 as string,
    hardwareClass:plan.hardwareClass as string,
    evaluationContractSha256:policy.evaluationContractSha256,
    deterministicSeedContractSha256:
      policy.deterministicSeedContractSha256,
    caseCount:policy.caseCount,
    qualityDimensions:policy.qualityDimensions,
    hardPreservationDimensions:policy.hardPreservationDimensions,
    rows:Object.freeze(rows),
    ...authorityBoundary(),
  };
  const matrixEvidenceSha256=await digest(
    HSME_SPATIAL_EXECUTION_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,matrixEvidenceSha256});
}

export async function hsmeSpatialExecutionMatrixV1Digest(
  value:HsmeSpatialExecutionMatrixV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='SPATIAL_EXECUTION_MATRIX_READY_NOT_DISPOSED'
    ||value.matrixEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_spatial_execution_matrix_digest_state',
      'only READY_NOT_DISPOSED matrix is digestible',
    );
  }
  const {matrixEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_SPATIAL_EXECUTION_MATRIX_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeMeasurement(
  raw:unknown,
  path:string,
):CoreHsmeSpatialExecutionMeasurementV1{
  const r=exactRecord(raw,[
    'variant','implementationSha256','mapReplayIdentitySha256',
    'qualityVector','hardPreservationFailureCounts','criticalFailureCount',
    'wallClockUs','fullComputeTokenWork','cheapPathTokenWork',
    'prunedTokenWork','activeWeightsBytes','peakMemoryBytes',
    'flashBytesMoved','ramBytesMoved','acceleratorBytesMoved',
    'networkBytesDuringExecution','realTargetDeviceMeasurement',
  ],path);
  if(
    r.networkBytesDuringExecution!==0
    ||r.realTargetDeviceMeasurement!==true
  ){
    fail(
      'hsme_spatial_execution_measurement_boundary',
      path+' network/real-device boundary invalid',
    );
  }
  if(
    !Array.isArray(r.qualityVector)
    ||!Array.isArray(r.hardPreservationFailureCounts)
  ){
    fail(
      'hsme_spatial_execution_measurement_vectors',
      path+' quality/hard-preservation vectors must be arrays',
    );
  }
  const qualityVector=r.qualityVector.map((value,index)=>
    normalizeQualityValue(
      value,
      path+'.qualityVector['+index+']',
    )
  ).sort((a,b)=>lexical(a.dimension,b.dimension));
  const hardPreservationFailureCounts=
    r.hardPreservationFailureCounts.map((value,index)=>
      normalizeHardFailure(
        value,
        path+'.hardPreservationFailureCounts['+index+']',
      )
    ).sort((a,b)=>lexical(a.dimension,b.dimension));
  if(
    new Set(qualityVector.map(value=>value.dimension)).size!==
      qualityVector.length
    ||new Set(
      hardPreservationFailureCounts.map(value=>value.dimension),
    ).size!==hardPreservationFailureCounts.length
  ){
    fail(
      'hsme_spatial_execution_measurement_dimensions',
      path+' contains duplicate quality/hard-preservation dimensions',
    );
  }
  return deepFreeze({
    variant:enumValue(
      r.variant,
      [
        'FULL_SPATIAL_CONTROL',
        'PROTECTED_REGION_CHEAP_BACKGROUND',
        'BOUNDED_BACKGROUND_PRUNING',
      ] as const,
      path+'.variant',
    ),
    implementationSha256:sha256(
      r.implementationSha256,
      path+'.implementationSha256',
    ),
    mapReplayIdentitySha256:sha256(
      r.mapReplayIdentitySha256,
      path+'.mapReplayIdentitySha256',
    ),
    qualityVector:Object.freeze(qualityVector),
    hardPreservationFailureCounts:
      Object.freeze(hardPreservationFailureCounts),
    criticalFailureCount:safeInteger(
      r.criticalFailureCount,
      path+'.criticalFailureCount',
      0,
      1_000_000,
    ),
    wallClockUs:safeInteger(
      r.wallClockUs,
      path+'.wallClockUs',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    fullComputeTokenWork:safeInteger(
      r.fullComputeTokenWork,
      path+'.fullComputeTokenWork',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    cheapPathTokenWork:safeInteger(
      r.cheapPathTokenWork,
      path+'.cheapPathTokenWork',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    prunedTokenWork:safeInteger(
      r.prunedTokenWork,
      path+'.prunedTokenWork',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    activeWeightsBytes:safeInteger(
      r.activeWeightsBytes,
      path+'.activeWeightsBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    peakMemoryBytes:safeInteger(
      r.peakMemoryBytes,
      path+'.peakMemoryBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    flashBytesMoved:safeInteger(
      r.flashBytesMoved,
      path+'.flashBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    ramBytesMoved:safeInteger(
      r.ramBytesMoved,
      path+'.ramBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    acceleratorBytesMoved:safeInteger(
      r.acceleratorBytesMoved,
      path+'.acceleratorBytesMoved',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    networkBytesDuringExecution:0,
    realTargetDeviceMeasurement:true,
  });
}

function normalizeQualityValue(
  raw:unknown,
  path:string,
):HsmeSpatialExecutionQualityValueV1{
  const r=exactRecord(raw,['dimension','valueBps'],path);
  return deepFreeze({
    dimension:identifier(r.dimension,path+'.dimension',100),
    valueBps:safeInteger(
      r.valueBps,path+'.valueBps',0,10_000,
    ),
  });
}

function normalizeHardFailure(
  raw:unknown,
  path:string,
):HsmeSpatialExecutionHardFailureV1{
  const r=exactRecord(raw,['dimension','failureCount'],path);
  return deepFreeze({
    dimension:identifier(r.dimension,path+'.dimension',100),
    failureCount:safeInteger(
      r.failureCount,path+'.failureCount',0,1_000_000,
    ),
  });
}

function validateMeasurement(
  row:CoreHsmeSpatialExecutionMeasurementV1,
  candidate:HsmeSpatialComputeMapCandidateV1,
  plan:HsmeSpatialSparsityExperimentPlanV1,
  policy:HsmeSpatialExecutionCampaignPolicyV1,
):string|null{
  if(
    row.implementationSha256!==candidate.spatialMapSha256
    ||row.mapReplayIdentitySha256!==
      candidate.deterministicReplayIdentitySha256
  ){
    return 'SPATIAL_EXECUTION_MAP_REPLAY_BINDING_MISMATCH';
  }
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
    return 'SPATIAL_EXECUTION_QUALITY_DIMENSION_MISMATCH';
  }
  if(
    row.criticalFailureCount>policy.caseCount
    ||row.hardPreservationFailureCounts.some(
      value=>value.failureCount>policy.caseCount,
    )
  ){
    return 'SPATIAL_EXECUTION_FAILURE_COUNT_EXCEEDED';
  }
  if(
    row.wallClockUs>policy.maxWallClockUs
    ||row.peakMemoryBytes>policy.maxPeakMemoryBytes
    ||row.flashBytesMoved>policy.maxFlashBytesMoved
    ||row.ramBytesMoved>policy.maxRamBytesMoved
    ||row.acceleratorBytesMoved>policy.maxAcceleratorBytesMoved
  ){
    return 'SPATIAL_EXECUTION_RESOURCE_CEILING_EXCEEDED';
  }
  if(
    row.fullComputeTokenWork!==candidate.fullComputeTokenWork
    ||row.cheapPathTokenWork!==candidate.cheapPathTokenWork
    ||row.prunedTokenWork!==candidate.prunedTokenWork
  ){
    return 'SPATIAL_EXECUTION_TOKEN_WORK_BINDING_MISMATCH';
  }
  if(row.variant==='FULL_SPATIAL_CONTROL'){
    if(
      row.cheapPathTokenWork!==0
      ||row.prunedTokenWork!==0
      ||candidate.cheapPathAreaBps!==0
      ||candidate.prunedAreaBps!==0
    ){
      return 'SPATIAL_EXECUTION_FULL_CONTROL_SHAPE_INVALID';
    }
  }
  if(
    row.variant==='PROTECTED_REGION_CHEAP_BACKGROUND'
    &&(
      row.cheapPathTokenWork<=0
      ||row.prunedTokenWork!==0
    )
  ){
    return 'SPATIAL_EXECUTION_CHEAP_BACKGROUND_SHAPE_INVALID';
  }
  if(
    row.variant==='BOUNDED_BACKGROUND_PRUNING'
    &&row.prunedTokenWork<=0
  ){
    return 'SPATIAL_EXECUTION_PRUNING_SHAPE_INVALID';
  }
  if(
    !plan.variants.includes(row.variant)
  ){
    return 'SPATIAL_EXECUTION_VARIANT_NOT_FROZEN';
  }
  return null;
}

function policyBindsInputs(
  policy:HsmeSpatialExecutionCampaignPolicyV1,
  plan:HsmeSpatialSparsityExperimentPlanV1,
  planSha:string,
  rosterSha:string,
):boolean{
  return policy.experimentPlanSha256===planSha
    &&policy.computeMapRosterSha256===rosterSha
    &&policy.prototypeSha256===plan.prototypeSha256
    &&policy.denseBaselineContentSha256===
      plan.denseBaselineContentSha256
    &&policy.fixtureSetSha256===plan.fixtureSetSha256
    &&policy.runtimeRepresentationSha256===
      plan.runtimeRepresentationSha256
    &&policy.hardwareClass===plan.hardwareClass
    &&policy.caseCount===plan.caseCount
    &&sameStringSet(
      policy.qualityDimensions,
      plan.qualityDimensions,
    )
    &&sameStringSet(
      policy.hardPreservationDimensions,
      plan.hardPreservationDimensions,
    );
}

function readyPlan(
  value:HsmeSpatialSparsityExperimentPlanV1,
):boolean{
  return value.schemaVersion===
      HSME_SPATIAL_SPARSITY_EXPERIMENT_PLAN_V1_SCHEMA
    &&value.state==='SPATIAL_SPARSITY_PLAN_FROZEN_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.planEvidenceSha256!=='UNKNOWN'
    &&value.prototypeSha256!=='UNKNOWN'
    &&value.denseBaselineContentSha256!=='UNKNOWN'
    &&value.fixtureSetSha256!=='UNKNOWN'
    &&value.runtimeRepresentationSha256!=='UNKNOWN'
    &&value.hardwareClass!=='UNKNOWN'
    &&typeof value.caseCount==='number'
    &&value.variants.length>=2
    &&value.spatialExecutionAllowed===false
    &&value.spatialMapMutationAllowed===false
    &&value.inferenceExecutionAllowed===false
    &&value.fashionGeometryAuthorityGranted===false
    &&value.artifactAuthorityGranted===false;
}

function readyRoster(
  value:HsmeSpatialComputeMapRosterV1,
):boolean{
  return value.schemaVersion===HSME_SPATIAL_COMPUTE_MAP_ROSTER_V1_SCHEMA
    &&value.state==='SPATIAL_COMPUTE_MAP_ROSTER_FROZEN_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.rosterEvidenceSha256!=='UNKNOWN'
    &&value.experimentPlanSha256!=='UNKNOWN'
    &&value.prototypeSha256!=='UNKNOWN'
    &&value.fixtureSetSha256!=='UNKNOWN'
    &&value.runtimeRepresentationSha256!=='UNKNOWN'
    &&value.hardwareClass!=='UNKNOWN'
    &&value.candidates.length>=2
    &&value.spatialExecutionAllowed===false
    &&value.spatialMapMutationAllowed===false
    &&value.inferenceExecutionAllowed===false
    &&value.fashionGeometryAuthorityGranted===false
    &&value.artifactAuthorityGranted===false;
}

type OutputKeys=
  |'experimentPlanSha256'
  |'computeMapRosterSha256'
  |'campaignPolicySha256'
  |'hostResultSha256'
  |'executionAttemptId'
  |'prototypeSha256'
  |'denseBaselineContentSha256'
  |'fixtureSetSha256'
  |'runtimeRepresentationSha256'
  |'hardwareClass'
  |'evaluationContractSha256'
  |'deterministicSeedContractSha256'
  |'caseCount'
  |'qualityDimensions'
  |'hardPreservationDimensions';

type PartialOutput=Partial<Pick<
  HsmeSpatialExecutionMatrixV1,
  OutputKeys
>>;

function resolvedValues(
  plan:HsmeSpatialSparsityExperimentPlanV1,
  planSha:string,
  rosterSha:string,
  policy:HsmeSpatialExecutionCampaignPolicyV1,
  policySha:string,
):PartialOutput{
  return {
    experimentPlanSha256:planSha,
    computeMapRosterSha256:rosterSha,
    campaignPolicySha256:policySha,
    prototypeSha256:plan.prototypeSha256,
    denseBaselineContentSha256:plan.denseBaselineContentSha256,
    fixtureSetSha256:plan.fixtureSetSha256,
    runtimeRepresentationSha256:plan.runtimeRepresentationSha256,
    hardwareClass:plan.hardwareClass,
    evaluationContractSha256:policy.evaluationContractSha256,
    deterministicSeedContractSha256:
      policy.deterministicSeedContractSha256,
    caseCount:policy.caseCount,
    qualityDimensions:policy.qualityDimensions,
    hardPreservationDimensions:policy.hardPreservationDimensions,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSpatialExecutionMatrixV1{
  return terminal('SPATIAL_EXECUTION_MATRIX_BLOCKED',blockers,values);
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSpatialExecutionMatrixV1{
  return terminal('SPATIAL_EXECUTION_MATRIX_INVALID',blockers,values);
}

function failed(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSpatialExecutionMatrixV1{
  return terminal('SPATIAL_EXECUTION_MATRIX_FAILED',blockers,values);
}

function terminal(
  state:
    |'SPATIAL_EXECUTION_MATRIX_INVALID'
    |'SPATIAL_EXECUTION_MATRIX_BLOCKED'
    |'SPATIAL_EXECUTION_MATRIX_FAILED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeSpatialExecutionMatrixV1{
  return deepFreeze({
    schemaVersion:HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    computeMapRosterSha256:
      values.computeMapRosterSha256??'UNKNOWN',
    campaignPolicySha256:values.campaignPolicySha256??'UNKNOWN',
    hostResultSha256:values.hostResultSha256??'UNKNOWN',
    executionAttemptId:values.executionAttemptId??'UNKNOWN',
    prototypeSha256:values.prototypeSha256??'UNKNOWN',
    denseBaselineContentSha256:
      values.denseBaselineContentSha256??'UNKNOWN',
    fixtureSetSha256:values.fixtureSetSha256??'UNKNOWN',
    runtimeRepresentationSha256:
      values.runtimeRepresentationSha256??'UNKNOWN',
    hardwareClass:values.hardwareClass??'UNKNOWN',
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
    spatialExecutionAllowed:false as const,
    spatialMapMutationAllowed:false as const,
    inferenceExecutionAllowed:false as const,
    fashionGeometryAuthorityGranted:false as const,
    projectMutationAllowed:false as const,
    artifactAuthorityGranted:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function assertNoAuthority(
  record:Record<string,unknown>,
  path:string,
):void{
  for(const field of Object.keys(authorityBoundary())){
    if(record[field]!==false){
      fail(
        'hsme_spatial_execution_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function variantIndex(
  variant:HsmeSpatialVariantV1,
  plan:HsmeSpatialSparsityExperimentPlanV1,
):number{
  return plan.variants.indexOf(variant);
}

function sameStringSet(
  left:readonly string[],
  right:readonly string[],
):boolean{
  if(left.length!==right.length)return false;
  const a=[...left].sort(lexical);
  const b=[...right].sort(lexical);
  return a.every((value,index)=>value===b[index]);
}

function identifierSet(
  raw:unknown,
  path:string,
  min:number,
  max:number,
  maxLength:number,
):string[]{
  if(!Array.isArray(raw)||raw.length<min||raw.length>max){
    fail(
      'hsme_spatial_execution_value',
      path+' cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>
    identifier(value,path+'['+index+']',maxLength)
  ).sort(lexical);
  if(new Set(values).size!==values.length){
    fail(
      'hsme_spatial_execution_value',
      path+' contains duplicates',
    );
  }
  return values;
}

function exactDigest(
  expected:string,
  actual:string,
  embedded:string,
):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail(
      'hsme_spatial_execution_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_spatial_execution_schema',
      path+' must be a plain object',
    );
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_spatial_execution_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function enumValue<T extends readonly string[]>(
  raw:unknown,
  values:T,
  path:string,
):T[number]{
  if(
    typeof raw!=='string'
    ||!(values as readonly string[]).includes(raw)
  ){
    fail(
      'hsme_spatial_execution_value',
      path+' is unsupported',
    );
  }
  return raw as T[number];
}

function identifier(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail(
      'hsme_spatial_execution_value',
      path+' must be an identifier',
    );
  }
  return value;
}

function sha256(
  raw:unknown,
  path:string,
):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_spatial_execution_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(
  raw:unknown,
  path:string,
  max:number,
):string{
  if(typeof raw!=='string'){
    fail(
      'hsme_spatial_execution_value',
      path+' must be a string',
    );
  }
  const value=raw.trim();
  if(
    value.length<1
    ||value.length>max
    ||/[\u0000-\u001f\u007f]/.test(value)
  ){
    fail(
      'hsme_spatial_execution_value',
      path+' is invalid',
    );
  }
  return value;
}

function safeInteger(
  raw:unknown,
  path:string,
  min:number,
  max:number,
):number{
  if(
    !Number.isSafeInteger(raw)
    ||(raw as number)<min
    ||(raw as number)>max
  ){
    fail(
      'hsme_spatial_execution_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
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
    fail(
      'hsme_spatial_execution_hash',
      'hash port must return lowercase SHA-256',
    );
  }
  return result;
}

async function verify(
  run:()=>Promise<boolean>,
):Promise<boolean>{
  try{
    return await run()===true;
  }catch{
    return false;
  }
}

function lexical(a:string,b:string):number{
  return a<b?-1:a>b?1:0;
}

function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(
      value as Record<string,unknown>,
    )){
      deepFreeze(child);
    }
  }
  return value;
}

function fail(
  code:string,
  message:string,
):never{
  throw new HsmeSpatialExecutionMatrixV1Error(code,message);
}
