import {
  adaptHsmeFoundationTargetDeviceBenchmarkEvidenceV1,
  HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_EVIDENCE_DIGEST_DOMAIN,
  HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_METHOD_DIGEST_DOMAIN,
  type HsmeFoundationTargetDeviceBindingSetV1,
} from './HsmeFoundationTargetDeviceBenchmarkAdapterV1';
import {
  type HsmeFoundationTierBudgetPolicyV1,
  type HsmeFoundationTargetTierEvidenceV1,
} from './HsmeFoundationTierQualificationV1';
import {
  hsmeFoundationRuntimeInventoryStableJsonV1,
} from './HsmeFoundationResourceEvidenceV1';
import {
  assessHsmeFoundationPhysicalMobileValidationEvidenceV1,
  type HsmeFoundationPhysicalMobileRunTrustPortV1,
  type HsmeFoundationPhysicalMobileValidationBundleV1,
} from './HsmeFoundationPhysicalMobileValidationEvidenceV1';
import type {HsmeFoundationBenchmarkRunHashPortV1} from './HsmeFoundationBenchmarkRunEvidenceV1';

export const HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA =
  'BERS_HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1' as const;
export const HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_DIGEST_DOMAIN =
  'bers:hsme:physical-target-evidence-binding:v1\0' as const;
export const HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN =
  'bers:hsme:target-device-adapted-evidence:v1\0' as const;

const HEX64=/^[0-9a-f]{64}$/;
const CAPABILITIES=Object.freeze(['TEXT_TO_IMAGE','IMAGE_EDITING'] as const);
type Capability=typeof CAPABILITIES[number];

export type HsmeFoundationPhysicalTargetEvidenceBindingStateV1=
  | 'PHYSICAL_TARGET_EVIDENCE_REQUIRED'
  | 'PHYSICAL_TARGET_EVIDENCE_INVALID'
  | 'PHYSICAL_TARGET_EVIDENCE_READY';

export type HsmeFoundationPhysicalTargetEvidenceBindingV1=Readonly<{
  schemaVersion:typeof HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA;
  candidateId:string;
  capability:Capability;
  state:HsmeFoundationPhysicalTargetEvidenceBindingStateV1;
  blockers:readonly string[];
  deviceCapabilityKey:string|'UNKNOWN';
  benchmarkEvidenceKey:string|'UNKNOWN';
  measurementCaptureSha256:string|'UNKNOWN';
  targetEvidenceSha256:string|'UNKNOWN';
  physicalRunPayloadSha256:string|'UNKNOWN';
  physicalTargetBindingSha256:string|'UNKNOWN';
  targetEvidence:HsmeFoundationTargetTierEvidenceV1|null;
  selectedCandidateIdAllowed:false;
  reuseAdvanceAllowed:false;
  fullStudentEscalationAllowed:false;
  modelFleetPromotionAllowed:false;
  installOrDownloadAllowed:false;
  productionAuthorityGranted:false;
  providerAuthorityGranted:false;
  billingAuthorityGranted:false;
  projectArtifactMutationAllowed:false;
  aeeExecutionAuthorityGranted:false;
  durableModelFleetPromotionAllowed:false;
  trainingOrDistillationAllowed:false;
  winnerSelectionAllowed:false;
}>;

