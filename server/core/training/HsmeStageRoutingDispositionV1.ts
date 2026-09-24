import {
  HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA,
  hsmeStageRoutingComparisonMatrixV1Digest,
  type CoreHsmeStageRoutingCampaignMeasurementV1,
  type HsmeStageRoutingComparisonMatrixV1,
} from './HsmeStageRoutingComparisonMatrixV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_STAGE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_DISPOSITION_POLICY_V1' as const;
export const HSME_STAGE_ROUTING_DISPOSITION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-disposition-policy:v1\0' as const;
export const HSME_STAGE_ROUTING_DISPOSITION_V1_SCHEMA =
  'BERS_HSME_STAGE_ROUTING_DISPOSITION_V1' as const;
export const HSME_STAGE_ROUTING_DISPOSITION_DIGEST_DOMAIN =
  'bers:hsme:stage-routing-disposition:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;

export type HsmeStageRoutingQualityFloorV1=Readonly<{
  dimension:string;
  minimumBps:number;
}>;

export type HsmeStageRoutingQualityRegressionV1=Readonly<{
  dimension:string;
  maxRegressionBps:number;
}>;

export type HsmeStageRoutingPreservationCeilingV1=Readonly<{
  dimension:string;
  maxFailureCount:number;
}>;

export type HsmeStageRoutingDispositionPolicyV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA;
  routingMatrixSha256:string;
  routeTableEvidenceSha256:string;
  scheduleEvidenceSha256:string;
  fixtureSetSha256:string;
  evaluationContractSha256:string;
  deterministicSeedContractSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  qualityFloors:readonly HsmeStageRoutingQualityFloorV1[];
  maxQualityRegressionVsStatic:
    readonly HsmeStageRoutingQualityRegressionV1[];
  maxHardPreservationFailures:
    readonly HsmeStageRoutingPreservationCeilingV1[];
  maxCriticalFailureCount:number;
  minWallClockImprovementBps:number;
  minTotalBytesMovedImprovementBps:number;
  maxPeakMemoryRegressionBps:number;
  maxActiveWeightsRegressionBps:number;
  maxTransitionStallUs:number;
  reviewState:'QUALITY_FIRST_STAGE_ROUTING_POLICY_REVIEWED';
  routeSelectionAllowed:false;
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

export interface HsmeStageRoutingDispositionMatrixOriginVerifierV1{
  verifyRoutingMatrix(
    matrix:HsmeStageRoutingComparisonMatrixV1,
    expectedMatrixSha256:string,
  ):Promise<boolean>;
}

