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
import {
  HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA,
  assessHsmeFoundationPhysicalMobileValidationEvidenceV1,
} from '../src/platform/creative/local-ai/hsme/HsmeFoundationPhysicalMobileValidationEvidenceV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hashPort={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};
const TESTED_COMMIT='a'.repeat(40);
const NOW=2_000;

function measured(platform,index=0,overrides={}){
  const ios=platform==='IOS';
  return {
    status:'MEASURED',
    platform,
    metricKind:ios?'TASK_VM_INFO_PHYS_FOOTPRINT_BYTES':'PROCESS_RESIDENT_SET_RSS_BYTES',
    bytes:[100_000_000,200_000_000,300_000_000,250_000_000,280_000_000][index]??100_000_000,
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

function bridge(platform){
  const samples=[0,1,2,3,4].map(index=>measured(platform,index));
  let index=0;
  return {async sample(){return samples[index++];}};
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
    modelId:'hsme-physical-mobile-candidate',
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

function execution(){
  let state='UNLOADED';
  return {
    state:()=>state,
    async load(){state='LOADED';},
    async synchronize(){},
    async infer(req){
      return {
        requestId:req.requestId,
        modelId:'hsme-physical-mobile-candidate',
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

async function validBundle(platform='ANDROID'){
  const bytes=new TextEncoder().encode('physical-mobile-model-v1');
  const memory=platform==='IOS'
    ? createHsmeFoundationIosWorkingSetMeasurementAdapterV1(bridge(platform),hashPort)
    : createHsmeFoundationAndroidWorkingSetMeasurementAdapterV1(bridge(platform),hashPort);
  const device=snapshot(platform);
  const model=manifest(bytes,platform);
  const capture=await captureHsmeFoundationTargetDeviceMeasuredBenchmarkV1(
    {
      targetTier:'MOBILE_DEFAULT',
      snapshot:device,
      manifest:model,
      modelBytes:bytes,
      request:{requestId:'physical-fixture-1',inputs:{input:{data:[1,2,3,4],dims:[1,4]}}},
      benchmarkFixtureSha256:H('physical-frozen-fixture'),
      targetRuntimeInventorySha256:H('physical-target-runtime-inventory'),
      representationBindingSha256:H('physical-representation-binding'),
      warmSampleCount:2,
      energyEstimate:.4,
      energyEvidenceSha256:H('physical-energy-evidence'),
    },
    execution(),memory,store(),clock(),hashPort,
  );
  return {
    schemaVersion:HSME_FOUNDATION_PHYSICAL_MOBILE_VALIDATION_V1_SCHEMA,
    testedCommitSha:TESTED_COMMIT,
    physicalOriginClaim:'REAL_PHYSICAL_DEVICE',
    capturedAt:capture.benchmarkEvidence.capturedAt,
    expiresAt:capture.benchmarkEvidence.expiresAt,
    deviceSnapshot:device,
    applicationBuildSha256:H('physical-app-build'),
    deviceRunSessionSha256:H(platform+'-physical-session'),
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
  };
}

function trust(result=true){
  const calls=[];
  return {
    calls,
    async verifyPhysicalRunEvidence(attestation,canonicalPayload){
      calls.push({attestation,canonicalPayload});
      if(result instanceof Error)throw result;
      return result;
    },
  };
}

for(const platform of ['ANDROID','IOS']){
  test(platform+' signed physical bundle reaches VERIFIED only through external trust port',async()=>{
    const bundle=await validBundle(platform);
    const verifier=trust(true);
    const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
      bundle,verifier,TESTED_COMMIT,NOW,hashPort,
    );
    assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_VERIFIED');
    assert.equal(result.physicalState,'REAL_DEVICE_EVIDENCE_VERIFIED');
    assert.deepEqual(result.blockers,[]);
    assert.match(result.sourceEvidenceLedgerSha256,/^[0-9a-f]{64}$/);
    assert.match(result.physicalRunPayloadSha256,/^[0-9a-f]{64}$/);
    assert.equal(verifier.calls.length,1);
    assert.equal(verifier.calls[0].canonicalPayload,result.canonicalPayload);
    assert.match(result.canonicalPayload,/"physicalOriginClaim":"REAL_PHYSICAL_DEVICE"/);
    assert.match(result.canonicalPayload,/"sourceEvidenceLedgerSha256":"[0-9a-f]{64}"/);
    assert.equal(result.productionAuthorityGranted,false);
    assert.equal(result.modelFleetPromotionAllowed,false);
    assert.equal(result.reuseAdvanceAllowed,false);
    assert.equal(result.winnerSelectionAllowed,false);
  });
}

test('integrity can pass while unverified external attestation remains required',async()=>{
  const bundle=await validBundle();
  const verifier=trust(false);
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_VERIFIED');
  assert.equal(result.physicalState,'REAL_DEVICE_ATTESTATION_REQUIRED');
  assert.deepEqual(result.blockers,['PHYSICAL_ATTESTATION_UNVERIFIED']);
  assert.equal(verifier.calls.length,1);
});

test('throwing trust verifier fails closed without losing integrity result',async()=>{
  const bundle=await validBundle();
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,trust(new Error('offline verifier')),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_VERIFIED');
  assert.equal(result.physicalState,'REAL_DEVICE_ATTESTATION_REQUIRED');
  assert.ok(result.blockers.includes('PHYSICAL_ATTESTATION_UNVERIFIED'));
});

test('invalid attestation URLs cannot reach external trust verifier',async()=>{
  const bundle=structuredClone(await validBundle());
  bundle.attestation.signatureUrl='http://evidence.example/unsigned.sig';
  const verifier=trust(true);
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_VERIFIED');
  assert.equal(result.physicalState,'REAL_DEVICE_ATTESTATION_REQUIRED');
  assert.ok(result.blockers.includes('PHYSICAL_ATTESTATION_INVALID'));
  assert.equal(verifier.calls.length,0);
});

test('exported DeviceCapabilitySnapshot must be canonical and fully bound into the physical payload',async()=>{
  const malformed=structuredClone(await validBundle());
  malformed.deviceSnapshot.evidence.observedSignals=['deviceSerial=raw-secret'];
  let verifier=trust(true);
  let result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    malformed,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('DEVICE_SNAPSHOT_EVIDENCE_NOT_CANONICAL'));
  assert.equal(verifier.calls.length,0);

  const base=await validBundle();
  const changed=structuredClone(base);
  changed.deviceSnapshot.profile.storageFreeBytes-=1;
  const baseResult=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    base,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  const changedResult=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    changed,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(baseResult.integrityState,'EVIDENCE_INTEGRITY_VERIFIED');
  assert.equal(changedResult.integrityState,'EVIDENCE_INTEGRITY_VERIFIED');
  assert.notEqual(baseResult.physicalRunPayloadSha256,changedResult.physicalRunPayloadSha256);
  assert.match(baseResult.canonicalPayload,/"deviceSnapshotSha256":"[0-9a-f]{64}"/);
});

test('extra DeviceCapabilitySnapshot fields cannot hide outside the capability key',async()=>{
  const bundle=structuredClone(await validBundle());
  bundle.deviceSnapshot.deviceSerial='raw-device-serial';
  const verifier=trust(true);
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('DEVICE_SNAPSHOT_SHAPE_INVALID'));
  assert.ok(result.blockers.includes('FORBIDDEN_SENSITIVE_EXPORT_FIELD'));
  assert.equal(verifier.calls.length,0);
});

test('unsigned extra root, ledger and attestation fields are rejected',async()=>{
  const root=structuredClone(await validBundle());
  root.deviceSerial='forbidden-serial';
  let verifier=trust(true);
  let result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    root,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('BUNDLE_SHAPE_INVALID'));
  assert.ok(result.blockers.includes('FORBIDDEN_SENSITIVE_EXPORT_FIELD'));
  assert.equal(verifier.calls.length,0);

  const record=structuredClone(await validBundle());
  record.sourceEvidenceLedger[0].unsignedNote='not-in-canonical-record';
  verifier=trust(true);
  result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    record,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('SOURCE_LEDGER_RECORD_SHAPE_INVALID'));
  assert.equal(verifier.calls.length,0);

  const attestation=structuredClone(await validBundle());
  attestation.attestation.token='secret-token';
  verifier=trust(true);
  result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    attestation,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('FORBIDDEN_SENSITIVE_EXPORT_FIELD'));
  assert.equal(verifier.calls.length,0);
});

test('attestation URLs cannot embed HTTP basic credentials',async()=>{
  const bundle=structuredClone(await validBundle());
  bundle.attestation.evidenceUrl='https://user:password@evidence.example/hsme/mobile-run.json';
  const verifier=trust(true);
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_VERIFIED');
  assert.equal(result.physicalState,'REAL_DEVICE_ATTESTATION_REQUIRED');
  assert.ok(result.blockers.includes('PHYSICAL_ATTESTATION_INVALID'));
  assert.equal(verifier.calls.length,0);
});

test('source evidence byte tampering invalidates integrity before trust',async()=>{
  const bundle=structuredClone(await validBundle());
  bundle.sourceEvidenceLedger[2].evidence.bytes+=1;
  const verifier=trust(true);
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.equal(result.physicalState,'REAL_DEVICE_EVIDENCE_INVALID');
  assert.ok(result.blockers.includes('SOURCE_SAMPLE_BINDING_MISMATCH'));
  assert.ok(result.blockers.includes('SOURCE_EVIDENCE_DIGEST_MISMATCH'));
  assert.equal(verifier.calls.length,0);
});

test('missing or extra ledger records fail the sample bijection',async()=>{
  const missing=structuredClone(await validBundle());
  missing.sourceEvidenceLedger.pop();
  let result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    missing,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('SOURCE_LEDGER_SAMPLE_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('SOURCE_SAMPLE_WITHOUT_EVIDENCE'));

  const extra=structuredClone(await validBundle());
  extra.sourceEvidenceLedger.push(structuredClone(extra.sourceEvidenceLedger[4]));
  result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    extra,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('SOURCE_LEDGER_SAMPLE_COUNT_MISMATCH'));
  assert.ok(result.blockers.includes('SOURCE_EVIDENCE_DUPLICATE'));
  assert.ok(result.blockers.includes('SOURCE_LEDGER_UNREFERENCED_RECORD'));
});

test('raw process/session identity fields are forbidden in exported evidence',async()=>{
  const bundle=structuredClone(await validBundle());
  bundle.sourceEvidenceLedger[0].evidence.processIdentity='raw-pid-should-not-export';
  bundle.sourceEvidenceLedger[0].evidence.sessionIdentity='raw-session-should-not-export';
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('SOURCE_EVIDENCE_SHAPE_INVALID'));
  assert.ok(result.blockers.includes('RAW_PROCESS_SESSION_IDENTITY_FORBIDDEN'));
});