export async function proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
  rawBudgetPolicy:HsmeFoundationTierBudgetPolicyV1,
  rawBindingSet:HsmeFoundationTargetDeviceBindingSetV1,
  candidateId:string,
  capability:Capability,
  physicalBundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  trust:HsmeFoundationPhysicalMobileRunTrustPortV1,
  expectedTestedCommitSha:string,
  nowMs:number,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
):Promise<HsmeFoundationPhysicalTargetEvidenceBindingV1>{
  const blockers:string[]=[];
  if(typeof candidateId!=='string'||candidateId.length<1||candidateId.length>120){
    return result(candidateId,capability,'PHYSICAL_TARGET_EVIDENCE_INVALID',['CANDIDATE_ID_INVALID']);
  }
  if(!CAPABILITIES.includes(capability)) {
    return result(candidateId,capability,'PHYSICAL_TARGET_EVIDENCE_INVALID',['CAPABILITY_INVALID']);
  }

  const physical=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    physicalBundle,trust,expectedTestedCommitSha,nowMs,hash,
  );
  if(physical.integrityState!=='EVIDENCE_INTEGRITY_VERIFIED'){
    blockers.push('PHYSICAL_BUNDLE_INTEGRITY_INVALID');
  }
  if(physical.physicalState==='REAL_DEVICE_ATTESTATION_REQUIRED'){
    blockers.push('PHYSICAL_ATTESTATION_REQUIRED');
  }else if(physical.physicalState!=='REAL_DEVICE_EVIDENCE_VERIFIED'){
    blockers.push('PHYSICAL_DEVICE_EVIDENCE_INVALID');
  }

  let adapter;
  try{
    adapter=await adaptHsmeFoundationTargetDeviceBenchmarkEvidenceV1(
      rawBudgetPolicy,rawBindingSet,nowMs,hash,
    );
  }catch{
    blockers.push('TARGET_DEVICE_ADAPTER_INVALID');
    return result(
      candidateId,capability,
      physical.physicalState==='REAL_DEVICE_ATTESTATION_REQUIRED'
        ?'PHYSICAL_TARGET_EVIDENCE_REQUIRED'
        :'PHYSICAL_TARGET_EVIDENCE_INVALID',
      blockers,
      {
        measurementCaptureSha256:physicalBundle.measuredCapture.measurementCaptureSha256,
        physicalRunPayloadSha256:physical.physicalRunPayloadSha256??'UNKNOWN',
      },
    );
  }

  const rows=adapter.rows.filter(row=>row.candidateId===candidateId&&row.capability===capability);
  const records=adapter.targetEvidenceSet.records.filter(
    record=>record.candidateId===candidateId&&record.capability===capability,
  );
  if(rows.length!==1)blockers.push(rows.length===0?'TARGET_ADAPTER_ROW_MISSING':'TARGET_ADAPTER_ROW_DUPLICATE');
  if(records.length!==1)blockers.push(records.length===0?'TARGET_EVIDENCE_MISSING':'TARGET_EVIDENCE_DUPLICATE');

  const row=rows[0];
  const target=records[0];
  const capture=physicalBundle.measuredCapture;
  const raw=capture.rawCapture;

  if(row&&row.state!=='TARGET_DEVICE_EVIDENCE_READY')blockers.push('TARGET_DEVICE_ADAPTER_NOT_READY');
  if(row&&row.deviceCapabilityKey!==raw.deviceCapabilityKey)blockers.push('TARGET_DEVICE_KEY_DRIFT');
  if(row&&row.benchmarkEvidenceKey!==capture.benchmarkEvidence.evidenceKey)blockers.push('TARGET_BENCHMARK_KEY_DRIFT');

  let targetEvidenceSha256:string|'UNKNOWN'='UNKNOWN';
  if(target&&row){
    targetEvidenceSha256=row.targetEvidenceSha256;
    if(!HEX64.test(targetEvidenceSha256))blockers.push('TARGET_EVIDENCE_ROW_DIGEST_INVALID');
    const recomputedTargetEvidenceSha256=await digestValue(
      HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN,
      target,
      hash,
      blockers,
      'TARGET_EVIDENCE_REHASH_INVALID',
    );
    if(recomputedTargetEvidenceSha256!==null&&recomputedTargetEvidenceSha256!==targetEvidenceSha256){
      blockers.push('TARGET_EVIDENCE_ROW_DIGEST_MISMATCH');
    }
    await validateTargetAgainstPhysical(target,physicalBundle,hash,blockers);
  }

  const physicalReady=physical.physicalState==='REAL_DEVICE_EVIDENCE_VERIFIED'
    && physical.integrityState==='EVIDENCE_INTEGRITY_VERIFIED';
  const proofInputsReady=target!==undefined
    && row!==undefined
    && row.state==='TARGET_DEVICE_EVIDENCE_READY'
    && targetEvidenceSha256!=='UNKNOWN'
    && physical.physicalRunPayloadSha256!==null
    && HEX64.test(physical.physicalRunPayloadSha256);

  let physicalTargetBindingSha256:string|'UNKNOWN'='UNKNOWN';
  if(proofInputsReady&&blockers.length===0){
    physicalTargetBindingSha256=(await digestValue(
      HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_DIGEST_DOMAIN,
      {
        schemaVersion:HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA,
        candidateId,
        capability,
        deviceCapabilityKey:raw.deviceCapabilityKey,
        benchmarkEvidenceKey:capture.benchmarkEvidence.evidenceKey,
        measurementCaptureSha256:capture.measurementCaptureSha256,
        targetEvidenceSha256,
        physicalRunPayloadSha256:physical.physicalRunPayloadSha256,
        selectedCandidateIdAllowed:false,
        reuseAdvanceAllowed:false,
        fullStudentEscalationAllowed:false,
        productionAuthorityGranted:false,
        winnerSelectionAllowed:false,
      },
      hash,blockers,'PHYSICAL_TARGET_BINDING_HASH_INVALID',
    ))??'UNKNOWN';
  }

  const state:HsmeFoundationPhysicalTargetEvidenceBindingStateV1=
    blockers.length===0&&physicalReady&&physicalTargetBindingSha256!=='UNKNOWN'
      ?'PHYSICAL_TARGET_EVIDENCE_READY'
      : blockers.every(value=>value==='PHYSICAL_ATTESTATION_REQUIRED')
        ?'PHYSICAL_TARGET_EVIDENCE_REQUIRED'
        : 'PHYSICAL_TARGET_EVIDENCE_INVALID';

  return result(candidateId,capability,state,blockers,{
    deviceCapabilityKey:row?.deviceCapabilityKey??'UNKNOWN',
    benchmarkEvidenceKey:row?.benchmarkEvidenceKey??'UNKNOWN',
    measurementCaptureSha256:capture.measurementCaptureSha256,
    targetEvidenceSha256,
    physicalRunPayloadSha256:physical.physicalRunPayloadSha256??'UNKNOWN',
    physicalTargetBindingSha256,
    targetEvidence:state==='PHYSICAL_TARGET_EVIDENCE_READY'&&target?target:null,
  });
}

