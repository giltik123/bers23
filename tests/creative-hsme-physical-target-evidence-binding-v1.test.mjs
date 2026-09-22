import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {BenchmarkEvidenceStore} from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import {
  HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA,
  HSME_FOUNDATION_TARGET_DEVICE_REPRESENTATION_BINDING_DIGEST_DOMAIN,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTargetDeviceBenchmarkAdapterV1.ts';
import {
  HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTierQualificationV1.ts';
import {
  hsmeFoundationRuntimeInventoryStableJsonV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationResourceEvidenceV1.ts';
import {
  captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTargetDeviceMeasuredCaptureV1.ts';
import {
  createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1,
  createHsmeFoundationIosWorkingSetMeasurementAdapterV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationNativeMobileWorkingSetAdaptersV1.ts';
import {
  HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalMobileValidationEvidenceV1.ts';
import {
  HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN,
  proveHsmeFoundationPhysicalTargetEvidenceBindingV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalTargetEvidenceBindingV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const CANDIDATE='flux2-klein-4b-distilled-v1';
const CAPABILITY='IMAGE_EDITING';
const TESTED_COMMIT='a'.repeat(40);
const NOW=2_000;

function measured(platform,index){
  const ios=platform==='IOS';
  return {
    status:'MEASURED',
    platform,
    metricKind:ios?'TASK_VM_INFO_PHYS_FOOTPRINT_BYTES':'PROCESS_RESIDENT_SET_RSS_BYTES',
    bytes:[100_000_000,200_000_000,300_000_000,250_000_000,280_000_000][index],
    capturedAtMicros:[1500,4000,12500,17500,23000][index],
    processIdentity:ios?'ios-process-101':'android-process-202',
    sessionIdentity:ios?'ios-session-a':'android-session-a',
    sourceApi:ios?'task_info(TASK_VM_INFO)':'/proc/self/statm',
    sourceApiVersion:ios?'darwin-task-v1':'linux-procfs-v1',
    monotonicTimeDomain:ios?'mach-continuous-micros':'android-elapsed-realtime-micros',
    bridgeVersion:ios?'ios-native-bridge-v1':'android-native-bridge-v1',
    adapterBuildSha256:H(ios?'ios-adapter-build':'android-adapter-build'),
    runtimeIdentitySha256:H(ios?'ios-runtime':'android-runtime'),
  };
}

function nativeMemory(platform){
  const samples=[0,1,2,3,4].map(index=>measured(platform,index));
  let index=0;
  const bridge={async sample(){return samples[index++];}};
  return platform==='IOS'
    ?createHsmeFoundationIosWorkingSetMeasurementAdapterV1(bridge,hashPort)
    :createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1(bridge,hashPort);
}

function snapshot(platform){
  return {
    schemaVersion:1,
    capturedAt:1_000,
    profile:{
      platform,deviceClass:'MOBILE',tier:'HIGH',
      ramMb:8192,vramMb:0,storageFreeBytes:50_000_000_000,
    },
    runtimeCapabilities:{
      ONNX_RUNTIME:true,WEBGPU:false,WASM:true,NNAPI:platform==='ANDROID',
      DIRECTML:false,CUDA:false,METAL:platform==='IOS',VULKAN:false,
    },
    evidence:{
      observedSignals:['deviceClass','platform','ramMb','storageFreeBytes','vramMb'],
      unknownSignals:[],
      observedRuntimes:['ONNX_RUNTIME','WEBGPU','WASM','NNAPI','DIRECTML','CUDA','METAL','VULKAN'],
      unknownRuntimes:[],
    },
  };
}

function manifest(bytes,platform){
  return {
    modelId:'hsme-physical-target-candidate',
    version:'1.0.0',
    family:'hsme',
    capabilities:['IMAGE_EDITING'],
    modelFormat:'ONNX',
    runtime:'ONNX_RUNTIME',
    sizeBytes:bytes.byteLength,
    requiredRam:999_999_999,
    requiredVram:777_777_777,
    supportedPlatforms:[platform],
    supportedAccelerators:['ONNX_RUNTIME','WASM'],
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

function inventory(model){
  return {
    schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
    candidateId:CANDIDATE,
    immutableRevision:'b'.repeat(40),
    complete:true,
    artifacts:[{
      relativePath:'model.onnx',
      bytes:model.sizeBytes,
      contentSha256:model.sha256,
    }],
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
        modelId:'hsme-physical-target-candidate',
        outputs:{output:{data:[0,1,2,3],dims:[1,2,2]}},
        provider:'wasm',
        latencyMs:999,
        memoryBytes:888_888_888,
        artifact:{id:'artifact',kind:'TENSOR',mimeType:'application/octet-stream',data:null,metadata:{}},
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
  return new BenchmarkEvidenceStore({
    async list(){return [...rows.values()];},
    async put(value){rows.set(value.evidenceKey,value);},
    async remove(key){rows.delete(key);},
  },hashPort,()=>1_000,10_000);
}

function budget(){
  return {
    schemaVersion:HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
    policyId:'mobile-target-budget-v1',
    targetTier:'MOBILE_DEFAULT',
    maxInstalledBytes:1_000_000_000,
    maxWorkingMemoryBytes:1_000_000_000,
    maxColdEndToEndLatencyMicros:1_000_000,
    maxWarmEndToEndLatencyMicros:1_000_000,
    productionAuthorityGranted:false,
    winnerSelectionAllowed:false,
  };
}

async function fixture(platform='ANDROID',overrides={}){
  const bytes=new TextEncoder().encode('physical-target-model-v1');
  const device=snapshot(platform);
  const model=manifest(bytes,platform);
  const inv=inventory(model);
  const inventoryStable=hsmeFoundationRuntimeInventoryStableJsonV1(inv);
  const inventorySha256=H(inventoryStable);
  const representationEvidenceSha256=H(
    HSME_FOUNDATION_TARGET_DEVICE_REPRESENTATION_BINDING_DIGEST_DOMAIN+
    JSON.stringify({
      candidateId:CANDIDATE,
      capability:CAPABILITY,
      representationKind:'TARGET_SPECIFIC_REPRESENTATION',
      representationContentSha256:model.sha256,
      inventorySha256,
      manifestModelId:model.modelId,
      manifestVersion:model.version,
      manifestSha256:model.sha256,
      manifestRuntime:model.runtime,
      bridgeMode:'SINGLE_FILE_EXACT_SHA',
    }),
  );
  const memory=nativeMemory(platform);
  const capture=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
    {
      targetTier:'MOBILE_DEFAULT',
      snapshot:device,
      manifest:model,
      modelBytes:bytes,
      request:{requestId:'physical-target-fixture',inputs:{input:{data:[1,2,3,4],dims:[1,4]}}},
      benchmarkFixtureSha256:H('physical-target-frozen-fixture'),
      targetRuntimeInventorySha256:overrides.captureRuntimeInventorySha256??inventorySha256,
      representationBindingSha256:overrides.captureRepresentationBindingSha256??representationEvidenceSha256,
      warmSampleCount:2,
      energyEstimate:.4,
      energyEvidenceSha256:H('physical-target-energy-evidence'),
    },
    execution(),memory,store(),clock(),hashPort,
  );
  const bindingSet={
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA,
    records:[{
      candidateId:CANDIDATE,
      capability:CAPABILITY,
      targetTier:'MOBILE_DEFAULT',
      sourceModelContentSha256:H('source-model-content'),
      sourceExecutionProfileSha256:H('source-execution-profile'),
      representationKind:'TARGET_SPECIFIC_REPRESENTATION',
      representationContentSha256:model.sha256,
      runtimeInventory:inv,
      modelManifest:model,
      representationBridgeMode:'SINGLE_FILE_EXACT_SHA',
      deviceSnapshot:device,
      benchmarkEvidence:capture.benchmarkEvidence,
      measurementAttestation:capture.measurementAttestation,
    }],
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
    winnerSelectionAllowed:false,
  };
  const physicalBundle={
    schemaVersion:HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA,
    testedCommitSha:TESTED_COMMIT,
    physicalOriginClaim:'REAL_PHYSICAL_DEVICE',
    capturedAt:capture.benchmarkEvidence.capturedAt,
    expiresAt:capture.benchmarkEvidence.expiresAt,
    deviceSnapshot:device,
    applicationBuildSha256:H('physical-target-app-build'),
    deviceRunSessionSha256:H(platform+'-physical-target-session'),
    measuredCapture:capture,
    sourceEvidenceLedger:memory.sourceEvidenceLedger(),
    attestation:{
      evidenceUrl:'https://evidence.example/hsme/physical-target.json',
      signatureUrl:'https://evidence.example/hsme/physical-target.json.sig',
      verificationKeyId:'bers-hsme-physical-target-v1',
    },
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    selectedCandidateIdAllowed:false,
    reuseAdvanceAllowed:false,
    fullStudentEscalationAllowed:false,
    winnerSelectionAllowed:false,
  };
  return {device,model,inventory:inv,inventorySha256,representationEvidenceSha256,capture,bindingSet,physicalBundle};
}

function trust(verified=true){
  return {async verifyPhysicalRunEvidence(){return verified;}};
}

for(const platform of ['ANDROID','IOS']){
  test(platform+' exact target record binds to the trusted physical run without selection authority',async()=>{
    const x=await fixture(platform);
    const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
      budget(),x.bindingSet,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,hashPort,
    );
    assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_READY');
    assert.deepEqual(result.blockers,[]);
    assert.match(result.targetEvidenceSha256,/^[0-9a-f]{64}$/);
    assert.match(result.physicalRunPayloadSha256,/^[0-9a-f]{64}$/);
    assert.match(result.physicalTargetBindingSha256,/^[0-9a-f]{64}$/);
    assert.equal(result.targetEvidence.candidateId,CANDIDATE);
    assert.equal(result.targetEvidence.capability,CAPABILITY);
    assert.equal(result.targetEvidence.targetTier,'MOBILE_DEFAULT');
    assert.equal(result.targetEvidence.peakWorkingMemoryBytes,300_000_000);
    assert.equal(result.selectedCandidateIdAllowed,false);
    assert.equal(result.reuseAdvanceAllowed,false);
    assert.equal(result.fullStudentEscalationAllowed,false);
    assert.equal(result.modelFleetPromotionAllowed,false);
    assert.equal(result.productionAuthorityGranted,false);
    assert.equal(result.winnerSelectionAllowed,false);
  });
}

test('integrity-valid run without trusted physical attestation remains REQUIRED',async()=>{
  const x=await fixture();
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),x.bindingSet,CANDIDATE,CAPABILITY,x.physicalBundle,trust(false),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_REQUIRED');
  assert.deepEqual(result.blockers,['PHYSICAL_ATTESTATION_REQUIRED']);
  assert.equal(result.targetEvidence,null);
  assert.equal(result.reuseAdvanceAllowed,false);
});

test('caller-specified candidate identity is proof input, not a winner-selection fallback',async()=>{
  const x=await fixture();
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),x.bindingSet,'different-candidate',CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('TARGET_ADAPTER_ROW_MISSING'));
  assert.ok(result.blockers.includes('TARGET_EVIDENCE_MISSING'));
  assert.equal(result.selectedCandidateIdAllowed,false);
});

test('target evidence row digest is independently rehashed by the physical binding gate',async()=>{
  const x=await fixture();
  let targetDigestCalls=0;
  const driftingHashPort={
    async sha256(bytes){
      const text=new TextDecoder().decode(bytes);
      const digest=createHash('sha256').update(bytes).digest('hex');
      if(text.startsWith(HSME_FOUNDATION_TARGET_DEVICE_ADAPTED_EVIDENCE_DIGEST_DOMAIN)){
        targetDigestCalls+=1;
        if(targetDigestCalls>1)return digest==='0'.repeat(64)?'1'.repeat(64):'0'.repeat(64);
      }
      return digest;
    },
  };
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),x.bindingSet,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,driftingHashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('TARGET_EVIDENCE_ROW_DIGEST_MISMATCH'));
  assert.ok(targetDigestCalls>=2);
});

test('capture representation binding must equal the adapter representation proof',async()=>{
  const x=await fixture('ANDROID',{captureRepresentationBindingSha256:H('wrong-representation-binding')});
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),x.bindingSet,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('TARGET_REPRESENTATION_BINDING_DRIFT'));
});

test('capture runtime inventory digest must equal the exact target inventory',async()=>{
  const x=await fixture('ANDROID',{captureRuntimeInventorySha256:H('wrong-runtime-inventory')});
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),x.bindingSet,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('TARGET_RUNTIME_INVENTORY_DRIFT'));
});

