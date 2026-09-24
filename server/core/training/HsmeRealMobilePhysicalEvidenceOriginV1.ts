import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
  hsmeHardwarePlacementMatrixV1Digest,
  type CoreHsmeHardwarePlacementMeasurementV1,
  type HsmeHardwarePlacementMatrixV1,
} from './HsmeHardwarePlacementMatrixV1.ts';
import {
  HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA,
  hsmeRealMobileDeviceEvidenceSetV1Digest,
  normalizeHsmeRealMobileDeviceEvidenceSetV1,
  type HsmeRealMobileEvidenceOriginVerifierV1,
  type HsmeRealMobileDeviceEvidenceSetV1,
  type HsmeRealMobileMatrixOriginVerifierV1,
} from './HsmeRealMobileQualificationV1.ts';
import {
  HSME_FOUNDATION_PHYSICAL_MOBILE_DEVICE_SNAPSHOT_DIGEST_DOMAIN,
  assessHsmeFoundationPhysicalMobileValidationEvidenceV1,
  type HsmeFoundationPhysicalMobileRunTrustPortV1,
  type HsmeFoundationPhysicalMobileValidationBundleV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalMobileValidationEvidenceV1.ts';
import {
  hsmeNativeMobileEnergyThermalEvidenceV1Digest,
  type HsmeNativeMobileEnergyThermalEvidenceRecordV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeNativeMobileEnergyThermalEvidenceV1.ts';
import type {
  HsmeDenseBaselineHashPortV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeDenseBaselineEvidenceV1.ts';

export const HSME_REAL_MOBILE_PHYSICAL_ORIGIN_ASSEMBLY_V1_SCHEMA =
  'BERS_HSME_REAL_MOBILE_PHYSICAL_ORIGIN_ASSEMBLY_V1' as const;
export const HSME_REAL_MOBILE_PHYSICAL_ORIGIN_BINDING_DIGEST_DOMAIN =
  'bers:hsme:real-mobile-physical-origin-binding:v1\0' as const;
export const HSME_REAL_MOBILE_HARDWARE_RUNTIME_IDENTITY_DIGEST_DOMAIN =
  'bers:hsme:hardware-runtime-identity:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;

export interface HsmeNativeMobileEnergyThermalOriginVerifierV1{
  verifyNativeMobileEnergyThermalEvidence(
    record:HsmeNativeMobileEnergyThermalEvidenceRecordV1,
    expectedEvidenceSha256:string,
  ):Promise<boolean>;
}

export type HsmeRealMobilePhysicalOriginAssemblyV1=Readonly<{
  schemaVersion:
    typeof HSME_REAL_MOBILE_PHYSICAL_ORIGIN_ASSEMBLY_V1_SCHEMA;
  state:
    |'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID'
    |'REAL_MOBILE_PHYSICAL_ORIGIN_BLOCKED'
    |'REAL_MOBILE_PHYSICAL_ORIGIN_READY';
  blockers:readonly string[];
  hardwarePlacementMatrixSha256:string|'UNKNOWN';
  physicalRunPayloadSha256:string|'UNKNOWN';
  nativeTelemetryEvidenceSha256:string|'UNKNOWN';
  realMobileEvidenceSetSha256:string|'UNKNOWN';
  physicalOriginBindingSha256:string|'UNKNOWN';
  evidenceSet:HsmeRealMobileDeviceEvidenceSetV1|null;
  physicalDeviceAttestationSemantic:
    'FOUNDATION_VERIFIED_PHYSICAL_RUN_PAYLOAD_SHA256';
  productionAuthorityGranted:false;
  modelInstallAllowed:false;
  modelFleetPromotionAllowed:false;
  durableModelFleetPromotionAllowed:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  fashionGeometryAuthorityGranted:false;
  artifactAuthorityGranted:false;
  aeeExecutionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmePreparedRealMobilePhysicalOriginV1=Readonly<{
  assembly:HsmeRealMobilePhysicalOriginAssemblyV1;
  evidenceOrigin:HsmeRealMobileEvidenceOriginVerifierV1;
}>;

export class HsmeRealMobilePhysicalEvidenceOriginV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeRealMobilePhysicalEvidenceOriginV1Error';
    this.code=code;
  }
}

export async function prepareHsmeRealMobilePhysicalEvidenceOriginV1(
  matrix:HsmeHardwarePlacementMatrixV1,
  expectedMatrixSha256:string,
  matrixOrigin:HsmeRealMobileMatrixOriginVerifierV1,
  candidateId:string,
  requestedPlacement:'CPU'|'GPU'|'NPU',
  physicalBundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  physicalTrust:HsmeFoundationPhysicalMobileRunTrustPortV1,
  expectedTestedCommitSha:string,
  nowMs:number,
  telemetryRecord:HsmeNativeMobileEnergyThermalEvidenceRecordV1,
  expectedTelemetrySha256:string,
  telemetryOrigin:HsmeNativeMobileEnergyThermalOriginVerifierV1,
  hash:HsmeDenseBaselineHashPortV1,
):Promise<HsmePreparedRealMobilePhysicalOriginV1>{
  if(
    matrix.schemaVersion!==HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA
    ||matrix.state!=='HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED'
    ||matrix.matrixEvidenceSha256==='UNKNOWN'
  ){
    return blocked(['REAL_MOBILE_PHYSICAL_READY_MATRIX_REQUIRED']);
  }

  let matrixSha256:string;
  try{
    matrixSha256=await hsmeHardwarePlacementMatrixV1Digest(matrix,hash);
  }catch{
    return invalid(['REAL_MOBILE_PHYSICAL_MATRIX_REHASH_INVALID']);
  }

  const common={hardwarePlacementMatrixSha256:matrixSha256};
  if(
    !exactDigest(
      expectedMatrixSha256,
      matrixSha256,
      matrix.matrixEvidenceSha256 as string,
    )
  ){
    return invalid(
      ['REAL_MOBILE_PHYSICAL_MATRIX_REHASH_MISMATCH'],
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
      ['REAL_MOBILE_PHYSICAL_MATRIX_ORIGIN_UNVERIFIED'],
      common,
    );
  }

  const rows=matrix.rows.filter(
    row=>
      row.candidateId===candidateId
      &&row.requestedPlacement===requestedPlacement,
  );
  if(rows.length!==1){
    return invalid(
      [
        rows.length===0
          ?'REAL_MOBILE_PHYSICAL_PLACEMENT_ROW_MISSING'
          :'REAL_MOBILE_PHYSICAL_PLACEMENT_ROW_DUPLICATE',
      ],
      common,
    );
  }
  const row=rows[0];

  const physical=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    physicalBundle,
    physicalTrust,
    expectedTestedCommitSha,
    nowMs,
    hash,
  );
  if(
    physical.integrityState!=='EVIDENCE_INTEGRITY_VERIFIED'
    ||physical.physicalRunPayloadSha256===null
  ){
    return invalid(
      ['REAL_MOBILE_PHYSICAL_FOUNDATION_INTEGRITY_INVALID'],
      common,
    );
  }
  if(physical.physicalState==='REAL_DEVICE_ATTESTATION_REQUIRED'){
    return blocked(
      ['REAL_MOBILE_PHYSICAL_FOUNDATION_ATTESTATION_REQUIRED'],
      {
        ...common,
        physicalRunPayloadSha256:physical.physicalRunPayloadSha256,
      },
    );
  }
  if(physical.physicalState!=='REAL_DEVICE_EVIDENCE_VERIFIED'){
    return invalid(
      ['REAL_MOBILE_PHYSICAL_FOUNDATION_ORIGIN_INVALID'],
      {
        ...common,
        physicalRunPayloadSha256:physical.physicalRunPayloadSha256,
      },
    );
  }

  let telemetrySha256:string;
  try{
    telemetrySha256=
      await hsmeNativeMobileEnergyThermalEvidenceV1Digest(
        telemetryRecord.evidence,
        hash,
      );
  }catch{
    return invalid(
      ['REAL_MOBILE_PHYSICAL_NATIVE_TELEMETRY_INVALID'],
      {
        ...common,
        physicalRunPayloadSha256:physical.physicalRunPayloadSha256,
      },
    );
  }
  const withTelemetry={
    ...common,
    physicalRunPayloadSha256:physical.physicalRunPayloadSha256,
    nativeTelemetryEvidenceSha256:telemetrySha256,
  };
  if(
    !exactDigest(
      expectedTelemetrySha256,
      telemetrySha256,
      telemetryRecord.evidenceSha256,
    )
  ){
    return invalid(
      ['REAL_MOBILE_PHYSICAL_NATIVE_TELEMETRY_REHASH_MISMATCH'],
      withTelemetry,
    );
  }
  if(!await verify(
    ()=>telemetryOrigin.verifyNativeMobileEnergyThermalEvidence(
      telemetryRecord,
      telemetrySha256,
    ),
  )){
    return invalid(
      ['REAL_MOBILE_PHYSICAL_NATIVE_TELEMETRY_ORIGIN_UNVERIFIED'],
      withTelemetry,
    );
  }

  const expectedHardwareRuntimeIdentitySha256=await digest(
    HSME_REAL_MOBILE_HARDWARE_RUNTIME_IDENTITY_DIGEST_DOMAIN,
    row.runtimeIdentity,
    hash,
  );

  const bindingBlockers=validateSamePhysicalSession(
    row,
    physicalBundle,
    telemetryRecord,
    expectedHardwareRuntimeIdentitySha256,
  );
  if(bindingBlockers.length>0){
    return invalid(bindingBlockers,withTelemetry);
  }

  const deviceHardwareProfileSha256=await digest(
    HSME_FOUNDATION_PHYSICAL_MOBILE_DEVICE_SNAPSHOT_DIGEST_DOMAIN,
    physicalBundle.deviceSnapshot,
    hash,
  );

  const t=telemetryRecord.evidence;
  const platformFamily=t.platform==='IOS'?'APPLE' as const:'ANDROID' as const;

  const evidenceSet=normalizeHsmeRealMobileDeviceEvidenceSetV1({
    schemaVersion:HSME_REAL_MOBILE_DEVICE_EVIDENCE_SET_V1_SCHEMA,
    hardwarePlacementMatrixSha256:matrixSha256,
    records:[
      {
        hardwarePlacementMatrixSha256:matrixSha256,
        candidateId:row.candidateId,
        fleetModelId:row.fleetModelId,
        fleetVersion:row.fleetVersion,
        representationContentSha256:row.representationContentSha256,
        requestedPlacement:row.requestedPlacement,
        placementMeasurementEvidenceSha256:
          row.measurementEvidenceSha256,
        platformFamily,
        deviceClass:'MOBILE',
        supportedDeviceClass:row.supportedDeviceClass,
        physicalDeviceAttestationSha256:
          physical.physicalRunPayloadSha256,
        deviceHardwareProfileSha256,
        osBuildSha256:t.osBuildSha256,
        runtimeBuildSha256:t.runtimeBuildSha256,
        repeatedRunCount:t.repeatedRunCount,
        repeatedWarmLatencyP50Us:t.repeatedWarmLatencyP50Us,
        repeatedWarmLatencyP95Us:t.repeatedWarmLatencyP95Us,
        peakHostMemoryBytes:t.peakHostMemoryBytes,
        peakAcceleratorMemoryBytes:t.peakAcceleratorMemoryBytes,
        flashBytesMoved:t.flashBytesMoved,
        ramBytesMoved:t.ramBytesMoved,
        acceleratorBytesMoved:t.acceleratorBytesMoved,
        energyMicroJoulesPerRun:t.energyMicroJoulesPerRun,
        batteryStartBps:t.batteryStartBps,
        batteryEndBps:t.batteryEndBps,
        powerSource:'BATTERY',
        thermalStartState:t.thermalStartState,
        thermalPeakState:t.thermalPeakState,
        thermalEndState:t.thermalEndState,
        throttledRunCount:t.throttledRunCount,
        networkBytesDuringExecution:0,
        measurementMethodSha256:t.measurementMethodSha256,
        batteryMeasurementEvidenceSha256:
          t.batteryMeasurementEvidenceSha256,
        thermalMeasurementEvidenceSha256:
          t.thermalMeasurementEvidenceSha256,
        realPhysicalMobileDeviceMeasurement:true,
      },
    ],
    realPhysicalMobileDeviceEvidence:true,
    ...authorityBoundary(),
  });

  const evidenceSetSha256=
    await hsmeRealMobileDeviceEvidenceSetV1Digest(
      evidenceSet,
      hash,
    );

  const physicalOriginBindingSha256=await digest(
    HSME_REAL_MOBILE_PHYSICAL_ORIGIN_BINDING_DIGEST_DOMAIN,
    {
      hardwarePlacementMatrixSha256:matrixSha256,
      candidateId:row.candidateId,
      requestedPlacement:row.requestedPlacement,
      placementMeasurementEvidenceSha256:
        row.measurementEvidenceSha256,
      representationContentSha256:row.representationContentSha256,
      physicalRunPayloadSha256:physical.physicalRunPayloadSha256,
      deviceRunSessionSha256:physicalBundle.deviceRunSessionSha256,
      nativeTelemetryEvidenceSha256:telemetrySha256,
      nativeTelemetryAttestationSha256:
        t.nativeTelemetryAttestationSha256,
      expectedHardwareRuntimeIdentitySha256,
      deviceCapabilityKey:t.deviceCapabilityKey,
      supportedDeviceClass:t.supportedDeviceClass,
      realMobileEvidenceSetSha256:evidenceSetSha256,
      physicalDeviceAttestationSemantic:
        'FOUNDATION_VERIFIED_PHYSICAL_RUN_PAYLOAD_SHA256',
    },
    hash,
  );

  const assembly:HsmeRealMobilePhysicalOriginAssemblyV1=deepFreeze({
    schemaVersion:HSME_REAL_MOBILE_PHYSICAL_ORIGIN_ASSEMBLY_V1_SCHEMA,
    state:'REAL_MOBILE_PHYSICAL_ORIGIN_READY',
    blockers:Object.freeze([]),
    hardwarePlacementMatrixSha256:matrixSha256,
    physicalRunPayloadSha256:physical.physicalRunPayloadSha256,
    nativeTelemetryEvidenceSha256:telemetrySha256,
    realMobileEvidenceSetSha256:evidenceSetSha256,
    physicalOriginBindingSha256,
    evidenceSet,
    physicalDeviceAttestationSemantic:
      'FOUNDATION_VERIFIED_PHYSICAL_RUN_PAYLOAD_SHA256',
    ...assemblyAuthorityBoundary(),
  });

  const canonicalEvidenceSet=JSON.stringify(evidenceSet);
  const evidenceOrigin:HsmeRealMobileEvidenceOriginVerifierV1=
    Object.freeze({
      async verifyRealMobileDeviceEvidenceSet(
        candidateSet,
        expectedEvidenceSetSha256,
      ){
        try{
          const normalized=normalizeHsmeRealMobileDeviceEvidenceSetV1(
            candidateSet,
          );
          const digestValue=
            await hsmeRealMobileDeviceEvidenceSetV1Digest(
              normalized,
              hash,
            );
          return expectedEvidenceSetSha256===evidenceSetSha256
            &&digestValue===evidenceSetSha256
            &&JSON.stringify(normalized)===canonicalEvidenceSet;
        }catch{
          return false;
        }
      },
    });

  return deepFreeze({
    assembly,
    evidenceOrigin,
  });
}

function validateSamePhysicalSession(
  row:CoreHsmeHardwarePlacementMeasurementV1,
  bundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  telemetryRecord:HsmeNativeMobileEnergyThermalEvidenceRecordV1,
  expectedHardwareRuntimeIdentitySha256:string,
):string[]{
  const blockers:string[]=[];
  const t=telemetryRecord.evidence;
  const raw=bundle.measuredCapture.rawCapture;
  const profile=bundle.deviceSnapshot.profile;
  const ledger=bundle.sourceEvidenceLedger;
  const first=ledger[0]?.evidence;

  if(first===undefined){
    blockers.push('REAL_MOBILE_PHYSICAL_FOUNDATION_SOURCE_LEDGER_MISSING');
    return blockers;
  }

  if(bundle.deviceRunSessionSha256!==t.deviceRunSessionSha256){
    blockers.push('REAL_MOBILE_PHYSICAL_DEVICE_RUN_SESSION_MISMATCH');
  }
  if(first.sessionIdentitySha256!==t.sessionIdentitySha256){
    blockers.push('REAL_MOBILE_PHYSICAL_NATIVE_SESSION_IDENTITY_MISMATCH');
  }
  if(first.processIdentitySha256!==t.processIdentitySha256){
    blockers.push('REAL_MOBILE_PHYSICAL_NATIVE_PROCESS_IDENTITY_MISMATCH');
  }
  if(first.runtimeIdentitySha256!==t.runtimeIdentitySha256){
    blockers.push('REAL_MOBILE_PHYSICAL_NATIVE_RUNTIME_IDENTITY_MISMATCH');
  }
  if(t.runtimeIdentitySha256!==expectedHardwareRuntimeIdentitySha256){
    blockers.push('REAL_MOBILE_PHYSICAL_HARDWARE_RUNTIME_IDENTITY_MISMATCH');
  }
  if(first.adapterBuildSha256!==t.adapterBuildSha256){
    blockers.push('REAL_MOBILE_PHYSICAL_NATIVE_ADAPTER_BUILD_MISMATCH');
  }
  if(
    ledger.some(
      record=>
        record.evidence.sessionIdentitySha256!==t.sessionIdentitySha256
        ||record.evidence.processIdentitySha256!==t.processIdentitySha256
        ||record.evidence.runtimeIdentitySha256!==t.runtimeIdentitySha256,
    )
  ){
    blockers.push('REAL_MOBILE_PHYSICAL_FOUNDATION_LEDGER_IDENTITY_DRIFT');
  }

  const expectedPlatform=t.platform==='IOS'?'APPLE':'ANDROID';
  if(row.platformFamily!==expectedPlatform){
    blockers.push('REAL_MOBILE_PHYSICAL_PLATFORM_FAMILY_MISMATCH');
  }
  if(
    t.deviceCapabilityKey!==raw.deviceCapabilityKey
    ||t.supportedDeviceClass!==row.supportedDeviceClass
  ){
    blockers.push('REAL_MOBILE_PHYSICAL_DEVICE_CLASS_BINDING_MISMATCH');
  }
  if(
    profile.deviceClass!=='MOBILE'
    ||(
      t.platform==='ANDROID'
        ?profile.platform!=='ANDROID'
        :profile.platform!=='IOS'
    )
  ){
    blockers.push('REAL_MOBILE_PHYSICAL_DEVICE_PLATFORM_MISMATCH');
  }

  if(
    raw.modelId!==row.fleetModelId
    ||raw.modelVersion!==row.fleetVersion
    ||raw.manifestSha256!==row.representationContentSha256
  ){
    blockers.push('REAL_MOBILE_PHYSICAL_FLEET_REPRESENTATION_MISMATCH');
  }
  if(!providerCompatibleWithPlacement(
    raw.provider,
    row.platformFamily,
    row.requestedPlacement,
  )){
    blockers.push('REAL_MOBILE_PHYSICAL_RUNTIME_PROVIDER_MISMATCH');
  }
  if(
    t.actualPlacement!==row.requestedPlacement
    ||row.actualPlacement!==row.requestedPlacement
    ||row.runtimeFallbackUsed
  ){
    blockers.push('REAL_MOBILE_PHYSICAL_PLACEMENT_MISMATCH');
  }
  if(t.networkBytesDuringExecution!==0){
    blockers.push('REAL_MOBILE_PHYSICAL_NETWORK_BYTES_NONZERO');
  }
  if(
    t.capturedAtMicrosEnd<=t.capturedAtMicrosStart
    ||t.repeatedRunCount<1
  ){
    blockers.push('REAL_MOBILE_PHYSICAL_CAPTURE_WINDOW_INVALID');
  }

  return [...new Set(blockers)].sort(lexical);
}

type PartialAssembly=Partial<Pick<
  HsmeRealMobilePhysicalOriginAssemblyV1,
  'hardwarePlacementMatrixSha256'
  |'physicalRunPayloadSha256'
  |'nativeTelemetryEvidenceSha256'
  |'realMobileEvidenceSetSha256'
  |'physicalOriginBindingSha256'
>>;

function invalid(
  blockers:readonly string[],
  values:PartialAssembly={},
):HsmePreparedRealMobilePhysicalOriginV1{
  return terminal(
    'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID',
    blockers,
    values,
  );
}

function blocked(
  blockers:readonly string[],
  values:PartialAssembly={},
):HsmePreparedRealMobilePhysicalOriginV1{
  return terminal(
    'REAL_MOBILE_PHYSICAL_ORIGIN_BLOCKED',
    blockers,
    values,
  );
}

function terminal(
  state:
    |'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID'
    |'REAL_MOBILE_PHYSICAL_ORIGIN_BLOCKED',
  blockers:readonly string[],
  values:PartialAssembly,
):HsmePreparedRealMobilePhysicalOriginV1{
  const assembly=deepFreeze({
    schemaVersion:HSME_REAL_MOBILE_PHYSICAL_ORIGIN_ASSEMBLY_V1_SCHEMA,
    state,
    blockers:Object.freeze([...new Set(blockers)].sort(lexical)),
    hardwarePlacementMatrixSha256:
      values.hardwarePlacementMatrixSha256??'UNKNOWN',
    physicalRunPayloadSha256:
      values.physicalRunPayloadSha256??'UNKNOWN',
    nativeTelemetryEvidenceSha256:
      values.nativeTelemetryEvidenceSha256??'UNKNOWN',
    realMobileEvidenceSetSha256:
      values.realMobileEvidenceSetSha256??'UNKNOWN',
    physicalOriginBindingSha256:
      values.physicalOriginBindingSha256??'UNKNOWN',
    evidenceSet:null,
    physicalDeviceAttestationSemantic:
      'FOUNDATION_VERIFIED_PHYSICAL_RUN_PAYLOAD_SHA256' as const,
    ...assemblyAuthorityBoundary(),
  });
  const evidenceOrigin:HsmeRealMobileEvidenceOriginVerifierV1=
    Object.freeze({
      async verifyRealMobileDeviceEvidenceSet(){
        return false;
      },
    });
  return deepFreeze({
    assembly,
    evidenceOrigin,
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

function assemblyAuthorityBoundary(){
  return Object.freeze({
    productionAuthorityGranted:false as const,
    modelInstallAllowed:false as const,
    modelFleetPromotionAllowed:false as const,
    durableModelFleetPromotionAllowed:false as const,
    providerAuthorityGranted:false as const,
    billingAuthorityGranted:false as const,
    projectArtifactMutationAllowed:false as const,
    fashionGeometryAuthorityGranted:false as const,
    artifactAuthorityGranted:false as const,
    aeeExecutionAuthorityGranted:false as const,
    winnerSelectionAllowed:false as const,
  });
}

function providerCompatibleWithPlacement(
  provider:string,
  platformFamily:'APPLE'|'ANDROID',
  placement:'CPU'|'GPU'|'NPU',
):boolean{
  if(placement==='CPU'){
    return provider==='cpu'||provider==='wasm';
  }
  if(placement==='GPU'){
    return provider==='webgpu'
      ||provider==='cuda'
      ||provider==='dml'
      ||(platformFamily==='APPLE'&&provider==='coreml');
  }
  return platformFamily==='APPLE'
    ?provider==='coreml'
    :provider==='nnapi';
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
    throw new HsmeRealMobilePhysicalEvidenceOriginV1Error(
      'hsme_real_mobile_physical_hash',
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