export interface HsmeStageRoutingDispositionPolicyOriginVerifierV1{
  verifyDispositionPolicy(
    policy:HsmeStageRoutingDispositionPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeStageRoutingDispositionV1=Readonly<{
  schemaVersion:typeof HSME_STAGE_ROUTING_DISPOSITION_V1_SCHEMA;
  state:
    |'STAGE_ROUTING_DISPOSITION_INVALID'
    |'STAGE_ROUTING_DISPOSITION_BLOCKED'
    |'STAGE_ROUTING_DISPOSITION_READY';
  blockers:readonly string[];
  disposition:'ADVANCE'|'REDESIGN'|'REJECT'|'NONE';
  routingMatrixSha256:string|'UNKNOWN';
  dispositionPolicySha256:string|'UNKNOWN';
  routeTableEvidenceSha256:string|'UNKNOWN';
  scheduleEvidenceSha256:string|'UNKNOWN';
  fixtureSetSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  hardRejected:boolean;
  qualityEligible:boolean;
  efficiencyEligible:boolean;
  reasons:readonly string[];
  staticWallClockUs:number|'UNKNOWN';
  routedWallClockUs:number|'UNKNOWN';
  staticTotalBytesMoved:number|'UNKNOWN';
  routedTotalBytesMoved:number|'UNKNOWN';
  staticPeakMemoryBytes:number|'UNKNOWN';
  routedPeakMemoryBytes:number|'UNKNOWN';
  staticActiveWeightsBytes:number|'UNKNOWN';
  routedActiveWeightsBytes:number|'UNKNOWN';
  routedTransitionStallUs:number|'UNKNOWN';
  dispositionEvidenceSha256:string|'UNKNOWN';
  routeSelectionAllowed:false;
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

export class HsmeStageRoutingDispositionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeStageRoutingDispositionV1Error';
    this.code=code;
  }
}

export function normalizeHsmeStageRoutingDispositionPolicyV1(
  raw:unknown,
):HsmeStageRoutingDispositionPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','routingMatrixSha256','routeTableEvidenceSha256',
    'scheduleEvidenceSha256','fixtureSetSha256','evaluationContractSha256',
    'deterministicSeedContractSha256','runtimeRepresentationSha256',
    'hardwareClass','qualityFloors','maxQualityRegressionVsStatic',
    'maxHardPreservationFailures','maxCriticalFailureCount',
    'minWallClockImprovementBps','minTotalBytesMovedImprovementBps',
    'maxPeakMemoryRegressionBps','maxActiveWeightsRegressionBps',
    'maxTransitionStallUs','reviewState','routeSelectionAllowed',
    'stageRoutingExecutionAllowed','routeMutationAllowed',
    'inferenceExecutionAllowed','modelInstallAllowed',
    'modelFleetPromotionAllowed','durableModelFleetPromotionAllowed',
    'productionAuthorityGranted','providerAuthorityGranted',
    'billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_STAGE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA){
    fail(
      'hsme_stage_disposition_policy_schema',
      'disposition policy schema unsupported',
    );
  }
  if(r.reviewState!=='QUALITY_FIRST_STAGE_ROUTING_POLICY_REVIEWED'){
    fail(
      'hsme_stage_disposition_policy_review',
      'disposition policy review state invalid',
    );
  }
  assertNoAuthority(r,'policy');

  const qualityFloors=normalizeQualityFloors(r.qualityFloors);
  const maxQualityRegressionVsStatic=normalizeQualityRegressions(
    r.maxQualityRegressionVsStatic,
  );
  const maxHardPreservationFailures=normalizePreservationCeilings(
    r.maxHardPreservationFailures,
  );

  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_DISPOSITION_POLICY_V1_SCHEMA,
    routingMatrixSha256:sha256(
      r.routingMatrixSha256,'policy.routingMatrixSha256',
    ),
    routeTableEvidenceSha256:sha256(
      r.routeTableEvidenceSha256,'policy.routeTableEvidenceSha256',
    ),
    scheduleEvidenceSha256:sha256(
      r.scheduleEvidenceSha256,'policy.scheduleEvidenceSha256',
    ),
    fixtureSetSha256:sha256(r.fixtureSetSha256,'policy.fixtureSetSha256'),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,'policy.evaluationContractSha256',
    ),
    deterministicSeedContractSha256:sha256(
      r.deterministicSeedContractSha256,
      'policy.deterministicSeedContractSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'policy.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(r.hardwareClass,'policy.hardwareClass',160),
    qualityFloors:Object.freeze(qualityFloors),
    maxQualityRegressionVsStatic:Object.freeze(
      maxQualityRegressionVsStatic,
    ),
    maxHardPreservationFailures:Object.freeze(
      maxHardPreservationFailures,
    ),
    maxCriticalFailureCount:safeInteger(
      r.maxCriticalFailureCount,
      'policy.maxCriticalFailureCount',
      0,
      1_000_000,
    ),
    minWallClockImprovementBps:safeInteger(
      r.minWallClockImprovementBps,
      'policy.minWallClockImprovementBps',
      0,
      10_000,
    ),
    minTotalBytesMovedImprovementBps:safeInteger(
      r.minTotalBytesMovedImprovementBps,
      'policy.minTotalBytesMovedImprovementBps',
      0,
      10_000,
    ),
    maxPeakMemoryRegressionBps:safeInteger(
      r.maxPeakMemoryRegressionBps,
      'policy.maxPeakMemoryRegressionBps',
      0,
      10_000,
    ),
    maxActiveWeightsRegressionBps:safeInteger(
      r.maxActiveWeightsRegressionBps,
      'policy.maxActiveWeightsRegressionBps',
      0,
      10_000,
    ),
    maxTransitionStallUs:safeInteger(
      r.maxTransitionStallUs,
      'policy.maxTransitionStallUs',
      0,
      Number.MAX_SAFE_INTEGER,
    ),
    reviewState:'QUALITY_FIRST_STAGE_ROUTING_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeStageRoutingDispositionPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_STAGE_ROUTING_DISPOSITION_POLICY_DIGEST_DOMAIN,
    normalizeHsmeStageRoutingDispositionPolicyV1(raw),
    hash,
  );
}