test('cross-device target binding cannot reuse a trusted physical bundle',async()=>{
  const x=await fixture('ANDROID');
  const bindings=structuredClone(x.bindingSet);
  bindings.records[0].deviceSnapshot.profile.ramMb=4096;
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),bindings,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('TARGET_DEVICE_ADAPTER_INVALID')
    || result.blockers.includes('TARGET_DEVICE_ADAPTER_NOT_READY')
    || result.blockers.includes('TARGET_EVIDENCE_MISSING'));
});

test('benchmark aggregate drift in target binding cannot masquerade as the physical capture',async()=>{
  const x=await fixture();
  const bindings=structuredClone(x.bindingSet);
  bindings.records[0].benchmarkEvidence.ramBytes+=1;
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),bindings,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('TARGET_DEVICE_ADAPTER_NOT_READY')
    || result.blockers.includes('TARGET_EVIDENCE_MISSING'));
});

test('tested commit drift in the physical bundle blocks target binding',async()=>{
  const x=await fixture();
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),x.bindingSet,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),'c'.repeat(40),NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('PHYSICAL_BUNDLE_INTEGRITY_INVALID'));
});

test('target binding never converts readiness into reuse or full-student authority',async()=>{
  const x=await fixture();
  const result=await proveHsmeFoundationPhysicalTargetEvidenceBindingV1(
    budget(),x.bindingSet,CANDIDATE,CAPABILITY,x.physicalBundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.state,'PHYSICAL_TARGET_EVIDENCE_READY');
  for(const field of [
    'selectedCandidateIdAllowed','reuseAdvanceAllowed','fullStudentEscalationAllowed',
    'modelFleetPromotionAllowed','installOrDownloadAllowed','productionAuthorityGranted',
    'providerAuthorityGranted','billingAuthorityGranted','projectArtifactMutationAllowed',
    'aeeExecutionAuthorityGranted','durableModelFleetPromotionAllowed',
    'trainingOrDistillationAllowed','winnerSelectionAllowed',
  ]) assert.equal(result[field],false,field);
});
