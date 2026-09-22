import {
  deviceCapabilityKeyForBenchmarkEvidenceV1,
  evidenceKeyFor,
  isValidBenchmarkEvidenceV1,
  type BenchmarkEvidence,
} from '../benchmark/BenchmarkEvidence';
import type {
  DeviceCapabilitySnapshot,
  ExecutionProvider,
  ModelManifest,
  RuntimeKind,
} from '../types';
import {
  hsmeFoundationRuntimeInventoryStableJsonV1,
  normalizeHsmeFoundationRuntimeInventoryV1,
  type HsmeFoundationRuntimeInventoryV1,
} from './HsmeFoundationResourceEvidenceV1';
import {
  HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA,
  hsmeFoundationTierBudgetPolicyV1Digest,
  normalizeHsmeFoundationTierBudgetPolicyV1,
  type HsmeFoundationTargetTierEvidenceV1,
  type HsmeFoundationTargetTierEvidenceSetV1,
} from './HsmeFoundationTierQualificationV1';
import type { HsmeFoundationBenchmarkRunHashPortV1 } from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_TARGET_DEVICE_ADAPTER_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TARGET_DEVICE_ADAPTER_V1' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_RUNTIME_PROFILE_DIGEST_DOMAIN =
  'bers:hsme:target-device-runtime-profile:v1\0' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_HARDWARE_PROFILE_DIGEST_DOMAIN =
  'bers:hsme:target-device-hardware-profile:v1\0' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_METHOD_DIGEST_DOMAIN =
  'bers:hsme:target-device-measurement-method:v1\0' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:target-device-measurement-evidence:v1\0' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_BENCHMARK_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:target-device-benchmark-evidence:v1\0' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_REPRESENTATION_BINDING_DIGEST_DOMAIN =
  'bers:hsme:target-device-representation-binding:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
const TARGET_TIERS=Object.freeze(['MOBILE_DEFAULT','DESKTOP_HIGH_END'] as const);
const REPRESENTATION_KINDS=Object.freeze(['IDENTICAL_REFERENCE_ARTIFACTS','TARGET_SPECIFIC_REPRESENTATION'] as const);
const ADAPTER_STATES=Object.freeze([
  'TARGET_BINDING_REQUIRED',
  'TARGET_DEVICE_EVIDENCE_REQUIRED',
  'TARGET_MEASUREMENT_INSUFFICIENT',
  'TARGET_DEVICE_EVIDENCE_READY',
  'FAILED_EVIDENCE',
] as const);
const MEMORY_MODES=Object.freeze(['UNIFIED_PROCESS_WORKING_SET','DISCRETE_HOST_PLUS_ACCELERATOR'] as const);
const WARM_SOURCES=Object.freeze(['latencyMs','warmStartMs'] as const);

type Capability=typeof CAPABILITIES[number];
type TargetTier=typeof TARGET_TIERS[number];
type RepresentationKind=typeof REPRESENTATION_KINDS[number];
type AdapterState=typeof ADAPTER_STATES[number];
type MemoryMode=typeof MEMORY_MODES[number];

export type HsmeFoundationTargetDeviceMeasurementAttestationV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA;
  benchmarkEvidenceKey:string;
  benchmarkEvidenceSha256:string;
  measurementCaptureSha256:string;
  memoryAccountingMode:MemoryMode;
  ramMetric:'PEAK_PROCESS_WORKING_SET_BYTES'|'PEAK_HOST_WORKING_SET_BYTES';
  vramMetric:'NOT_SEPARATELY_BUDGETED'|'PEAK_ACCELERATOR_BYTES';
  coldLatencySource:'coldStartMs';
  warmLatencySource:typeof WARM_SOURCES[number];
  millisecondsToMicroseconds:'EXACT_X1000';
  evidenceMethodSha256:string;
  productionAuthorityGranted:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationTargetDeviceBindingV1=Readonly<{
  candidateId:string;
  capability:Capability;
  targetTier:TargetTier;
  sourceModelContentSha256:string;
  sourceExecutionProfileSha256:string;
  representationKind:RepresentationKind;
  representationContentSha256:string;
  runtimeInventory:HsmeFoundationRuntimeInventoryV1;
  modelManifest:ModelManifest;
  representationBridgeMode:'SINGLE_FILE_EXACT_SHA'|'MULTI_FILE_UNSUPPORTED';
  deviceSnapshot:DeviceCapabilitySnapshot|null;
  benchmarkEvidence:BenchmarkEvidence|null;
  measurementAttestation:HsmeFoundationTargetDeviceMeasurementAttestationV1|null;
}>;

