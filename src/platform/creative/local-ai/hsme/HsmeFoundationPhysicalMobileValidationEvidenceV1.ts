import {deviceCapabilityKeyForBenchmarkEvidenceV1} from '../benchmark/BenchmarkEvidence';
import type {DeviceCapabilitySnapshot} from '../types';
import {
  verifyHsmeFoundationTargetDeviceMeasuredCaptureV1,
  type HsmeFoundationTargetDeviceMeasuredCaptureResultV1,
} from './HsmeFoundationTargetDeviceMeasuredCaptureV1';
import {
  HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_ADAPTER_V1_SCHEMA,
  HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_SOURCE_EVIDENCE_DOMAIN,
  type HsmeFoundationNativeMobileWorkingSetSourceEvidenceRecordV1,
  type HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1,
} from './HsmeFoundationNativeMobileWorkingSetAdaptersV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1' as const;
export const HSME_FOUNDATION_PHYSICAL_MOBILE_LEDGER_DIGEST_DOMAIN =
  'bers:hsme:physical-mobile-source-ledger:v1\0' as const;
export const HSME_FOUNDATION_PHYSICAL_MOBILE_PAYLOAD_DIGEST_DOMAIN =
  'bers:hsme:physical-mobile-validation-payload:v1\0' as const;
export const HSME_FOUNDATION_PHYSICAL_MOBILE_DEVICE_SNAPSHOT_DIGEST_DOMAIN =
  'bers:hsme:physical-mobile-device-snapshot:v1\0' as const;
export const HSME_FOUNDATION_PHYSICAL_MOBILE_MAX_AGE_MS=30*24*60*60*1000;

const HEX64=/^[0-9a-f]{64}$/;
const COMMIT_SHA=/^[0-9a-f]{40}$/;
const MAX_LEDGER_RECORDS=32;
const MAX_TEXT_LENGTH=256;
const SOURCE_EVIDENCE_KEYS=Object.freeze([
  'adapterBuildSha256',
  'browserHeapUsed',
  'bytes',
  'capturedAtMicros',
  'deviceCapacityUsed',
  'manifestResourceEstimateUsed',
  'metricKind',
  'monotonicTimeDomain',
  'phase',
  'platform',
  'processIdentitySha256',
  'productionAuthorityGranted',
  'runtimeEstimateUsed',
  'runtimeIdentitySha256',
  'schemaVersion',
  'sequence',
  'sessionIdentitySha256',
  'sourceApi',
  'sourceApiVersion',
  'bridgeVersion',
  'winnerSelectionAllowed',
].sort());
const BUNDLE_KEYS=Object.freeze([
  'applicationBuildSha256',
  'attestation',
  'capturedAt',
  'deviceRunSessionSha256',
  'deviceSnapshot',
  'expiresAt',
  'fullStudentEscalationAllowed',
  'measuredCapture',
  'modelFleetPromotionAllowed',
  'physicalOriginClaim',
  'productionAuthorityGranted',
  'reuseAdvanceAllowed',
  'schemaVersion',
  'selectedCandidateIdAllowed',
  'sourceEvidenceLedger',
  'testedCommitSha',
  'winnerSelectionAllowed',
].sort());
const LEDGER_RECORD_KEYS=Object.freeze(['evidence','sourceEvidenceSha256'].sort());
const ATTESTATION_KEYS=Object.freeze(['evidenceUrl','signatureUrl','verificationKeyId'].sort());
const FORBIDDEN_EXPORT_KEYS=new Set([
  'advertisingid','advertisingidentifier','credential','credentials','deviceserial','deviceserialnumber',
  'image','imagebytes','modeloutput','password','prompt','secret','sessionidentity','token','usercontent',
  'processidentity',
]);
const DEVICE_SNAPSHOT_KEYS=Object.freeze(['capturedAt','evidence','profile','runtimeCapabilities','schemaVersion'].sort());
const DEVICE_PROFILE_KEYS=Object.freeze(['deviceClass','platform','ramMb','storageFreeBytes','tier','vramMb'].sort());
const DEVICE_EVIDENCE_KEYS=Object.freeze(['observedRuntimes','observedSignals','unknownRuntimes','unknownSignals'].sort());
const POLICY_SIGNAL_KEYS=Object.freeze(['platform','deviceClass','ramMb','vramMb','storageFreeBytes'] as const);
const RUNTIME_KEYS=Object.freeze(['ONNX_RUNTIME','WEBGPU','WASM','NNAPI','DIRECTML','CUDA','METAL','VULKAN'] as const);
const RUNTIME_CAPABILITY_KEYS=Object.freeze([...RUNTIME_KEYS].sort());

