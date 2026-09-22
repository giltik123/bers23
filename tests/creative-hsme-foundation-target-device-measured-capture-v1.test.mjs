import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  BenchmarkEvidenceStore,
} from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import {
  captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1,
  verifyHsmeFoundationTargetDeviceMeasuredCaptureV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTargetDeviceMeasuredCaptureV1.ts';
import {
  HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA,
  adaptHsmeFoundationTargetDeviceBenchmarkEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTargetDeviceBenchmarkAdapterV1.ts';
import {
  HSME_FOUNDATION_TIER_BUDGET_POLICY_V1_SCHEMA,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTierQualificationV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function manifest(bytes,status='AVAILABLE'){
  return {
    modelId:'hsme-mobile-candidate',
    version:'1.0.0',
    family:'hsme',
    capabilities:['IMAGE_EDITING'],
    modelFormat:'ONNX',
    runtime:'ONNX_RUNTIME',
    sizeBytes:bytes.byteLength,
    requiredRam:999_999_999,
    requiredVram:777_777_777,
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
    status,
    stabilityScore:.95,
  };
}
function snapshot(){
  return {
    schemaVersion:1,
    capturedAt:1_000,
    profile:{
      platform:'ANDROID',deviceClass:'MOBILE',tier:'HIGH',
      ramMb:8192,vramMb:0,storageFreeBytes:50_000_000_000,
    },
    runtimeCapabilities:{
      ONNX_RUNTIME:true,WEBGPU:false,WASM:true,NNAPI:true,DIRECTML:false,CUDA:false,METAL:false,VULKAN:false,
    },
    evidence:{observedSignals:[],unknownSignals:[],observedRuntimes:['ONNX_RUNTIME','NNAPI'],unknownRuntimes:[]},
  };
}
function input(bytes,overrides={}){
  return {
    targetTier:'MOBILE_DEFAULT',
    snapshot:snapshot(),
    manifest:manifest(bytes),
    modelBytes:bytes,
    request:{requestId:'fixture-1',inputs:{input:{data:[1,2,3,4],dims:[1,4]}}},
    benchmarkFixtureSha256:H('frozen-fixture'),
    targetRuntimeInventorySha256:H('target-runtime-inventory'),
    representationBindingSha256:H('representation-binding'),
    warmSampleCount:2,
    energyEstimate:.4,
    energyEvidenceSha256:H('energy-evidence'),
    ...overrides,
  };
}
function inferenceResult(requestId,provider='nnapi',modelId='hsme-mobile-candidate'){
  return {
    requestId,
    modelId,
    outputs:{output:{data:[0,1,2,3],dims:[1,2,2]}},
    provider,
    latencyMs:999,
    memoryBytes:888_888_888,
    artifact:{id:'artifact',kind:'TENSOR',mimeType:'application/octet-stream',data:null,metadata:{}},
  };
}
function execution({provider='nnapi',driftProvider=false}={}){
  let state='UNLOADED';
  let inferCount=0;
  return {
    state:()=>state,
    async load(){state='LOADED';},
    async synchronize(){},
    async infer(req){
      inferCount+=1;
      return inferenceResult(req.requestId,driftProvider&&inferCount>1?'wasm':provider);
    },
    async unload(){state='UNLOADED';},
    get inferCount(){return inferCount;},
  };
}
function clock(values=[1000,2000,12000,13000,18000,19000,24000,25000]){
  let index=0;
  return {nowMicros(){if(index>=values.length)throw new Error('clock exhausted');return values[index++];}};
}
function unifiedMemory({sourceKind='NATIVE_PROCESS_WORKING_SET',outsideWindow=false}={}){
  const host=[100_000_000,200_000_000,300_000_000,250_000_000,280_000_000];
  const times=outsideWindow?[500,4000,13000,18000,23000]:[1500,4000,12500,17500,23000];
  let index=0;
  return {
    memoryAccountingMode:'UNIFIED_PROCESS_WORKING_SET',
    sourceKind,
    async sample(){
      const i=index++;
      return {
        capturedAtMicros:times[i],
        hostBytes:host[i],
        acceleratorBytes:'UNAVAILABLE',
        sourceEvidenceSha256:H('native-memory-sample-'+i),
      };
    },
  };
}
function discreteMemory(){
  const host=[100,120,130,125,128];
  const accel=[10,20,30,25,29];
  const times=[1500,4000,12500,17500,23000];
  let index=0;
  return {
    memoryAccountingMode:'DISCRETE_HOST_PLUS_ACCELERATOR',
    sourceKind:'NATIVE_HOST_AND_ACCELERATOR_WORKING_SET',
    async sample(){
      const i=index++;
      return {
        capturedAtMicros:times[i],
        hostBytes:host[i],
        acceleratorBytes:accel[i],
        sourceEvidenceSha256:H('discrete-memory-sample-'+i),
      };
    },
  };
}
function store(){
  const rows=new Map();
  const port={
    async list(){return [...rows.values()];},
    async put(value){rows.set(value.evidenceKey,value);},
    async remove(key){rows.delete(key);},
  };
  return {rows,store:new BenchmarkEvidenceStore(port,hashPort,()=>1_000,10_000)};
}

test('measured unified capture produces raw-sample digest, BenchmarkEvidence and #638 attestation',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  const run=execution();
  const evidence=store();
  const result=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
    input(bytes),run,unifiedMemory(),evidence.store,clock(),hashPort,
  );

  assert.equal(run.state(),'UNLOADED');
  assert.equal(run.inferCount,3);
  assert.equal(result.rawCapture.coldLatencyMicros,10_000);
  assert.deepEqual(result.rawCapture.warmLatencySamplesMicros,[5_000,5_000]);
  assert.equal(result.rawCapture.warmLatencyMeanMicros,5_000);
  assert.equal(result.rawCapture.peakHostWorkingSetBytes,300_000_000);
  assert.equal(result.rawCapture.peakAcceleratorBytes,'UNAVAILABLE');
  assert.equal(result.rawCapture.runtimeEstimateUsed,false);
  assert.equal(result.rawCapture.manifestResourceEstimateUsed,false);
  assert.notEqual(result.rawCapture.peakHostWorkingSetBytes,result.rawCapture.energyEstimate);
  assert.notEqual(result.rawCapture.peakHostWorkingSetBytes,result.benchmarkEvidence.vramBytes);
  assert.match(result.measurementCaptureSha256,/^[0-9a-f]{64}$/);
  assert.match(result.benchmarkEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(result.measurementAttestation.measurementCaptureSha256,result.measurementCaptureSha256);
  assert.equal(result.measurementAttestation.benchmarkEvidenceSha256,result.benchmarkEvidenceSha256);
  assert.equal(result.measurementAttestation.memoryAccountingMode,'UNIFIED_PROCESS_WORKING_SET');
  assert.equal(result.measurementAttestation.ramMetric,'PEAK_PROCESS_WORKING_SET_BYTES');
  assert.equal(result.measurementAttestation.vramMetric,'NOT_SEPARATELY_BUDGETED');
  assert.equal(result.benchmarkEvidence.ramBytes,300_000_000);
  assert.equal(result.benchmarkEvidence.vramBytes,0);
  assert.equal(result.benchmarkEvidence.coldStartMs,10);
  assert.equal(result.benchmarkEvidence.latencyMs,5);
  assert.equal(evidence.rows.size,1);
  assert.equal(result.modelFleetPromotionAllowed,false);
  assert.equal(result.reuseAdvanceAllowed,false);
  assert.equal(result.winnerSelectionAllowed,false);
  const proof=await verifyHsmeFoundationTargetDeviceMeasuredCaptureV1(result,hashPort);
  assert.equal(proof.measurementCaptureSha256,result.measurementCaptureSha256);
});

test('measured capture feeds #639 adapter as target evidence without granting tier decision authority',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  const capture=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
    input(bytes),execution(),unifiedMemory(),store().store,clock(),hashPort,
  );
  const budget={
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
  const model=input(bytes).manifest;
  const bindingSet={
    schemaVersion:HSME_FOUNDATION_TARGET_DEVICE_BINDING_SET_V1_SCHEMA,
    records:[{
      candidateId:'flux2-klein-4b-distilled-v1',
      capability:'IMAGE_EDITING',
      targetTier:'MOBILE_DEFAULT',
      sourceModelContentSha256:H('source-model-content'),
      sourceExecutionProfileSha256:H('source-execution-profile'),
      representationKind:'TARGET_SPECIFIC_REPRESENTATION',
      representationContentSha256:model.sha256,
      runtimeInventory:{
        schemaVersion:'BERS_HSME_FOUNDATION_RUNTIME_INVENTORY_V1',
        candidateId:'flux2-klein-4b-distilled-v1',
        immutableRevision:'a'.repeat(40),
        complete:true,
        artifacts:[{relativePath:'model.onnx',bytes:model.sizeBytes,contentSha256:model.sha256}],
      },
      modelManifest:model,
      representationBridgeMode:'SINGLE_FILE_EXACT_SHA',
      deviceSnapshot:snapshot(),
      benchmarkEvidence:capture.benchmarkEvidence,
      measurementAttestation:capture.measurementAttestation,
    }],
    productionAuthorityGranted:false,
    modelFleetPromotionAllowed:false,
    installOrDownloadAllowed:false,
    winnerSelectionAllowed:false,
  };
  const adapted=await adaptHsmeFoundationTargetDeviceBenchmarkEvidenceV1(budget,bindingSet,2_000,hashPort);
  assert.equal(adapted.rows[0].state,'TARGET_DEVICE_EVIDENCE_READY');
  assert.equal(adapted.targetEvidenceSet.records.length,1);
  assert.equal(adapted.targetEvidenceSet.records[0].peakWorkingMemoryBytes,300_000_000);
  assert.equal(adapted.reuseAdvanceAllowed,false);
  assert.equal(adapted.productionAuthorityGranted,false);
});

test('verifier rejects aggregate tampering after capture',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  const result=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
    input(bytes),execution(),unifiedMemory(),store().store,clock(),hashPort,
  );
  const tampered=structuredClone(result);
  tampered.benchmarkEvidence.ramBytes+=1;
  await assert.rejects(
    verifyHsmeFoundationTargetDeviceMeasuredCaptureV1(tampered,hashPort),
    error=>['hsme_target_capture_verify_benchmark_digest','hsme_target_capture_verify_aggregate'].includes(error?.code),
  );
});

