import {
  HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA,
  hsmeSpatialExecutionMatrixV1Digest,
  type CoreHsmeSpatialExecutionMeasurementV1,
  type HsmeSpatialExecutionMatrixV1,
} from './HsmeSpatialExecutionMatrixV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_SPATIAL_DISPOSITION_POLICY_V1_SCHEMA =
  'BERS_HSME_SPATIAL_DISPOSITION_POLICY_V1' as const;
export const HSME_SPATIAL_DISPOSITION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:spatial-disposition-policy:v1\0' as const;
export const HSME_SPATIAL_DISPOSITION_V1_SCHEMA =
  'BERS_HSME_SPATIAL_DISPOSITION_V1' as const;
export const HSME_SPATIAL_DISPOSITION_DIGEST_DOMAIN =
  'bers:hsme:spatial-disposition:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+/-]*$/;
const CANDIDATE_VARIANTS=Object.freeze([
  'PROTECTED_REGION_CHEAP_BACKGROUND',
  'BOUNDED_BACKGROUND_PRUNING',
] as const);

export type HsmeSpatialCandidateVariantV1=
  typeof CANDIDATE_VARIANTS[number];

export type HsmeSpatialDispositionQualityFloorV1=Readonly<{
  dimension:string;
  minimumBps:number;
}>;

export type HsmeSpatialDispositionQualityRegressionV1=Readonly<{
  dimension:string;
  maxRegressionBps:number;
}>;

export type HsmeSpatialDispositionPreservationCeilingV1=Readonly<{
  dimension:string;
  maxFailureCount:number;
}>;

export type HsmeSpatialDispositionPolicyV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_DISPOSITION_POLICY_V1_SCHEMA;
  executionMatrixSha256:string;
  experimentPlanSha256:string;
  computeMapRosterSha256:string;
  fixtureSetSha256:string;
  evaluationContractSha256:string;
  deterministicSeedContractSha256:string;
  runtimeRepresentationSha256:string;
  hardwareClass:string;
  qualityFloors:readonly HsmeSpatialDispositionQualityFloorV1[];
  maxQualityRegressionVsControl:
    readonly HsmeSpatialDispositionQualityRegressionV1[];
  maxHardPreservationFailures:
    readonly HsmeSpatialDispositionPreservationCeilingV1[];
  maxCriticalFailureCount:number;
  minWallClockImprovementBps:number;
  minTotalBytesMovedImprovementBps:number;
  maxPeakMemoryRegressionBps:number;
  maxActiveWeightsRegressionBps:number;
  reviewState:'QUALITY_FIRST_SPATIAL_POLICY_REVIEWED';
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

export interface HsmeSpatialDispositionMatrixOriginVerifierV1{
  verifySpatialExecutionMatrix(
    matrix:HsmeSpatialExecutionMatrixV1,
    expectedMatrixSha256:string,
  ):Promise<boolean>;
}

