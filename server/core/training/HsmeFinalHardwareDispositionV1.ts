import {
  HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA,
  hsmeDenseBaselineFinalizationV1Digest,
  type HsmeDenseBaselineFinalizationV1,
} from './HsmeDenseBaselineFinalizationV1.ts';
import {
  HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA,
  hsmeHardwareRepresentationQualificationRosterV1Digest,
  type HsmeHardwareBackendV1,
  type HsmeHardwareRepresentationCandidateV1,
  type HsmeHardwareRepresentationQualificationRosterV1,
} from './HsmeHardwareRepresentationQualificationRosterV1.ts';
import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
  hsmeHardwarePlacementMatrixV1Digest,
  type CoreHsmeHardwarePlacementMeasurementV1,
  type HsmeHardwarePlacementMatrixV1,
} from './HsmeHardwarePlacementMatrixV1.ts';
import {
  HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA,
  HSME_REAL_MOBILE_THERMAL_STATES_V1,
  hsmeRealMobileQualificationV1Digest,
  type HsmeRealMobileQualificationRecordV1,
  type HsmeRealMobileQualificationV1,
} from './HsmeRealMobileQualificationV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_FINAL_HARDWARE_DISPOSITION_POLICY_V1_SCHEMA =
  'BERS_HSME_FINAL_HARDWARE_DISPOSITION_POLICY_V1' as const;
export const HSME_FINAL_HARDWARE_DISPOSITION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:final-hardware-disposition-policy:v1\0' as const;
export const HSME_FINAL_HARDWARE_DISPOSITION_V1_SCHEMA =
  'BERS_HSME_FINAL_HARDWARE_DISPOSITION_V1' as const;
export const HSME_FINAL_HARDWARE_DISPOSITION_DIGEST_DOMAIN =
  'bers:hsme:final-hardware-disposition:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/;

export type HsmeFinalHardwareQualityFloorV1=Readonly<{
  dimension:string;
  minimumBps:number;
}>;

export type HsmeFinalHardwareQualityRegressionV1=Readonly<{
  dimension:string;
  maxRegressionBps:number;
}>;

export type HsmeFinalHardwarePreservationCeilingV1=Readonly<{
  dimension:string;
  maxFailureCount:number;
}>;

export type HsmeFinalHardwareCandidateBindingV1=Readonly<{
  candidateId:string;
  requestedPlacement:HsmeHardwareBackendV1;
  expectedLogicalModelFamily:string;
}>;