export async function decideHsmeStageRoutingDispositionV1(
  matrix:HsmeStageRoutingComparisonMatrixV1,
  expectedMatrixSha256:string,
  matrixOrigin:HsmeStageRoutingDispositionMatrixOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeStageRoutingDispositionPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeStageRoutingDispositionV1>{
  if(
    matrix.schemaVersion!==HSME_STAGE_ROUTING_COMPARISON_MATRIX_V1_SCHEMA
    ||matrix.state!=='STAGE_ROUTING_COMPARISON_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['STAGE_ROUTING_DISPOSITION_READY_MATRIX_REQUIRED']);
  }

  let matrixSha:string;
  try{
    matrixSha=await hsmeStageRoutingComparisonMatrixV1Digest(matrix,hash);
  }catch{
    return invalid(['STAGE_ROUTING_DISPOSITION_MATRIX_REHASH_INVALID']);
  }
  const common=valuesFromMatrix(matrix,matrixSha);
  if(
    !exactDigest(
      expectedMatrixSha256,
      matrixSha,
      matrix.matrixEvidenceSha256 as string,
    )
  ){
    return invalid(
      ['STAGE_ROUTING_DISPOSITION_MATRIX_REHASH_MISMATCH'],
      common,
    );
  }
  if(!await verify(()=>matrixOrigin.verifyRoutingMatrix(matrix,matrixSha))){
    return invalid(
      ['STAGE_ROUTING_DISPOSITION_MATRIX_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  let policy:HsmeStageRoutingDispositionPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeStageRoutingDispositionPolicyV1(rawPolicy);
    policySha=await hsmeStageRoutingDispositionPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['STAGE_ROUTING_DISPOSITION_POLICY_INVALID'],common);
  }
  const bound={...common,dispositionPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(
      ['STAGE_ROUTING_DISPOSITION_POLICY_DIGEST_MISMATCH'],
      bound,
    );
  }
  if(!await verify(
    ()=>policyOrigin.verifyDispositionPolicy(policy,policySha),
  )){
    return invalid(
      ['STAGE_ROUTING_DISPOSITION_POLICY_ORIGIN_UNVERIFIED'],
      bound,
    );
  }
  if(!policyBindsMatrix(policy,matrix,matrixSha)){
    return invalid(
      ['STAGE_ROUTING_DISPOSITION_POLICY_BINDING_MISMATCH'],
      bound,
    );
  }

  const staticRow=row(matrix,'STATIC_SHARED_CONTROL');
  const routedRow=row(matrix,'STAGE_ROUTED');
  const measured=measurementValues(staticRow,routedRow);

  if(!staticQualityPass(staticRow,policy)){
    return ready(
      'REDESIGN',
      bound,
      measured,
      false,
      false,
      false,
      ['STATIC_CONTROL_QUALITY_BASELINE_INVALID'],
      hash,
    );
  }

  const reasons:string[]=[];
  let hardRejected=false;
  if(routedRow.criticalFailureCount>policy.maxCriticalFailureCount){
    hardRejected=true;
    reasons.push('CRITICAL_FAILURE_COUNT_EXCEEDED');
  }
  for(const ceiling of policy.maxHardPreservationFailures){
    const routedFailures=hardFailure(routedRow,ceiling.dimension);
    const staticFailures=hardFailure(staticRow,ceiling.dimension);
    if(
      routedFailures>ceiling.maxFailureCount
      ||routedFailures>staticFailures
    ){
      hardRejected=true;
      reasons.push('HARD_PRESERVATION_FAILED:'+ceiling.dimension);
    }
  }
  if(hardRejected){
    return ready(
      'REJECT',
      bound,
      measured,
      true,
      false,
      false,
      reasons,
      hash,
    );
  }

  let qualityEligible=true;
  for(const floor of policy.qualityFloors){
    if(quality(routedRow,floor.dimension)<floor.minimumBps){
      qualityEligible=false;
      reasons.push('QUALITY_FLOOR_FAILED:'+floor.dimension);
    }
  }
  for(const regression of policy.maxQualityRegressionVsStatic){
    if(
      quality(routedRow,regression.dimension)
        <quality(staticRow,regression.dimension)-regression.maxRegressionBps
    ){
      qualityEligible=false;
      reasons.push(
        'STATIC_QUALITY_REGRESSION_EXCEEDED:'+regression.dimension,
      );
    }
  }
  if(!qualityEligible){
    return ready(
      'REDESIGN',
      bound,
      measured,
      false,
      false,
      false,
      reasons,
      hash,
    );
  }

  const staticTotal=measured.staticTotalBytesMoved;
  const routedTotal=measured.routedTotalBytesMoved;
  const wallClockImprovement=improvementBps(
    staticRow.wallClockUs,
    routedRow.wallClockUs,
  );
  const bytesMovedImprovement=improvementBps(staticTotal,routedTotal);
  const peakMemoryRegression=regressionBps(
    staticRow.peakMemoryBytes,
    routedRow.peakMemoryBytes,
  );
  const activeWeightsRegression=regressionBps(
    staticRow.activeWeightsBytes,
    routedRow.activeWeightsBytes,
  );

  let efficiencyEligible=true;
  if(wallClockImprovement<policy.minWallClockImprovementBps){
    efficiencyEligible=false;
    reasons.push('WALL_CLOCK_IMPROVEMENT_INSUFFICIENT');
  }
  if(
    bytesMovedImprovement<policy.minTotalBytesMovedImprovementBps
  ){
    efficiencyEligible=false;
    reasons.push('TOTAL_BYTES_MOVED_IMPROVEMENT_INSUFFICIENT');
  }
  if(peakMemoryRegression>policy.maxPeakMemoryRegressionBps){
    efficiencyEligible=false;
    reasons.push('PEAK_MEMORY_REGRESSION_EXCEEDED');
  }
  if(activeWeightsRegression>policy.maxActiveWeightsRegressionBps){
    efficiencyEligible=false;
    reasons.push('ACTIVE_WEIGHTS_REGRESSION_EXCEEDED');
  }
  if(routedRow.transitionStallUs>policy.maxTransitionStallUs){
    efficiencyEligible=false;
    reasons.push('TRANSITION_STALL_EXCEEDED');
  }

  return ready(
    efficiencyEligible?'ADVANCE':'REDESIGN',
    bound,
    measured,
    false,
    true,
    efficiencyEligible,
    reasons,
    hash,
  );
}

export async function hsmeStageRoutingDispositionV1Digest(
  value:HsmeStageRoutingDispositionV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='STAGE_ROUTING_DISPOSITION_READY'
    ||value.dispositionEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_stage_disposition_digest_state',
      'only READY disposition is digestible',
    );
  }
  const {dispositionEvidenceSha256:_ignored,...payload}=value;
  return digest(HSME_STAGE_ROUTING_DISPOSITION_DIGEST_DOMAIN,payload,hash);
}

