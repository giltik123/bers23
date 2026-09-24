import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
  hsmeHardwarePlacementMatrixV1Digest,
  type CoreHsmeHardwarePlacementMeasurementV1,
  type HsmeHardwarePlacementMatrixV1,
} from './HsmeHardwarePlacementMatrixV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA =
  'BERS_HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1' as const;
export const HSME_REAL_MOBILE_QUALIFICATION_POLICY_DIGEST_DOMAIN =
  'bers:hsme:real-mobile-qualification-policy:v1\0' as const;
export const HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA =
  'BERS_HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1' as const;
export const HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_DIGEST_DOMAIN =
  'bers:hsme:real-mobile-device-evidence-set:v1\0' as const;
export const HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA =
  'BERS_HSME_REAL_MOBILE_QUALIFICATION_V1' as const;
export const HSME_REAL_MOBILE_QUALIFICATION_DIGEST_DOMAIN =
  'bers:hsme:real-mobile-qualification:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const IDENTIFIER=/^[A-Za-z0-9][A-Za-z0-9._:@/+\-]*$/;
const VERSION=/^[A-Za-z0-9][A-Za-z0-9._+\-]*$/;

export const HSME_REAL_MOBILE_THERMAL_STATES_V1=Object.freeze([
  'NORMAL',
  'ELEVATED',
  'HIGH',
  'CRITICAL',
] as const);

export type HsmeRealMobileThermalStateV1=
  typeof HSME_REAL_MOBILE_THERMAL_STATES_V1[number];

