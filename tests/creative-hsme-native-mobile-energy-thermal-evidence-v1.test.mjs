import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import test from 'node:test';

import {
  captureHsmeNativeMobileEnergyThermalEvidenceV1,
  hsmeNativeMobileEnergyThermalEvidenceV1Digest,
} from '../src/platform/creative/local-ai/hsme/HsmeNativeMobileEnergyThermalEvidenceV1.ts';

const H=value=>createHash('sha256').update(value).digest('hex');
const hash={sha256:async bytes=>createHash('sha256').update(bytes).digest('hex')};

function raw(overrides={}){
  return {
    platform:'ANDROID',
    processIdentity:'android-process-202',
    sessionIdentity:'android-session-a',
    deviceRunSessionSha256:H('device-run-session'),
    runtimeIdentitySha256:H('runtime-id'),
    actualPlacement:'NPU',
    nativeTelemetryAttestationSha256:H('native-telemetry-attestation'),
    sourceApi:'android-power-stats-native-v1',
    sourceApiVersion:'1',
    bridgeVersion:'android-hsme-energy-bridge-v1',
    adapterBuildSha256:H('adapter-build'),
    osBuildSha256:H('android-os-build'),
    runtimeBuildSha256:H('runtime-build'),
    capturedAtMicrosStart:1_000,
    capturedAtMicrosEnd:10_000,
    warmLatencyUs:[900,1_000,1_100,1_200,1_300],
    peakHostMemoryBytes:800_000_000,
    peakAcceleratorMemoryBytes:400_000_000,
    flashBytesMoved:100_000_000,
    ramBytesMoved:200_000_000,
    acceleratorBytesMoved:300_000_000,
    energyMicroJoulesTotal:5_001,
    batteryStartBps:8_000,
    batteryEndBps:7_950,
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
}

function bridge(value){
  return {async capture(){return value;}};
}

test('native physical capture derives deterministic p50 p95 and measured energy evidence',async()=>{
  const record=await captureHsmeNativeMobileEnergyThermalEvidenceV1(
    bridge(raw()),
    hash,
  );
  const e=record.evidence;

  assert.equal(e.platform,'ANDROID');
  assert.equal(e.actualPlacement,'NPU');
  assert.equal(e.repeatedRunCount,5);
  assert.equal(e.repeatedWarmLatencyP50Us,1_100);
  assert.equal(e.repeatedWarmLatencyP95Us,1_300);
  assert.equal(e.energyMicroJoulesTotal,5_001);
  assert.equal(e.energyMicroJoulesPerRun,1_001);
  assert.equal(e.energyAggregation,'CEIL_TOTAL_UJ_DIV_RUN_COUNT');
  assert.equal(e.powerSource,'BATTERY');
  assert.equal(e.networkBytesDuringExecution,0);
  assert.equal(e.estimatedEnergyUsed,false);
  assert.equal(e.browserTelemetryUsed,false);
  assert.equal(e.simulatedDeviceUsed,false);
  assert.equal(e.manifestEstimateUsed,false);
  assert.equal(e.runtimeEstimateUsed,false);
  assert.match(e.processIdentitySha256,/^[0-9a-f]{64}$/);
  assert.match(e.sessionIdentitySha256,/^[0-9a-f]{64}$/);
  assert.match(e.measurementMethodSha256,/^[0-9a-f]{64}$/);
  assert.match(e.batteryMeasurementEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.match(e.thermalMeasurementEvidenceSha256,/^[0-9a-f]{64}$/);
  assert.equal(
    await hsmeNativeMobileEnergyThermalEvidenceV1Digest(e,hash),
    record.evidenceSha256,
  );
});

test('caller warm-run order does not affect percentile aggregation',async()=>{
  const a=await captureHsmeNativeMobileEnergyThermalEvidenceV1(
    bridge(raw({warmLatencyUs:[1300,900,1200,1000,1100]})),
    hash,
  );
  const b=await captureHsmeNativeMobileEnergyThermalEvidenceV1(
    bridge(raw({warmLatencyUs:[900,1000,1100,1200,1300]})),
    hash,
  );
  assert.equal(a.evidence.repeatedWarmLatencyP50Us,1_100);
  assert.equal(b.evidence.repeatedWarmLatencyP50Us,1_100);
  assert.equal(a.evidence.repeatedWarmLatencyP95Us,1_300);
  assert.equal(b.evidence.repeatedWarmLatencyP95Us,1_300);
});

test('battery charging network traffic and estimated-energy semantics fail closed',async()=>{
  for(const value of [
    raw({batteryStartBps:7000,batteryEndBps:7001}),
    raw({powerSource:'CHARGING'}),
    raw({networkBytesDuringExecution:1}),
    raw({energyMeasurementKind:'ESTIMATED'}),
    raw({physicalOriginClaim:'EMULATOR'}),
  ]){
    await assert.rejects(
      ()=>captureHsmeNativeMobileEnergyThermalEvidenceV1(
        bridge(value),
        hash,
      ),
    );
  }
});

test('physical placement and source attestation must be explicit',async()=>{
  for(const value of [
    raw({actualPlacement:'AUTO'}),
    raw({nativeTelemetryAttestationSha256:'not-a-sha'}),
    raw({runtimeIdentitySha256:'not-a-sha'}),
    raw({adapterBuildSha256:'not-a-sha'}),
  ]){
    await assert.rejects(
      ()=>captureHsmeNativeMobileEnergyThermalEvidenceV1(
        bridge(value),
        hash,
      ),
    );
  }
});

test('capture bounds reject unsafe timings runs memory energy and throttle values',async()=>{
  for(const value of [
    raw({capturedAtMicrosEnd:999}),
    raw({warmLatencyUs:[1000]}),
    raw({warmLatencyUs:[1000,0]}),
    raw({peakHostMemoryBytes:0}),
    raw({energyMicroJoulesTotal:0}),
    raw({throttledRunCount:6}),
    raw({batteryStartBps:10_001}),
  ]){
    await assert.rejects(
      ()=>captureHsmeNativeMobileEnergyThermalEvidenceV1(
        bridge(value),
        hash,
      ),
    );
  }
});

test('unknown raw fields are rejected before evidence hashing',async()=>{
  const value={...raw(),deviceSerial:'secret-device-serial'};
  await assert.rejects(
    ()=>captureHsmeNativeMobileEnergyThermalEvidenceV1(
      bridge(value),
      hash,
    ),
  );
});