test('Android PSS cannot be relabeled inside a physical bundle',async()=>{
  const bundle=structuredClone(await validBundle('ANDROID'));
  bundle.sourceEvidenceLedger[0].evidence.metricKind='PROCESS_PROPORTIONAL_SET_PSS_BYTES';
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('ANDROID_RSS_REQUIRED'));
});

test('iOS RSS cannot replace task physical footprint',async()=>{
  const bundle=structuredClone(await validBundle('IOS'));
  bundle.sourceEvidenceLedger[0].evidence.metricKind='PROCESS_RESIDENT_SET_RSS_BYTES';
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('IOS_PHYSICAL_FOOTPRINT_REQUIRED'));
});

test('cross-device snapshot drift fails closed',async()=>{
  const bundle=structuredClone(await validBundle('ANDROID'));
  bundle.deviceSnapshot.profile.ramMb=4096;
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,trust(true),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('DEVICE_CAPABILITY_KEY_DRIFT'));
});

test('tested commit drift fails closed',async()=>{
  const bundle=await validBundle();
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,trust(true),'b'.repeat(40),NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('TESTED_COMMIT_DRIFT'));
});

test('stale and future physical evidence fail before trust',async()=>{
  const stale=structuredClone(await validBundle());
  stale.capturedAt=1;
  stale.expiresAt=2;
  stale.measuredCapture.benchmarkEvidence.capturedAt=1;
  stale.measuredCapture.benchmarkEvidence.expiresAt=2;
  let verifier=trust(true);
  let result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    stale,verifier,TESTED_COMMIT,HSME_MAX_AGE_PLUS_NOW(),hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('STALE_EVIDENCE'));
  assert.equal(verifier.calls.length,0);

  const future=structuredClone(await validBundle());
  future.capturedAt=5_000;
  future.expiresAt=10_000;
  future.measuredCapture.benchmarkEvidence.capturedAt=5_000;
  future.measuredCapture.benchmarkEvidence.expiresAt=10_000;
  verifier=trust(true);
  result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    future,verifier,TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(result.integrityState,'EVIDENCE_INTEGRITY_INVALID');
  assert.ok(result.blockers.includes('FUTURE_EVIDENCE'));
  assert.equal(verifier.calls.length,0);
});

function HSME_MAX_AGE_PLUS_NOW(){
  return 40*24*60*60*1000;
}

test('self-declared REAL_PHYSICAL_DEVICE without verified signature never becomes verified',async()=>{
  const bundle=await validBundle();
  const result=await assessHsmeFoundationPhysicalMobileValidationEvidenceV1(
    bundle,trust(false),TESTED_COMMIT,NOW,hashPort,
  );
  assert.equal(bundle.physicalOriginClaim,'REAL_PHYSICAL_DEVICE');
  assert.equal(result.physicalState,'REAL_DEVICE_ATTESTATION_REQUIRED');
  assert.notEqual(result.physicalState,'REAL_DEVICE_EVIDENCE_VERIFIED');
});