function policyBindsMatrix(
  policy:HsmeStageRoutingDispositionPolicyV1,
  matrix:HsmeStageRoutingComparisonMatrixV1,
  matrixSha:string,
):boolean{
  return policy.routingMatrixSha256===matrixSha
    &&policy.routeTableEvidenceSha256===matrix.routeTableEvidenceSha256
    &&policy.scheduleEvidenceSha256===matrix.scheduleEvidenceSha256
    &&policy.fixtureSetSha256===matrix.fixtureSetSha256
    &&policy.evaluationContractSha256===matrix.evaluationContractSha256
    &&policy.deterministicSeedContractSha256===
      matrix.deterministicSeedContractSha256
    &&policy.runtimeRepresentationSha256===
      matrix.runtimeRepresentationSha256
    &&policy.hardwareClass===matrix.hardwareClass
    &&sameDimensions(
      policy.qualityFloors,
      matrix.qualityDimensions,
    )
    &&sameDimensions(
      policy.maxQualityRegressionVsStatic,
      matrix.qualityDimensions,
    )
    &&sameDimensions(
      policy.maxHardPreservationFailures,
      matrix.hardPreservationDimensions,
    );
}

function staticQualityPass(
  value:CoreHsmeStageRoutingCampaignMeasurementV1,
  policy:HsmeStageRoutingDispositionPolicyV1,
):boolean{
  if(value.criticalFailureCount>policy.maxCriticalFailureCount){
    return false;
  }
  for(const floor of policy.qualityFloors){
    if(quality(value,floor.dimension)<floor.minimumBps){
      return false;
    }
  }
  for(const ceiling of policy.maxHardPreservationFailures){
    if(hardFailure(value,ceiling.dimension)>ceiling.maxFailureCount){
      return false;
    }
  }
  return true;
}

