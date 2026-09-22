import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  deviceCapabilityKeyForBenchmarkEvidenceV1,
  evidenceKeyFor,
} from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import {
  HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA,
  HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA,
  adaptHsmeFoundationTargetDeviceBenchmarkEvidenceV1,
  hsmeFoundationTargetDeviceBenchmarkEvidenceV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTargetDeviceBenchmarkAdapterV1.ts';
import {
  HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
  normalizeHsmeFoundationTargetTierEvidenceSetV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTierQualificationV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const runtimeCaps=(overrides={})=>({
  ONNX_RUNTIME:true,WEBGPU:false,WASM:true,NNAPI:true,DIRECTML:false,CUDA:false,METAL:false,VULKAN:false,...overrides,
});
const mobileSnapshot=(overrides={})=>({
  schemaVersion:1,
  capturedAt:1_000,
  profile:{
    platform:'ANDROID',deviceClass:'MOBILE',tier:'HIGH',ramMb:8_192,vramMb:0,storageFreeBytes:50_000_000_000,
    ...overrides,
  },
  runtimeCapabilities:runtimeCaps(),
  evidence:{observedSignals:[],unknownSignals:[],observedRuntimes:[],unknownRuntimes:[]},
});
const desktopSnapshot=(overrides={})=>({
  schemaVersion:1,
  capturedAt:1_000,
  profile:{
    platform:'LINUX',deviceClass:'DESKTOP',tier:'HIGH',ramMb:16_384,vramMb:8_192,storageFreeBytes:50_000_000_000,
    ...overrides,
  },
  runtimeCapabilities:runtimeCaps({CUDA:true,NNAPI:false}),
  evidence:{observedSignals:[],unknownSignals:[],observedRuntimes:[],unknownRuntimes:[]},
});
function policy(targetTier='MOBILE_DEFAULT'){
  return {
    schemaVersion:HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
    policyId:'adapter-'+targetTier.toLowerCase().replaceAll('_','-')+'-v1',
    targetTier,
    maxInstalledBytes:2_000_000_000,
    maxWorkingMemoryBytes:3_000_000_000,
    maxColdEndToEndLatencyMicros:2_000_000,
    maxWarmEndToEndLatencyMicros:500_000,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}
function manifest(sha,sizeBytes,overrides={}){
  return {
    modelId:'hsme-mobile-candidate',
    version:'1.0.0',
    family:'hsme',
    capabilities:['IMAGE_EDITING'],
    modelFormat:'ONNX',
    runtime:'ONNX_RUNTIME',
    sizeBytes,
    requiredRam:1024,
    requiredVram:0,
    supportedPlatforms:['ANDROID','IOS'],
    supportedAccelerators:['ONNX_RUNTIME','NNAPI'],
    estimatedLatency:70,
    qualityScore:.9,
    energyScore:.8,
    privacyLevel:'PRIVATE',
    license:'Apache-2.0',
    publisher:'bers',
    downloadUri:'https://models.example/hsme.onnx',
    sha256:sha,
    signature:'signed',
    status:'AVAILABLE',
    stabilityScore:.95,
    ...overrides,
  };
}
function inventory(candidateId,sha,bytes,extra=[]){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId,
    immutableRevision:'a'.repeat(40),
    complete:true,
    artifacts:[
      {relativePath:'model.onnx',bytes,contentSha256:sha},
      ...extra,
    ].sort((a,b)=>a.relativePath<b.relativePath?-1:a.relativePath>b.relativePath?1:0),
  };
}
async function evidence(snapshot,model,overrides={}){
  const deviceCapabilityKey=await deviceCapabilityKeyForBenchmarkEvidenceV1(snapshot,hashPort);
  const provider=overrides.provider??'nnapi';
  const binding={
    deviceCapabilityKey,
    modelId:overrides.modelId??model.modelId,
    modelVersion:overrides.modelVersion??model.version,
    manifestSha256:overrides.manifestSha256??model.sha256,
    runtime:overrides.runtime??model.runtime,
  };
  return {
    schemaVersion:1,
    evidenceKey:evidenceKeyFor(binding,provider),
    ...binding,
    provider,
    capturedAt:1_000,
    expiresAt:10_000,
    sampleCount:5,
    coldStartMs:250,
    warmStartMs:80,
    latencyMs:70,
    ramBytes:1_200_000_000,
    vramBytes:0,
    energyEstimate:.4,
    successRate:1,
    outputDimensions:[1,512,512],
    ...overrides,
    evidenceKey:evidenceKeyFor(binding,provider),
  };
}
async function attestation(evidenceValue,overrides={}){
  const benchmarkEvidenceSha256=await hsmeFoundationTargetDeviceBenchmarkEvidenceV1Digest(evidenceValue,hashPort);
  return {
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_MEASUREMENT_ATTESTATION_V1_SCHEMA,
    benchmarkEvidenceKey:evidenceValue.evidenceKey,
    benchmarkEvidenceSha256,
    measurementCaptureSha256:H('measurement-capture|'+benchmarkEvidenceSha256),
    memoryAccountingMode:'UNIFIED_PROCESS_WORKING_SET',
    ramMetric:'PEAK_PROCESS_WORKING_SET_BYTES',
    vramMetric:'NOT_SEPARATELY_BUDGETED',
    coldLatencySource:'coldStartMs',
    warmLatencySource:'latencyMs',
    millisecondsToMicroseconds:'EXACT_X1000',
    evidenceMethodSha256:H('measurement-method-v1'),
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
    ...overrides,
  };
}
async function baseRow(overrides={}){
  const candidateId='flux2-klein-4b-distilled-v1';
  const artifactSha=H('target-single-file-representation');
  const bytes=123_456_789;
  const device=mobileSnapshot();
  const model=manifest(artifactSha,bytes);
  const benchmark=await evidence(device,model);
  return {
    candidateId,
    capability:'IMAGE_EDITING',
    targetTier:'MOBILE_DEFAULT',
    sourceModelContentSha256:H('source-model'),
    sourceExecutionProfileSha256:H('source-profile'),
    representationKind:'TARGET_SPECIFIC_REPRESENTATION',
    representationContentSha256:artifactSha,
    runtimeInventory:inventory(candidateId,artifactSha,bytes),
    modelManifest:model,
    representationBridgeMode:'SINGLE_FILE_EXACT_SHA',
    deviceSnapshot:device,
    benchmarkEvidence:benchmark,
    measurementAttestation:await attestation(benchmark),
    ...overrides,
  };
}
function bindings(records){
  return {
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA,
    records,
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
    winnerSelectionAllowed:false,
  };
}
async function adapt(row,budget=policy(),now=2_000){
  return adaptHsmeFoundationTargetDeviceBenchmarkEvidenceV1(budget,bindings([row]),now,hashPort);
}

test('exact mobile single-file DeviceFleet evidence adapts into #634 target evidence without promotion authority',async()=>{
  const row=await baseRow();
  const result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_DEVICE_EVIDENCE_READY');
  assert.deepEqual(result.rows[0].reasons,[]);
  assert.match(result.rows[0].deviceCapabilityKey,/^[0-9a-f]{64}$/);
  assert.match(result.rows[0].targetEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(result.targetEvidenceSet.records.length,1);
  const target=result.targetEvidenceSet.records[0];
  assert.equal(target.targetTier,'MOBILE_DEFAULT');
  assert.equal(target.targetHardwareClass,'MOBILE_TARGET_DEVICE');
  assert.equal(target.workingMemoryKind,'TARGET_PEAK_WORKING_SET_BYTES');
  assert.equal(target.peakWorkingMemoryBytes,row.benchmarkEvidence.ramBytes);
  assert.equal(target.coldEndToEndLatencyMicros,250_000);
  assert.equal(target.warmEndToEndLatencyMicros,70_000);
  assert.equal(target.representationContentSha256,row.modelManifest.sha256);
  assert.doesNotThrow(()=>normalizeHsmeFoundationTargetTierEvidenceSetV1(result.targetEvidenceSet));
  assert.equal(result.modelFleetPromotionUsed,false);
  assert.equal(result.selectedCandidateIdAllowed,false);
  assert.equal(result.reuseAdvanceAllowed,false);
  assert.equal(result.fullStudentEscalationAllowed,false);
  assert.equal(result.productionAuthorityGranted,false);
  assert.equal(result.durableModelFleetPromotionAllowed,false);
});

test('measurement attestation cannot be replayed across a newer capture with the same evidenceKey',async()=>{
  const base=await baseRow();
  const staleAttestation=base.measurementAttestation;
  const newer={...base.benchmarkEvidence,capturedAt:1_500,latencyMs:71,ramBytes:1_250_000_000};
  const row={...base,benchmarkEvidence:newer,measurementAttestation:staleAttestation};
  const result=await adapt(row,policy(),2_000);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('MEASUREMENT_ATTESTATION_EVIDENCE_DIGEST_MISMATCH'));
});

test('measurement capture digest is mandatory and lowercase content-addressed',async()=>{
  const base=await baseRow();
  const row={...base,measurementAttestation:{...base.measurementAttestation,measurementCaptureSha256:'INVALID'}};
  await assert.rejects(adapt(row),error=>error?.code==='hsme_target_adapter_sha');
});

test('missing device benchmark stays TARGET_DEVICE_EVIDENCE_REQUIRED',async()=>{
  const row=await baseRow({deviceSnapshot:null,benchmarkEvidence:null,measurementAttestation:null});
  const result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_DEVICE_EVIDENCE_REQUIRED');
  assert.equal(result.targetEvidenceSet.records.length,0);
});

test('missing method attestation stays TARGET_MEASUREMENT_INSUFFICIENT',async()=>{
  const row=await baseRow({measurementAttestation:null});
  const result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_MEASUREMENT_INSUFFICIENT');
  assert.ok(result.rows[0].reasons.includes('MEASUREMENT_METHOD_ATTESTATION_REQUIRED'));
});

test('discrete host plus accelerator measurements are not silently collapsed into one working-set budget',async()=>{
  const base=await baseRow();
  const row={...base,measurementAttestation:await attestation(base.benchmarkEvidence,{
    memoryAccountingMode:'DISCRETE_HOST_PLUS_ACCELERATOR',
    ramMetric:'PEAK_HOST_WORKING_SET_BYTES',
    vramMetric:'PEAK_ACCELERATOR_BYTES',
  })};
  const result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_MEASUREMENT_INSUFFICIENT');
  assert.ok(result.rows[0].reasons.includes('NO_SINGLE_TARGET_WORKING_SET_SEMANTIC'));
});

test('multi-file target representation cannot masquerade behind one ModelManifest SHA',async()=>{
  const base=await baseRow();
  const second={relativePath:'weights-2.bin',bytes:9,contentSha256:H('second-artifact')};
  const row={
    ...base,
    representationBridgeMode:'MULTI_FILE_UNSUPPORTED',
    runtimeInventory:inventory(base.candidateId,base.representationContentSha256,base.modelManifest.sizeBytes,[second]),
  };
  const result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_BINDING_REQUIRED');
  assert.ok(result.rows[0].reasons.includes('MULTI_FILE_REPRESENTATION_BRIDGE_NOT_PROVEN'));
  assert.equal(result.targetEvidenceSet.records.length,0);
});

test('single-file representation bridge rejects manifest/content/size drift',async()=>{
  const base=await baseRow();
  let row={...base,modelManifest:{...base.modelManifest,sha256:H('wrong-manifest')}};
  let result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_BINDING_REQUIRED');
  assert.ok(result.rows[0].reasons.includes('SINGLE_FILE_REPRESENTATION_SHA_MISMATCH'));

  row={...base,modelManifest:{...base.modelManifest,sizeBytes:base.modelManifest.sizeBytes+1}};
  result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_BINDING_REQUIRED');
  assert.ok(result.rows[0].reasons.includes('MODEL_MANIFEST_SIZE_DIFFERS_FROM_TARGET_ARTIFACT'));
});

test('identical-reference representation must retain source model content digest',async()=>{
  const base=await baseRow();
  const row={...base,representationKind:'IDENTICAL_REFERENCE_ARTIFACTS'};
  const result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_BINDING_REQUIRED');
  assert.ok(result.rows[0].reasons.includes('IDENTICAL_REFERENCE_REPRESENTATION_CONTENT_MISMATCH'));
});

test('MOBILE_DEFAULT rejects desktop and unsupported target platforms',async()=>{
  const base=await baseRow();
  const desktop=desktopSnapshot();
  const desktopEvidence=await evidence(desktop,base.modelManifest,{provider:'cuda'});
  let row={...base,deviceSnapshot:desktop,benchmarkEvidence:desktopEvidence,measurementAttestation:await attestation(desktopEvidence)};
  let result=await adapt(row);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('MOBILE_TARGET_REQUIRES_MOBILE_DEVICE_CLASS'));

  const ios=mobileSnapshot({platform:'IOS'});
  const androidOnly={...base.modelManifest,supportedPlatforms:['ANDROID']};
  const iosEvidence=await evidence(ios,androidOnly);
  row={...base,modelManifest:androidOnly,deviceSnapshot:ios,benchmarkEvidence:iosEvidence,measurementAttestation:await attestation(iosEvidence)};
  result=await adapt(row);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('MODEL_MANIFEST_PLATFORM_UNSUPPORTED'));
});