export type HsmeRealMobileQualificationPolicyV1=Readonly<{
  schemaVersion:typeof HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA;
  hardwarePlacementMatrixSha256:string;
  minRepeatedRunCount:number;
  maxWarmLatencyRegressionBps:number;
  maxBatteryDrainBps:number;
  maxEnergyMicroJoulesPerRun:number;
  maxPeakThermalState:'NORMAL'|'ELEVATED'|'HIGH';
  maxThrottledRunCount:number;
  maxPeakHostMemoryRegressionBps:number;
  maxPeakAcceleratorMemoryRegressionBps:number;
  requireBatteryPower:true;
  networkAllowed:false;
  reviewState:'REAL_MOBILE_QUALIFICATION_POLICY_REVIEWED';
  selectionAllowed:false;
  mobileBackendAdmissionAllowed:false;
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

export type HsmeRealMobileDeviceEvidenceV1=Readonly<{
  hardwarePlacementMatrixSha256:string;
  candidateId:string;
  fleetModelId:string;
  fleetVersion:string;
  representationContentSha256:string;
  requestedPlacement:'CPU'|'GPU'|'NPU';
  placementMeasurementEvidenceSha256:string;
  platformFamily:'APPLE'|'ANDROID';
  deviceClass:'MOBILE';
  supportedDeviceClass:string;
  physicalDeviceAttestationSha256:string;
  deviceHardwareProfileSha256:string;
  osBuildSha256:string;
  runtimeBuildSha256:string;
  repeatedRunCount:number;
  repeatedWarmLatencyP50Us:number;
  repeatedWarmLatencyP95Us:number;
  peakHostMemoryBytes:number;
  peakAcceleratorMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  energyMicroJoulesPerRun:number;
  batteryStartBps:number;
  batteryEndBps:number;
  powerSource:'BATTERY';
  thermalStartState:HsmeRealMobileThermalStateV1;
  thermalPeakState:HsmeRealMobileThermalStateV1;
  thermalEndState:HsmeRealMobileThermalStateV1;
  throttledRunCount:number;
  networkBytesDuringExecution:0;
  measurementMethodSha256:string;
  batteryMeasurementEvidenceSha256:string;
  thermalMeasurementEvidenceSha256:string;
  realPhysicalMobileDeviceMeasurement:true;
}>;

export type HsmeRealMobileDeviceEvidenceSetV1=Readonly<{
  schemaVersion:typeof HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA;
  hardwarePlacementMatrixSha256:string;
  records:readonly HsmeRealMobileDeviceEvidenceV1[];
  realPhysicalMobileDeviceEvidence:true;
  selectionAllowed:false;
  mobileBackendAdmissionAllowed:false;
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

export interface HsmeRealMobileMatrixOriginVerifierV1{
  verifyHardwarePlacementMatrix(
    matrix:HsmeHardwarePlacementMatrixV1,
    expectedMatrixSha256:string,
  ):Promise<boolean>;
}

export interface HsmeRealMobilePolicyOriginVerifierV1{
  verifyRealMobileQualificationPolicy(
    policy:HsmeRealMobileQualificationPolicyV1,
    expectedPolicySha256:string,
  ):Promise<boolean>;
}

export interface HsmeRealMobileEvidenceOriginVerifierV1{
  verifyRealMobileDeviceEvidenceSet(
    evidenceSet:HsmeRealMobileDeviceEvidenceSetV1,
    expectedEvidenceSetSha256:string,
  ):Promise<boolean>;
}

export type HsmeRealMobileQualificationRecordV1=Readonly<{
  candidateId:string;
  requestedPlacement:'CPU'|'GPU'|'NPU';
  supportedDeviceClass:string;
  platformFamily:'APPLE'|'ANDROID';
  qualification:'QUALIFIED'|'REJECTED';
  reasons:readonly string[];
  repeatedRunCount:number;
  repeatedWarmLatencyP50Us:number;
  repeatedWarmLatencyP95Us:number;
  energyMicroJoulesPerRun:number;
  batteryDrainBps:number;
  thermalPeakState:HsmeRealMobileThermalStateV1;
  throttledRunCount:number;
  peakHostMemoryBytes:number;
  peakAcceleratorMemoryBytes:number;
  flashBytesMoved:number;
  ramBytesMoved:number;
  acceleratorBytesMoved:number;
  physicalDeviceAttestationSha256:string;
  deviceHardwareProfileSha256:string;
  measurementMethodSha256:string;
  batteryMeasurementEvidenceSha256:string;
  thermalMeasurementEvidenceSha256:string;
}>;

export type HsmeRealMobileQualificationV1=Readonly<{
  schemaVersion:typeof HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA;
  state:
    |'REAL_MOBILE_QUALIFICATION_INVALID'
    |'REAL_MOBILE_QUALIFICATION_BLOCKED'
    |'REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED';
  blockers:readonly string[];
  hardwarePlacementMatrixSha256:string|'UNKNOWN';
  qualificationPolicySha256:string|'UNKNOWN';
  realMobileEvidenceSetSha256:string|'UNKNOWN';
  records:readonly HsmeRealMobileQualificationRecordV1[];
  qualifiedDeviceClasses:readonly string[];
  rejectedDeviceClasses:readonly string[];
  qualificationEvidenceSha256:string|'UNKNOWN';
  selectionAllowed:false;
  mobileBackendAdmissionAllowed:false;
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

export class HsmeRealMobileQualificationV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeRealMobileQualificationV1Error';
    this.code=code;
  }
}

export function normalizeHsmeRealMobileQualificationPolicyV1(
  raw:unknown,
):HsmeRealMobileQualificationPolicyV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'hardwarePlacementMatrixSha256',
    'minRepeatedRunCount',
    'maxWarmLatencyRegressionBps',
    'maxBatteryDrainBps',
    'maxEnergyMicroJoulesPerRun',
    'maxPeakThermalState',
    'maxThrottledRunCount',
    'maxPeakHostMemoryRegressionBps',
    'maxPeakAcceleratorMemoryRegressionBps',
    'requireBatteryPower',
    'networkAllowed',
    'reviewState',
    'selectionAllowed',
    'mobileBackendAdmissionAllowed',
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

  if(r.schemaVersion!==HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA){
    fail(
      'hsme_real_mobile_policy_schema',
      'real mobile qualification policy schema unsupported',
    );
  }
  if(r.reviewState!=='REAL_MOBILE_QUALIFICATION_POLICY_REVIEWED'){
    fail(
      'hsme_real_mobile_policy_review',
      'real mobile qualification policy review state invalid',
    );
  }
  if(
    r.requireBatteryPower!==true
    ||r.networkAllowed!==false
  ){
    fail(
      'hsme_real_mobile_policy_boundary',
      'battery/network boundary invalid',
    );
  }
  assertNoAuthority(r,'policy');

  return deepFreeze({
    schemaVersion:HSME_REAL_MOBILE_QUALIFICATION_POLICY_V1_SCHEMA,
    hardwarePlacementMatrixSha256:sha256(
      r.hardwarePlacementMatrixSha256,
      'policy.hardwarePlacementMatrixSha256',
    ),
    minRepeatedRunCount:safeInteger(
      r.minRepeatedRunCount,
      'policy.minRepeatedRunCount',
      1,
      1_000_000,
    ),
    maxWarmLatencyRegressionBps:safeInteger(
      r.maxWarmLatencyRegressionBps,
      'policy.maxWarmLatencyRegressionBps',
      0,
      10_000,
    ),
    maxBatteryDrainBps:safeInteger(
      r.maxBatteryDrainBps,
      'policy.maxBatteryDrainBps',
      0,
      10_000,
    ),
    maxEnergyMicroJoulesPerRun:safeInteger(
      r.maxEnergyMicroJoulesPerRun,
      'policy.maxEnergyMicroJoulesPerRun',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxPeakThermalState:enumValue(
      r.maxPeakThermalState,
      ['NORMAL','ELEVATED','HIGH'] as const,
      'policy.maxPeakThermalState',
    ),
    maxThrottledRunCount:safeInteger(
      r.maxThrottledRunCount,
      'policy.maxThrottledRunCount',
      0,
      1_000_000,
    ),
    maxPeakHostMemoryRegressionBps:safeInteger(
      r.maxPeakHostMemoryRegressionBps,
      'policy.maxPeakHostMemoryRegressionBps',
      0,
      10_000,
    ),
    maxPeakAcceleratorMemoryRegressionBps:safeInteger(
      r.maxPeakAcceleratorMemoryRegressionBps,
      'policy.maxPeakAcceleratorMemoryRegressionBps',
      0,
      10_000,
    ),
    requireBatteryPower:true,
    networkAllowed:false,
    reviewState:'REAL_MOBILE_QUALIFICATION_POLICY_REVIEWED',
    ...authorityBoundary(),
  });
}

export async function hsmeRealMobileQualificationPolicyV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_REAL_MOBILE_QUALIFICATION_POLICY_DIGEST_DOMAIN,
    normalizeHsmeRealMobileQualificationPolicyV1(raw),
    hash,
  );
}