test('runtime estimate or manifest-capacity source cannot masquerade as measured working set',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  for(const forbidden of ['RUNTIME_ESTIMATE','MANIFEST_REQUIRED_RAM','DEVICE_CAPACITY']){
    const memory=unifiedMemory({sourceKind:forbidden});
    await assert.rejects(
      captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(input(bytes),execution(),memory,store().store,clock(),hashPort),
      error=>error?.code==='hsme_target_capture_memory_source',
    );
  }
});

test('discrete host+accelerator capture stays explicitly separate in attestation',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  const result=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
    input(bytes),execution(),discreteMemory(),store().store,clock(),hashPort,
  );
  assert.equal(result.rawCapture.peakHostWorkingSetBytes,130);
  assert.equal(result.rawCapture.peakAcceleratorBytes,30);
  assert.equal(result.measurementAttestation.memoryAccountingMode,'DISCRETE_HOST_PLUS_ACCELERATOR');
  assert.equal(result.measurementAttestation.ramMetric,'PEAK_HOST_WORKING_SET_BYTES');
  assert.equal(result.measurementAttestation.vramMetric,'PEAK_ACCELERATOR_BYTES');
  assert.equal(result.benchmarkEvidence.ramBytes,130);
  assert.equal(result.benchmarkEvidence.vramBytes,30);
});