function quality(
  value:CoreHsmeStageRoutingCampaignMeasurementV1,
  dimension:string,
):number{
  const item=value.qualityVector.find(entry=>entry.dimension===dimension);
  if(item===undefined){
    fail(
      'hsme_stage_disposition_quality_dimension',
      'quality dimension missing: '+dimension,
    );
  }
  return item.valueBps;
}

function hardFailure(
  value:CoreHsmeStageRoutingCampaignMeasurementV1,
  dimension:string,
):number{
  const item=value.hardPreservationFailureCounts.find(
    entry=>entry.dimension===dimension,
  );
  if(item===undefined){
    fail(
      'hsme_stage_disposition_hard_dimension',
      'hard preservation dimension missing: '+dimension,
    );
  }
  return item.failureCount;
}

function row(
  matrix:HsmeStageRoutingComparisonMatrixV1,
  variant:'STATIC_SHARED_CONTROL'|'STAGE_ROUTED',
):CoreHsmeStageRoutingCampaignMeasurementV1{
  const value=matrix.rows.find(entry=>entry.variant===variant);
  if(value===undefined){
    fail(
      'hsme_stage_disposition_variant',
      'matrix variant missing: '+variant,
    );
  }
  return value;
}

type PartialOutput=Partial<Pick<
  HsmeStageRoutingDispositionV1,
  'routingMatrixSha256'|'dispositionPolicySha256'
  |'routeTableEvidenceSha256'|'scheduleEvidenceSha256'
  |'fixtureSetSha256'|'runtimeRepresentationSha256'|'hardwareClass'
>>;

type MeasurementValues=Readonly<{
  staticWallClockUs:number;
  routedWallClockUs:number;
  staticTotalBytesMoved:number;
  routedTotalBytesMoved:number;
  staticPeakMemoryBytes:number;
  routedPeakMemoryBytes:number;
  staticActiveWeightsBytes:number;
  routedActiveWeightsBytes:number;
  routedTransitionStallUs:number;
}>;

function valuesFromMatrix(
  matrix:HsmeStageRoutingComparisonMatrixV1,
  matrixSha:string,
):PartialOutput{
  return {
    routingMatrixSha256:matrixSha,
    routeTableEvidenceSha256:matrix.routeTableEvidenceSha256,
    scheduleEvidenceSha256:matrix.scheduleEvidenceSha256,
    fixtureSetSha256:matrix.fixtureSetSha256,
    runtimeRepresentationSha256:matrix.runtimeRepresentationSha256,
    hardwareClass:matrix.hardwareClass,
  };
}

function measurementValues(
  staticRow:CoreHsmeStageRoutingCampaignMeasurementV1,
  routedRow:CoreHsmeStageRoutingCampaignMeasurementV1,
):MeasurementValues{
  return Object.freeze({
    staticWallClockUs:staticRow.wallClockUs,
    routedWallClockUs:routedRow.wallClockUs,
    staticTotalBytesMoved:totalBytes(staticRow),
    routedTotalBytesMoved:totalBytes(routedRow),
    staticPeakMemoryBytes:staticRow.peakMemoryBytes,
    routedPeakMemoryBytes:routedRow.peakMemoryBytes,
    staticActiveWeightsBytes:staticRow.activeWeightsBytes,
    routedActiveWeightsBytes:routedRow.activeWeightsBytes,
    routedTransitionStallUs:routedRow.transitionStallUs,
  });
}