export type HsmeFinalHardwareDispositionPolicyV1=Readonly<{
  schemaVersion:typeof HSME_FINAL_HARDWARE_DISPOSITION_POLICY_V1_SCHEMA;
  denseBaselineFinalizationSha256:string;
  hardwareRepresentationRosterSha256:string;
  hardwarePlacementMatrixSha256:string;
  realMobileQualificationSha256:string;
  denseControlCandidateId:string;
  denseControlPlacement:HsmeHardwareBackendV1;
  denseLogicalModelFamily:string;
  targetDeviceClass:string;
  candidates:readonly HsmeFinalHardwareCandidateBindingV1[];
  qualityFloors:readonly HsmeFinalHardwareQualityFloorV1[];
  maxQualityRegressionVsDense:
    readonly HsmeFinalHardwareQualityRegressionV1[];
  maxHardPreservationFailures:
    readonly HsmeFinalHardwarePreservationCeilingV1[];
  maxCriticalFailureCount:number;
  minWarmLatencyImprovementBps:number;
  minTotalBytesMovedImprovementBps:number;
  minInstalledBytesImprovementBps:number;
  minActiveRepresentationBytesImprovementBps:number;
  maxPeakHostMemoryRegressionBps:number;
  maxPeakAcceleratorMemoryRegressionBps:number;
  maxEnergyRegressionBps:number;
  maxBatteryDrainRegressionBps:number;
  maxThermalRegressionSteps:number;
  maxThrottledRunRegressionCount:number;
  reviewState:'FINAL_HARDWARE_DISPOSITION_POLICY_REVIEWED';
  productionAdmissionAllowed:false;
  candidateSelectionAllowed:false;
  benchmarkExecutionAllowed:false;
  representationMutationAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export interface HsmeFinalHardwareDispositionOriginVerifierV1{
  verifyDenseBaselineFinalization(
    value:HsmeDenseBaselineFinalizationV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyHardwareRepresentationRoster(
    value:HsmeHardwareRepresentationQualificationRosterV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyHardwarePlacementMatrix(
    value:HsmeHardwarePlacementMatrixV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyRealMobileQualification(
    value:HsmeRealMobileQualificationV1,
    expectedSha256:string,
  ):Promise<boolean>;
  verifyFinalHardwareDispositionPolicy(
    value:HsmeFinalHardwareDispositionPolicyV1,
    expectedSha256:string,
  ):Promise<boolean>;
}

export type HsmeFinalHardwareCandidateDispositionV1=Readonly<{
  candidateId:string;
  requestedPlacement:HsmeHardwareBackendV1;
  targetDeviceClass:string;
  disposition:'ADVANCE'|'REDESIGN'|'REJECT';
  hardRejected:boolean;
  qualityEligible:boolean;
  mobileQualified:boolean;
  efficiencyEligible:boolean;
  reasons:readonly string[];
  denseInstalledBytes:number;
  candidateInstalledBytes:number;
  denseWarmLatencyUs:number;
  candidateWarmLatencyUs:number;
  denseActiveRepresentationBytes:number;
  candidateActiveRepresentationBytes:number;
  denseTotalBytesMoved:number;
  candidateTotalBytesMoved:number;
  densePeakHostMemoryBytes:number;
  candidatePeakHostMemoryBytes:number;
  densePeakAcceleratorMemoryBytes:number;
  candidatePeakAcceleratorMemoryBytes:number;
  denseEnergyMicroJoulesPerRun:number;
  candidateEnergyMicroJoulesPerRun:number;
  denseBatteryDrainBps:number;
  candidateBatteryDrainBps:number;
  denseThermalPeakState:string;
  candidateThermalPeakState:string;
  denseThrottledRunCount:number;
  candidateThrottledRunCount:number;
}>;

export type HsmeFinalHardwareDispositionV1=Readonly<{
  schemaVersion:typeof HSME_FINAL_HARDWARE_DISPOSITION_V1_SCHEMA;
  state:
    |'FINAL_HARDWARE_DISPOSITION_INVALID'
    |'FINAL_HARDWARE_DISPOSITION_BLOCKED'
    |'FINAL_HARDWARE_DISPOSITION_READY';
  blockers:readonly string[];
  architectureDisposition:'ADVANCE'|'REDESIGN'|'REJECT'|'NONE';
  denseBaselineFinalizationSha256:string|'UNKNOWN';
  hardwareRepresentationRosterSha256:string|'UNKNOWN';
  hardwarePlacementMatrixSha256:string|'UNKNOWN';
  realMobileQualificationSha256:string|'UNKNOWN';
  dispositionPolicySha256:string|'UNKNOWN';
  denseControlCandidateId:string|'UNKNOWN';
  denseControlPlacement:HsmeHardwareBackendV1|'UNKNOWN';
  targetDeviceClass:string|'UNKNOWN';
  candidateDispositions:readonly HsmeFinalHardwareCandidateDispositionV1[];
  advancedCandidates:readonly string[];
  redesignedCandidates:readonly string[];
  rejectedCandidates:readonly string[];
  dispositionEvidenceSha256:string|'UNKNOWN';
  productionAdmissionAllowed:false;
  candidateSelectionAllowed:false;
  benchmarkExecutionAllowed:false;
  representationMutationAllowed:false;
  inferenceExecutionAllowed:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeFinalHardwareDispositionV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFinalHardwareDispositionV1Error';
    this.code=code;
  }
}

export function normalizeHsmeFinalHardwareDispositionPolicyV1(
  raw:unknown,
):HsmeFinalHardwareDispositionPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'denseBaselineFinalizationSha256',
    'hardwareRepresentationRosterSha256',
    'hardwarePlacementMatrixSha256',
    'realMobileQualificationSha256',
    'denseControlCandidateId',
    'denseControlPlacement',
    'denseLogicalModelFamily',
    'targetDeviceClass',
    'candidates',
    'qualityFloors',
    'maxQualityRegressionVsDense',
    'maxHardPreservationFailures',
    'maxCriticalFailureCount',
    'minWarmLatencyImprovementBps',
    'minTotalBytesMovedImprovementBps',
    'minInstalledBytesImprovementBps',
    'minActiveRepresentationBytesImprovementBps',
    'maxPeakHostMemoryRegressionBps',
    'maxPeakAcceleratorMemoryRegressionBps',
    'maxEnergyRegressionBps',
    'maxBatteryDrainRegressionBps',
    'maxThermalRegressionSteps',
    'maxThrottledRunRegressionCount',
    'reviewState',
    'productionAdmissionAllowed',
    'candidateSelectionAllowed',
    'benchmarkExecutionAllowed',
    'representationMutationAllowed',
    'inferenceExecutionAllowed',
    'modelInstallAllowed',
    'modelFleetPromotionAllowed',
    'durableModelFleetPromotionAllowed',
    'productionAuthorityGranted',
    'providerAuthorityGranted',
    'billingAuthorityGranted',
    'projectArtifactMutationAllowed',
    'fashionGeometryAuthorityGranted',
    'artifactAuthorityGranted',
    'aeeExecutionAuthorityGranted',
    'winnerSelectionAllowed',
  ],'policy');

  if(r.schemaVersion!==HSME_FINAL_HARDWARE_DISPOSITION_POLICY_V1_SCHEMA){
    fail(
      'hsme_final_hardware_policy_schema',
      'final hardware disposition policy schema unsupported',
    );
  }
  if(r.reviewState!=='FINAL_HARDWARE_DISPOSITION_POLICY_REVIEWED'){
    fail(
      'hsme_final_hardware_policy_review',
      'final hardware disposition policy review state invalid',
    );
  }
  assertNoAuthority(r,'policy');

  const candidates=normalizeCandidateBindings(r.candidates);
  const denseControlCandidateId=identifier(
    r.denseControlCandidateId,
    'policy.denseControlCandidateId',
    160,
  );
  if(candidates.some(value=>value.candidateId===denseControlCandidateId)){
    fail(
      'hsme_final_hardware_policy_candidate',
      'evaluated HSME candidate cannot equal dense control candidate',
    );
  }

  const qualityFloors=normalizeQualityFloors(r.qualityFloors);
  const qualityRegressions=normalizeQualityRegressions(
    r.maxQualityRegressionVsDense,
  );
  const preservationCeilings=normalizePreservationCeilings(
    r.maxHardPreservationFailures,
  );

  return deepFreeze({
    schemaVersion:HSME_FINAL_HARDWARE_DISPOSITION_POLICY_V1_SCHEMA,
    denseBaselineFinalizationSha256:sha256(
      r.denseBaselineFinalizationSha256,
      'policy.denseBaselineFinalizationSha256',
    ),
    hardwareRepresentationRosterSha256:sha256(
      r.hardwareRepresentationRosterSha256,
      'policy.hardwareRepresentationRosterSha256',
    ),
    hardwarePlacementMatrixSha256:sha256(
      r.hardwarePlacementMatrixSha256,
      'policy.hardwarePlacementMatrixSha256',
    ),
    realMobileQualificationSha256:sha256(
      r.realMobileQualificationSha256,
      'policy.realMobileQualificationSha256',
    ),
    denseControlCandidateId,
    denseControlPlacement:enumValue(
      r.denseControlPlacement,
      ['CPU','GPU','NPU'] as const,
      'policy.denseControlPlacement',
    ),
    denseLogicalModelFamily:identifier(
      r.denseLogicalModelFamily,
      'policy.denseLogicalModelFamily',
      160,
    ),
    targetDeviceClass:identifier(
      r.targetDeviceClass,
      'policy.targetDeviceClass',
      160,
    ),
    candidates:Object.freeze(candidates),
    qualityFloors:Object.freeze(qualityFloors),
    maxQualityRegressionVsDense:Object.freeze(qualityRegressions),
    maxHardPreservationFailures:Object.freeze(preservationCeilings),
    maxCriticalFailureCount:safeInteger(
      r.maxCriticalFailureCount,
      'policy.maxCriticalFailureCount',
      0,
      1_000_000,
    ),
    minWarmLatencyImprovementBps:bps(
      r.minWarmLatencyImprovementBps,
      'policy.minWarmLatencyImprovementBps',
    ),
    minTotalBytesMovedImprovementBps:bps(
      r.minTotalBytesMovedImprovementBps,
      'policy.minTotalBytesMovedImprovementBps',
    ),
    minInstalledBytesImprovementBps:bps(
      r.minInstalledBytesImprovementBps,
      'policy.minInstalledBytesImprovementBps',
    ),
    minActiveRepresentationBytesImprovementBps:bps(
      r.minActiveRepresentationBytesImprovementBps,
      'policy.minActiveRepresentationBytesImprovementBps',
    ),
    maxPeakHostMemoryRegressionBps:bps(
      r.maxPeakHostMemoryRegressionBps,
      'policy.maxPeakHostMemoryRegressionBps',
    ),
    maxPeakAcceleratorMemoryRegressionBps:bps(
      r.maxPeakAcceleratorMemoryRegressionBps,
      'policy.maxPeakAcceleratorMemoryRegressionBps',
    ),
    maxEnergyRegressionBps:bps(
      r.maxEnergyRegressionBps,
      'policy.maxEnergyRegressionBps',
    ),
    maxBatteryDrainRegressionBps:bps(
      r.maxBatteryDrainRegressionBps,
      'policy.maxBatteryDrainRegressionBps',
    ),
    maxThermalRegressionSteps:safeInteger(
      r.maxThermalRegressionSteps,
      'policy.maxThermalRegressionSteps',
      0,
      3,
    ),
    maxThrottledRunRegressionCount:safeInteger(
      r.maxThrottledRunRegressionCount,
      'policy.maxThrottledRunRegressionCount',
      0,
      1_000_000,
    ),
    reviewState:'FINAL_HARDWARE_DISPOSITION_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeFinalHardwareDispositionPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_FINAL_HARDWARE_DISPOSITION_POLICY_DIGEST_DOMAIN,
    normalizeHsmeFinalHardwareDispositionPolicyV1(raw),
    hash,
  );
}

export function evaluateHsmeFinalHardwareCandidateV1(
  denseCandidate:HsmeHardwareRepresentationCandidateV1,
  candidate:HsmeHardwareRepresentationCandidateV1,
  denseRow:CoreHsmeHardwarePlacementMeasurementV1,
  candidateRow:CoreHsmeHardwarePlacementMeasurementV1,
  denseMobile:HsmeRealMobileQualificationRecordV1,
  candidateMobile:HsmeRealMobileQualificationRecordV1,
  policy:HsmeFinalHardwareDispositionPolicyV1,
):HsmeFinalHardwareCandidateDispositionV1{
  const reasons:string[]=[];
  let hardRejected=false;

  if(
    candidateRow.criticalFailureCount>policy.maxCriticalFailureCount
    ||candidateRow.criticalFailureCount>denseRow.criticalFailureCount
  ){
    hardRejected=true;
    reasons.push('CRITICAL_FAILURE_COUNT_EXCEEDED');
  }

  for(const ceiling of policy.maxHardPreservationFailures){
    const candidateFailures=hardFailure(candidateRow,ceiling.dimension);
    const denseFailures=hardFailure(denseRow,ceiling.dimension);
    if(
      candidateFailures>ceiling.maxFailureCount
      ||candidateFailures>denseFailures
    ){
      hardRejected=true;
      reasons.push('HARD_PRESERVATION_FAILED:'+ceiling.dimension);
    }
  }

  if(hardRejected){
    return candidateDisposition(
      candidate,
      candidateRow,
      candidateMobile,
      denseCandidate,
      denseRow,
      denseMobile,
      'REJECT',
      true,
      false,
      candidateMobile.qualification==='QUALIFIED',
      false,
      reasons,
      policy.targetDeviceClass,
    );
  }

  let qualityEligible=true;
  for(const floor of policy.qualityFloors){
    if(quality(candidateRow,floor.dimension)<floor.minimumBps){
      qualityEligible=false;
      reasons.push('QUALITY_FLOOR_FAILED:'+floor.dimension);
    }
  }
  for(const regression of policy.maxQualityRegressionVsDense){
    if(
      quality(candidateRow,regression.dimension)
      <quality(denseRow,regression.dimension)-regression.maxRegressionBps
    ){
      qualityEligible=false;
      reasons.push(
        'DENSE_QUALITY_REGRESSION_EXCEEDED:'+regression.dimension,
      );
    }
  }

  if(!qualityEligible){
    return candidateDisposition(
      candidate,
      candidateRow,
      candidateMobile,
      denseCandidate,
      denseRow,
      denseMobile,
      'REDESIGN',
      false,
      false,
      candidateMobile.qualification==='QUALIFIED',
      false,
      reasons,
      policy.targetDeviceClass,
    );
  }

  const mobileQualified=candidateMobile.qualification==='QUALIFIED';
  if(!mobileQualified){
    reasons.push('REAL_MOBILE_QUALIFICATION_REJECTED');
    return candidateDisposition(
      candidate,
      candidateRow,
      candidateMobile,
      denseCandidate,
      denseRow,
      denseMobile,
      'REDESIGN',
      false,
      true,
      false,
      false,
      reasons,
      policy.targetDeviceClass,
    );
  }

  let efficiencyEligible=true;
  if(
    improvementBps(
      denseRow.warmLatencyUs,
      candidateRow.warmLatencyUs,
    )<policy.minWarmLatencyImprovementBps
  ){
    efficiencyEligible=false;
    reasons.push('WARM_LATENCY_IMPROVEMENT_INSUFFICIENT');
  }
  if(
    improvementBps(
      totalBytes(denseRow),
      totalBytes(candidateRow),
    )<policy.minTotalBytesMovedImprovementBps
  ){
    efficiencyEligible=false;
    reasons.push('TOTAL_BYTES_MOVED_IMPROVEMENT_INSUFFICIENT');
  }
  if(
    improvementBps(
      denseCandidate.representationBytes,
      candidate.representationBytes,
    )<policy.minInstalledBytesImprovementBps
  ){
    efficiencyEligible=false;
    reasons.push('INSTALLED_BYTES_IMPROVEMENT_INSUFFICIENT');
  }
  if(
    improvementBps(
      denseRow.activeRepresentationBytes,
      candidateRow.activeRepresentationBytes,
    )<policy.minActiveRepresentationBytesImprovementBps
  ){
    efficiencyEligible=false;
    reasons.push('ACTIVE_BYTES_IMPROVEMENT_INSUFFICIENT');
  }
  if(
    regressionBps(
      denseRow.peakHostMemoryBytes,
      candidateRow.peakHostMemoryBytes,
    )>policy.maxPeakHostMemoryRegressionBps
  ){
    efficiencyEligible=false;
    reasons.push('PEAK_HOST_MEMORY_REGRESSION_EXCEEDED');
  }
  if(
    regressionBps(
      denseRow.peakAcceleratorMemoryBytes,
      candidateRow.peakAcceleratorMemoryBytes,
    )>policy.maxPeakAcceleratorMemoryRegressionBps
  ){
    efficiencyEligible=false;
    reasons.push('PEAK_ACCELERATOR_MEMORY_REGRESSION_EXCEEDED');
  }
  if(
    regressionBps(
      denseMobile.energyMicroJoulesPerRun,
      candidateMobile.energyMicroJoulesPerRun,
    )>policy.maxEnergyRegressionBps
  ){
    efficiencyEligible=false;
    reasons.push('ENERGY_REGRESSION_EXCEEDED');
  }
  if(
    regressionBps(
      denseMobile.batteryDrainBps,
      candidateMobile.batteryDrainBps,
    )>policy.maxBatteryDrainRegressionBps
  ){
    efficiencyEligible=false;
    reasons.push('BATTERY_DRAIN_REGRESSION_EXCEEDED');
  }
  if(
    thermalRank(candidateMobile.thermalPeakState)
      -thermalRank(denseMobile.thermalPeakState)
      >policy.maxThermalRegressionSteps
  ){
    efficiencyEligible=false;
    reasons.push('THERMAL_REGRESSION_EXCEEDED');
  }
  if(
    candidateMobile.throttledRunCount-denseMobile.throttledRunCount
      >policy.maxThrottledRunRegressionCount
  ){
    efficiencyEligible=false;
    reasons.push('THROTTLED_RUN_REGRESSION_EXCEEDED');
  }

  return candidateDisposition(
    candidate,
    candidateRow,
    candidateMobile,
    denseCandidate,
    denseRow,
    denseMobile,
    efficiencyEligible?'ADVANCE':'REDESIGN',
    false,
    true,
    true,
    efficiencyEligible,
    reasons,
    policy.targetDeviceClass,
  );
}

export function rollupHsmeFinalHardwareArchitectureDispositionV1(
  candidates:readonly HsmeFinalHardwareCandidateDispositionV1[],
):'ADVANCE'|'REDESIGN'|'REJECT'{
  if(candidates.length<1){
    fail(
      'hsme_final_hardware_rollup_empty',
      'at least one HSME candidate disposition is required',
    );
  }
  if(candidates.some(value=>value.disposition==='ADVANCE')){
    return 'ADVANCE';
  }
  if(candidates.every(value=>value.disposition==='REJECT')){
    return 'REJECT';
  }
  return 'REDESIGN';
}

export async function decideHsmeFinalHardwareDispositionV1(
  denseFinalization:HsmeDenseBaselineFinalizationV1,
  expectedDenseFinalizationSha256:string,
  roster:HsmeHardwareRepresentationQualificationRosterV1,
  expectedRosterSha256:string,
  matrix:HsmeHardwarePlacementMatrixV1,
  expectedMatrixSha256:string,
  realMobile:HsmeRealMobileQualificationV1,
  expectedRealMobileSha256:string,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  origin:HsmeFinalHardwareDispositionOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeFinalHardwareDispositionV1>{
  if(!readyDenseFinalization(denseFinalization)){
    return blocked(['FINAL_HARDWARE_DENSE_BASELINE_FINALIZATION_REQUIRED']);
  }
  if(!readyRoster(roster)){
    return blocked(['FINAL_HARDWARE_REPRESENTATION_ROSTER_REQUIRED']);
  }
  if(!readyMatrix(matrix)){
    return blocked(['FINAL_HARDWARE_PLACEMENT_MATRIX_REQUIRED']);
  }
  if(!readyRealMobile(realMobile)){
    return blocked(['FINAL_HARDWARE_REAL_MOBILE_QUALIFICATION_REQUIRED']);
  }

  let denseSha:string;
  let rosterSha:string;
  let matrixSha:string;
  let realMobileSha:string;
  try{
    denseSha=await hsmeDenseBaselineFinalizationV1Digest(
      denseFinalization,
      hash,
    );
    rosterSha=
      await hsmeHardwareRepresentationQualificationRosterV1Digest(
        roster,
        hash,
      );
    matrixSha=await hsmeHardwarePlacementMatrixV1Digest(
      matrix,
      hash,
    );
    realMobileSha=await hsmeRealMobileQualificationV1Digest(
      realMobile,
      hash,
    );
  }catch{
    return invalid(['FINAL_HARDWARE_INPUT_REHASH_INVALID']);
  }

  const common={
    denseBaselineFinalizationSha256:denseSha,
    hardwareRepresentationRosterSha256:rosterSha,
    hardwarePlacementMatrixSha256:matrixSha,
    realMobileQualificationSha256:realMobileSha,
  };

  if(
    !exactDigest(
      expectedDenseFinalizationSha256,
      denseSha,
      denseFinalization.finalizationEvidenceSha256,
    )
    ||!exactDigest(
      expectedRosterSha256,
      rosterSha,
      roster.rosterEvidenceSha256 as string,
    )
    ||!exactDigest(
      expectedMatrixSha256,
      matrixSha,
      matrix.matrixEvidenceSha256 as string,
    )
    ||!exactDigest(
      expectedRealMobileSha256,
      realMobileSha,
      realMobile.qualificationEvidenceSha256 as string,
    )
  ){
    return invalid(['FINAL_HARDWARE_INPUT_DIGEST_MISMATCH'],common);
  }

  if(!await verify(
    ()=>origin.verifyDenseBaselineFinalization(
      denseFinalization,
      denseSha,
    ),
  )){
    return invalid(
      ['FINAL_HARDWARE_DENSE_BASELINE_ORIGIN_UNVERIFIED'],
      common,
    );
  }
  if(!await verify(
    ()=>origin.verifyHardwareRepresentationRoster(
      roster,
      rosterSha,
    ),
  )){
    return invalid(
      ['FINAL_HARDWARE_ROSTER_ORIGIN_UNVERIFIED'],
      common,
    );
  }
  if(!await verify(
    ()=>origin.verifyHardwarePlacementMatrix(
      matrix,
      matrixSha,
    ),
  )){
    return invalid(
      ['FINAL_HARDWARE_MATRIX_ORIGIN_UNVERIFIED'],
      common,
    );
  }
  if(!await verify(
    ()=>origin.verifyRealMobileQualification(
      realMobile,
      realMobileSha,
    ),
  )){
    return invalid(
      ['FINAL_HARDWARE_REAL_MOBILE_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  if(
    matrix.hardwareRepresentationRosterSha256!==rosterSha
    ||realMobile.hardwarePlacementMatrixSha256!==matrixSha
  ){
    return invalid(
      ['FINAL_HARDWARE_INPUT_CHAIN_BINDING_MISMATCH'],
      common,
    );
  }

  let policy:HsmeFinalHardwareDispositionPolicyV1;
  let policySha:string;
  try{
    policy=normalizeHsmeFinalHardwareDispositionPolicyV1(rawPolicy);
    policySha=await hsmeFinalHardwareDispositionPolicyV1Digest(
      policy,
      hash,
    );
  }catch{
    return invalid(['FINAL_HARDWARE_POLICY_INVALID'],common);
  }
  const bound={
    ...common,
    dispositionPolicySha256:policySha,
    denseControlCandidateId:policy.denseControlCandidateId,
    denseControlPlacement:policy.denseControlPlacement,
    targetDeviceClass:policy.targetDeviceClass,
  };

  if(!exactDigest(expectedPolicySha256,policySha,policySha)){
    return invalid(['FINAL_HARDWARE_POLICY_DIGEST_MISMATCH'],bound);
  }
  if(!await verify(
    ()=>origin.verifyFinalHardwareDispositionPolicy(
      policy,
      policySha,
    ),
  )){
    return invalid(['FINAL_HARDWARE_POLICY_ORIGIN_UNVERIFIED'],bound);
  }
  if(
    policy.denseBaselineFinalizationSha256!==denseSha
    ||policy.hardwareRepresentationRosterSha256!==rosterSha
    ||policy.hardwarePlacementMatrixSha256!==matrixSha
    ||policy.realMobileQualificationSha256!==realMobileSha
    ||!sameDimensions(policy.qualityFloors,matrix.qualityDimensions)
    ||!sameDimensions(
      policy.maxQualityRegressionVsDense,
      matrix.qualityDimensions,
    )
    ||!sameDimensions(
      policy.maxHardPreservationFailures,
      matrix.hardPreservationDimensions,
    )
  ){
    return invalid(['FINAL_HARDWARE_POLICY_BINDING_MISMATCH'],bound);
  }

  const baselinePin=denseFinalization.decisionCandidate?.baselinePin;
  if(baselinePin===undefined){
    return invalid(['FINAL_HARDWARE_DENSE_BASELINE_PIN_MISSING'],bound);
  }

  const denseCandidate=roster.candidates.find(
    value=>value.candidateId===policy.denseControlCandidateId,
  );
  if(
    denseCandidate===undefined
    ||denseCandidate.logicalModelFamily!==policy.denseLogicalModelFamily
    ||denseCandidate.sourceModelContentSha256!==baselinePin.contentSha256
  ){
    return invalid(['FINAL_HARDWARE_DENSE_LINEAGE_MISMATCH'],bound);
  }

  const denseRow=findMatrixRow(
    matrix,
    policy.denseControlCandidateId,
    policy.denseControlPlacement,
  );
  const denseMobile=findMobileRecord(
    realMobile,
    policy.denseControlCandidateId,
    policy.denseControlPlacement,
    policy.targetDeviceClass,
  );
  if(denseRow===null||denseMobile===null){
    return invalid(['FINAL_HARDWARE_DENSE_CONTROL_EVIDENCE_MISSING'],bound);
  }
  if(!absoluteDenseQualityPass(denseRow,policy)){
    return readyResult(
      'REDESIGN',
      ['DENSE_CONTROL_QUALITY_BASELINE_INVALID'],
      bound,
      [],
      hash,
    );
  }
  if(denseMobile.qualification!=='QUALIFIED'){
    return readyResult(
      'REDESIGN',
      ['DENSE_CONTROL_REAL_MOBILE_NOT_QUALIFIED'],
      bound,
      [],
      hash,
    );
  }

  const dispositions:HsmeFinalHardwareCandidateDispositionV1[]=[];
  for(const binding of policy.candidates){
    const candidate=roster.candidates.find(
      value=>value.candidateId===binding.candidateId,
    );
    if(
      candidate===undefined
      ||candidate.logicalModelFamily!==binding.expectedLogicalModelFamily
    ){
      return invalid(['FINAL_HARDWARE_CANDIDATE_ROSTER_BINDING_MISMATCH'],bound);
    }
    const row=findMatrixRow(
      matrix,
      binding.candidateId,
      binding.requestedPlacement,
    );
    const mobile=findMobileRecord(
      realMobile,
      binding.candidateId,
      binding.requestedPlacement,
      policy.targetDeviceClass,
    );
    if(row===null||mobile===null){
      return invalid(['FINAL_HARDWARE_CANDIDATE_EVIDENCE_MISSING'],bound);
    }
    dispositions.push(
      evaluateHsmeFinalHardwareCandidateV1(
        denseCandidate,
        candidate,
        denseRow,
        row,
        denseMobile,
        mobile,
        policy,
      ),
    );
  }

  dispositions.sort(
    (a,b)=>lexical(
      a.candidateId+'\0'+a.requestedPlacement,
      b.candidateId+'\0'+b.requestedPlacement,
    ),
  );

  return readyResult(
    rollupHsmeFinalHardwareArchitectureDispositionV1(dispositions),
    [],
    bound,
    dispositions,
    hash,
  );
}

export async function hsmeFinalHardwareDispositionV1Digest(
  value:HsmeFinalHardwareDispositionV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='FINAL_HARDWARE_DISPOSITION_READY'
    ||value.dispositionEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_final_hardware_digest_state',
      'only READY final hardware disposition is digestible',
    );
  }
  const {dispositionEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_FINAL_HARDWARE_DISPOSITION_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

async function readyResult(
  architectureDisposition:'ADVANCE'|'REDESIGN'|'REJECT',
  blockers:readonly string[],
  common:PartialOutput,
  candidateDispositions:readonly HsmeFinalHardwareCandidateDispositionV1[],
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeFinalHardwareDispositionV1>{
  const advancedCandidates=Object.freeze(
    candidateDispositions
      .filter(value=>value.disposition==='ADVANCE')
      .map(value=>value.candidateId),
  );
  const redesignedCandidates=Object.freeze(
    candidateDispositions
      .filter(value=>value.disposition==='REDESIGN')
      .map(value=>value.candidateId),
  );
  const rejectedCandidates=Object.freeze(
    candidateDispositions
      .filter(value=>value.disposition==='REJECT')
      .map(value=>value.candidateId),
  );

  const payload={
    schemaVersion:HSME_FINAL_HARDWARE_DISPOSITION_V1_SCHEMA,
    state:'FINAL_HARDWARE_DISPOSITION_READY' as const,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    architectureDisposition,
    denseBaselineFinalizationSha256:requiredDigest(
      common.denseBaselineFinalizationSha256,
      'denseBaselineFinalizationSha256',
    ),
    hardwareRepresentationRosterSha256:requiredDigest(
      common.hardwareRepresentationRosterSha256,
      'hardwareRepresentationRosterSha256',
    ),
    hardwarePlacementMatrixSha256:requiredDigest(
      common.hardwarePlacementMatrixSha256,
      'hardwarePlacementMatrixSha256',
    ),
    realMobileQualificationSha256:requiredDigest(
      common.realMobileQualificationSha256,
      'realMobileQualificationSha256',
    ),
    dispositionPolicySha256:requiredDigest(
      common.dispositionPolicySha256,
      'dispositionPolicySha256',
    ),
    denseControlCandidateId:requiredKnown(
      common.denseControlCandidateId,
      'denseControlCandidateId',
    ),
    denseControlPlacement:requiredPlacement(
      common.denseControlPlacement,
    ),
    targetDeviceClass:requiredKnown(
      common.targetDeviceClass,
      'targetDeviceClass',
    ),
    candidateDispositions:Object.freeze([...candidateDispositions]),
    advancedCandidates,
    redesignedCandidates,
    rejectedCandidates,
    ...authorityBoundary(),
  };
  const dispositionEvidenceSha256=await digest(
    HSME_FINAL_HARDWARE_DISPOSITION_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({
    ...payload,
    dispositionEvidenceSha256,
  });
}

function candidateDisposition(
  candidate:HsmeHardwareRepresentationCandidateV1,
  candidateRow:CoreHsmeHardwarePlacementMeasurementV1,
  candidateMobile:HsmeRealMobileQualificationRecordV1,
  denseCandidate:HsmeHardwareRepresentationCandidateV1,
  denseRow:CoreHsmeHardwarePlacementMeasurementV1,
  denseMobile:HsmeRealMobileQualificationRecordV1,
  disposition:'ADVANCE'|'REDESIGN'|'REJECT',
  hardRejected:boolean,
  qualityEligible:boolean,
  mobileQualified:boolean,
  efficiencyEligible:boolean,
  reasons:readonly string[],
  targetDeviceClass:string,
):HsmeFinalHardwareCandidateDispositionV1{
  return deepFreeze({
    candidateId:candidate.candidateId,
    requestedPlacement:candidateRow.requestedPlacement,
    targetDeviceClass,
    disposition,
    hardRejected,
    qualityEligible,
    mobileQualified,
    efficiencyEligible,
    reasons:Object.freeze([...new Set(reasons)].sort(lexical)),
    denseInstalledBytes:denseCandidate.representationBytes,
    candidateInstalledBytes:candidate.representationBytes,
    denseWarmLatencyUs:denseRow.warmLatencyUs,
    candidateWarmLatencyUs:candidateRow.warmLatencyUs,
    denseActiveRepresentationBytes:denseRow.activeRepresentationBytes,
    candidateActiveRepresentationBytes:
      candidateRow.activeRepresentationBytes,
    denseTotalBytesMoved:totalBytes(denseRow),
    candidateTotalBytesMoved:totalBytes(candidateRow),
    densePeakHostMemoryBytes:denseRow.peakHostMemoryBytes,
    candidatePeakHostMemoryBytes:candidateRow.peakHostMemoryBytes,
    densePeakAcceleratorMemoryBytes:denseRow.peakAcceleratorMemoryBytes,
    candidatePeakAcceleratorMemoryBytes:
      candidateRow.peakAcceleratorMemoryBytes,
    denseEnergyMicroJoulesPerRun:denseMobile.energyMicroJoulesPerRun,
    candidateEnergyMicroJoulesPerRun:
      candidateMobile.energyMicroJoulesPerRun,
    denseBatteryDrainBps:denseMobile.batteryDrainBps,
    candidateBatteryDrainBps:candidateMobile.batteryDrainBps,
    denseThermalPeakState:denseMobile.thermalPeakState,
    candidateThermalPeakState:candidateMobile.thermalPeakState,
    denseThrottledRunCount:denseMobile.throttledRunCount,
    candidateThrottledRunCount:candidateMobile.throttledRunCount,
  });
}

function absoluteDenseQualityPass(
  row:CoreHsmeHardwarePlacementMeasurementV1,
  policy:HsmeFinalHardwareDispositionPolicyV1,
):boolean{
  if(row.criticalFailureCount>policy.maxCriticalFailureCount)return false;
  for(const floor of policy.qualityFloors){
    if(quality(row,floor.dimension)<floor.minimumBps)return false;
  }
  for(const ceiling of policy.maxHardPreservationFailures){
    if(hardFailure(row,ceiling.dimension)>ceiling.maxFailureCount){
      return false;
    }
  }
  return true;
}

function findMatrixRow(
  matrix:HsmeHardwarePlacementMatrixV1,
  candidateId:string,
  placement:HsmeHardwareBackendV1,
):CoreHsmeHardwarePlacementMeasurementV1|null{
  return matrix.rows.find(
    value=>
      value.candidateId===candidateId
      &&value.requestedPlacement===placement,
  )??null;
}

function findMobileRecord(
  mobile:HsmeRealMobileQualificationV1,
  candidateId:string,
  placement:HsmeHardwareBackendV1,
  deviceClass:string,
):HsmeRealMobileQualificationRecordV1|null{
  return mobile.records.find(
    value=>
      value.candidateId===candidateId
      &&value.requestedPlacement===placement
      &&value.supportedDeviceClass===deviceClass,
  )??null;
}

function readyDenseFinalization(
  value:HsmeDenseBaselineFinalizationV1,
):boolean{
  return value.schemaVersion===HSME_DENSE_BASELINE_FINALIZATION_V1_SCHEMA
    &&value.state==='DENSE_BASELINE_PIN_CANDIDATE_READY_NOT_PERSISTED'
    &&value.disposition==='ADVANCE'
    &&value.blockers.length===0
    &&value.decisionCandidate!==null
    &&value.decisionCandidate.baselinePin!==undefined
    &&value.modelInstallAllowed===false
    &&value.modelFleetPromotionAllowed===false
    &&value.durableModelFleetPromotionAllowed===false
    &&value.productionAuthorityGranted===false;
}

function readyRoster(
  value:HsmeHardwareRepresentationQualificationRosterV1,
):boolean{
  return value.schemaVersion===
      HSME_HARDWARE_REPRESENTATION_QUALIFICATION_ROSTER_V1_SCHEMA
    &&value.state===
      'HARDWARE_REPRESENTATION_ROSTER_FROZEN_NOT_EXECUTED'
    &&value.blockers.length===0
    &&value.rosterEvidenceSha256!=='UNKNOWN'
    &&value.candidates.length>=2
    &&value.modelInstallAllowed===false
    &&value.durableModelFleetPromotionAllowed===false;
}

function readyMatrix(
  value:HsmeHardwarePlacementMatrixV1,
):boolean{
  return value.schemaVersion===HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA
    &&value.state==='HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED'
    &&value.blockers.length===0
    &&value.matrixEvidenceSha256!=='UNKNOWN'
    &&value.rows.length>=2
    &&value.modelInstallAllowed===false
    &&value.durableModelFleetPromotionAllowed===false;
}

function readyRealMobile(
  value:HsmeRealMobileQualificationV1,
):boolean{
  return value.schemaVersion===HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA
    &&value.state==='REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED'
    &&value.blockers.length===0
    &&value.qualificationEvidenceSha256!=='UNKNOWN'
    &&value.records.length>=1
    &&value.mobileBackendAdmissionAllowed===false
    &&value.modelInstallAllowed===false
    &&value.durableModelFleetPromotionAllowed===false;
}

function normalizeCandidateBindings(
  raw:unknown,
):HsmeFinalHardwareCandidateBindingV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>12){
    fail(
      'hsme_final_hardware_policy_candidate',
      'policy.candidates cardinality must be 1..12',
    );
  }
  const values=raw.map((value,index)=>{
    const r=exactRecord(
      value,
      ['candidateId','requestedPlacement','expectedLogicalModelFamily'],
      'policy.candidates['+index+']',
    );
    return deepFreeze({
      candidateId:identifier(
        r.candidateId,
        'policy.candidates['+index+'].candidateId',
        160,
      ),
      requestedPlacement:enumValue(
        r.requestedPlacement,
        ['CPU','GPU','NPU'] as const,
        'policy.candidates['+index+'].requestedPlacement',
      ),
      expectedLogicalModelFamily:identifier(
        r.expectedLogicalModelFamily,
        'policy.candidates['+index+'].expectedLogicalModelFamily',
        160,
      ),
    });
  }).sort(
    (a,b)=>lexical(
      a.candidateId+'\0'+a.requestedPlacement,
      b.candidateId+'\0'+b.requestedPlacement,
    ),
  );
  const keys=values.map(
    value=>value.candidateId+'\0'+value.requestedPlacement,
  );
  if(new Set(keys).size!==keys.length){
    fail(
      'hsme_final_hardware_policy_candidate',
      'policy candidate bindings must be unique',
    );
  }
  return values;
}

function normalizeQualityFloors(
  raw:unknown,
):HsmeFinalHardwareQualityFloorV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_final_hardware_policy_quality',
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
      minimumBps:bps(
        r.minimumBps,
        'policy.qualityFloors['+index+'].minimumBps',
      ),
    });
  }).sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(values,'policy.qualityFloors');
  return values;
}

