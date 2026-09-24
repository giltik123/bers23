import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {BenchmarkEvidenceStore} from '../../../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import {
  captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFoundationTargetDeviceMeasuredCaptureV1.ts';
import {
  createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFoundationNativeMobileWorkingSetAdaptersV1.ts';
import {
  HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA,
} from '../../../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalMobileValidationEvidenceV1.ts';
import {
  captureHsmeNativeMobileEnergyThermalEvidenceV1,
} from '../../../src/platform/creative/local-ai/hsme/HsmeNativeMobileEnergyThermalEvidenceV1.ts';
import {
  HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
  hsmeHardwarePlacementMatrixV1Digest,
} from './HsmeHardwarePlacementMatrixV1.ts';
import {
  HSME_REAL_MOBILE_HARDWARE_RUNTIME_IDENTITY_DIGEST_DOMAIN,
  prepareHsmeRealMobilePhysicalEvidenceOriginV1,
} from './HsmeRealMobilePhysicalEvidenceOriginV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hash={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const TESTED_COMMIT='a'.repeat(40);
const NOW=2_000;
const CANDIDATE='android-npu';
const MODEL_ID='bers-hsme-android-npu';
const MODEL_VERSION='1.0.0';
const DEVICE_CLASS='snapdragon-8-gen-3-mobile';
const RUNTIME_IDENTITY='litert-qnn-hexagon-v1';
const DEVICE_SESSION=H('physical-device-run-session');
const ADAPTER_BUILD=H('android-adapter-build');
const PROCESS_ID='android-process-202';
const SESSION_ID='android-session-a';
const RUNTIME_IDENTITY_SHA=H(
  HSME_REAL_MOBILE_HARDWARE_RUNTIME_IDENTITY_DIGEST_DOMAIN
  +JSON.stringify(RUNTIME_IDENTITY),
);

function matrixAuthority(){
  return {
    selectionAllowed:false,
    benchmarkExecutionAllowed:false,
    representationMutationAllowed:false,
    inferenceExecutionAllowed:false,
    modelInstallAllowed:false,
    modelFleetPromotionAllowed:false,
    durableModelFleetPromotionAllowed:false,
    productionAuthorityGranted:false,
    providerAuthorityGranted:false,
    billingAuthorityGranted:false,
    projectArtifactMutationAllowed:false,
    fashionGeometryAuthorityGranted:false,
    artifactAuthorityGranted:false,
    aeeExecutionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

function quality(){
  return [
    {dimension:'ANATOMY_ARTIFACT',valueBps:9800},
    {dimension:'GARMENT_LOGO_PATTERN',valueBps:9700},
    {dimension:'IDENTITY_PERSON',valueBps:9750},
    {dimension:'NON_TARGET_PRESERVATION',valueBps:9650},
    {dimension:'SEMANTIC_ADHERENCE',valueBps:9600},
  ];
}

function hard(){
  return [
    {dimension:'ANATOMY_ARTIFACT',failureCount:0},
    {dimension:'GARMENT_LOGO_PATTERN',failureCount:0},
    {dimension:'IDENTITY_PERSON',failureCount:0},
    {dimension:'NON_TARGET_PRESERVATION',failureCount:0},
  ];
}

function placementRow(placement,manifestSha){
  return {
    candidateId:CANDIDATE,
    fleetModelId:MODEL_ID,
    fleetVersion:MODEL_VERSION,
    representationContentSha256:manifestSha,
    runtimeIdentity:RUNTIME_IDENTITY,
    formatIdentity:'litert-tflite-v1',
    platformFamily:'ANDROID',
    supportedDeviceClass:DEVICE_CLASS,
    requestedPlacement:placement,
    actualPlacement:placement,
    runtimeFallbackUsed:false,
    qualityVector:quality(),
    hardPreservationFailureCounts:hard(),
    criticalFailureCount:0,
    coldLatencyUs:900_000,
    warmLatencyUs:700_000,
    activeRepresentationBytes:700_000_000,
    peakHostMemoryBytes:900_000_000,
    peakAcceleratorMemoryBytes:placement==='CPU'?0:500_000_000,
    flashBytesMoved:400_000_000,
    ramBytesMoved:500_000_000,
    acceleratorBytesMoved:placement==='CPU'?0:300_000_000,
    networkBytesDuringExecution:0,
    measurementMethodSha256:H('placement-method-'+placement),
    measurementEvidenceSha256:H('placement-evidence-'+placement),
    realTargetDeviceMeasurement:true,
  };
}

async function matrix(manifestSha){
  const base={
    schemaVersion:HSME_HARDWARE_PLACEMENT_MATRIX_V1_SCHEMA,
    state:'HARDWARE_PLACEMENT_MATRIX_READY_NOT_DISPOSED',
    blockers:[],
    hardwareRepresentationRosterSha256:H('hardware-roster'),
    campaignPolicySha256:H('placement-policy'),
    hostResultSha256:H('placement-host-result'),
    executionAttemptId:'synthetic-placement-attempt-001',
    fixtureSetSha256:H('fixture-set'),
    evaluationContractSha256:H('evaluation-contract'),
    deterministicSeedContractSha256:H('seed-contract'),
    caseCount:20,
    qualityDimensions:quality().map(v=>v.dimension),
    hardPreservationDimensions:hard().map(v=>v.dimension),
    rows:[
      placementRow('CPU',manifestSha),
      placementRow('NPU',manifestSha),
    ],
    matrixEvidenceSha256:H('0'),
    ...matrixAuthority(),
  };
  const matrixEvidenceSha256=
    await hsmeHardwarePlacementMatrixV1Digest(base,hash);
  return {...base,matrixEvidenceSha256};
}

function measured(index=0,overrides={}){
  return {
    status:'MEASURED',
    platform:'ANDROID',
    metricKind:'PROCESS_RESIDENT_SET_RSS_BYTES',
    bytes:[100_000_000,200_000_000,300_000_000,250_000_000,280_000_000][index]
      ??100_000_000,
    capturedAtMicros:[1500,4000,12500,17500,23000][index]
      ??(30_000+index),
    processIdentity:PROCESS_ID,
    sessionIdentity:SESSION_ID,
    sourceApi:'/proc/self/statm',
    sourceApiVersion:'linux-procfs-v1',
    monotonicTimeDomain:'android-elapsed-realtime-micros',
    bridgeVersion:'android-native-bridge-v1',
    adapterBuildSha256:ADAPTER_BUILD,
    runtimeIdentitySha256:RUNTIME_IDENTITY_SHA,
    ...overrides,
  };
}

function memoryBridge(){
  const samples=[0,1,2,3,4].map(index=>measured(index));
  let index=0;
  return {async sample(){return samples[index++];}};
}

function snapshot(){
  return {
    schemaVersion:1,
    capturedAt:1_000,
    profile:{
      platform:'ANDROID',
      deviceClass:'MOBILE',
      tier:'HIGH',
      ramMb:8192,
      vramMb:0,
      storageFreeBytes:50_000_000_000,
    },
    runtimeCapabilities:{
      ONNX_RUNTIME:true,
      WEBGPU:false,
      WASM:true,
      NNAPI:true,
      DIRECTML:false,
      CUDA:false,
      METAL:false,
      VULKAN:false,
    },
    evidence:{
      observedSignals:[
        'deviceClass','platform','ramMb','storageFreeBytes','vramMb',
      ],
      unknownSignals:[],
      observedRuntimes:[
        'ONNX_RUNTIME','WEBGPU','WASM','NNAPI','DIRECTML',
        'CUDA','METAL','VULKAN',
      ],
      unknownRuntimes:[],
    },
  };
}

function manifest(bytes){
  return {
    modelId:MODEL_ID,
    version:MODEL_VERSION,
    family:'hsme',
    capabilities:['IMAGE_EDITING'],
    modelFormat:'ONNX',
    runtime:'ONNX_RUNTIME',
    sizeBytes:bytes.byteLength,
    requiredRam:999_999_999,
    requiredVram:0,
    supportedPlatforms:['ANDROID'],
    supportedAccelerators:['ONNX_RUNTIME','NNAPI'],
    estimatedLatency:999,
    qualityScore:.9,
    energyScore:.8,
    privacyLevel:'PRIVATE',
    license:'Apache-2.0',
    publisher:'bers',
    downloadUri:'https://models.example/hsme.onnx',
    sha256:H(bytes),
    signature:'signed',
    status:'AVAILABLE',
    stabilityScore:.95,
  };
}

function execution(){
  let state='UNLOADED';
  return {
    state:()=>state,
    async load(){state='LOADED';},
    async synchronize(){},
    async infer(req){
      return {
        requestId:req.requestId,
        modelId:MODEL_ID,
        outputs:{output:{data:[0,1,2,3],dims:[1,2,2]}},
        provider:'nnapi',
        latencyMs:999,
        memoryBytes:888_888_888,
        artifact:{
          id:'artifact',
          kind:'TENSOR',
          mimeType:'application/octet-stream',
          data:null,
          metadata:{},
        },
      };
    },
    async unload(){state='UNLOADED';},
  };
}

function clock(){
  const values=[1000,2000,12000,13000,18000,19000,24000,25000];
  let index=0;
  return {nowMicros(){return values[index++];}};
}

function store(){
  const rows=new Map();
  const port={
    async list(){return [...rows.values()];},
    async put(value){rows.set(value.evidenceKey,value);},
    async remove(key){rows.delete(key);},
  };
  return new BenchmarkEvidenceStore(port,hash,()=>1_000,10_000);
}

async function physicalBundle(){
  const bytes=new TextEncoder().encode('physical-hsme-8-model-v1');
  const memory=createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1(
    memoryBridge(),
    hash,
  );
  const device=snapshot();
  const model=manifest(bytes);
  const capture=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
    {
      targetTier:'MOBILE_DEFAULT',
      snapshot:device,
      manifest:model,
      modelBytes:bytes,
      request:{
        requestId:'physical-fixture-1',
        inputs:{input:{data:[1,2,3,4],dims:[1,4]}},
      },
      benchmarkFixtureSha256:H('physical-frozen-fixture'),
      targetRuntimeInventorySha256:H('physical-runtime-inventory'),
      representationBindingSha256:H('physical-representation-binding'),
      warmSampleCount:2,
      energyEstimate:.4,
      energyEvidenceSha256:H('foundation-energy-estimate-not-authoritative'),
    },
    execution(),
    memory,
    store(),
    clock(),
    hash,
  );
  return {
    bytes,
    bundle:{
      schemaVersion:HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA,
      testedCommitSha:TESTED_COMMIT,
      physicalOriginClaim:'REAL_PHYSICAL_DEVICE',
      capturedAt:capture.benchmarkEvidence.capturedAt,
      expiresAt:capture.benchmarkEvidence.expiresAt,
      deviceSnapshot:device,
      applicationBuildSha256:H('physical-app-build'),
      deviceRunSessionSha256:DEVICE_SESSION,
      measuredCapture:capture,
      sourceEvidenceLedger:memory.sourceEvidenceLedger(),
      attestation:{
        evidenceUrl:'https://evidence.example/hsme/mobile-run.json',
        signatureUrl:'https://evidence.example/hsme/mobile-run.json.sig',
        verificationKeyId:'bers-hsme-mobile-device-evidence-v1',
      },
      productionAuthorityGranted:false,
      modelFleetPromotionAllowed:false,
      selectedCandidateIdAllowed:false,
      reuseAdvanceAllowed:false,
      fullStudentEscalationAllowed:false,
      winnerSelectionAllowed:false,
    },
  };
}

function physicalTrust(result=true){
  return {
    async verifyPhysicalRunEvidence(){
      return result;
    },
  };
}

async function telemetry(bundle,overrides={}){
  const raw={
    platform:'ANDROID',
    processIdentity:PROCESS_ID,
    sessionIdentity:SESSION_ID,
    deviceRunSessionSha256:DEVICE_SESSION,
    deviceCapabilityKey:
      bundle.measuredCapture.rawCapture.deviceCapabilityKey,
    supportedDeviceClass:DEVICE_CLASS,
    runtimeIdentitySha256:RUNTIME_IDENTITY_SHA,
    actualPlacement:'NPU',
    nativeTelemetryAttestationSha256:H('native-telemetry-attestation'),
    sourceApi:'android-power-stats-native-v1',
    sourceApiVersion:'1',
    bridgeVersion:'android-hsme-energy-bridge-v1',
    adapterBuildSha256:ADAPTER_BUILD,
    osBuildSha256:H('android-os-build'),
    runtimeBuildSha256:H('runtime-build'),
    capturedAtMicrosStart:30_000,
    capturedAtMicrosEnd:80_000,
    warmLatencyUs:[650_000,670_000,690_000,710_000,730_000],
    peakHostMemoryBytes:850_000_000,
    peakAcceleratorMemoryBytes:450_000_000,
    flashBytesMoved:350_000_000,
    ramBytesMoved:450_000_000,
    acceleratorBytesMoved:280_000_000,
    energyMicroJoulesTotal:5_000_000,
    batteryStartBps:8000,
    batteryEndBps:7950,
    powerSource:'BATTERY',
    thermalStartState:'NORMAL',
    thermalPeakState:'ELEVATED',
    thermalEndState:'NORMAL',
    throttledRunCount:0,
    networkBytesDuringExecution:0,
    energyMeasurementKind:'MEASURED_TOTAL_MICROJOULES',
    physicalOriginClaim:'REAL_PHYSICAL_DEVICE',
    ...overrides,
  };
  return captureHsmeNativeMobileEnergyThermalEvidenceV1(
    {async capture(){return raw;}},
    hash,
  );
}

const trueMatrixOrigin={
  async verifyHardwarePlacementMatrix(){return true;},
};
const falseMatrixOrigin={
  async verifyHardwarePlacementMatrix(){return false;},
};
const trueTelemetryOrigin={
  async verifyNativeMobileEnergyThermalEvidence(){return true;},
};
const falseTelemetryOrigin={
  async verifyNativeMobileEnergyThermalEvidence(){return false;},
};

async function fixture(){
  const p=await physicalBundle();
  const m=await matrix(H(p.bytes));
  const t=await telemetry(p.bundle);
  return {p,m,t};
}

async function prepare(f,overrides={}){
  return prepareHsmeRealMobilePhysicalEvidenceOriginV1(
    overrides.matrix??f.m,
    overrides.matrixSha??f.m.matrixEvidenceSha256,
    overrides.matrixOrigin??trueMatrixOrigin,
    CANDIDATE,
    'NPU',
    overrides.bundle??f.p.bundle,
    overrides.physicalTrust??physicalTrust(true),
    TESTED_COMMIT,
    NOW,
    overrides.telemetry??f.t,
    overrides.telemetrySha??f.t.evidenceSha256,
    overrides.telemetryOrigin??trueTelemetryOrigin,
    hash,
  );
}

test('synthetic contract fixture assembles exact evidence set but does not run qualification',async()=>{
  const f=await fixture();
  const prepared=await prepare(f);
  const a=prepared.assembly;

  assert.equal(a.state,'REAL_MOBILE_PHYSICAL_ORIGIN_READY');
  assert.deepEqual(a.blockers,[]);
  assert.match(a.physicalRunPayloadSha256,/^[0-9a-f]{64}$/);
  assert.match(a.realMobileEvidenceSetSha256,/^[0-9a-f]{64}$/);
  assert.match(a.physicalOriginBindingSha256,/^[0-9a-f]{64}$/);
  assert.equal(
    a.physicalDeviceAttestationSemantic,
    'FOUNDATION_VERIFIED_PHYSICAL_RUN_PAYLOAD_SHA256',
  );
  assert.equal(a.evidenceSet.records.length,1);
  const record=a.evidenceSet.records[0];
  assert.equal(record.candidateId,CANDIDATE);
  assert.equal(record.requestedPlacement,'NPU');
  assert.equal(record.platformFamily,'ANDROID');
  assert.equal(record.supportedDeviceClass,DEVICE_CLASS);
  assert.equal(
    record.physicalDeviceAttestationSha256,
    a.physicalRunPayloadSha256,
  );
  assert.equal(
    record.placementMeasurementEvidenceSha256,
    f.m.rows[1].measurementEvidenceSha256,
  );
  assert.equal(record.energyMicroJoulesPerRun,1_000_000);
  assert.equal(a.productionAuthorityGranted,false);
  assert.equal(a.durableModelFleetPromotionAllowed,false);

  assert.equal(
    await prepared.evidenceOrigin.verifyRealMobileDeviceEvidenceSet(
      a.evidenceSet,
      a.realMobileEvidenceSetSha256,
    ),
    true,
  );
});

test('unverified physical attestation remains BLOCKED and cannot mint evidence origin',async()=>{
  const f=await fixture();
  const prepared=await prepare(f,{
    physicalTrust:physicalTrust(false),
  });

  assert.equal(
    prepared.assembly.state,
    'REAL_MOBILE_PHYSICAL_ORIGIN_BLOCKED',
  );
  assert.ok(
    prepared.assembly.blockers.includes(
      'REAL_MOBILE_PHYSICAL_FOUNDATION_ATTESTATION_REQUIRED',
    ),
  );
  assert.equal(prepared.assembly.evidenceSet,null);
  assert.equal(
    await prepared.evidenceOrigin.verifyRealMobileDeviceEvidenceSet(
      f.t,
      f.t.evidenceSha256,
    ),
    false,
  );
});

test('matrix and native telemetry origins are independently mandatory',async()=>{
  const f=await fixture();

  const a=await prepare(f,{matrixOrigin:falseMatrixOrigin});
  assert.equal(a.assembly.state,'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID');
  assert.ok(
    a.assembly.blockers.includes(
      'REAL_MOBILE_PHYSICAL_MATRIX_ORIGIN_UNVERIFIED',
    ),
  );

  const b=await prepare(f,{telemetryOrigin:falseTelemetryOrigin});
  assert.equal(b.assembly.state,'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID');
  assert.ok(
    b.assembly.blockers.includes(
      'REAL_MOBILE_PHYSICAL_NATIVE_TELEMETRY_ORIGIN_UNVERIFIED',
    ),
  );
});

test('same physical session process runtime and adapter identity are mandatory',async()=>{
  const f=await fixture();
  const cases=[
    ['deviceRunSessionSha256',H('other-device-session'),
      'REAL_MOBILE_PHYSICAL_DEVICE_RUN_SESSION_MISMATCH'],
    ['sessionIdentity','different-session',
      'REAL_MOBILE_PHYSICAL_NATIVE_SESSION_IDENTITY_MISMATCH'],
    ['processIdentity','different-process',
      'REAL_MOBILE_PHYSICAL_NATIVE_PROCESS_IDENTITY_MISMATCH'],
    ['runtimeIdentitySha256',H('different-runtime'),
      'REAL_MOBILE_PHYSICAL_NATIVE_RUNTIME_IDENTITY_MISMATCH'],
    ['adapterBuildSha256',H('different-adapter'),
      'REAL_MOBILE_PHYSICAL_NATIVE_ADAPTER_BUILD_MISMATCH'],
  ];

  for(const [field,value,reason] of cases){
    const telemetryRecord=await telemetry(
      f.p.bundle,
      {[field]:value},
    );
    const result=await prepare(f,{
      telemetry:telemetryRecord,
      telemetrySha:telemetryRecord.evidenceSha256,
    });
    assert.equal(
      result.assembly.state,
      'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID',
    );
    assert.ok(result.assembly.blockers.includes(reason));
  }
});

test('fleet representation device class and actual placement must match exact HSME row',async()=>{
  const f=await fixture();

  const wrongDevice=await telemetry(
    f.p.bundle,
    {supportedDeviceClass:'other-mobile-class'},
  );
  let result=await prepare(f,{
    telemetry:wrongDevice,
    telemetrySha:wrongDevice.evidenceSha256,
  });
  assert.equal(result.assembly.state,'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID');
  assert.ok(
    result.assembly.blockers.includes(
      'REAL_MOBILE_PHYSICAL_DEVICE_CLASS_BINDING_MISMATCH',
    ),
  );

  const wrongPlacement=await telemetry(
    f.p.bundle,
    {actualPlacement:'CPU'},
  );
  result=await prepare(f,{
    telemetry:wrongPlacement,
    telemetrySha:wrongPlacement.evidenceSha256,
  });
  assert.equal(result.assembly.state,'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID');
  assert.ok(
    result.assembly.blockers.includes(
      'REAL_MOBILE_PHYSICAL_PLACEMENT_MISMATCH',
    ),
  );

  const changedMatrix=structuredClone(f.m);
  changedMatrix.rows[1].representationContentSha256=H('other-binary');
  changedMatrix.matrixEvidenceSha256=
    await hsmeHardwarePlacementMatrixV1Digest(changedMatrix,hash);
  result=await prepare(f,{
    matrix:changedMatrix,
    matrixSha:changedMatrix.matrixEvidenceSha256,
  });
  assert.equal(result.assembly.state,'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID');
  assert.ok(
    result.assembly.blockers.includes(
      'REAL_MOBILE_PHYSICAL_FLEET_REPRESENTATION_MISMATCH',
    ),
  );
});

test('foundation provider must be compatible with the claimed NPU placement',async()=>{
  const f=await fixture();
  const changed=structuredClone(f.p.bundle);
  changed.measuredCapture.rawCapture.provider='wasm';
  changed.measuredCapture.benchmarkEvidence.provider='wasm';
  // Rehashing the altered foundation capture is intentionally omitted:
  // foundation integrity must fail before a provider mismatch can be trusted.
  const result=await prepare(f,{bundle:changed});
  assert.equal(result.assembly.state,'REAL_MOBILE_PHYSICAL_ORIGIN_INVALID');
  assert.ok(
    result.assembly.blockers.includes(
      'REAL_MOBILE_PHYSICAL_FOUNDATION_INTEGRITY_INVALID',
    ),
  );
});

test('returned evidence origin is pinned to the exact assembled evidence set',async()=>{
  const f=await fixture();
  const prepared=await prepare(f);
  const altered=structuredClone(prepared.assembly.evidenceSet);
  altered.records[0].batteryEndBps-=1;

  assert.equal(
    await prepared.evidenceOrigin.verifyRealMobileDeviceEvidenceSet(
      altered,
      prepared.assembly.realMobileEvidenceSetSha256,
    ),
    false,
  );
});