async function ready(
  disposition:'ADVANCE'|'REDESIGN'|'REJECT',
  common:PartialOutput,
  measured:MeasurementValues,
  hardRejected:boolean,
  qualityEligible:boolean,
  efficiencyEligible:boolean,
  reasons:readonly string[],
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeStageRoutingDispositionV1>{
  const payload={
    schemaVersion:HSME_STAGE_ROUTING_DISPOSITION_V1_SCHEMA,
    state:'STAGE_ROUTING_DISPOSITION_READY' as const,
    blockers:Object.freeze([] as string[]),
    disposition,
    routingMatrixSha256:requiredDigest(
      common.routingMatrixSha256,
      'routingMatrixSha256',
    ),
    dispositionPolicySha256:requiredDigest(
      common.dispositionPolicySha256,
      'dispositionPolicySha256',
    ),
    routeTableEvidenceSha256:requiredDigest(
      common.routeTableEvidenceSha256,
      'routeTableEvidenceSha256',
    ),
    scheduleEvidenceSha256:requiredDigest(
      common.scheduleEvidenceSha256,
      'scheduleEvidenceSha256',
    ),
    fixtureSetSha256:requiredDigest(
      common.fixtureSetSha256,
      'fixtureSetSha256',
    ),
    runtimeRepresentationSha256:requiredDigest(
      common.runtimeRepresentationSha256,
      'runtimeRepresentationSha256',
    ),
    hardwareClass:requiredKnown(
      common.hardwareClass,
      'hardwareClass',
    ),
    hardRejected,
    qualityEligible,
    efficiencyEligible,
    reasons:Object.freeze([...new Set(reasons)].sort(lexical)),
    ...measured,
    ...authorityBoundary(),
  };
  const dispositionEvidenceSha256=await digest(
    HSME_STAGE_ROUTING_DISPOSITION_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,dispositionEvidenceSha256});
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeStageRoutingDispositionV1{
  return terminal('STAGE_ROUTING_DISPOSITION_BLOCKED',blockers,values);
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeStageRoutingDispositionV1{
  return terminal('STAGE_ROUTING_DISPOSITION_INVALID',blockers,values);
}

function terminal(
  state:'STAGE_ROUTING_DISPOSITION_INVALID'|'STAGE_ROUTING_DISPOSITION_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeStageRoutingDispositionV1{
  return deepFreeze({
    schemaVersion:HSME_STAGE_ROUTING_DISPOSITION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    disposition:'NONE',
    routingMatrixSha256:values.routingMatrixSha256??'UNKNOWN',
    dispositionPolicySha256:values.dispositionPolicySha256??'UNKNOWN',
    routeTableEvidenceSha256:values.routeTableEvidenceSha256??'UNKNOWN',
    scheduleEvidenceSha256:values.scheduleEvidenceSha256??'UNKNOWN',
    fixtureSetSha256:values.fixtureSetSha256??'UNKNOWN',
    runtimeRepresentationSha256:
      values.runtimeRepresentationSha256??'UNKNOWN',
    hardwareClass:values.hardwareClass??'UNKNOWN',
    hardRejected:false,
    qualityEligible:false,
    efficiencyEligible:false,
    reasons:Object.freeze([]),
    staticWallClockUs:'UNKNOWN',
    routedWallClockUs:'UNKNOWN',
    staticTotalBytesMoved:'UNKNOWN',
    routedTotalBytesMoved:'UNKNOWN',
    staticPeakMemoryBytes:'UNKNOWN',
    routedPeakMemoryBytes:'UNKNOWN',
    staticActiveWeightsBytes:'UNKNOWN',
    routedActiveWeightsBytes:'UNKNOWN',
    routedTransitionStallUs:'UNKNOWN',
    dispositionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function normalizeQualityFloors(
  raw:unknown,
):HsmeStageRoutingQualityFloorV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_stage_disposition_policy_quality',
      'qualityFloors cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>{
    const r=exactRecord(
      value,
      ['dimension','minimumBps'],
      'policy.qualityFloors['+index+']',
    );
    return deepFreeze({
      dimension:identifier(
        r.dimension,
        'policy.qualityFloors['+index+'].dimension',
        100,
      ),
      minimumBps:safeInteger(
        r.minimumBps,
        'policy.qualityFloors['+index+'].minimumBps',
        0,
        10_000,
      ),
    });
  }).sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(values,'policy.qualityFloors');
  return values;
}

function normalizeQualityRegressions(
  raw:unknown,
):HsmeStageRoutingQualityRegressionV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_stage_disposition_policy_quality',
      'maxQualityRegressionVsStatic cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>{
    const r=exactRecord(
      value,
      ['dimension','maxRegressionBps'],
      'policy.maxQualityRegressionVsStatic['+index+']',
    );
    return deepFreeze({
      dimension:identifier(
        r.dimension,
        'policy.maxQualityRegressionVsStatic['+index+'].dimension',
        100,
      ),
      maxRegressionBps:safeInteger(
        r.maxRegressionBps,
        'policy.maxQualityRegressionVsStatic['+index+'].maxRegressionBps',
        0,
        10_000,
      ),
    });
  }).sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(values,'policy.maxQualityRegressionVsStatic');
  return values;
}