export type HsmeFoundationTargetDeviceBindingSetV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA;
  records:readonly HsmeFoundationTargetDeviceBindingV1[];
  productionAuthorityGranted:false;
  modelFleetPromotionAllowed:false;
  installOrDownloadAllowed:false;
  winnerSelectionAllowed:false;
}>;

export type HsmeFoundationTargetDeviceAdapterRowV1=Readonly<{
  candidateId:string;
  capability:Capability;
  state:AdapterState;
  reasons:readonly string[];
  deviceCapabilityKey:string|'UNKNOWN';
  benchmarkEvidenceKey:string|'UNKNOWN';
  targetEvidenceSha256:string|'UNKNOWN';
}>;

export type HsmeFoundationTargetDeviceAdapterV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_TARGET_DEVICE_ADAPTER_V1_SCHEMA;
  budgetPolicySha256:string;
  rows:readonly HsmeFoundationTargetDeviceAdapterRowV1[];
  targetEvidenceSet:HsmeFoundationTargetTierEvidenceSetV1;
  modelFleetPromotionUsed:false;
  qualityScoringUsed:false;
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export class HsmeFoundationTargetDeviceAdapterV1Error extends Error{
  readonly code:string;
  constructor(code:string,message:string){
    super(message);
    this.name='HsmeFoundationTargetDeviceAdapterV1Error';
    this.code=code;
  }
}

export async function hsmeFoundationTargetDeviceBenchmarkEvidenceV1Digest(
  evidence:BenchmarkEvidence,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  if(!isValidBenchmarkEvidenceV1(evidence)){
    fail('hsme_target_adapter_benchmark_invalid','benchmark evidence invalid for digest');
  }
  return digest(
    HSME_FOUNDATION_TARGET_DEVICE_BENCHMARK_EVIDENCE_DIGEST_DOMAIN,
    normalizeBenchmarkEvidenceForDigest(evidence),
    hash,
  );
}

export async function adaptHsmeFoundationTargetDeviceBenchmarkEvidenceV1(
  rawBudgetPolicy:unknown,
  rawBindings:unknown,
  nowMs:number,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationTargetDeviceAdapterV1>{
  if(!Number.isSafeInteger(nowMs)||nowMs<0)fail('hsme_target_adapter_now','nowMs must be non-negative safe integer');
  const budget=normalizeHsmeFoundationTierBudgetPolicyV1(rawBudgetPolicy);
  const budgetPolicySha256=await hsmeFoundationTierBudgetPolicyV1Digest(budget,hash);
  const bindings=normalizeBindingSet(rawBindings);
  const rows:HsmeFoundationTargetDeviceAdapterRowV1[]=[];
  const ready:HsmeFoundationTargetTierEvidenceV1[]=[];

  for(const binding of bindings.records){
    if(binding.targetTier!==budget.targetTier){
      rows.push(freezeRow(binding,'FAILED_EVIDENCE',['TARGET_TIER_DIFFERS_FROM_BUDGET_POLICY']));
      continue;
    }
    const result=await adaptOne(binding,budgetPolicySha256,nowMs,hash);
    rows.push(result.row);
    if(result.targetEvidence)ready.push(result.targetEvidence);
  }

  rows.sort((a,b)=>lexical(key(a.candidateId,a.capability),key(b.candidateId,b.capability)));
  ready.sort((a,b)=>lexical(key(a.candidateId,a.capability),key(b.candidateId,b.capability)));
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_ADAPTER_V1_SCHEMA,
    budgetPolicySha256,
    rows:Object.freeze(rows),
    targetEvidenceSet:Object.freeze({
      schemaVersion:HSME_FOUNDATION_TARGET_TIER_EVIDENCE_SET_V1_SCHEMA,
      records:Object.freeze(ready),
      productionAuthorityGranted:false,
      winnerSelectionAllowed:false,
    }),
    modelFleetPromotionUsed:false,
    qualityScoringUsed:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    aeeExecutionAuthorityGranted:false,
    durableModelFleetPromotionAllowed:false,
    trainingOrDistillationAllowed:false,
    winnerSelectionAllowed:false,
  });
}