test('capture rejects wrong model bytes and never starts execution',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  const wrong=new TextEncoder().encode('other-model-bytes');
  const run=execution();
  const bad=input(bytes,{modelBytes:wrong});
  await assert.rejects(
    captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(bad,run,unifiedMemory(),store().store,clock(),hashPort),
    error=>error?.code==='hsme_target_capture_model_bytes',
  );
  assert.equal(run.state(),'UNLOADED');
  assert.equal(run.inferCount,0);
});

test('provider drift and manifest-provider mismatch fail closed',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  await assert.rejects(
    captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(input(bytes),execution({driftProvider:true}),unifiedMemory(),store().store,clock(),hashPort),
    error=>error?.code==='hsme_target_capture_provider_drift',
  );

  const restricted={...manifest(bytes),supportedAccelerators:['ONNX_RUNTIME']};
  await assert.rejects(
    captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
      input(bytes,{manifest:restricted}),execution(),unifiedMemory(),store().store,clock(),hashPort,
    ),
    error=>error?.code==='hsme_target_capture_provider_manifest',
  );
});

test('memory samples outside the measured capture window fail closed',async()=>{
  const bytes=new TextEncoder().encode('model-bytes-v1');
  await assert.rejects(
    captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
      input(bytes),execution(),unifiedMemory({outsideWindow:true}),store().store,clock(),hashPort,
    ),
    error=>error?.code==='hsme_target_capture_sample_window',
  );
});
