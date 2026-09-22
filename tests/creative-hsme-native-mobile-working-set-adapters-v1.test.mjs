import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {BenchmarkEvidenceStore} from '../src/platform/creative/local-ai/benchmark/BenchmarkEvidence.ts';
import {
  captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationTargetDeviceMeasuredCaptureV1.ts';
import {
  createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1,
  createHsmeFoundationIosWorkingSetMeasurementAdapterV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationNativeMobileWorkingSetAdaptersV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function measured(platform,index=0,overrides={}){
  const ios=platform==='IOS';
  return {
    status:'MEASURED',
    platform,
    metricKind:ios?'TASK_VM_INFO_PHYS_FOOTPRINT_BYTES':'PROCESS_RESIDENT_SET_RSS_BYTES',
    bytes:100_000_000+index*10_000_000,
    capturedAtMicros:[1500,4000,12500,17500,23000][index]??(30_000+index),
    processIdentity:ios?'ios-process-101':'android-process-202',
    sessionIdentity:ios?'ios-session-a':'android-session-a',
    sourceApi:ios?'task_info(TASK_VM_INFO)':'/proc/self/statm',
    sourceApiVersion:ios?'darwin-task-v1':'linux-procfs-v1',
    monotonicTimeDomain:ios?'mach-continuous-micros':'android-elapsed-realtime-micros',
    bridgeVersion:ios?'ios-native-bridge-v1':'android-native-bridge-v1',
    adapterBuildSha256:H(ios?'ios-adapter-build':'android-adapter-build'),
    runtimeIdentitySha256:H(ios?'ios-runtime':'android-runtime'),
    ...overrides,
  };
}

function queueBridge(samples){
  let index=0;
  return {
    async sample(){
      if(index>=samples.length)throw new Error('native bridge sample queue exhausted');
      return samples[index++];
    },
  };
}

function adapter(platform,samples){
  const bridge=queueBridge(samples);
  return platform==='IOS'
    ? createHsmeFoundationIosWorkingSetMeasurementAdapterV1(bridge,hashPort)
    : createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1(bridge,hashPort);
}

test('Android adapter accepts exact process RSS and produces content-addressed evidence',async()=>{
  const a=adapter('ANDROID',[measured('ANDROID',0)]);
  const sample=await a.sample('BASELINE',0);
  assert.equal(a.memoryAccountingMode,'UNIFIED_PROCESS_WORKING_SET');
  assert.equal(a.sourceKind,'NATIVE_PROCESS_WORKING_SET');
  assert.equal(sample.hostBytes,100_000_000);
  assert.equal(sample.acceleratorBytes,'UNAVAILABLE');
  assert.match(sample.sourceEvidenceSha256,/^[0-9a-f]{64}$/);
  const ledger=a.sourceEvidenceLedger();
  assert.equal(ledger.length,1);
  assert.equal(ledger[0].sourceEvidenceSha256,sample.sourceEvidenceSha256);
  assert.match(ledger[0].evidence.processIdentitySha256,/^[0-9a-f]{64}$/);
  assert.match(ledger[0].evidence.sessionIdentitySha256,/^[0-9a-f]{64}$/);
  assert.equal('processIdentity' in ledger[0].evidence,false);
  assert.equal('sessionIdentity' in ledger[0].evidence,false);

  const b=adapter('ANDROID',[measured('ANDROID',0)]);
  const same=await b.sample('BASELINE',0);
  assert.equal(same.sourceEvidenceSha256,sample.sourceEvidenceSha256);
});

test('iOS adapter accepts exact task physical footprint and keeps unified semantics',async()=>{
  const a=adapter('IOS',[measured('IOS',0)]);
  const sample=await a.sample('BASELINE',0);
  assert.equal(a.memoryAccountingMode,'UNIFIED_PROCESS_WORKING_SET');
  assert.equal(a.sourceKind,'NATIVE_UNIFIED_PROCESS_WORKING_SET');
  assert.equal(sample.hostBytes,100_000_000);
  assert.equal(sample.acceleratorBytes,'UNAVAILABLE');
  assert.match(sample.sourceEvidenceSha256,/^[0-9a-f]{64}$/);
});

test('unavailable and permission-denied native telemetry fail explicitly',async()=>{
  for(const platform of ['ANDROID','IOS']){
    for(const reason of ['SOURCE_UNAVAILABLE','PERMISSION_DENIED']){
      const a=adapter(platform,[{status:'UNAVAILABLE',reason,detailCode:'native-source-denied'}]);
      await assert.rejects(
        a.sample('BASELINE',0),
        error=>error?.code==='MEASUREMENT_UNAVAILABLE',
      );
    }
  }
});

test('Android PSS or other metric cannot masquerade as process RSS',async()=>{
  const a=adapter('ANDROID',[measured('ANDROID',0,{metricKind:'PROCESS_PROPORTIONAL_SET_PSS_BYTES'})]);
  await assert.rejects(
    a.sample('BASELINE',0),
    error=>error?.code==='MEASUREMENT_UNAVAILABLE',
  );
});

test('iOS non-footprint metric cannot masquerade as physical footprint',async()=>{
  const a=adapter('IOS',[measured('IOS',0,{metricKind:'PROCESS_RESIDENT_SET_RSS_BYTES'})]);
  await assert.rejects(
    a.sample('BASELINE',0),
    error=>error?.code==='MEASUREMENT_UNAVAILABLE',
  );
});

test('platform drift fails closed before evidence leaves the adapter',async()=>{
  const a=adapter('ANDROID',[measured('ANDROID',0,{platform:'IOS'})]);
  await assert.rejects(
    a.sample('BASELINE',0),
    error=>error?.code==='hsme_native_mobile_platform',
  );
});

test('process, session and source identity drift fail closed',async()=>{
  for(const override of [
    {processIdentity:'other-process'},
    {sessionIdentity:'other-session'},
    {sourceApiVersion:'changed-source-version'},
    {monotonicTimeDomain:'changed-time-domain'},
    {bridgeVersion:'changed-bridge'},
    {adapterBuildSha256:H('changed-build')},
    {runtimeIdentitySha256:H('changed-runtime')},
  ]){
    const a=adapter('ANDROID',[
      measured('ANDROID',0),
      measured('ANDROID',1,override),
    ]);
    await a.sample('BASELINE',0);
    await assert.rejects(
      a.sample('POST_LOAD',0),
      error=>error?.code==='hsme_native_mobile_identity_drift',
    );
  }
});

test('native timestamp regression or duplicate timestamp fails closed',async()=>{
  for(const capturedAtMicros of [1500,1499]){
    const a=adapter('ANDROID',[
      measured('ANDROID',0),
      measured('ANDROID',1,{capturedAtMicros}),
    ]);
    await a.sample('BASELINE',0);
    await assert.rejects(
      a.sample('POST_LOAD',0),
      error=>error?.code==='hsme_native_mobile_timestamp_regression',
    );
  }
});

test('zero, negative and unsafe byte counts reject',async()=>{
  for(const bytes of [0,-1,Number.MAX_SAFE_INTEGER+1]){
    const a=adapter('ANDROID',[measured('ANDROID',0,{bytes})]);
    await assert.rejects(
      a.sample('BASELINE',0),
      error=>error?.code==='hsme_native_mobile_bytes',
    );
  }
});

test('source evidence binds phase, sequence and exact measured value',async()=>{
  const sameRaw=measured('ANDROID',0);
  const baseline=adapter('ANDROID',[sameRaw]);
  const postLoad=adapter('ANDROID',[sameRaw]);
  const a=await baseline.sample('BASELINE',0);
  const b=await postLoad.sample('POST_LOAD',0);
  assert.notEqual(a.sourceEvidenceSha256,b.sourceEvidenceSha256);

  const changed=adapter('ANDROID',[{...sameRaw,bytes:sameRaw.bytes+1}]);
  const c=await changed.sample('BASELINE',0);
  assert.notEqual(a.sourceEvidenceSha256,c.sourceEvidenceSha256);
});

function manifest(bytes,platform){
  return {
    modelId:'hsme-native-mobile-candidate',
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
      observedSignals:[],unknownSignals:[],
      observedRuntimes:['ONNX_RUNTIME','WASM'],unknownRuntimes:[],
    },
  };
}

function input(bytes,platform){
  return {
    targetTier:'MOBILE_DEFAULT',
    snapshot:snapshot(platform),
    manifest:manifest(bytes,platform),
    modelBytes:bytes,
    request:{requestId:'native-fixture-1',inputs:{input:{data:[1,2,3,4],dims:[1,4]}}},
    benchmarkFixtureSha256:H('native-frozen-fixture'),
    targetRuntimeInventorySha256:H('native-target-runtime-inventory'),
    representationBindingSha256:H('native-representation-binding'),
    warmSampleCount:2,
    energyEstimate:.4,
    energyEvidenceSha256:H('native-energy-evidence'),
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
        modelId:'hsme-native-mobile-candidate',
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
  const port={
    async list(){return [...rows.values()];},
    async put(value){rows.set(value.evidenceKey,value);},
    async remove(key){rows.delete(key);},
  };
  return new BenchmarkEvidenceStore(port,hashPort,()=>1_000,10_000);
}

for(const platform of ['ANDROID','IOS']){
  test(platform+' native adapter feeds #640 capture without semantic translation',async()=>{
    const bytes=new TextEncoder().encode('native-mobile-model-v1');
    const samples=[0,1,2,3,4].map(index=>measured(platform,index,{
      bytes:[100_000_000,200_000_000,300_000_000,250_000_000,280_000_000][index],
    }));
    const memory=adapter(platform,samples);
    const result=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
      input(bytes,platform),execution(),memory,store(),clock(),hashPort,
    );

    assert.equal(result.rawCapture.peakHostWorkingSetBytes,300_000_000);
    assert.equal(result.rawCapture.peakAcceleratorBytes,'UNAVAILABLE');
    assert.equal(result.benchmarkEvidence.ramBytes,300_000_000);
    assert.equal(result.benchmarkEvidence.vramBytes,0);
    assert.equal(result.rawCapture.runtimeEstimateUsed,false);
    assert.equal(result.rawCapture.manifestResourceEstimateUsed,false);
    assert.equal(result.productionAuthorityGranted,false);
    assert.equal(result.reuseAdvanceAllowed,false);
    assert.equal(result.winnerSelectionAllowed,false);
    assert.equal(result.rawCapture.workingSetSamples.length,5);
    for(const sample of result.rawCapture.workingSetSamples){
      assert.match(sample.sourceEvidenceSha256,/^[0-9a-f]{64}$/);
    }

    const ledger=memory.sourceEvidenceLedger();
    assert.equal(ledger.length,5);
    assert.deepEqual(
      ledger.map(record=>record.sourceEvidenceSha256),
      result.rawCapture.workingSetSamples.map(sample=>sample.sourceEvidenceSha256),
    );
    assert.equal(new Set(ledger.map(record=>record.sourceEvidenceSha256)).size,5);
    for(const record of ledger){
      assert.equal('processIdentity' in record.evidence,false);
      assert.equal('sessionIdentity' in record.evidence,false);
      assert.match(record.evidence.processIdentitySha256,/^[0-9a-f]{64}$/);
      assert.match(record.evidence.sessionIdentitySha256,/^[0-9a-f]{64}$/);
    }
  });
}