export function normalizeHsmeRealMobileDeviceEvidenceSetV1(
  raw:unknown,
):HsmeRealMobileDeviceEvidenceSetV1{
  const r=exactRecord(raw,[
    'schemaVersion',
    'hardwarePlacementMatrixSha256',
    'records',
    'realPhysicalMobileDeviceEvidence',
    'selectionAllowed',
    'mobileBackendAdmissionAllowed',
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
  ],'evidenceSet');

  if(r.schemaVersion!==HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA){
    fail(
      'hsme_real_mobile_evidence_schema',
      'real mobile evidence set schema unsupported',
    );
  }
  if(r.realPhysicalMobileDeviceEvidence!==true){
    fail(
      'hsme_real_mobile_evidence_real_device',
      'realPhysicalMobileDeviceEvidence must be true',
    );
  }
  assertNoAuthority(r,'evidenceSet');

  if(
    !Array.isArray(r.records)
    ||r.records.length<1
    ||r.records.length>32
  ){
    fail(
      'hsme_real_mobile_evidence_records',
      'real mobile evidence record cardinality must be 1..32',
    );
  }

  const records=r.records.map((value,index)=>
    normalizeEvidenceRecord(
      value,
      'evidenceSet.records['+index+']',
    )
  ).sort(compareEvidenceRecords);

  const keys=records.map(value=>
    recordKey(
      value.candidateId,
      value.requestedPlacement,
      value.supportedDeviceClass,
    )
  );
  if(new Set(keys).size!==keys.length){
    fail(
      'hsme_real_mobile_evidence_duplicate',
      'candidate/placement/device-class evidence must be unique',
    );
  }

  const matrixSha256=sha256(
    r.hardwarePlacementMatrixSha256,
    'evidenceSet.hardwarePlacementMatrixSha256',
  );
  if(
    records.some(
      value=>value.hardwarePlacementMatrixSha256!==matrixSha256,
    )
  ){
    fail(
      'hsme_real_mobile_evidence_matrix_binding',
      'every evidence record must bind the set matrix digest',
    );
  }

  return deepFreeze({
    schemaVersion:HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA,
    hardwarePlacementMatrixSha256:matrixSha256,
    records:Object.freeze(records),
    realPhysicalMobileDeviceEvidence:true,
    ...authorityBoundary(),
  });
}

export async function hsmeRealMobileDeviceEvidenceSetV1Digest(
  raw:unknown,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  return digest(
    HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_DIGEST_DOMAIN,
    normalizeHsmeRealMobileDeviceEvidenceSetV1(raw),
    hash,
  );
}