test('stale and future benchmark evidence fail closed',async()=>{
  const base=await baseRow();
  let row={...base,benchmarkEvidence:{...base.benchmarkEvidence,expiresAt:1_500}};
  row.benchmarkEvidence.evidenceKey=evidenceKeyFor({
    deviceCapabilityKey:row.benchmarkEvidence.deviceCapabilityKey,
    modelId:row.benchmarkEvidence.modelId,
    modelVersion:row.benchmarkEvidence.modelVersion,
    manifestSha256:row.benchmarkEvidence.manifestSha256,
    runtime:row.benchmarkEvidence.runtime,
  },row.benchmarkEvidence.provider);
  row.measurementAttestation=await attestation(row.benchmarkEvidence);
  let result=await adapt(row,policy(),2_000);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('BENCHMARK_STALE'));

  row={...base,benchmarkEvidence:{...base.benchmarkEvidence,capturedAt:3_000,expiresAt:10_000}};
  row.benchmarkEvidence.evidenceKey=evidenceKeyFor({
    deviceCapabilityKey:row.benchmarkEvidence.deviceCapabilityKey,
    modelId:row.benchmarkEvidence.modelId,
    modelVersion:row.benchmarkEvidence.modelVersion,
    manifestSha256:row.benchmarkEvidence.manifestSha256,
    runtime:row.benchmarkEvidence.runtime,
  },row.benchmarkEvidence.provider);
  row.measurementAttestation=await attestation(row.benchmarkEvidence);
  result=await adapt(row,policy(),2_000);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('BENCHMARK_FROM_FUTURE'));
});