function normalizeQualityRegressions(
  raw:unknown,
):HsmeFinalHardwareQualityRegressionV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_final_hardware_policy_quality',
      'maxQualityRegressionVsDense cardinality invalid',
    );
  }
  const values=raw.map((value,index)=>{
    const r=exactRecord(
      value,
      ['dimension','maxRegressionBps'],
      'policy.maxQualityRegressionVsDense['+index+']',
    );
    return deepFreeze({
      dimension:identifier(
        r.dimension,
        'policy.maxQualityRegressionVsDense['+index+'].dimension',
        100,
      ),
      maxRegressionBps:bps(
        r.maxRegressionBps,
        'policy.maxQualityRegressionVsDense['+index+'].maxRegressionBps',
      ),
    });
  }).sort((a,b)=>lexical(a.dimension,b.dimension));
  assertUniqueDimensions(values,'policy.maxQualityRegressionVsDense');
  return values;
}

function normalizePreservationCeilings(
  raw:unknown,
):HsmeFinalHardwarePreservationCeilingV1[]{
  if(!Array.isArray(raw)||raw.length<1||raw.length>32){
    fail(
      'hsme_final_hardware_policy_preservation',
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

function quality(
  row:CoreHsmeHardwarePlacementMeasurementV1,
  dimension:string,
):number{
  const value=row.qualityVector.find(
    item=>item.dimension===dimension,
  );
  if(value===undefined){
    fail(
      'hsme_final_hardware_quality_dimension',
      'quality dimension missing: '+dimension,
    );
  }
  return value.valueBps;
}

function hardFailure(
  row:CoreHsmeHardwarePlacementMeasurementV1,
  dimension:string,
):number{
  const value=row.hardPreservationFailureCounts.find(
    item=>item.dimension===dimension,
  );
  if(value===undefined){
    fail(
      'hsme_final_hardware_hard_dimension',
      'hard preservation dimension missing: '+dimension,
    );
  }
  return value.failureCount;
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
  if(new Set(values.map(value=>value.dimension)).size!==values.length){
    fail(
      'hsme_final_hardware_policy_dimension',
      path+' contains duplicates',
    );
  }
}

function totalBytes(
  row:CoreHsmeHardwarePlacementMeasurementV1,
):number{
  return checkedAdd(
    checkedAdd(row.flashBytesMoved,row.ramBytesMoved),
    row.acceleratorBytesMoved,
  );
}

function improvementBps(
  baseline:number,
  candidate:number,
):number{
  if(baseline<=0||candidate>=baseline)return 0;
  return Math.floor(((baseline-candidate)/baseline)*10_000);
}

function regressionBps(
  baseline:number,
  candidate:number,
):number{
  if(candidate<=baseline)return 0;
  if(baseline<=0)return 10_000;
  return Math.floor(((candidate-baseline)/baseline)*10_000);
}

function thermalRank(value:string):number{
  const index=(HSME_REAL_MOBILE_THERMAL_STATES_V1 as readonly string[])
    .indexOf(value);
  if(index<0){
    fail(
      'hsme_final_hardware_thermal_state',
      'unsupported thermal state',
    );
  }
  return index;
}

function checkedAdd(a:number,b:number):number{
  const value=a+b;
  if(!Number.isSafeInteger(value)||value<0){
    fail(
      'hsme_final_hardware_value',
      'resource sum overflowed safe integer range',
    );
  }
  return value;
}

type PartialOutput=Partial<Pick<
  HsmeFinalHardwareDispositionV1,
  'denseBaselineFinalizationSha256'
  |'hardwareRepresentationRosterSha256'
  |'hardwarePlacementMatrixSha256'
  |'realMobileQualificationSha256'
  |'dispositionPolicySha256'
  |'denseControlCandidateId'
  |'denseControlPlacement'
  |'targetDeviceClass'
>>;

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeFinalHardwareDispositionV1{
  return terminal(
    'FINAL_HARDWARE_DISPOSITION_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeFinalHardwareDispositionV1{
  return terminal(
    'FINAL_HARDWARE_DISPOSITION_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'FINAL_HARDWARE_DISPOSITION_INVALID'
    |'FINAL_HARDWARE_DISPOSITION_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeFinalHardwareDispositionV1{
  return deepFreeze({
    schemaVersion:HSME_FINAL_HARDWARE_DISPOSITION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    architectureDisposition:'NONE',
    denseBaselineFinalizationSha256:
      values.denseBaselineFinalizationSha256??'UNKNOWN',
    hardwareRepresentationRosterSha256:
      values.hardwareRepresentationRosterSha256??'UNKNOWN',
    hardwarePlacementMatrixSha256:
      values.hardwarePlacementMatrixSha256??'UNKNOWN',
    realMobileQualificationSha256:
      values.realMobileQualificationSha256??'UNKNOWN',
    dispositionPolicySha256:
      values.dispositionPolicySha256??'UNKNOWN',
    denseControlCandidateId:
      values.denseControlCandidateId??'UNKNOWN',
    denseControlPlacement:
      values.denseControlPlacement??'UNKNOWN',
    targetDeviceClass:
      values.targetDeviceClass??'UNKNOWN',
    candidateDispositions:Object.freeze([]),
    advancedCandidates:Object.freeze([]),
    redesignedCandidates:Object.freeze([]),
    rejectedCandidates:Object.freeze([]),
    dispositionEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    productionAdmissionAllowed:false as const,
    candidateSelectionAllowed:false as const,
    benchmarkExecutionAllowed:false as const,
    representationMutationAllowed:false as const,
    inferenceExecutionAllowed:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    productionAuthorityGranted:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    fashionGeometryAuthorityGranted:false as const,
    artifactAuthorityGranted:false as const,
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
        'hsme_final_hardware_authority',
        path+'.'+field+' must remain false',
      );
    }
  }
}

function requiredDigest(
  value:string|undefined,
  path:string,
):string{
  if(value===undefined||!HEX64.test(value)){
    fail(
      'hsme_final_hardware_binding',
      path+' must be a known SHA-256 digest',
    );
  }
  return value;
}

function requiredKnown(
  value:string|undefined,
  path:string,
):string{
  if(value===undefined||value==='UNKNOWN'){
    fail(
      'hsme_final_hardware_binding',
      path+' must be known',
    );
  }
  return value;
}

function requiredPlacement(
  value:HsmeHardwareBackendV1|'UNKNOWN'|undefined,
):HsmeHardwareBackendV1{
  if(value==='CPU'||value==='GPU'||value==='NPU')return value;
  fail(
    'hsme_final_hardware_binding',
    'denseControlPlacement must be known',
  );
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
      'hsme_final_hardware_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_final_hardware_schema',
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
      'hsme_final_hardware_schema',
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
      'hsme_final_hardware_value',
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
      'hsme_final_hardware_value',
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
      'hsme_final_hardware_value',
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
      'hsme_final_hardware_value',
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
      'hsme_final_hardware_value',
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
      'hsme_final_hardware_value',
      path+' must be a bounded safe integer',
    );
  }
  return raw as number;
}

function bps(raw:unknown,path:string):number{
  return safeInteger(raw,path,0,10_000);
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  const result=await hash.sha256(
    new TextEncoder().encode(
      domain+JSON.stringify(value),
    ),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_final_hardware_hash',
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
  throw new HsmeFinalHardwareDispositionV1Error(
    code,
    message,
  );
}