export interface HsmeSpatialDispositionPolicyOriginVerifierV1{
  verifySpatialDispositionPolicy(
    policy:HsmeSpatialDispositionPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export type HsmeSpatialCandidateDispositionV1=Readonly<{
  variant:HsmeSpatialCandidateVariantV1;
  disposition:'ADVANCE'|'REDESIGN'|'REJECT';
  hardRejected:boolean;
  qualityEligible:boolean;
  efficiencyEligible:boolean;
  reasons:readonly string[];
  controlWallClockUs:number;
  candidateWallClockUs:number;
  controlTotalBytesMoved:number;
  candidateTotalBytesMoved:number;
  controlPeakMemoryBytes:number;
  candidatePeakMemoryBytes:number;
  controlActiveWeightsBytes:number;
  candidateActiveWeightsBytes:number;
  candidateFullComputeTokenWork:number;
  candidateCheapPathTokenWork:number;
  candidatePrunedTokenWork:number;
}>;

export type HsmeSpatialDispositionV1=Readonly<{
  schemaVersion:typeof HSME_SPATIAL_DISPOSITION_V1_SCHEMA;
  state:
    |'SPATIAL_DISPOSITION_INVALID'
    |'SPATIAL_DISPOSITION_BLOCKED'
    |'SPATIAL_DISPOSITION_READY';
  blockers:readonly string[];
  executionMatrixSha256:string|'UNKNOWN';
  dispositionPolicySha256:string|'UNKNOWN';
  experimentPlanSha256:string|'UNKNOWN';
  computeMapRosterSha256:string|'UNKNOWN';
  fixtureSetSha256:string|'UNKNOWN';
  runtimeRepresentationSha256:string|'UNKNOWN';
  hardwareClass:string|'UNKNOWN';
  candidateDispositions:readonly HsmeSpatialCandidateDispositionV1[];
  advancedVariants:readonly HsmeSpatialCandidateVariantV1[];
  redesignedVariants:readonly HsmeSpatialCandidateVariantV1[];
  rejectedVariants:readonly HsmeSpatialCandidateVariantV1[];
  dispositionEvidenceSha256:string|'UNKNOWN';
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

export class HsmeSpatialDispositionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeSpatialDispositionV1Error';
    this.code=code;
  }
}

export function normalizeHsmeSpatialDispositionPolicyV1(
  raw:unknown,
):HsmeSpatialDispositionPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion','executionMatrixSha256','experimentPlanSha256',
    'computeMapRosterSha256','fixtureSetSha256',
    'evaluationContractSha256','deterministicSeedContractSha256',
    'runtimeRepresentationSha256','hardwareClass','qualityFloors',
    'maxQualityRegressionVsControl','maxHardPreservationFailures',
    'maxCriticalFailureCount','minWallClockImprovementBps',
    'minTotalBytesMovedImprovementBps','maxPeakMemoryRegressionBps',
    'maxActiveWeightsRegressionBps','reviewState','selectionAllowed',
    'spatialExecutionAllowed','spatialMapMutationAllowed',
    'inferenceExecutionAllowed','fashionGeometryAuthorityGranted',
    'projectMutationAllowed','artifactAuthorityGranted',
    'modelInstallAllowed','modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted',
    'aeeExecutionAuthorityGranted','winnerSelectionAllowed',
  ],'policy');
  if(r.schemaVersion!==HSME_SPATIAL_DISPOSITION_POLICY_V1_SCHEMA){
    fail(
      'hsme_spatial_disposition_policy_schema',
      'spatial disposition policy schema unsupported',
    );
  }
  if(r.reviewState!=='QUALITY_FIRST_SPATIAL_POLICY_REVIEWED'){
    fail(
      'hsme_spatial_disposition_policy_review',
      'spatial disposition policy review state invalid',
    );
  }
  assertNoAuthority(r,'policy');

  const qualityFloors=normalizeQualityFloors(r.qualityFloors);
  const maxQualityRegressionVsControl=normalizeQualityRegressions(
    r.maxQualityRegressionVsControl,
  );
  const maxHardPreservationFailures=normalizePreservationCeilings(
    r.maxHardPreservationFailures,
  );

  return deepFreeze({
    schemaVersion:HSME_SPATIAL_DISPOSITION_POLICY_V1_SCHEMA,
    executionMatrixSha256:sha256(
      r.executionMatrixSha256,'policy.executionMatrixSha256',
    ),
    experimentPlanSha256:sha256(
      r.experimentPlanSha256,'policy.experimentPlanSha256',
    ),
    computeMapRosterSha256:sha256(
      r.computeMapRosterSha256,'policy.computeMapRosterSha256',
    ),
    fixtureSetSha256:sha256(
      r.fixtureSetSha256,'policy.fixtureSetSha256',
    ),
    evaluationContractSha256:sha256(
      r.evaluationContractSha256,
      'policy.evaluationContractSha256',
    ),
    deterministicSeedContractSha256:sha256(
      r.deterministicSeedContractSha256,
      'policy.deterministicSeedContractSha256',
    ),
    runtimeRepresentationSha256:sha256(
      r.runtimeRepresentationSha256,
      'policy.runtimeRepresentationSha256',
    ),
    hardwareClass:identifier(
      r.hardwareClass,'policy.hardwareClass',160,
    ),
    qualityFloors:Object.freeze(qualityFloors),
    maxQualityRegressionVsControl:Object.freeze(
      maxQualityRegressionVsControl,
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
    reviewState:'QUALITY_FIRST_SPATIAL_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeSpatialDispositionPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_SPATIAL_DISPOSITION_POLICY_DIGEST_DOMAIN,
    normalizeHsmeSpatialDispositionPolicyV1(raw),
    hash,
  );
}

export async function decideHsmeSpatialDispositionV1(
  matrix:HsmeSpatialExecutionMatrixV1,
  expectedMatrixSha256:string,
  matrixOrigin:HsmeSpatialDispositionMatrixOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeSpatialDispositionPolicyOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeSpatialDispositionV1>{
  if(
    matrix.schemaVersion!==HSME_SPATIAL_EXECUTION_MATRIX_V1_SCHEMA
    ||matrix.state!=='SPATIAL_EXECUTION_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['SPATIAL_DISPOSITION_READY_MATRIX_REQUIRED']);
  }

  let matrixSha:string;
  try{
    matrixSha=await hsmeSpatialExecutionMatrixV1Digest(matrix,hash);
  }catch{
    return invalid(['SPATIAL_DISPOSITION_MATRIX_REHASH_INVALID']);
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
      ['SPATIAL_DISPOSITION_MATRIX_REHASH_MISMATCH'],
      common,
    );
  }
  if(!await verify(
    ()=>matrixOrigin.verifySpatialExecutionMatrix(matrix,matrixSha),
  )){
    return invalid(
      ['SPATIAL_DISPOSITION_MATRIX_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  let policy:HsmeSpatialDispositionPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeSpatialDispositionPolicyV1(rawPolicy);
    policySha=await hsmeSpatialDispositionPolicyV1Digest(policy,hash);
  }catch{
    return invalid(['SPATIAL_DISPOSITION_POLICY_INVALID'],common);
  }
  const bound={...common,dispositionPolicySha256:policySha};
  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(
      ['SPATIAL_DISPOSITION_POLICY_DIGEST_MISMATCH'],
      bound,
    );
  }
  if(!await verify(
    ()=>policyOrigin.verifySpatialDispositionPolicy(policy,policySha),
  )){
    return invalid(
      ['SPATIAL_DISPOSITION_POLICY_ORIGIN_UNVERIFIED'],
      bound,
    );
  }
  if(!policyBindsMatrix(policy,matrix,matrixSha)){
    return invalid(
      ['SPATIAL_DISPOSITION_POLICY_BINDING_MISMATCH'],
      bound,
    );
  }

  const control=row(matrix,'FULL_SPATIAL_CONTROL');
  const candidates=matrix.rows
    .filter(value=>value.variant!=='FULL_SPATIAL_CONTROL')
    .map(value=>{
      if(!CANDIDATE_VARIANTS.includes(
        value.variant as HsmeSpatialCandidateVariantV1,
      )){
        fail(
          'hsme_spatial_disposition_variant',
          'unsupported candidate variant',
        );
      }
      return value;
    })
    .sort(
      (a,b)=>CANDIDATE_VARIANTS.indexOf(
        a.variant as HsmeSpatialCandidateVariantV1,
      )-CANDIDATE_VARIANTS.indexOf(
        b.variant as HsmeSpatialCandidateVariantV1,
      ),
    );

  if(candidates.length<1||candidates.length>2){
    return invalid(
      ['SPATIAL_DISPOSITION_CANDIDATE_SET_INVALID'],
      bound,
    );
  }

  let candidateDispositions:HsmeSpatialCandidateDispositionV1[];
  if(!absoluteQualityPass(control,policy)){
    candidateDispositions=candidates.map(candidate=>
      candidateStatus(
        candidate.variant as HsmeSpatialCandidateVariantV1,
        'REDESIGN',
        false,
        false,
        false,
        ['FULL_SPATIAL_CONTROL_QUALITY_BASELINE_INVALID'],
        control,
        candidate,
      )
    );
  }else{
    candidateDispositions=candidates.map(candidate=>
      evaluateCandidate(
        candidate as CoreHsmeSpatialExecutionMeasurementV1,
        control,
        policy,
      )
    );
  }

  const advancedVariants=Object.freeze(
    candidateDispositions
      .filter(value=>value.disposition==='ADVANCE')
      .map(value=>value.variant),
  );
  const redesignedVariants=Object.freeze(
    candidateDispositions
      .filter(value=>value.disposition==='REDESIGN')
      .map(value=>value.variant),
  );
  const rejectedVariants=Object.freeze(
    candidateDispositions
      .filter(value=>value.disposition==='REJECT')
      .map(value=>value.variant),
  );

  const payload={
    schemaVersion:HSME_SPATIAL_DISPOSITION_V1_SCHEMA,
    state:'SPATIAL_DISPOSITION_READY' as const,
    blockers:Object.freeze([] as string[]),
    executionMatrixSha256:matrixSha,
    dispositionPolicySha256:policySha,
    experimentPlanSha256:matrix.experimentPlanSha256 as string,
    computeMapRosterSha256:matrix.computeMapRosterSha256 as string,
    fixtureSetSha256:matrix.fixtureSetSha256 as string,
    runtimeRepresentationSha256:
      matrix.runtimeRepresentationSha256 as string,
    hardwareClass:matrix.hardwareClass as string,
    candidateDispositions:Object.freeze(candidateDispositions),
    advancedVariants,
    redesignedVariants,
    rejectedVariants,
    ...authorityBoundary(),
  };
  const dispositionEvidenceSha256=await digest(
    HSME_SPATIAL_DISPOSITION_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({...payload,dispositionEvidenceSha256});
}

export async function hsmeSpatialDispositionV1Digest(
  value:HsmeSpatialDispositionV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='SPATIAL_DISPOSITION_READY'
    ||value.dispositionEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_spatial_disposition_digest_state',
      'only READY disposition is digestible',
    );
  }
  const {dispositionEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_SPATIAL_DISPOSITION_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function evaluateCandidate(
  candidate:CoreHsmeSpatialExecutionMeasurementV1,
  control:CoreHsmeSpatialExecutionMeasurementV1,
  policy:HsmeSpatialDispositionPolicyV1,
):HsmeSpatialCandidateDispositionV1{
  const variant=candidate.variant as HsmeSpatialCandidateVariantV1;
  const reasons:string[]=[];
  let hardRejected=false;

  if(candidate.criticalFailureCount>policy.maxCriticalFailureCount){
    hardRejected=true;
    reasons.push('CRITICAL_FAILURE_COUNT_EXCEEDED');
  }
  for(const ceiling of policy.maxHardPreservationFailures){
    const candidateFailures=hardFailure(candidate,ceiling.dimension);
    const controlFailures=hardFailure(control,ceiling.dimension);
    if(
      candidateFailures>ceiling.maxFailureCount
      ||candidateFailures>controlFailures
    ){
      hardRejected=true;
      reasons.push(
        'HARD_PRESERVATION_FAILED:'+ceiling.dimension,
      );
    }
  }
  if(hardRejected){
    return candidateStatus(
      variant,
      'REJECT',
      true,
      false,
      false,
      reasons,
      control,
      candidate,
    );
  }

  let qualityEligible=true;
  for(const floor of policy.qualityFloors){
    if(quality(candidate,floor.dimension)<floor.minimumBps){
      qualityEligible=false;
      reasons.push('QUALITY_FLOOR_FAILED:'+floor.dimension);
    }
  }
  for(const regression of policy.maxQualityRegressionVsControl){
    if(
      quality(candidate,regression.dimension)
      <quality(control,regression.dimension)-regression.maxRegressionBps
    ){
      qualityEligible=false;
      reasons.push(
        'CONTROL_QUALITY_REGRESSION_EXCEEDED:'+regression.dimension,
      );
    }
  }
  if(!qualityEligible){
    return candidateStatus(
      variant,
      'REDESIGN',
      false,
      false,
      false,
      reasons,
      control,
      candidate,
    );
  }

  const controlTotal=totalBytes(control);
  const candidateTotal=totalBytes(candidate);
  let efficiencyEligible=true;

  if(
    improvementBps(
      control.wallClockUs,
      candidate.wallClockUs,
    )<policy.minWallClockImprovementBps
  ){
    efficiencyEligible=false;
    reasons.push('WALL_CLOCK_IMPROVEMENT_INSUFFICIENT');
  }
  if(
    improvementBps(
      controlTotal,
      candidateTotal,
    )<policy.minTotalBytesMovedImprovementBps
  ){
    efficiencyEligible=false;
    reasons.push('TOTAL_BYTES_MOVED_IMPROVEMENT_INSUFFICIENT');
  }
  if(
    regressionBps(
      control.peakMemoryBytes,
      candidate.peakMemoryBytes,
    )>policy.maxPeakMemoryRegressionBps
  ){
    efficiencyEligible=false;
    reasons.push('PEAK_MEMORY_REGRESSION_EXCEEDED');
  }
  if(
    regressionBps(
      control.activeWeightsBytes,
      candidate.activeWeightsBytes,
    )>policy.maxActiveWeightsRegressionBps
  ){
    efficiencyEligible=false;
    reasons.push('ACTIVE_WEIGHTS_REGRESSION_EXCEEDED');
  }

  return candidateStatus(
    variant,
    efficiencyEligible?'ADVANCE':'REDESIGN',
    false,
    true,
    efficiencyEligible,
    reasons,
    control,
    candidate,
  );
}

function absoluteQualityPass(
  value:CoreHsmeSpatialExecutionMeasurementV1,
  policy:HsmeSpatialDispositionPolicyV1,
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

function policyBindsMatrix(
  policy:HsmeSpatialDispositionPolicyV1,
  matrix:HsmeSpatialExecutionMatrixV1,
  matrixSha:string,
):boolean{
  return policy.executionMatrixSha256===matrixSha
    &&policy.experimentPlanSha256===matrix.experimentPlanSha256
    &&policy.computeMapRosterSha256===matrix.computeMapRosterSha256
    &&policy.fixtureSetSha256===matrix.fixtureSetSha256
    &&policy.evaluationContractSha256===
      matrix.evaluationContractSha256
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
      policy.maxQualityRegressionVsControl,
      matrix.qualityDimensions,
    )
    &&sameDimensions(
      policy.maxHardPreservationFailures,
      matrix.hardPreservationDimensions,
    );
}

function candidateStatus(
  variant:HsmeSpatialCandidateVariantV1,
  disposition:'ADVANCE'|'REDESIGN'|'REJECT',
  hardRejected:boolean,
  qualityEligible:boolean,
  efficiencyEligible:boolean,
  reasons:readonly string[],
  control:CoreHsmeSpatialExecutionMeasurementV1,
  candidate:CoreHsmeSpatialExecutionMeasurementV1,
):HsmeSpatialCandidateDispositionV1{
  return deepFreeze({
    variant,
    disposition,
    hardRejected,
    qualityEligible,
    efficiencyEligible,
    reasons:Object.freeze([...new Set(reasons)].sort(lexical)),
    controlWallClockUs:control.wallClockUs,
    candidateWallClockUs:candidate.wallClockUs,
    controlTotalBytesMoved:totalBytes(control),
    candidateTotalBytesMoved:totalBytes(candidate),
    controlPeakMemoryBytes:control.peakMemoryBytes,
    candidatePeakMemoryBytes:candidate.peakMemoryBytes,
    controlActiveWeightsBytes:control.activeWeightsBytes,
    candidateActiveWeightsBytes:candidate.activeWeightsBytes,
    candidateFullComputeTokenWork:candidate.fullComputeTokenWork,
    candidateCheapPathTokenWork:candidate.cheapPathTokenWork,
    candidatePrunedTokenWork:candidate.prunedTokenWork,
  });
}

function quality(
  value:CoreHsmeSpatialExecutionMeasurementV1,
  dimension:string,
):number{
  const item=value.qualityVector.find(
    entry=>entry.dimension===dimension,
  );
  if(item===undefined){
    fail(
      'hsme_spatial_disposition_quality_dimension',
      'quality dimension missing: '+dimension,
    );
  }
  return item.valueBps;
}

function hardFailure(
  value:CoreHsmeSpatialExecutionMeasurementV1,
  dimension:string,
):number{
  const item=value.hardPreservationFailureCounts.find(
    entry=>entry.dimension===dimension,
  );
  if(item===undefined){
    fail(
      'hsme_spatial_disposition_hard_dimension',
      'hard preservation dimension missing: '+dimension,
    );
  }
  return item.failureCount;
}

function row(
  matrix:HsmeSpatialExecutionMatrixV1,
  variant:'FULL_SPATIAL_CONTROL',
):CoreHsmeSpatialExecutionMeasurementV1{
  const value=matrix.rows.find(entry=>entry.variant===variant);
  if(value===undefined){
    fail(
      'hsme_spatial_disposition_control',
      'FULL_SPATIAL_CONTROL row missing',
    );
  }
  return value;
}

type PartialOutput=Partial<Pick<
  HsmeSpatialDispositionV1,
  'executionMatrixSha256'|'dispositionPolicySha256'
  |'experimentPlanSha256'|'computeMapRosterSha256'
  |'fixtureSetSha256'|'runtimeRepresentationSha256'|'hardwareClass'
>>;

function valuesFromMatrix(
  matrix:HsmeSpatialExecutionMatrixV1,
  matrixSha:string,
):PartialOutput{
  return {
    executionMatrixSha256:matrixSha,
    experimentPlanSha256:matrix.experimentPlanSha256,
    computeMapRosterSha256:matrix.computeMapRosterSha256,
    fixtureSetSha256:matrix.fixtureSetSha256,
    runtimeRepresentationSha256:matrix.runtimeRepresentationSha256,
    hardwareClass:matrix.hardwareClass,
  };
}

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSpatialDispositionV1{
  return terminal('SPATIAL_DISPOSITION_BLOCKED',blockers,values);
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeSpatialDispositionV1{
  return terminal('SPATIAL_DISPOSITION_INVALID',blockers,values);
}

function terminal(
  state:'SPATIAL_DISPOSITION_INVALID'|'SPATIAL_DISPOSITION_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeSpatialDispositionV1{
  return deepFreeze({
    schemaVersion:HSME_SPATIAL_DISPOSITION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    executionMatrixSha256:values.executionMatrixSha256??'UNKNOWN',
    dispositionPolicySha256:values.dispositionPolicySha256??'UNKNOWN',
    experimentPlanSha256:values.experimentPlanSha256??'UNKNOWN',
    computeMapRosterSha256:values.computeMapRosterSha256??'UNKNOWN',
    fixtureSetSha256:values.fixtureSetSha256??'UNKNOWN',
    runtimeRepresentationSha256:
      values.runtimeRepresentationSha256??'UNKNOWN',
    hardwareClass:values.hardwareClass??'UNKNOWN',
    candidateDispositions:Object.freeze([]),
    advancedVariants:Object.freeze([]),
    redesignedVariants:Object.freeze([]),
    rejectedVariants:Object.freeze([]),
    dispositionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function normalizeQualityFloors(
  raw:unknown,
):HsmeSpatialDispositionQualityFloorV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_spatial_disposition_policy_quality',
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
):HsmeSpatialDispositionQualityRegressionV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_spatial_disposition_policy_quality',
      'maxQualityRegressionVsControl cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>{
    const r=exactRecord(
      value,
      ['dimension','maxRegressionBps'],
      'policy.maxQualityRegressionVsControl['+index+']',
    );
    return deepFreeze({
      dimension:identifier(
        r.dimension,
        'policy.maxQualityRegressionVsControl['+index+'].dimension',
        100,
      ),
      maxRegressionBps:safeInteger(
        r.maxRegressionBps,
        'policy.maxQualityRegressionVsControl['+index+'].maxRegressionBps',
        0,
        10_000,
      ),
    });
  }).sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(
    values,
    'policy.maxQualityRegressionVsControl',
  );
  return values;
}

function normalizePreservationCeilings(
  raw:unknown,
):HsmeSpatialDispositionPreservationCeilingV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_spatial_disposition_policy_preservation',
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
  assertUniqueDimensions(
    values,
    'policy.maxHardPreservationFailures',
  );
  return values;
}

function sameDimensions(
  values:readonly {dimension:string}[],
  expected:readonly string[],
):boolean{
  if(values.length!==expected.length)return false;
  const sorted=[...expected].sort(lexical);
  return values.every(
    (value,index)=>value.dimension===sorted[index],
  );
}

function assertUniqueDimensions(
  values:readonly {dimension:string}[],
  path:string,
):void{
  if(
    new Set(values.map(value=>value.dimension)).size!==values.length
  ){
    fail(
      'hsme_spatial_disposition_policy_dimension',
      path+' contains duplicates',
    );
  }
}

function totalBytes(
  value:CoreHsmeSpatialExecutionMeasurementV1,
):number{
  return checkedAdd(
    checkedAdd(value.flashBytesMoved,value.ramBytesMoved),
    value.acceleratorBytesMoved,
  );
}

function improvementBps(
  baseline:number,
  candidate:number,
):number{
  if(baseline<=0||candidate>=baseline)return 0;
  return Math.floor(
    ((baseline-candidate)/baseline)*10_000,
  );
}

function regressionBps(
  baseline:number,
  candidate:number,
):number{
  if(candidate<=baseline)return 0;
  if(baseline<=0)return 10_000;
  return Math.floor(
    ((candidate-baseline)/baseline)*10_000,
  );
}

function checkedAdd(a:number,b:number):number{
  const value=a+b;
  if(!Number.isSafeInteger(value)||value<0){
    fail(
      'hsme_spatial_disposition_value',
      'byte sum overflowed safe integer range',
    );
  }
  return value;
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
        'hsme_spatial_disposition_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
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
      'hsme_spatial_disposition_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_spatial_disposition_schema',
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
      'hsme_spatial_disposition_schema',
      path+' contains unknown or missing fields',
    );
  }
  return r;
}

function identifier(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!IDENTIFIER.test(value)){
    fail(
      'hsme_spatial_disposition_value',
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
      'hsme_spatial_disposition_value',
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
      'hsme_spatial_disposition_value',
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
      'hsme_spatial_disposition_value',
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
      'hsme_spatial_disposition_value',
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
      'hsme_spatial_disposition_hash',
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
  throw new HsmeSpatialDispositionV1Error(code,message);
}