test('exact model version SHA runtime and provider capability binding is mandatory',async()=>{
  const base=await baseRow();
  const otherEvidence=await evidence(base.deviceSnapshot,base.modelManifest,{modelVersion:'2.0.0'});
  let row={...base,benchmarkEvidence:otherEvidence,measurementAttestation:await attestation(otherEvidence)};
  let result=await adapt(row);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('BENCHMARK_MODEL_RUNTIME_BINDING_MISMATCH'));

  const noNnapi={...base.deviceSnapshot,runtimeCapabilities:runtimeCaps({NNAPI:false})};
  const noNnapiEvidence=await evidence(noNnapi,base.modelManifest);
  row={...base,deviceSnapshot:noNnapi,benchmarkEvidence:noNnapiEvidence,measurementAttestation:await attestation(noNnapiEvidence)};
  result=await adapt(row);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('PROVIDER_RUNTIME_UNAVAILABLE_ON_TARGET'));
});

test('provider must also be explicitly allowed by ModelManifest supportedAccelerators',async()=>{
  const base=await baseRow();
  const restricted={...base.modelManifest,supportedAccelerators:['ONNX_RUNTIME']};
  const benchmark=await evidence(base.deviceSnapshot,restricted);
  const row={...base,modelManifest:restricted,benchmarkEvidence:benchmark,measurementAttestation:await attestation(benchmark)};
  const result=await adapt(row);
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.ok(result.rows[0].reasons.includes('MODEL_MANIFEST_PROVIDER_UNSUPPORTED'));
});