export function evaluateHsmeRealMobileRecordV1(
  evidence:HsmeRealMobileDeviceEvidenceV1,
  placementRow:CoreHsmeHardwarePlacementMeasurementV1,
  policy:HsmeRealMobileQualificationPolicyV1,
):HsmeRealMobileQualificationRecordV1{
  const reasons:string[]=[];

  if(evidence.repeatedRunCount<policy.minRepeatedRunCount){
    reasons.push('REPEATED_RUN_COUNT_INSUFFICIENT');
  }
  if(
    regressionBps(
      placementRow.warmLatencyUs,
      evidence.repeatedWarmLatencyP95Us,
    )>policy.maxWarmLatencyRegressionBps
  ){
    reasons.push('WARM_LATENCY_REGRESSION_EXCEEDED');
  }

  const batteryDrainBps=evidence.batteryStartBps-evidence.batteryEndBps;
  if(batteryDrainBps>policy.maxBatteryDrainBps){
    reasons.push('BATTERY_DRAIN_EXCEEDED');
  }
  if(
    evidence.energyMicroJoulesPerRun>
      policy.maxEnergyMicroJoulesPerRun
  ){
    reasons.push('ENERGY_PER_RUN_EXCEEDED');
  }

  if(evidence.thermalPeakState==='CRITICAL'){
    reasons.push('CRITICAL_THERMAL_STATE');
  }else if(
    thermalRank(evidence.thermalPeakState)>
      thermalRank(policy.maxPeakThermalState)
  ){
    reasons.push('THERMAL_STATE_EXCEEDED');
  }

  if(
    evidence.throttledRunCount>policy.maxThrottledRunCount
  ){
    reasons.push('THROTTLED_RUN_COUNT_EXCEEDED');
  }
  if(
    regressionBps(
      placementRow.peakHostMemoryBytes,
      evidence.peakHostMemoryBytes,
    )>policy.maxPeakHostMemoryRegressionBps
  ){
    reasons.push('PEAK_HOST_MEMORY_REGRESSION_EXCEEDED');
  }
  if(
    regressionBps(
      placementRow.peakAcceleratorMemoryBytes,
      evidence.peakAcceleratorMemoryBytes,
    )>policy.maxPeakAcceleratorMemoryRegressionBps
  ){
    reasons.push('PEAK_ACCELERATOR_MEMORY_REGRESSION_EXCEEDED');
  }

  return deepFreeze({
    candidateId:evidence.candidateId,
    requestedPlacement:evidence.requestedPlacement,
    supportedDeviceClass:evidence.supportedDeviceClass,
    platformFamily:evidence.platformFamily,
    qualification:reasons.length===0?'QUALIFIED':'REJECTED',
    reasons:Object.freeze([...new Set(reasons)].sort(lexical)),
    repeatedRunCount:evidence.repeatedRunCount,
    repeatedWarmLatencyP50Us:evidence.repeatedWarmLatencyP50Us,
    repeatedWarmLatencyP95Us:evidence.repeatedWarmLatencyP95Us,
    energyMicroJoulesPerRun:evidence.energyMicroJoulesPerRun,
    batteryDrainBps,
    thermalPeakState:evidence.thermalPeakState,
    throttledRunCount:evidence.throttledRunCount,
    peakHostMemoryBytes:evidence.peakHostMemoryBytes,
    peakAcceleratorMemoryBytes:evidence.peakAcceleratorMemoryBytes,
    flashBytesMoved:evidence.flashBytesMoved,
    ramBytesMoved:evidence.ramBytesMoved,
    acceleratorBytesMoved:evidence.acceleratorBytesMoved,
    physicalDeviceAttestationSha256:
      evidence.physicalDeviceAttestationSha256,
    deviceHardwareProfileSha256:
      evidence.deviceHardwareProfileSha256,
    measurementMethodSha256:evidence.measurementMethodSha256,
    batteryMeasurementEvidenceSha256:
      evidence.batteryMeasurementEvidenceSha256,
    thermalMeasurementEvidenceSha256:
      evidence.thermalMeasurementEvidenceSha256,
  });
}