export type HsmeFoundationPhysicalMobileRunAttestationV1=Readonly<{
  evidenceUrl:string;
  signatureUrl:string;
  verificationKeyId:string;
}>;

export interface HsmeFoundationPhysicalMobileRunTrustPortV1{
  verifyPhysicalRunEvidence(
    attestation:HsmeFoundationPhysicalMobileRunAttestationV1,
    canonicalPayload:string,
  ):Promise<boolean>;
}

export type HsmeFoundationPhysicalMobileValidationBundleV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA;
  testedCommitSha:string;
  physicalOriginClaim:'REAL_PHYSICAL_DEVICE';
  capturedAt:number;
  expiresAt:number;
  deviceSnapshot:DeviceCapabilitySnapshot;
  applicationBuildSha256:string;
  deviceRunSessionSha256:string;
  measuredCapture:HsmeFoundationTargetDeviceMeasuredCaptureResultV1;
  sourceEvidenceLedger:readonly HsmeFoundationNativeMobileWorkingSetSourceEvidenceRecordV1[];
  attestation:HsmeFoundationPhysicalMobileRunAttestationV1;
  productionAuthorityGranted:false;
  modelFleetPromotionAllowed:false;
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationPhysicalMobileValidationStateV1=
  | 'REAL_DEVICE_EVIDENCE_INVALID'
  | 'REAL_DEVICE_ATTESTATION_REQUIRED'
  | 'REAL_DEVICE_EVIDENCE_VERIFIED';

export type HsmeFoundationPhysicalMobileIntegrityStateV1=
  | 'EVIDENCE_INTEGRITY_INVALID'
  | 'EVIDENCE_INTEGRITY_VERIFIED';