async function adaptOne(
  binding:HsmeFoundationTargetDeviceBindingV1,
  budgetPolicySha256:string,
  nowMs:number,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<Readonly<{row:HsmeFoundationTargetDeviceAdapterRowV1;targetEvidence:HsmeFoundationTargetTierEvidenceV1|null}>>{
  const representation=await proveRepresentationBinding(binding,hash);
  if(!representation.ready){
    return Object.freeze({row:freezeRow(binding,'TARGET_BINDING_REQUIRED',representation.reasons),targetEvidence:null});
  }
  if(binding.deviceSnapshot===null||binding.benchmarkEvidence===null){
    return Object.freeze({row:freezeRow(binding,'TARGET_DEVICE_EVIDENCE_REQUIRED',['DEVICE_SNAPSHOT_AND_BENCHMARK_EVIDENCE_REQUIRED']),targetEvidence:null});
  }

  const snapshot=binding.deviceSnapshot;
  const evidence=binding.benchmarkEvidence;
  const deviceCheck=await validateDeviceBenchmarkBinding(binding,snapshot,evidence,nowMs,hash);
  if(!deviceCheck.ok){
    return Object.freeze({
      row:freezeRow(binding,'FAILED_EVIDENCE',deviceCheck.reasons,deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }

  if(binding.measurementAttestation===null){
    return Object.freeze({
      row:freezeRow(binding,'TARGET_MEASUREMENT_INSUFFICIENT',['MEASUREMENT_METHOD_ATTESTATION_REQUIRED'],deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }
  const method=normalizeMeasurementAttestation(binding.measurementAttestation);
  const benchmarkEvidenceSha256=await hsmeFoundationTargetDeviceBenchmarkEvidenceV1Digest(evidence,hash);
  if(method.benchmarkEvidenceKey!==evidence.evidenceKey){
    return Object.freeze({
      row:freezeRow(binding,'FAILED_EVIDENCE',['MEASUREMENT_ATTESTATION_EVIDENCE_KEY_MISMATCH'],deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }
  if(method.benchmarkEvidenceSha256!==benchmarkEvidenceSha256){
    return Object.freeze({
      row:freezeRow(binding,'FAILED_EVIDENCE',['MEASUREMENT_ATTESTATION_EVIDENCE_DIGEST_MISMATCH'],deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }
  if(method.memoryAccountingMode!=='UNIFIED_PROCESS_WORKING_SET'
    || method.ramMetric!=='PEAK_PROCESS_WORKING_SET_BYTES'
    || method.vramMetric!=='NOT_SEPARATELY_BUDGETED'){
    return Object.freeze({
      row:freezeRow(binding,'TARGET_MEASUREMENT_INSUFFICIENT',['NO_SINGLE_TARGET_WORKING_SET_SEMANTIC'],deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }
  if(!Number.isSafeInteger(evidence.ramBytes)||evidence.ramBytes<1){
    return Object.freeze({
      row:freezeRow(binding,'TARGET_MEASUREMENT_INSUFFICIENT',['RAM_BYTES_NOT_EXACT_POSITIVE_INTEGER'],deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }
  const cold=exactMicros(evidence.coldStartMs,'coldStartMs');
  const warm=exactMicros(method.warmLatencySource==='latencyMs'?evidence.latencyMs:evidence.warmStartMs,method.warmLatencySource);
  if(cold===null||warm===null){
    return Object.freeze({
      row:freezeRow(binding,'TARGET_MEASUREMENT_INSUFFICIENT',['LATENCY_NOT_EXACT_MILLISECOND_TO_MICROSECOND_VALUE'],deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }
  if(evidence.sampleCount<1||evidence.successRate<=0){
    return Object.freeze({
      row:freezeRow(binding,'TARGET_MEASUREMENT_INSUFFICIENT',['NO_SUCCESSFUL_BENCHMARK_SAMPLE'],deviceCheck.deviceCapabilityKey,evidence.evidenceKey),
      targetEvidence:null,
    });
  }

  const inventory=normalizeHsmeFoundationRuntimeInventoryV1(binding.runtimeInventory);
  const targetRuntimeProfileSha256=await digest(HSME_FOUNDATION_TARGET_DEVICE_RUNTIME_PROFILE_DIGEST_DOMAIN,{
    modelId:binding.modelManifest.modelId,
    modelVersion:binding.modelManifest.version,
    manifestSha256:binding.modelManifest.sha256,
    runtime:binding.modelManifest.runtime,
    provider:evidence.provider,
    deviceCapabilityKey:deviceCheck.deviceCapabilityKey,
  },hash);
  const hardwareProfileSha256=await digest(HSME_FOUNDATION_TARGET_DEVICE_HARDWARE_PROFILE_DIGEST_DOMAIN,{
    schemaVersion:snapshot.schemaVersion,
    deviceCapabilityKey:deviceCheck.deviceCapabilityKey,
    platform:snapshot.profile.platform,
    deviceClass:snapshot.profile.deviceClass,
    tier:snapshot.profile.tier,
    ramMb:snapshot.profile.ramMb,
    vramMb:snapshot.profile.vramMb,
    runtime:binding.modelManifest.runtime,
    provider:evidence.provider,
  },hash);
  const measurementMethodSha256=await digest(
    HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_METHOD_DIGEST_DOMAIN,
    method,
    hash,
  );
  const measurementEvidenceSha256=await digest(
    HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_EVIDENCE_DIGEST_DOMAIN,
    normalizeBenchmarkEvidenceForDigest(evidence),
    hash,
  );
  const targetEvidence:HsmeFoundationTargetTierEvidenceV1=deepFreeze({
    candidateId:binding.candidateId,
    capability:binding.capability,
    targetTier:binding.targetTier,
    sourceModelContentSha256:binding.sourceModelContentSha256,
    sourceExecutionProfileSha256:binding.sourceExecutionProfileSha256,
    representationKind:binding.representationKind,
    representationContentSha256:binding.representationContentSha256,
    representationEvidenceSha256:representation.representationEvidenceSha256,
    runtimeInventory:inventory,
    targetRuntimeProfileSha256,
    targetHardwareClass:binding.targetTier==='MOBILE_DEFAULT'?'MOBILE_TARGET_DEVICE':'DESKTOP_HIGH_END_TARGET',
    workingMemoryKind:'TARGET_PEAK_WORKING_SET_BYTES',
    peakWorkingMemoryBytes:evidence.ramBytes,
    coldEndToEndLatencyMicros:cold,
    warmEndToEndLatencyMicros:warm,
    hardwareProfileSha256,
    measurementMethodSha256,
    measurementEvidenceSha256,
    budgetPolicySha256,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
  const targetEvidenceSha256=await digest(
    'bers:hsme:target-device-adapted-evidence:v1\0',
    targetEvidence,
    hash,
  );
  return Object.freeze({
    row:freezeRow(binding,'TARGET_DEVICE_EVIDENCE_READY',[],deviceCheck.deviceCapabilityKey,evidence.evidenceKey,targetEvidenceSha256),
    targetEvidence,
  });
}

async function proveRepresentationBinding(
  binding:HsmeFoundationTargetDeviceBindingV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<Readonly<{ready:boolean;reasons:readonly string[];representationEvidenceSha256:string}>>{
  const inventory=normalizeHsmeFoundationRuntimeInventoryV1(binding.runtimeInventory);
  const inventorySha256=await digestRaw(hsmeFoundationRuntimeInventoryStableJsonV1(inventory),hash);
  const evidence=await digest(HSME_FOUNDATION_TARGET_DEVICE_REPRESENTATION_BINDING_DIGEST_DOMAIN,{
    candidateId:binding.candidateId,
    capability:binding.capability,
    representationKind:binding.representationKind,
    representationContentSha256:binding.representationContentSha256,
    inventorySha256,
    manifestModelId:binding.modelManifest.modelId,
    manifestVersion:binding.modelManifest.version,
    manifestSha256:binding.modelManifest.sha256,
    manifestRuntime:binding.modelManifest.runtime,
    bridgeMode:binding.representationBridgeMode,
  },hash);

  if(binding.representationBridgeMode!=='SINGLE_FILE_EXACT_SHA'){
    return Object.freeze({ready:false,reasons:Object.freeze(['MULTI_FILE_REPRESENTATION_BRIDGE_NOT_PROVEN']),representationEvidenceSha256:evidence});
  }
  if(inventory.artifacts.length!==1){
    return Object.freeze({ready:false,reasons:Object.freeze(['SINGLE_FILE_BRIDGE_REQUIRES_EXACTLY_ONE_RUNTIME_ARTIFACT']),representationEvidenceSha256:evidence});
  }
  const artifact=inventory.artifacts[0];
  if(artifact.contentSha256!==binding.modelManifest.sha256
    || artifact.contentSha256!==binding.representationContentSha256){
    return Object.freeze({ready:false,reasons:Object.freeze(['SINGLE_FILE_REPRESENTATION_SHA_MISMATCH']),representationEvidenceSha256:evidence});
  }
  if(binding.representationKind==='IDENTICAL_REFERENCE_ARTIFACTS'
    && binding.representationContentSha256!==binding.sourceModelContentSha256){
    return Object.freeze({ready:false,reasons:Object.freeze(['IDENTICAL_REFERENCE_REPRESENTATION_CONTENT_MISMATCH']),representationEvidenceSha256:evidence});
  }
  if(binding.modelManifest.sizeBytes!==artifact.bytes){
    return Object.freeze({ready:false,reasons:Object.freeze(['MODEL_MANIFEST_SIZE_DIFFERS_FROM_TARGET_ARTIFACT']),representationEvidenceSha256:evidence});
  }
  return Object.freeze({ready:true,reasons:Object.freeze([]),representationEvidenceSha256:evidence});
}

async function validateDeviceBenchmarkBinding(
  binding:HsmeFoundationTargetDeviceBindingV1,
  snapshot:DeviceCapabilitySnapshot,
  evidence:BenchmarkEvidence,
  nowMs:number,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<Readonly<{ok:boolean;reasons:readonly string[];deviceCapabilityKey:string}>>{
  const reasons:string[]=[];
  if(snapshot.schemaVersion!==1)reasons.push('DEVICE_SNAPSHOT_SCHEMA_UNSUPPORTED');
  const deviceCapabilityKey=await deviceCapabilityKeyForBenchmarkEvidenceV1(snapshot,hash);
  if(!HEX64.test(deviceCapabilityKey))fail('hsme_target_adapter_device_hash','deviceCapabilityKey hash port result must be lowercase SHA-256');
  if(binding.targetTier==='MOBILE_DEFAULT'){
    if(snapshot.profile.deviceClass!=='MOBILE')reasons.push('MOBILE_TARGET_REQUIRES_MOBILE_DEVICE_CLASS');
    if(snapshot.profile.platform!=='ANDROID'&&snapshot.profile.platform!=='IOS')reasons.push('MOBILE_TARGET_REQUIRES_ANDROID_OR_IOS');
  }else{
    if(snapshot.profile.deviceClass!=='DESKTOP')reasons.push('DESKTOP_TARGET_REQUIRES_DESKTOP_DEVICE_CLASS');
    if(!['WINDOWS','MACOS','LINUX'].includes(snapshot.profile.platform))reasons.push('DESKTOP_TARGET_PLATFORM_INVALID');
  }
  if(snapshot.profile.tier==='UNKNOWN'||snapshot.profile.ramMb==='UNKNOWN')reasons.push('TARGET_DEVICE_RESOURCE_EVIDENCE_UNKNOWN');
  if(!binding.modelManifest.supportedPlatforms.includes(snapshot.profile.platform))reasons.push('MODEL_MANIFEST_PLATFORM_UNSUPPORTED');
  if(snapshot.runtimeCapabilities[binding.modelManifest.runtime]!==true)reasons.push('MODEL_RUNTIME_UNAVAILABLE_ON_TARGET');
  const providerRuntime=providerCapability(evidence.provider);
  if(providerRuntime&&snapshot.runtimeCapabilities[providerRuntime]!==true)reasons.push('PROVIDER_RUNTIME_UNAVAILABLE_ON_TARGET');
  const providerAccelerator=providerManifestAccelerator(evidence.provider);
  if(providerAccelerator&&!binding.modelManifest.supportedAccelerators.includes(providerAccelerator)){
    reasons.push('MODEL_MANIFEST_PROVIDER_UNSUPPORTED');
  }

  if(!isValidBenchmarkEvidenceV1(evidence))reasons.push('BENCHMARK_EVIDENCE_INVALID');
  const expectedKey=evidenceKeyFor({
    deviceCapabilityKey,
    modelId:binding.modelManifest.modelId,
    modelVersion:binding.modelManifest.version,
    manifestSha256:binding.modelManifest.sha256,
    runtime:binding.modelManifest.runtime,
  },evidence.provider);
  if(evidence.deviceCapabilityKey!==deviceCapabilityKey)reasons.push('BENCHMARK_DEVICE_KEY_MISMATCH');
  if(evidence.modelId!==binding.modelManifest.modelId
    || evidence.modelVersion!==binding.modelManifest.version
    || evidence.manifestSha256!==binding.modelManifest.sha256
    || evidence.runtime!==binding.modelManifest.runtime){
    reasons.push('BENCHMARK_MODEL_RUNTIME_BINDING_MISMATCH');
  }
  if(evidence.evidenceKey!==expectedKey)reasons.push('BENCHMARK_EVIDENCE_KEY_MISMATCH');
  if(evidence.capturedAt>nowMs)reasons.push('BENCHMARK_FROM_FUTURE');
  if(evidence.expiresAt<nowMs)reasons.push('BENCHMARK_STALE');
  if(!['AVAILABLE','INSTALLED','READY'].includes(binding.modelManifest.status)){
    reasons.push('TARGET_MODEL_STATUS_UNSAFE');
  }
  return deepFreeze({ok:reasons.length===0,reasons:Object.freeze([...new Set(reasons)].sort()),deviceCapabilityKey});
}

function normalizeBindingSet(raw:unknown):HsmeFoundationTargetDeviceBindingSetV1{
  const set=exactRecord(raw,[
    'schemaVersion','records','productionAuthorityGranted','modelFleetPromotionAllowed','installOrDownloadAllowed','winnerSelectionAllowed',
  ],'bindings');
  if(set.schemaVersion!==HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA)fail('hsme_target_adapter_schema','binding set schema mismatch');
  for(const field of ['productionAuthorityGranted','modelFleetPromotionAllowed','installOrDownloadAllowed','winnerSelectionAllowed']){
    if(set[field]!==false)fail('hsme_target_adapter_authority','binding set authority must remain false: '+field);
  }
  if(!Array.isArray(set.records)||set.records.length<1||set.records.length>16)fail('hsme_target_adapter_records','binding records must contain 1..16 entries');
  const records=set.records.map((value,index)=>normalizeBinding(value,'bindings.records['+index+']'));
  const keys=records.map(value=>key(value.candidateId,value.capability));
  if(new Set(keys).size!==keys.length)fail('hsme_target_adapter_duplicate','candidate/capability binding must be unique');
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA,
    records:Object.freeze(records.sort((a,b)=>lexical(key(a.candidateId,a.capability),key(b.candidateId,b.capability)))),
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
    winnerSelectionAllowed:false,
  });
}

function normalizeBinding(raw:unknown,path:string):HsmeFoundationTargetDeviceBindingV1{
  const record=exactRecord(raw,[
    'candidateId','capability','targetTier','sourceModelContentSha256','sourceExecutionProfileSha256',
    'representationKind','representationContentSha256','runtimeInventory','modelManifest',
    'representationBridgeMode','deviceSnapshot','benchmarkEvidence','measurementAttestation',
  ],path);
  const manifest=normalizeManifest(record.modelManifest,path+'.modelManifest');
  return deepFreeze({
    candidateId:identifier(record.candidateId,path+'.candidateId',120),
    capability:enumValue(record.capability,CAPABILITIES,path+'.capability'),
    targetTier:enumValue(record.targetTier,TARGET_TIERS,path+'.targetTier'),
    sourceModelContentSha256:sha256(record.sourceModelContentSha256,path+'.sourceModelContentSha256'),
    sourceExecutionProfileSha256:sha256(record.sourceExecutionProfileSha256,path+'.sourceExecutionProfileSha256'),
    representationKind:enumValue(record.representationKind,REPRESENTATION_KINDS,path+'.representationKind'),
    representationContentSha256:sha256(record.representationContentSha256,path+'.representationContentSha256'),
    runtimeInventory:normalizeHsmeFoundationRuntimeInventoryV1(record.runtimeInventory),
    modelManifest:manifest,
    representationBridgeMode:enumValue(record.representationBridgeMode,Object.freeze(['SINGLE_FILE_EXACT_SHA','MULTI_FILE_UNSUPPORTED'] as const),path+'.representationBridgeMode'),
    deviceSnapshot:record.deviceSnapshot===null?null:normalizeDeviceSnapshot(record.deviceSnapshot,path+'.deviceSnapshot'),
    benchmarkEvidence:record.benchmarkEvidence===null?null:normalizeBenchmarkEvidence(record.benchmarkEvidence,path+'.benchmarkEvidence'),
    measurementAttestation:record.measurementAttestation===null?null:normalizeMeasurementAttestation(record.measurementAttestation),
  });
}

function normalizeManifest(raw:unknown,path:string):ModelManifest{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_target_adapter_manifest',path+' must be object');
  const value=raw as Record<string,any>;
  const required=['modelId','version','family','capabilities','modelFormat','runtime','sizeBytes','requiredRam','requiredVram','supportedPlatforms','supportedAccelerators','estimatedLatency','qualityScore','energyScore','privacyLevel','license','publisher','downloadUri','sha256','signature','status','stabilityScore'];
  for(const field of required)if(!Object.hasOwn(value,field))fail('hsme_target_adapter_manifest_field',path+'.'+field+' required');
  if(typeof value.modelId!=='string'||!value.modelId)fail('hsme_target_adapter_manifest_id','modelId invalid');
  if(typeof value.version!=='string'||!value.version)fail('hsme_target_adapter_manifest_version','version invalid');
  if(!HEX64.test(value.sha256))fail('hsme_target_adapter_manifest_sha','manifest sha256 invalid');
  if(!['ONNX_RUNTIME','WEBGPU','WASM','NNAPI','DIRECTML','CUDA','METAL','VULKAN'].includes(value.runtime))fail('hsme_target_adapter_manifest_runtime','runtime invalid');
  if(!['ONNX','TFLITE','SAFETENSORS','GGUF'].includes(value.modelFormat))fail('hsme_target_adapter_manifest_format','modelFormat invalid');
  if(!['AVAILABLE','DOWNLOADING','VERIFYING','STAGED','UPDATING','ROLLING_BACK','INSTALLED','READY','OUTDATED','DISABLED','QUARANTINED','FAILED','REMOVING'].includes(value.status))fail('hsme_target_adapter_manifest_status','status invalid');
  if(!Number.isSafeInteger(value.sizeBytes)||value.sizeBytes<1)fail('hsme_target_adapter_manifest_size','sizeBytes invalid');
  if(!Array.isArray(value.supportedPlatforms)||value.supportedPlatforms.length<1)fail('hsme_target_adapter_manifest_platforms','supportedPlatforms invalid');
  return deepFreeze(structuredClone(raw)) as ModelManifest;
}

function normalizeDeviceSnapshot(raw:unknown,path:string):DeviceCapabilitySnapshot{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_target_adapter_device',path+' must be object');
  const value=structuredClone(raw) as DeviceCapabilitySnapshot;
  if(value.schemaVersion!==1||!value.profile||!value.runtimeCapabilities)fail('hsme_target_adapter_device_schema',path+' invalid');
  return deepFreeze(value);
}

function normalizeBenchmarkEvidence(raw:unknown,path:string):BenchmarkEvidence{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_target_adapter_benchmark',path+' must be object');
  const value=deepFreeze(structuredClone(raw)) as BenchmarkEvidence;
  if(!isValidBenchmarkEvidenceV1(value))fail('hsme_target_adapter_benchmark_invalid',path+' invalid');
  return value;
}

function normalizeMeasurementAttestation(raw:unknown):HsmeFoundationTargetDeviceMeasurementAttestationV1{
  const record=exactRecord(raw,[
    'schemaVersion','benchmarkEvidenceKey','benchmarkEvidenceSha256','measurementCaptureSha256','memoryAccountingMode','ramMetric','vramMetric',
    'coldLatencySource','warmLatencySource','millisecondsToMicroseconds','evidenceMethodSha256',
    'productionAuthorityGranted','winnerSelectionAllowed',
  ],'measurementAttestation');
  if(record.schemaVersion!==HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA){
    fail('hsme_target_adapter_method_schema','measurement attestation schema mismatch');
  }
  if(record.productionAuthorityGranted!==false||record.winnerSelectionAllowed!==false){
    fail('hsme_target_adapter_method_authority','measurement attestation authority must remain false');
  }
  return deepFreeze({
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA,
    benchmarkEvidenceKey:boundedString(record.benchmarkEvidenceKey,'measurementAttestation.benchmarkEvidenceKey',700),
    benchmarkEvidenceSha256:sha256(record.benchmarkEvidenceSha256,'measurementAttestation.benchmarkEvidenceSha256'),
    measurementCaptureSha256:sha256(record.measurementCaptureSha256,'measurementAttestation.measurementCaptureSha256'),
    memoryAccountingMode:enumValue(record.memoryAccountingMode,MEMORY_MODES,'measurementAttestation.memoryAccountingMode'),
    ramMetric:enumValue(record.ramMetric,Object.freeze(['PEAK_PROCESS_WORKING_SET_BYTES','PEAK_HOST_WORKING_SET_BYTES'] as const),'measurementAttestation.ramMetric'),
    vramMetric:enumValue(record.vramMetric,Object.freeze(['NOT_SEPARATELY_BUDGETED','PEAK_ACCELERATOR_BYTES'] as const),'measurementAttestation.vramMetric'),
    coldLatencySource:literal(record.coldLatencySource,'coldStartMs','measurementAttestation.coldLatencySource'),
    warmLatencySource:enumValue(record.warmLatencySource,WARM_SOURCES,'measurementAttestation.warmLatencySource'),
    millisecondsToMicroseconds:literal(record.millisecondsToMicroseconds,'EXACT_X1000','measurementAttestation.millisecondsToMicroseconds'),
    evidenceMethodSha256:sha256(record.evidenceMethodSha256,'measurementAttestation.evidenceMethodSha256'),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  });
}

function normalizeBenchmarkEvidenceForDigest(evidence:BenchmarkEvidence):BenchmarkEvidence{
  return deepFreeze(structuredClone(evidence));
}

function providerCapability(provider:ExecutionProvider):RuntimeKind|null{
  if(provider==='webgpu')return 'WEBGPU';
  if(provider==='wasm')return 'WASM';
  if(provider==='cuda')return 'CUDA';
  if(provider==='dml')return 'DIRECTML';
  if(provider==='coreml')return 'METAL';
  if(provider==='nnapi')return 'NNAPI';
  return null;
}
function providerManifestAccelerator(provider:ExecutionProvider):RuntimeKind|null{
  if(provider==='webgpu')return 'WEBGPU';
  if(provider==='wasm')return 'WASM';
  if(provider==='cuda')return 'CUDA';
  if(provider==='dml')return 'DIRECTML';
  if(provider==='coreml')return 'METAL';
  if(provider==='nnapi')return 'NNAPI';
  return null;
}

function exactMicros(ms:number,path:string):number|null{
  if(!Number.isFinite(ms)||ms<0)return null;
  const micros=ms*1000;
  if(!Number.isSafeInteger(micros)||micros<1)return null;
  return micros;
}

function freezeRow(
  binding:Pick<HsmeFoundationTargetDeviceBindingV1,'candidateId'|'capability'>,
  state:AdapterState,
  reasons:readonly string[],
  deviceCapabilityKey:string='UNKNOWN',
  benchmarkEvidenceKey:string='UNKNOWN',
  targetEvidenceSha256:string='UNKNOWN',
):HsmeFoundationTargetDeviceAdapterRowV1{
  return deepFreeze({
    candidateId:binding.candidateId,
    capability:binding.capability,
    state,
    reasons:Object.freeze([...new Set(reasons)].sort()),
    deviceCapabilityKey,
    benchmarkEvidenceKey,
    targetEvidenceSha256,
  });
}

async function digest(
  domain:string,
  value:unknown,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<string>{
  return digestRaw(domain+JSON.stringify(value),hash);
}
async function digestRaw(value:string,hash:HsmeFoundationBenchmarkRunHashPortV1):Promise<string>{
  const result=await hash.sha256(new TextEncoder().encode(value));
  if(!HEX64.test(result))fail('hsme_target_adapter_hash','hash port must return lowercase SHA-256');
  return result;
}
function exactRecord(raw:unknown,allowed:readonly string[],path:string):Record<string,any>{
  if(!raw||typeof raw!=='object'||Array.isArray(raw))fail('hsme_target_adapter_record',path+' must be object');
  const record=raw as Record<string,any>;
  for(const key of Object.keys(record))if(!allowed.includes(key))fail('hsme_target_adapter_field_unknown',path+'.'+key+' is not allowed');
  for(const key of allowed)if(!Object.hasOwn(record,key))fail('hsme_target_adapter_field_missing',path+'.'+key+' required');
  return record;
}
function enumValue<T extends readonly string[]>(value:unknown,values:T,path:string):T[number]{
  if(typeof value!=='string'||!values.includes(value as T[number]))fail('hsme_target_adapter_enum',path+' invalid');
  return value as T[number];
}
function literal<T extends string>(value:unknown,expected:T,path:string):T{
  if(value!==expected)fail('hsme_target_adapter_literal',path+' must equal '+expected);
  return expected;
}
function identifier(value:unknown,path:string,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value))fail('hsme_target_adapter_identifier',path+' invalid');
  return value;
}
function boundedString(value:unknown,path:string,max:number):string{
  if(typeof value!=='string'||value.length<1||value.length>max)fail('hsme_target_adapter_string',path+' invalid');
  return value;
}
function sha256(value:unknown,path:string):string{
  if(typeof value!=='string'||!HEX64.test(value))fail('hsme_target_adapter_sha',path+' invalid');
  return value;
}
function key(candidateId:string,capability:string):string{return candidateId+'\0'+capability;}
function lexical(a:string,b:string):number{return a<b?-1:a>b?1:0;}
function deepFreeze<T>(value:T):T{
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){
    Object.freeze(value);
    for(const child of Object.values(value as Record<string,unknown>))deepFreeze(child);
  }
  return value;
}
function fail(code:string,message:string):never{throw new HsmeFoundationTargetDeviceAdapterV1Error(code,message);}