async function validateTargetAgainstPhysical(
  target:HsmeFoundationTargetTierEvidenceV1,
  bundle:HsmeFoundationPhysicalMobileValidationBundleV1,
  hash:HsmeFoundationBenchmarkRunHashPortV1,
  blockers:string[],
):Promise<void>{
  const capture=bundle.measuredCapture;
  const raw=capture.rawCapture;
  const benchmark=capture.benchmarkEvidence;
  if(target.targetTier!=='MOBILE_DEFAULT')blockers.push('MOBILE_TARGET_TIER_REQUIRED');
  if(target.targetHardwareClass!=='MOBILE_TARGET_DEVICE')blockers.push('MOBILE_TARGET_HARDWARE_REQUIRED');
  if(target.workingMemoryKind!=='TARGET_PEAK_WORKING_SET_BYTES')blockers.push('TARGET_WORKING_SET_SEMANTIC_INVALID');
  if(target.representationContentSha256!==raw.manifestSha256)blockers.push('TARGET_REPRESENTATION_MANIFEST_DRIFT');
  if(raw.representationBindingSha256!==target.representationEvidenceSha256){
    blockers.push('TARGET_REPRESENTATION_BINDING_DRIFT');
  }
  if(target.peakWorkingMemoryBytes!==benchmark.ramBytes)blockers.push('TARGET_WORKING_SET_AGGREGATE_DRIFT');
  const warmMs=capture.measurementAttestation.warmLatencySource==='latencyMs'
    ?benchmark.latencyMs
    :benchmark.warmStartMs;
  if(target.coldEndToEndLatencyMicros!==exactMicros(benchmark.coldStartMs)
    || target.warmEndToEndLatencyMicros!==exactMicros(warmMs)){
    blockers.push('TARGET_LATENCY_AGGREGATE_DRIFT');
  }

  const inventorySha256=await digestText(
    '',hsmeFoundationRuntimeInventoryStableJsonV1(target.runtimeInventory),hash,blockers,'TARGET_RUNTIME_INVENTORY_HASH_INVALID',
  );
  if(inventorySha256!==raw.targetRuntimeInventorySha256)blockers.push('TARGET_RUNTIME_INVENTORY_DRIFT');

  const methodSha256=await digestValue(
    HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_METHOD_DIGEST_DOMAIN,
    capture.measurementAttestation,hash,blockers,'TARGET_MEASUREMENT_METHOD_HASH_INVALID',
  );
  if(methodSha256!==target.measurementMethodSha256)blockers.push('TARGET_MEASUREMENT_METHOD_DRIFT');

  const evidenceSha256=await digestValue(
    HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_EVIDENCE_DIGEST_DOMAIN,
    capture.benchmarkEvidence,hash,blockers,'TARGET_MEASUREMENT_EVIDENCE_HASH_INVALID',
  );
  if(evidenceSha256!==target.measurementEvidenceSha256)blockers.push('TARGET_MEASUREMENT_EVIDENCE_DRIFT');
}

function exactMicros(ms:number):number|'INVALID'{
  if(!Number.isFinite(ms)||ms<=0)return 'INVALID';
  const value=ms*1000;
  return Number.isSafeInteger(value)?value:'INVALID';
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
    const digest=await hash.sha256(new TextEncoder().encode(domain+value));
    if(!HEX64.test(digest))throw new Error('invalid digest');
    return digest;
  }catch{
    blockers.push(blocker);
    return null;
  }
}

function result(
  candidateId:string,
  capability:Capability,
  state:HsmeFoundationPhysicalTargetEvidenceBindingStateV1,
  blockers:readonly string[],
  values:Partial<Pick<
    HsmeFoundationPhysicalTargetEvidenceBindingV1,
    'deviceCapabilityKey'|'benchmarkEvidenceKey'|'measurementCaptureSha256'|
    'targetEvidenceSha256'|'physicalRunPayloadSha256'|'physicalTargetBindingSha256'|'targetEvidence'
  >>={},
):HsmeFoundationPhysicalTargetEvidenceBindingV1{
  return Object.freeze({
    schemaVersion:HSME_FOUNDATION_PHYSICAL_TARGET_EVIDENCE_BINDING_V1_SCHEMA,
    candidateId,
    capability,
    state,
    blockers:Object.freeze([...new Set(blockers)]),
    deviceCapabilityKey:values.deviceCapabilityKey??'UNKNOWN',
    benchmarkEvidenceKey:values.benchmarkEvidenceKey??'UNKNOWN',
    measurementCaptureSha256:values.measurementCaptureSha256??'UNKNOWN',
    targetEvidenceSha256:values.targetEvidenceSha256??'UNKNOWN',
    physicalRunPayloadSha256:values.physicalRunPayloadSha256??'UNKNOWN',
    physicalTargetBindingSha256:values.physicalTargetBindingSha256??'UNKNOWN',
    targetEvidence:values.targetEvidence??null,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
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