test('unsafe or transitional model lifecycle cannot become target evidence',async()=>{
  const base=await baseRow();
  for(const status of ['QUARANTINED','DOWNLOADING','VERIFYING','OUTDATED']){
    const changed={...base.modelManifest,status};
    const benchmark=await evidence(base.deviceSnapshot,changed);
    const row={...base,modelManifest:changed,benchmarkEvidence:benchmark,measurementAttestation:await attestation(benchmark)};
    const result=await adapt(row);
    assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
    assert.ok(result.rows[0].reasons.includes('TARGET_MODEL_STATUS_UNSAFE'));
  }
});

test('non-exact timing or zero successful samples remains measurement-insufficient',async()=>{
  const base=await baseRow();
  let benchmark={...base.benchmarkEvidence,latencyMs:70.0005};
  benchmark.evidenceKey=evidenceKeyFor({
    deviceCapabilityKey:benchmark.deviceCapabilityKey,modelId:benchmark.modelId,modelVersion:benchmark.modelVersion,
    manifestSha256:benchmark.manifestSha256,runtime:benchmark.runtime,
  },benchmark.provider);
  let row={...base,benchmarkEvidence:benchmark,measurementAttestation:await attestation(benchmark)};
  let result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_MEASUREMENT_INSUFFICIENT');
  assert.ok(result.rows[0].reasons.includes('LATENCY_NOT_EXACT_MILLISECOND_TO_MICROSECOND_VALUE'));

  benchmark={...base.benchmarkEvidence,sampleCount:0,successRate:0};
  benchmark.evidenceKey=evidenceKeyFor({
    deviceCapabilityKey:benchmark.deviceCapabilityKey,modelId:benchmark.modelId,modelVersion:benchmark.modelVersion,
    manifestSha256:benchmark.manifestSha256,runtime:benchmark.runtime,
  },benchmark.provider);
  row={...base,benchmarkEvidence:benchmark,measurementAttestation:await attestation(benchmark)};
  result=await adapt(row);
  assert.equal(result.rows[0].state,'TARGET_MEASUREMENT_INSUFFICIENT');
  assert.ok(result.rows[0].reasons.includes('NO_SUCCESSFUL_BENCHMARK_SAMPLE'));
});

test('budget tier mismatch never adapts evidence',async()=>{
  const row=await baseRow();
  const result=await adapt(row,policy('DESKTOP_HIGH_END'));
  assert.equal(result.rows[0].state,'FAILED_EVIDENCE');
  assert.deepEqual(result.rows[0].reasons,['TARGET_TIER_DIFFERS_FROM_BUDGET_POLICY']);
  assert.equal(result.targetEvidenceSet.records.length,0);
});