export type HsmeFoundationPhysicalMobileValidationAssessmentV1=Readonly<{
  integrityState:HsmeFoundationPhysicalMobileIntegrityStateV1;
  physicalState:HsmeFoundationPhysicalMobileValidationStateV1;
  blockers:readonly string[];
  sourceEvidenceLedgerSha256:string|null;
  physicalRunPayloadSha256:string|null;
  canonicalPayload:string|null;
  productionAuthorityGranted:false;
  modelFleetPromotionAllowed:false;
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export async function assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
  bundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  trust:HsmeFoundationPhysicalMobileRunTrustPortV1,
  expectedTestedCommitSha:string,
  now:number,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationPhysicalMobileValidationAssessmentV1>{
  const blockers:string[]=[];
  validateRoot(bundle,expectedTestedCommitSha,now,blockers);

  try{
    await verifyHsmeFoundationTargetDeviceMeasuredCaptureV1(bundle.measuredCapture,hash);
  }catch{
    blockers.push('MEASURED_CAPTURE_INVALID');
  }

  let deviceCapabilityKey:string|null=null;
  try{
    deviceCapabilityKey=await deviceCapabilityKeyForBenchmarkEvidenceV1(bundle.deviceSnapshot,hash);
    if(!HEX64.test(deviceCapabilityKey))throw new Error('invalid device key');
  }catch{
    blockers.push('DEVICE_SNAPSHOT_INVALID');
  }

  if(deviceCapabilityKey!==null&&deviceCapabilityKey!==bundle.measuredCapture.rawCapture.deviceCapabilityKey){
    blockers.push('DEVICE_CAPABILITY_KEY_DRIFT');
  }

  const deviceSnapshotSha256=await digestValue(
    HSME_FOUNDATION_PHYSICAL_MOBILE_DEVICE_SNAPSHOT_DIGEST_DOMAIN,
    bundle.deviceSnapshot,
    hash,
    blockers,
    'DEVICE_SNAPSHOT_HASH_INVALID',
  );

  validateMobileBinding(bundle,blockers);
  const ledgerResult=await verifyLedger(bundle,hash,blockers);
  const canonicalPayload=ledgerResult.sourceEvidenceLedgerSha256===null
    ||deviceCapabilityKey===null
    ||deviceSnapshotSha256===null
    ? null
    : canonicalPhysicalPayload(
      bundle,
      deviceCapabilityKey,
      deviceSnapshotSha256,
      ledgerResult.sourceEvidenceLedgerSha256,
    );
  let physicalRunPayloadSha256:string|null=null;
  if(canonicalPayload!==null){
    physicalRunPayloadSha256=await digestText(
      HSME_FOUNDATION_PHYSICAL_MOBILE_PAYLOAD_DIGEST_DOMAIN,
      canonicalPayload,
      hash,
      blockers,
      'PHYSICAL_PAYLOAD_HASH_INVALID',
    );
  }

  const integrityOk=blockers.length===0&&canonicalPayload!==null&&physicalRunPayloadSha256!==null;
  if(!integrityOk){
    return assessment(
      'EVIDENCE_INTEGRITY_INVALID',
      'REAL_DEVICE_EVIDENCE_INVALID',
      blockers,
      ledgerResult.sourceEvidenceLedgerSha256,
      physicalRunPayloadSha256,
      canonicalPayload,
    );
  }

  let trusted=false;
  if(!validAttestation(bundle.attestation)){
    blockers.push('PHYSICAL_ATTESTATION_INVALID');
  }else{
    try{
      trusted=await trust.verifyPhysicalRunEvidence(bundle.attestation,canonicalPayload);
    }catch{
      trusted=false;
    }
    if(!trusted)blockers.push('PHYSICAL_ATTESTATION_UNVERIFIED');
  }

  return assessment(
    'EVIDENCE_INTEGRITY_VERIFIED',
    trusted?'REAL_DEVICE_EVIDENCE_VERIFIED':'REAL_DEVICE_ATTESTATION_REQUIRED',
    blockers,
    ledgerResult.sourceEvidenceLedgerSha256,
    physicalRunPayloadSha256,
    canonicalPayload,
  );
}

async function verifyLedger(
  bundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<Readonly<{sourceEvidenceLedgerSha256:string|null}>>{
  const ledger=bundle.sourceEvidenceLedger;
  const samples=bundle.measuredCapture.rawCapture.workingSetSamples;
  if(!Array.isArray(ledger)||ledger.length<1||ledger.length>MAX_LEDGER_RECORDS){
    blockers.push('SOURCE_LEDGER_BOUNDS_INVALID');
    return Object.freeze({sourceEvidenceLedgerSha256:null});
  }
  if(ledger.length!==samples.length)blockers.push('SOURCE_LEDGER_SAMPLE_COUNT_MISMATCH');

  const seen=new Set<string>();
  const first=ledger[0]?.evidence;
  let previousTimestamp:number|undefined;

  for(let index=0;index<ledger.length;index+=1){
    const record=ledger[index];
    const sample=samples[index];
    if(!record||!record.evidence){
      blockers.push('SOURCE_LEDGER_RECORD_INVALID');
      continue;
    }
    if(!exactObjectShape(record,LEDGER_RECORD_KEYS))blockers.push('SOURCE_LEDGER_RECORD_SHAPE_INVALID');
    const evidence=record.evidence;
    if(!HEX64.test(record.sourceEvidenceSha256))blockers.push('SOURCE_EVIDENCE_DIGEST_INVALID');
    if(seen.has(record.sourceEvidenceSha256))blockers.push('SOURCE_EVIDENCE_DUPLICATE');
    seen.add(record.sourceEvidenceSha256);

    if(!exactSourceEvidenceShape(evidence))blockers.push('SOURCE_EVIDENCE_SHAPE_INVALID');
    if(evidence.schemaVersion!==HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_ADAPTER_V1_SCHEMA){
      blockers.push('SOURCE_EVIDENCE_SCHEMA_INVALID');
    }
    validateSourceSemantics(evidence,bundle.deviceSnapshot,blockers);
    validateSourceIdentity(first,evidence,blockers);

    if(previousTimestamp!==undefined&&evidence.capturedAtMicros<=previousTimestamp){
      blockers.push('SOURCE_TIMESTAMP_REGRESSION');
    }
    previousTimestamp=evidence.capturedAtMicros;

    if(sample){
      if(record.sourceEvidenceSha256!==sample.sourceEvidenceSha256
        || evidence.phase!==sample.phase
        || evidence.sequence!==sample.sequence
        || evidence.capturedAtMicros!==sample.capturedAtMicros
        || evidence.bytes!==sample.hostBytes
        || sample.acceleratorBytes!=='UNAVAILABLE'){
        blockers.push('SOURCE_SAMPLE_BINDING_MISMATCH');
      }
    }else blockers.push('SOURCE_LEDGER_UNREFERENCED_RECORD');

    const recomputed=await sourceEvidenceDigest(evidence,hash,blockers);
    if(recomputed!==null&&recomputed!==record.sourceEvidenceSha256){
      blockers.push('SOURCE_EVIDENCE_DIGEST_MISMATCH');
    }
  }

  if(samples.length>ledger.length)blockers.push('SOURCE_SAMPLE_WITHOUT_EVIDENCE');
  const sourceEvidenceLedgerSha256=await digestValue(
    HSME_FOUNDATION_PHYSICAL_MOBILE_LEDGER_DIGEST_DOMAIN,
    ledger,
    hash,
    blockers,
    'SOURCE_LEDGER_HASH_INVALID',
  );
  return Object.freeze({sourceEvidenceLedgerSha256});
}

function validateRoot(
  bundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  expectedTestedCommitSha:string,
  now:number,
  blockers:string[],
):void{
  if(!exactObjectShape(bundle,BUNDLE_KEYS))blockers.push('BUNDLE_SHAPE_INVALID');
  validateExportSafety(bundle,blockers);
  validateSanitizedDeviceSnapshot(bundle.deviceSnapshot,blockers);
  if(bundle.schemaVersion!==HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA){
    blockers.push('INVALID_SCHEMA');
  }
  if(!COMMIT_SHA.test(bundle.testedCommitSha)
    || !COMMIT_SHA.test(expectedTestedCommitSha)
    || bundle.testedCommitSha!==expectedTestedCommitSha){
    blockers.push('TESTED_COMMIT_DRIFT');
  }
  if(bundle.physicalOriginClaim!=='REAL_PHYSICAL_DEVICE')blockers.push('REAL_DEVICE_ORIGIN_CLAIM_REQUIRED');
  if(!Number.isSafeInteger(bundle.capturedAt)||bundle.capturedAt<0
    || !Number.isSafeInteger(bundle.expiresAt)||bundle.expiresAt<bundle.capturedAt
    || bundle.expiresAt-bundle.capturedAt>HSME_FOUNDATION_PHYSICAL_MOBILE_MAX_AGE_MS){
    blockers.push('INVALID_TIME');
  }else{
    if(!Number.isSafeInteger(now)||now<0)blockers.push('INVALID_TIME');
    if(bundle.capturedAt>now)blockers.push('FUTURE_EVIDENCE');
    if(bundle.expiresAt<now||now-bundle.capturedAt>HSME_FOUNDATION_PHYSICAL_MOBILE_MAX_AGE_MS){
      blockers.push('STALE_EVIDENCE');
    }
  }
  shaOrBlock(bundle.applicationBuildSha256,'APPLICATION_BUILD_INVALID',blockers);
  shaOrBlock(bundle.deviceRunSessionSha256,'DEVICE_RUN_SESSION_INVALID',blockers);
  if(bundle.capturedAt!==bundle.measuredCapture.benchmarkEvidence.capturedAt
    || bundle.expiresAt!==bundle.measuredCapture.benchmarkEvidence.expiresAt){
    blockers.push('BENCHMARK_TIME_BINDING_MISMATCH');
  }
  if(bundle.productionAuthorityGranted!==false
    || bundle.modelFleetPromotionAllowed!==false
    || bundle.selectedCandidateIdAllowed!==false
    || bundle.reuseAdvanceAllowed!==false
    || bundle.fullStudentEscalationAllowed!==false
    || bundle.winnerSelectionAllowed!==false){
    blockers.push('AUTHORITY_WIDENING_REJECTED');
  }
}

function validateMobileBinding(
  bundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  blockers:string[],
):void{
  const profile=bundle.deviceSnapshot.profile;
  const raw=bundle.measuredCapture.rawCapture;
  if(raw.targetTier!=='MOBILE_DEFAULT'||profile.deviceClass!=='MOBILE'){
    blockers.push('MOBILE_TARGET_REQUIRED');
  }
  if(profile.platform!=='ANDROID'&&profile.platform!=='IOS'){
    blockers.push('MOBILE_PLATFORM_REQUIRED');
  }
  if(!bundle.deviceSnapshot.runtimeCapabilities[raw.runtime])blockers.push('TARGET_RUNTIME_UNAVAILABLE');
  const benchmark=bundle.measuredCapture.benchmarkEvidence;
  if(benchmark.modelId!==raw.modelId
    || benchmark.modelVersion!==raw.modelVersion
    || benchmark.manifestSha256!==raw.manifestSha256
    || benchmark.runtime!==raw.runtime
    || benchmark.provider!==raw.provider){
    blockers.push('MODEL_RUNTIME_PROVIDER_DRIFT');
  }
  if(bundle.measuredCapture.measurementAttestation.memoryAccountingMode!=='UNIFIED_PROCESS_WORKING_SET'
    || bundle.measuredCapture.measurementAttestation.ramMetric!=='PEAK_PROCESS_WORKING_SET_BYTES'
    || bundle.measuredCapture.measurementAttestation.vramMetric!=='NOT_SEPARATELY_BUDGETED'){
    blockers.push('MOBILE_MEMORY_SEMANTICS_INVALID');
  }
  if(raw.peakAcceleratorBytes!=='UNAVAILABLE'||benchmark.vramBytes!==0){
    blockers.push('MOBILE_ACCELERATOR_BUDGET_MUST_REMAIN_UNAVAILABLE');
  }
}

function validateSourceSemantics(
  evidence:HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1,
  snapshot:DeviceCapabilitySnapshot,
  blockers:string[],
):void{
  const platform=snapshot.profile.platform;
  if(evidence.platform!==platform)blockers.push('SOURCE_PLATFORM_DRIFT');
  if(platform==='ANDROID'&&evidence.metricKind!=='PROCESS_RESIDENT_SET_RSS_BYTES'){
    blockers.push('ANDROID_RSS_REQUIRED');
  }
  if(platform==='IOS'&&evidence.metricKind!=='TASK_VM_INFO_PHYS_FOOTPRINT_BYTES'){
    blockers.push('IOS_PHYSICAL_FOOTPRINT_REQUIRED');
  }
  if(!Number.isSafeInteger(evidence.bytes)||evidence.bytes<1)blockers.push('SOURCE_BYTES_INVALID');
  if(!Number.isSafeInteger(evidence.capturedAtMicros)||evidence.capturedAtMicros<0){
    blockers.push('SOURCE_TIMESTAMP_INVALID');
  }
  if(!Number.isSafeInteger(evidence.sequence)||evidence.sequence<0)blockers.push('SOURCE_SEQUENCE_INVALID');
  shaOrBlock(evidence.processIdentitySha256,'PROCESS_IDENTITY_DIGEST_INVALID',blockers);
  shaOrBlock(evidence.sessionIdentitySha256,'SESSION_IDENTITY_DIGEST_INVALID',blockers);
  shaOrBlock(evidence.adapterBuildSha256,'ADAPTER_BUILD_INVALID',blockers);
  shaOrBlock(evidence.runtimeIdentitySha256,'RUNTIME_IDENTITY_INVALID',blockers);
  for(const value of [
    evidence.sourceApi,evidence.sourceApiVersion,evidence.monotonicTimeDomain,evidence.bridgeVersion,
  ]){
    if(typeof value!=='string'||value.length<1||value.length>MAX_TEXT_LENGTH)blockers.push('SOURCE_METADATA_INVALID');
  }
  if(evidence.deviceCapacityUsed!==false
    || evidence.browserHeapUsed!==false
    || evidence.runtimeEstimateUsed!==false
    || evidence.manifestResourceEstimateUsed!==false
    || evidence.productionAuthorityGranted!==false
    || evidence.winnerSelectionAllowed!==false){
    blockers.push('SOURCE_SEMANTIC_FALLBACK_OR_AUTHORITY_REJECTED');
  }
  const dynamic=evidence as unknown as Record<string,unknown>;
  if('processIdentity' in dynamic||'sessionIdentity' in dynamic){
    blockers.push('RAW_PROCESS_SESSION_IDENTITY_FORBIDDEN');
  }
}

function validateSourceIdentity(
  first:HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1|undefined,
  current:HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1,
  blockers:string[],
):void{
  if(!first)return;
  if(first.platform!==current.platform
    || first.metricKind!==current.metricKind
    || first.processIdentitySha256!==current.processIdentitySha256
    || first.sessionIdentitySha256!==current.sessionIdentitySha256
    || first.sourceApi!==current.sourceApi
    || first.sourceApiVersion!==current.sourceApiVersion
    || first.monotonicTimeDomain!==current.monotonicTimeDomain
    || first.bridgeVersion!==current.bridgeVersion
    || first.adapterBuildSha256!==current.adapterBuildSha256
    || first.runtimeIdentitySha256!==current.runtimeIdentitySha256){
    blockers.push('SOURCE_SESSION_IDENTITY_DRIFT');
  }
}

function exactSourceEvidenceShape(value:HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1):boolean{
  const keys=Object.keys(value as unknown as Record<string,unknown>).sort();
  return keys.length===SOURCE_EVIDENCE_KEYS.length
    && keys.every((key,index)=>key===SOURCE_EVIDENCE_KEYS[index]);
}

async function sourceEvidenceDigest(
  evidence:HsmeFoundationNativeMobileWorkingSetSourceEvidenceV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<string|null>{
  return digestValue(
    HSME_FOUNDATION_NATIVE_MOBILE_WORKING_SET_SOURCE_EVIDENCE_DOMAIN,
    evidence,
    hash,
    blockers,
    'SOURCE_EVIDENCE_HASH_INVALID',
  );
}

function canonicalPhysicalPayload(
  bundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  deviceCapabilityKey:string,
  deviceSnapshotSha256:string,
  sourceEvidenceLedgerSha256:string,
):string{
  const raw=bundle.measuredCapture.rawCapture;
  const first=bundle.sourceEvidenceLedger[0]?.evidence;
  return JSON.stringify({
    schemaVersion:HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA,
    testedCommitSha:bundle.testedCommitSha,
    physicalOriginClaim:bundle.physicalOriginClaim,
    capturedAt:bundle.capturedAt,
    expiresAt:bundle.expiresAt,
    platform:bundle.deviceSnapshot.profile.platform,
    deviceClass:bundle.deviceSnapshot.profile.deviceClass,
    deviceTier:bundle.deviceSnapshot.profile.tier,
    deviceCapabilityKey,
    deviceSnapshotSha256,
    applicationBuildSha256:bundle.applicationBuildSha256,
    deviceRunSessionSha256:bundle.deviceRunSessionSha256,
    modelId:raw.modelId,
    modelVersion:raw.modelVersion,
    manifestSha256:raw.manifestSha256,
    runtime:raw.runtime,
    provider:raw.provider,
    benchmarkFixtureSha256:raw.benchmarkFixtureSha256,
    targetRuntimeInventorySha256:raw.targetRuntimeInventorySha256,
    representationBindingSha256:raw.representationBindingSha256,
    captureMethodSha256:raw.captureMethodSha256,
    measurementCaptureSha256:bundle.measuredCapture.measurementCaptureSha256,
    benchmarkEvidenceSha256:bundle.measuredCapture.benchmarkEvidenceSha256,
    sourceEvidenceLedgerSha256,
    sourceMetricKind:first?.metricKind??'UNKNOWN',
    processIdentitySha256:first?.processIdentitySha256??'UNKNOWN',
    sessionIdentitySha256:first?.sessionIdentitySha256??'UNKNOWN',
    adapterBuildSha256:first?.adapterBuildSha256??'UNKNOWN',
    runtimeIdentitySha256:first?.runtimeIdentitySha256??'UNKNOWN',
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    winnerSelectionAllowed:false,
  });
}

async function digestValue(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
  blocker:string,
):Promise<string|null>{
  return digestText(domain,JSON.stringify(value),hash,blockers,blocker);
}

async function digestText(
  domain:string,
  value:string,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
  blocker:string,
):Promise<string|null>{
  try{
    const result=await hash.sha256(new TextEncoder().encode(domain+value));
    if(!HEX64.test(result))throw new Error('hash invalid');
    return result;
  }catch{
    blockers.push(blocker);
    return null;
  }
}

function validAttestation(attestation:HsmeFoundationPhysicalMobileRunAttestationV1):boolean{
  return exactObjectShape(attestation,ATTESTATION_KEYS)
    && safeHttpsUrl(attestation?.evidenceUrl)
    && safeHttpsUrl(attestation?.signatureUrl)
    && boundedText(attestation?.verificationKeyId);
}

function safeHttpsUrl(value:unknown):boolean{
  if(typeof value!=='string'||value.length>2048)return false;
  try{
    const url=new URL(value);
    return url.protocol==='https:'&&!url.username&&!url.password;
  }catch{return false;}
}

function exactObjectShape(value:unknown,expected:readonly string[]):boolean{
  if(value===null||typeof value!=='object'||Array.isArray(value))return false;
  const keys=Object.keys(value as Record<string,unknown>).sort();
  return keys.length===expected.length&&keys.every((key,index)=>key===expected[index]);
}

function validateSanitizedDeviceSnapshot(snapshot:DeviceCapabilitySnapshot,blockers:string[]):void{
  if(!exactObjectShape(snapshot,DEVICE_SNAPSHOT_KEYS)){
    blockers.push('DEVICE_SNAPSHOT_SHAPE_INVALID');
    return;
  }
  if(!exactObjectShape(snapshot.profile,DEVICE_PROFILE_KEYS))blockers.push('DEVICE_PROFILE_SHAPE_INVALID');
  if(!exactObjectShape(snapshot.runtimeCapabilities,RUNTIME_CAPABILITY_KEYS)){
    blockers.push('DEVICE_RUNTIME_CAPABILITIES_SHAPE_INVALID');
  }
  if(!exactObjectShape(snapshot.evidence,DEVICE_EVIDENCE_KEYS))blockers.push('DEVICE_EVIDENCE_SHAPE_INVALID');
  if(snapshot.schemaVersion!==1)blockers.push('DEVICE_SNAPSHOT_SCHEMA_INVALID');
  if(!Number.isSafeInteger(snapshot.capturedAt)||snapshot.capturedAt<0)blockers.push('DEVICE_SNAPSHOT_TIME_INVALID');

  for(const key of ['ramMb','vramMb','storageFreeBytes'] as const){
    const value=snapshot.profile[key];
    if(value!=='UNKNOWN'&&(!Number.isSafeInteger(value)||value<0))blockers.push('DEVICE_PROFILE_RESOURCE_INVALID');
  }
  for(const runtime of RUNTIME_KEYS){
    const value=snapshot.runtimeCapabilities[runtime];
    if(value!==true&&value!==false&&value!=='UNKNOWN')blockers.push('DEVICE_RUNTIME_CAPABILITY_INVALID');
  }

  const expectedObservedSignals=POLICY_SIGNAL_KEYS
    .filter(key=>snapshot.profile[key]!=='UNKNOWN')
    .map(String)
    .sort();
  const expectedUnknownSignals=POLICY_SIGNAL_KEYS
    .filter(key=>snapshot.profile[key]==='UNKNOWN')
    .map(String)
    .sort();
  const expectedObservedRuntimes=RUNTIME_KEYS.filter(kind=>snapshot.runtimeCapabilities[kind]!=='UNKNOWN');
  const expectedUnknownRuntimes=RUNTIME_KEYS.filter(kind=>snapshot.runtimeCapabilities[kind]==='UNKNOWN');

  if(!sameStringArray(snapshot.evidence.observedSignals,expectedObservedSignals)
    ||!sameStringArray(snapshot.evidence.unknownSignals,expectedUnknownSignals)
    ||!sameStringArray(snapshot.evidence.observedRuntimes,expectedObservedRuntimes)
    ||!sameStringArray(snapshot.evidence.unknownRuntimes,expectedUnknownRuntimes)){
    blockers.push('DEVICE_SNAPSHOT_EVIDENCE_NOT_CANONICAL');
  }
}

function sameStringArray(actual:readonly string[],expected:readonly string[]):boolean{
  return Array.isArray(actual)
    &&actual.length===expected.length
    &&actual.every((value,index)=>value===expected[index]);
}

function validateExportSafety(value:unknown,blockers:string[],seen=new Set<object>()):void{
  if(value===null||typeof value!=='object')return;
  const object=value as object;
  if(seen.has(object))return;
  seen.add(object);
  if(Array.isArray(value)){
    for(const child of value)validateExportSafety(child,blockers,seen);
    return;
  }
  for(const [key,child] of Object.entries(value as Record<string,unknown>)){
    const normalized=key.replace(/[^a-z0-9]/gi,'').toLowerCase();
    if(FORBIDDEN_EXPORT_KEYS.has(normalized)){
      blockers.push('FORBIDDEN_SENSITIVE_EXPORT_FIELD');
    }
    validateExportSafety(child,blockers,seen);
  }
}

function boundedText(value:unknown):boolean{
  return typeof value==='string'&&value.length>0&&value.length<=MAX_TEXT_LENGTH
    && !/[\u0000-\u001f\u007f]/.test(value);
}

function shaOrBlock(value:unknown,blocker:string,blockers:string[]):void{
  if(typeof value!=='string'||!HEX64.test(value))blockers.push(blocker);
}

function assessment(
  integrityState:HsmeFoundationPhysicalMobileIntegrityStateV1,
  physicalState:HsmeFoundationPhysicalMobileValidationStateV1,
  blockers:readonly string[],
  sourceEvidenceLedgerSha256:string|null,
  physicalRunPayloadSha256:string|null,
  canonicalPayload:string|null,
):HsmeFoundationPhysicalMobileValidationAssessmentV1{
  return Object.freeze({
    integrityState,
    physicalState,
    blockers:Object.freeze([...new Set(blockers)]),
    sourceEvidenceLedgerSha256,
    physicalRunPayloadSha256,
    canonicalPayload,
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    winnerSelectionAllowed:false,
  });
}