function normalizePreservationCeilings(
  raw:unknown,
):HsmeStageRoutingPreservationCeilingV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_stage_disposition_policy_preservation',
      'maxHardPreservationFailures cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>{
    const r=exactRecord(
      value,
      ['dimension','maxFailureCount'],
      'policy.maxHardPreservationFailures['+index+']',
    );
    return deepFreeze({
      dimension:identifier(
        r.dimension,
        'policy.maxHardPreservationFailures['+index+'].dimension',
        100,
      ),
      maxFailureCount:safeInteger(
        r.maxFailureCount,
        'policy.maxHardPreservationFailures['+index+'].maxFailureCount',
        0,
        1_000_000,
      ),
    });
  }).sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(values,'policy.maxHardPreservationFailures');
  return values;
}

function sameDimensions(
  values:readonly {dimension:string}[],
  expected:readonly string[],
):boolean{
  if(values.length!==expected.length)return false;
  const right=[...expected].sort(lexical);
  return values.every((value,index)=>value.dimension===right[index]);
}

function assertUniqueDimensions(
  values:readonly {dimension:string}[],
  path:string,
):void{
  if(new Set(values.map(value=>value.dimension)).size!==values.length){
    fail('hsme_stage_disposition_policy_dimension',path+' contains duplicates');
  }
}

function totalBytes(
  value:CoreHsmeStageRoutingCampaignMeasurementV1,
):number{
  return checkedAdd(
    checkedAdd(value.flashBytesMoved,value.ramBytesMoved),
    value.acceleratorBytesMoved,
  );
}

function improvementBps(baseline:number,candidate:number):number{
  if(baseline<=0)return 0;
  if(candidate>=baseline)return 0;
  return Math.floor(((baseline-candidate)/baseline)*10_000);
}

function regressionBps(baseline:number,candidate:number):number{
  if(candidate<=baseline)return 0;
  if(baseline<=0)return 10_000;
  return Math.floor(((candidate-baseline)/baseline)*10_000);
}

function checkedAdd(a:number,b:number):number{
  const value=a+b;
  if(!Number.isSafeInteger(value)||value<0){
    fail(
      'hsme_stage_disposition_value',
      'byte sum overflowed safe integer range',
    );
  }
  return value;
}

function requiredDigest(
  value:string|undefined,
  path:string,
):string{
  if(value===undefined||!HEX64.test(value)){
    fail('hsme_stage_disposition_binding',path+' must be a known digest');
  }
  return value;
}

function requiredKnown(
  value:string|undefined,
  path:string,
):string{
  if(value===undefined||value==='UNKNOWN'){
    fail('hsme_stage_disposition_binding',path+' must be known');
  }
  return value;
}

function authorityBoundary(){
  return Object.freeze({
    routeSelectionAllowed:false as const,
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
        'hsme_stage_disposition_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function exactDigest(expected:string,actual:string,embedded:string):boolean{
  return HEX64.test(expected)&&expected===actual&&actual===embedded;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail('hsme_stage_disposition_schema',path+' must be an object');
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail('hsme_stage_disposition_schema',path+' must be a plain object');
  }
  const r=raw as Record<string,unknown>;
  const keys=Object.keys(r);
  if(
    keys.length!==fields.length
    ||keys.some(key=>!fields.includes(key))
    ||fields.some(key=>!Object.hasOwn(r,key))
  ){
    fail(
      'hsme_stage_disposition_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function identifier(raw:unknown,path:string,max:number):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail('hsme_stage_disposition_value',path+' must be an identifier');
  }
  return value;
}

function sha256(raw:unknown,path:string):string{
  const value=boundedString(raw,path,64);
  if(!HEX64.test(value)){
    fail(
      'hsme_stage_disposition_value',
      path+' must be lowercase SHA-256',
    );
  }
  return value;
}

function boundedString(raw:unknown,path:string,max:number):string{
  if(typeof raw!=='string'){
    fail('hsme_stage_disposition_value',path+' must be a string');
  }
  const value=raw.trim();
  if(value.length<1||value.length>max||/[\u0000-\u001f\u007f]/.test(value)){
    fail('hsme_stage_disposition_value',path+' is invalid');
  }
  return value;
}

function safeInteger(
  raw:unknown,path:string,min:number,max:number,
):number{
  if(!Number.isSafeInteger(raw)||(raw as number)<min||(raw as number)>max){
    fail(
      'hsme_stage_disposition_value',
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
      'hsme_stage_disposition_hash',
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
  throw new HsmeStageRoutingDispositionV1Error(code,message);
}