export async function qualifyHsmeRealMobileEvidenceV1(
  matrix:HsmeHardwarePlacementMatrixV1,
  expectedMatrixSha256:string,
  matrixOrigin:HsmeRealMobileMatrixOriginVerifierV1,
  rawPolicy:unknown,
  expectedPolicySha256:string,
  policyOrigin:HsmeRealMobilePolicyOriginVerifierV1,
  rawEvidenceSet:unknown,
  expectedEvidenceSetSha256:string,
  evidenceOrigin:HsmeRealMobileEvidenceOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmeRealMobileQualificationV1>{
  if(!readyMatrix(matrix)){
    return blocked([
      'REAL_MOBILE_READY_PLACEMENT_MATRIX_REQUIRED',
    ]);
  }

  let matrixSha256:string;
  try{
    matrixSha256=await hsmeHardwarePlacementMatrixV1Digest(
      matrix,
      hash,
    );
  }catch{
    return invalid([
      'REAL_MOBILE_MATRIX_REHASH_INVALID',
    ]);
  }
  const common={
    hardwarePlacementMatrixSha256:matrixSha256,
  };

  if(
    !exactDigest(
      expectedMatrixSha256,
      matrixSha256,
      matrix.matrixEvidenceSha256 as string,
    )
  ){
    return invalid(
      ['REAL_MOBILE_MATRIX_REHASH_MISMATCH'],
      common,
    );
  }
  if(!await verify(
    ()=>matrixOrigin.verifyHardwarePlacementMatrix(
      matrix,
      matrixSha256,
    ),
  )){
    return invalid(
      ['REAL_MOBILE_MATRIX_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  let policy:HsmeRealMobileQualificationPolicyV1;
  let policySha256:string;
  try{
    policy=normalizeHsmeRealMobileQualificationPolicyV1(rawPolicy);
    policySha256=await hsmeRealMobileQualificationPolicyV1Digest(
      policy,
      hash,
    );
  }catch{
    return invalid(
      ['REAL_MOBILE_QUALIFICATION_POLICY_INVALID'],
      common,
    );
  }
  const bound={
    ...common,
    qualificationPolicySha256:policySha256,
  };

  if(
    !exactDigest(
      expectedPolicySha256,
      policySha256,
      policySha256,
    )
  ){
    return invalid(
      ['REAL_MOBILE_QUALIFICATION_POLICY_DIGEST_MISMATCH'],
      bound,
    );
  }
  if(!await verify(
    ()=>policyOrigin.verifyRealMobileQualificationPolicy(
      policy,
      policySha256,
    ),
  )){
    return invalid(
      ['REAL_MOBILE_QUALIFICATION_POLICY_ORIGIN_UNVERIFIED'],
      bound,
    );
  }
  if(policy.hardwarePlacementMatrixSha256!==matrixSha256){
    return invalid(
      ['REAL_MOBILE_QUALIFICATION_POLICY_BINDING_MISMATCH'],
      bound,
    );
  }

  if(rawEvidenceSet===null||rawEvidenceSet===undefined){
    return blocked(
      ['REAL_MOBILE_DEVICE_EVIDENCE_REQUIRED'],
      bound,
    );
  }

  let evidenceSet:HsmeRealMobileDeviceEvidenceSetV1;
  let evidenceSetSha256:string;
  try{
    evidenceSet=normalizeHsmeRealMobileDeviceEvidenceSetV1(
      rawEvidenceSet,
    );
    evidenceSetSha256=
      await hsmeRealMobileDeviceEvidenceSetV1Digest(
        evidenceSet,
        hash,
      );
  }catch{
    return invalid(
      ['REAL_MOBILE_DEVICE_EVIDENCE_INVALID'],
      bound,
    );
  }

  const evidenceBound={
    ...bound,
    realMobileEvidenceSetSha256:evidenceSetSha256,
  };
  if(
    !exactDigest(
      expectedEvidenceSetSha256,
      evidenceSetSha256,
      evidenceSetSha256,
    )
  ){
    return invalid(
      ['REAL_MOBILE_DEVICE_EVIDENCE_DIGEST_MISMATCH'],
      evidenceBound,
    );
  }
  if(!await verify(
    ()=>evidenceOrigin.verifyRealMobileDeviceEvidenceSet(
      evidenceSet,
      evidenceSetSha256,
    ),
  )){
    return invalid(
      ['REAL_MOBILE_DEVICE_EVIDENCE_ORIGIN_UNVERIFIED'],
      evidenceBound,
    );
  }
  if(evidenceSet.hardwarePlacementMatrixSha256!==matrixSha256){
    return invalid(
      ['REAL_MOBILE_DEVICE_EVIDENCE_MATRIX_BINDING_MISMATCH'],
      evidenceBound,
    );
  }

  const qualifiedRecords:HsmeRealMobileQualificationRecordV1[]=[];
  for(const evidence of evidenceSet.records){
    const row=matrix.rows.find(
      value=>
        value.candidateId===evidence.candidateId
        &&value.requestedPlacement===evidence.requestedPlacement,
    );
    if(row===undefined){
      return invalid(
        ['REAL_MOBILE_PLACEMENT_ROW_MISSING'],
        evidenceBound,
      );
    }
    if(!evidenceBindsPlacement(evidence,row,matrixSha256)){
      return invalid(
        ['REAL_MOBILE_PLACEMENT_BINDING_MISMATCH'],
        evidenceBound,
      );
    }
    qualifiedRecords.push(
      evaluateHsmeRealMobileRecordV1(
        evidence,
        row,
        policy,
      ),
    );
  }

  qualifiedRecords.sort(compareQualificationRecords);

  const qualifiedDeviceClasses=Object.freeze(
    [...new Set(
      qualifiedRecords
        .filter(value=>value.qualification==='QUALIFIED')
        .map(value=>value.supportedDeviceClass),
    )].sort(lexical),
  );
  const rejectedDeviceClasses=Object.freeze(
    [...new Set(
      qualifiedRecords
        .filter(value=>value.qualification==='REJECTED')
        .map(value=>value.supportedDeviceClass),
    )].sort(lexical),
  );

  const payload={
    schemaVersion:HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA,
    state:'REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED' as const,
    blockers:Object.freeze([] as string[]),
    hardwarePlacementMatrixSha256:matrixSha256,
    qualificationPolicySha256:policySha256,
    realMobileEvidenceSetSha256:evidenceSetSha256,
    records:Object.freeze(qualifiedRecords),
    qualifiedDeviceClasses,
    rejectedDeviceClasses,
    ...authorityBoundary(),
  };
  const qualificationEvidenceSha256=await digest(
    HSME_REAL_MOBILE_QUALIFICATION_DIGEST_DOMAIN,
    payload,
    hash,
  );
  return deepFreeze({
    ...payload,
    qualificationEvidenceSha256,
  });
}

export async function hsmeRealMobileQualificationV1Digest(
  value:HsmeRealMobileQualificationV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<string>{
  if(
    value.state!=='REAL_MOBILE_QUALIFICATION_READY_NOT_ADMITTED'
    ||value.qualificationEvidenceSha256==='UNKNOWN'
  ){
    fail(
      'hsme_real_mobile_qualification_digest_state',
      'only READY_NOT_ADMITTED qualification is digestible',
    );
  }
  const {qualificationEvidenceSha256:_ignored,...payload}=value;
  return digest(
    HSME_REAL_MOBILE_QUALIFICATION_DIGEST_DOMAIN,
    payload,
    hash,
  );
}

function normalizeEvidenceRecord(
  raw:unknown,
  path:string,
):HsmeRealMobileDeviceEvidenceV1{
  const r=exactRecord(raw,[
    'hardwarePlacementMatrixSha256',
    'candidateId',
    'fleetModelId',
    'fleetVersion',
    'representationContentSha256',
    'requestedPlacement',
    'placementMeasurementEvidenceSha256',
    'platformFamily',
    'deviceClass',
    'supportedDeviceClass',
    'physicalDeviceAttestationSha256',
    'deviceHardwareProfileSha256',
    'osBuildSha256',
    'runtimeBuildSha256',
    'repeatedRunCount',
    'repeatedWarmLatencyP50Us',
    'repeatedWarmLatencyP95Us',
    'peakHostMemoryBytes',
    'peakAcceleratorMemoryBytes',
    'flashBytesMoved',
    'ramBytesMoved',
    'acceleratorBytesMoved',
    'energyMicroJoulesPerRun',
    'batteryStartBps',
    'batteryEndBps',
    'powerSource',
    'thermalStartState',
    'thermalPeakState',
    'thermalEndState',
    'throttledRunCount',
    'networkBytesDuringExecution',
    'measurementMethodSha256',
    'batteryMeasurementEvidenceSha256',
    'thermalMeasurementEvidenceSha256',
    'realPhysicalMobileDeviceMeasurement',
  ],path);

  if(
    r.deviceClass!=='MOBILE'
    ||r.powerSource!=='BATTERY'
    ||r.networkBytesDuringExecution!==0
    ||r.realPhysicalMobileDeviceMeasurement!==true
  ){
    fail(
      'hsme_real_mobile_evidence_boundary',
      path+' must be physical MOBILE BATTERY local evidence',
    );
  }

  const repeatedRunCount=safeInteger(
    r.repeatedRunCount,
    path+'.repeatedRunCount',
    1,
    1_000_000,
  );
  const p50=safeInteger(
    r.repeatedWarmLatencyP50Us,
    path+'.repeatedWarmLatencyP50Us',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  const p95=safeInteger(
    r.repeatedWarmLatencyP95Us,
    path+'.repeatedWarmLatencyP95Us',
    1,
    Number.MAX_SAFE_INTEGER,
  );
  if(p95<p50){
    fail(
      'hsme_real_mobile_evidence_latency',
      path+' p95 warm latency must be >= p50',
    );
  }

  const batteryStartBps=safeInteger(
    r.batteryStartBps,
    path+'.batteryStartBps',
    0,
    10_000,
  );
  const batteryEndBps=safeInteger(
    r.batteryEndBps,
    path+'.batteryEndBps',
    0,
    10_000,
  );
  if(batteryEndBps>batteryStartBps){
    fail(
      'hsme_real_mobile_evidence_battery',
      path+' battery cannot increase under BATTERY measurement',
    );
  }

  const throttledRunCount=safeInteger(
    r.throttledRunCount,
    path+'.throttledRunCount',
    0,
    1_000_000,
  );
  if(throttledRunCount>repeatedRunCount){
    fail(
      'hsme_real_mobile_evidence_throttle',
      path+' throttledRunCount cannot exceed repeatedRunCount',
    );
  }

  return deepFreeze({
    hardwarePlacementMatrixSha256:sha256(
      r.hardwarePlacementMatrixSha256,
      path+'.hardwarePlacementMatrixSha256',
    ),
    candidateId:identifier(
      r.candidateId,
      path+'.candidateId',
      160,
    ),
    fleetModelId:identifier(
      r.fleetModelId,
      path+'.fleetModelId',
      160,
    ),
    fleetVersion:version(
      r.fleetVersion,
      path+'.fleetVersion',
      100,
    ),
    representationContentSha256:sha256(
      r.representationContentSha256,
      path+'.representationContentSha256',
    ),
    requestedPlacement:enumValue(
      r.requestedPlacement,
      ['CPU','GPU','NPU'] as const,
      path+'.requestedPlacement',
    ),
    placementMeasurementEvidenceSha256:sha256(
      r.placementMeasurementEvidenceSha256,
      path+'.placementMeasurementEvidenceSha256',
    ),
    platformFamily:enumValue(
      r.platformFamily,
      ['APPLE','ANDROID'] as const,
      path+'.platformFamily',
    ),
    deviceClass:'MOBILE',
    supportedDeviceClass:identifier(
      r.supportedDeviceClass,
      path+'.supportedDeviceClass',
      160,
    ),
    physicalDeviceAttestationSha256:sha256(
      r.physicalDeviceAttestationSha256,
      path+'.physicalDeviceAttestationSha256',
    ),
    deviceHardwareProfileSha256:sha256(
      r.deviceHardwareProfileSha256,
      path+'.deviceHardwareProfileSha256',
    ),
    osBuildSha256:sha256(
      r.osBuildSha256,
      path+'.osBuildSha256',
    ),
    runtimeBuildSha256:sha256(
      r.runtimeBuildSha256,
      path+'.runtimeBuildSha256',
    ),
    repeatedRunCount,
    repeatedWarmLatencyP50Us:p50,
    repeatedWarmLatencyP95Us:p95,
    peakHostMemoryBytes:safeInteger(
      r.peakHostMemoryBytes,
      path+'.peakHostMemoryBytes',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    peakAcceleratorMemoryBytes:safeInteger(
      r.peakAcceleratorMemoryBytes,
      path+'.peakAcceleratorMemoryBytes',
      0,
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
    energyMicroJoulesPerRun:safeInteger(
      r.energyMicroJoulesPerRun,
      path+'.energyMicroJoulesPerRun',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    batteryStartBps,
    batteryEndBps,
    powerSource:'BATTERY',
    thermalStartState:enumValue(
      r.thermalStartState,
      HSME_REAL_MOBILE_THERMAL_STATES_V1,
      path+'.thermalStartState',
    ),
    thermalPeakState:enumValue(
      r.thermalPeakState,
      HSME_REAL_MOBILE_THERMAL_STATES_V1,
      path+'.thermalPeakState',
    ),
    thermalEndState:enumValue(
      r.thermalEndState,
      HSME_REAL_MOBILE_THERMAL_STATES_V1,
      path+'.thermalEndState',
    ),
    throttledRunCount,
    networkBytesDuringExecution:0,
    measurementMethodSha256:sha256(
      r.measurementMethodSha256,
      path+'.measurementMethodSha256',
    ),
    batteryMeasurementEvidenceSha256:sha256(
      r.batteryMeasurementEvidenceSha256,
      path+'.batteryMeasurementEvidenceSha256',
    ),
    thermalMeasurementEvidenceSha256:sha256(
      r.thermalMeasurementEvidenceSha256,
      path+'.thermalMeasurementEvidenceSha256',
    ),
    realPhysicalMobileDeviceMeasurement:true,
  });
}

function evidenceBindsPlacement(
  evidence:HsmeRealMobileDeviceEvidenceV1,
  row:CoreHsmeHardwarePlacementMeasurementV1,
  matrixSha256:string,
):boolean{
  return evidence.hardwarePlacementMatrixSha256===matrixSha256
    &&evidence.candidateId===row.candidateId
    &&evidence.fleetModelId===row.fleetModelId
    &&evidence.fleetVersion===row.fleetVersion
    &&evidence.representationContentSha256===
      row.representationContentSha256
    &&evidence.requestedPlacement===row.requestedPlacement
    &&evidence.placementMeasurementEvidenceSha256===
      row.measurementEvidenceSha256
    &&evidence.platformFamily===row.platformFamily
    &&evidence.supportedDeviceClass===row.supportedDeviceClass;
}

function readyMatrix(
  matrix:HsmeHardwarePlacementMatrixV1,
):boolean{
  return matrix.schemaVersion===HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA
    &&matrix.state==='HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED'
    &&matrix.blockers.length===0
    &&matrix.matrixEvidenceSha256!=='UNKNOWN'
    &&matrix.rows.length>=2
    &&matrix.selectionAllowed===false
    &&matrix.benchmarkExecutionAllowed===false
    &&matrix.modelInstallAllowed===false
    &&matrix.durableModelFleetPromotionAllowed===false
    &&matrix.providerAuthorityGranted===false
    &&matrix.billingAuthorityGranted===false;
}

function compareEvidenceRecords(
  a:HsmeRealMobileDeviceEvidenceV1,
  b:HsmeRealMobileDeviceEvidenceV1,
):number{
  return lexical(
    recordKey(
      a.candidateId,
      a.requestedPlacement,
      a.supportedDeviceClass,
    ),
    recordKey(
      b.candidateId,
      b.requestedPlacement,
      b.supportedDeviceClass,
    ),
  );
}

function compareQualificationRecords(
  a:HsmeRealMobileQualificationRecordV1,
  b:HsmeRealMobileQualificationRecordV1,
):number{
  return lexical(
    recordKey(
      a.candidateId,
      a.requestedPlacement,
      a.supportedDeviceClass,
    ),
    recordKey(
      b.candidateId,
      b.requestedPlacement,
      b.supportedDeviceClass,
    ),
  );
}

function recordKey(
  candidateId:string,
  placement:string,
  deviceClass:string,
):string{
  return candidateId+'\0'+placement+'\0'+deviceClass;
}

function thermalRank(
  value:HsmeRealMobileThermalStateV1,
):number{
  return HSME_REAL_MOBILE_THERMAL_STATES_V1.indexOf(value);
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

type PartialOutput=Partial<Pick<
  HsmeRealMobileQualificationV1,
  'hardwarePlacementMatrixSha256'
  |'qualificationPolicySha256'
  |'realMobileEvidenceSetSha256'
>>;

function blocked(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeRealMobileQualificationV1{
  return terminal(
    'REAL_MOBILE_QUALIFICATION_BLOCKED',
    blockers,
    values,
  );
}

function invalid(
  blockers:readonly string[],
  values:PartialOutput={},
):HsmeRealMobileQualificationV1{
  return terminal(
    'REAL_MOBILE_QUALIFICATION_INVALID',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'REAL_MOBILE_QUALIFICATION_INVALID'
    |'REAL_MOBILE_QUALIFICATION_BLOCKED',
  blockers:readonly string[],
  values:PartialOutput,
):HsmeRealMobileQualificationV1{
  return deepFreeze({
    schemaVersion:HSME_REAL_MOBILE_QUALIFICATION_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    hardwarePlacementMatrixSha256:
      values.hardwarePlacementMatrixSha256??'UNKNOWN',
    qualificationPolicySha256:
      values.qualificationPolicySha256??'UNKNOWN',
    realMobileEvidenceSetSha256:
      values.realMobileEvidenceSetSha256??'UNKNOWN',
    records:Object.freeze([]),
    qualifiedDeviceClasses:Object.freeze([]),
    rejectedDeviceClasses:Object.freeze([]),
    qualificationEvidenceSha256:'UNKNOWN',
    ...authorityBoundary(),
  });
}

function authorityBoundary(){
  return Object.freeze({
    selectionAllowed:false as const,
    mobileBackendAdmissionAllowed:false as const,
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
        'hsme_real_mobile_authority',
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
  return HEX64.test(expected)
    &&expected===actual
    &&actual===embedded;
}

function exactRecord(
  raw:unknown,
  fields:readonly string[],
  path:string,
):Record<string,unknown>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw)){
    fail(
      'hsme_real_mobile_schema',
      path+' must be an object',
    );
  }
  const proto=Object.getPrototypeOf(raw);
  if(proto!==Object.prototype&&proto!==null){
    fail(
      'hsme_real_mobile_schema',
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
      'hsme_real_mobile_schema',
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
      'hsme_real_mobile_value',
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
      'hsme_real_mobile_value',
      path+' must be an identifier',
    );
  }
  return value;
}

function version(
  raw:unknown,
  path:string,
  max:number,
):string{
  const value=boundedString(raw,path,max);
  if(!VERSION.test(value)){
    fail(
      'hsme_real_mobile_value',
      path+' must be a version identifier',
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
      'hsme_real_mobile_value',
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
      'hsme_real_mobile_value',
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
      'hsme_real_mobile_value',
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
      'hsme_real_mobile_value',
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
    new TextEncoder().encode(
      domain+JSON.stringify(value),
    ),
  );
  if(!HEX64.test(result)){
    fail(
      'hsme_real_mobile_hash',
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
  throw new HsmeRealMobileQualificationV1Error(
    code,
    message,
  );
}
