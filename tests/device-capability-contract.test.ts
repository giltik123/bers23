import assert from 'node:assert/strict';
import test from 'node:test';
import { DeviceAnalyzer } from '../src/platform/creative/local-ai/device/DeviceAnalyzer';
import { DeviceExecutionAdmission } from '../src/platform/creative/local-ai/selection/DeviceExecutionAdmission';
import type { ModelManifest, RuntimeKind } from '../src/platform/creative/local-ai/types';

test('unobservable device capabilities remain UNKNOWN including NNAPI and tier', async () => {
  const profile = await new DeviceAnalyzer({ signals: async () => ({}) }).analyze();
  assert.equal(profile.platform, 'UNKNOWN');
  assert.equal(profile.gpu, 'UNKNOWN');
  assert.equal(profile.vramMb, 'UNKNOWN');
  assert.equal(profile.nnapi, 'UNKNOWN');
  assert.equal(profile.tier, 'UNKNOWN');
});

test('device admission carries measured NNAPI and runtime probe evidence on the canonical profile', async () => {
  const model: ModelManifest = Object.freeze({
    modelId: 'android-segment', version: '1', family: 'segmentation', capabilities: ['SEGMENTATION'], modelFormat: 'ONNX', runtime: 'NNAPI',
    sizeBytes: 1_000_000, requiredRam: 512, requiredVram: 0, supportedPlatforms: ['ANDROID'], supportedAccelerators: ['NNAPI'], estimatedLatency: 20,
    qualityScore: .8, energyScore: .9, privacyLevel: 'PRIVATE', license: 'Apache-2.0', publisher: 'test', downloadUri: 'local://model', sha256: 'a'.repeat(64), signature: 'test', status: 'READY', stabilityScore: .9,
  });
  const admission = new DeviceExecutionAdmission({
    signals: async () => ({
      platform: 'ANDROID', deviceClass: 'MOBILE', cpuCores: 8, ramMb: 8192, architecture: 'arm64', nnapi: true,
      storageFreeBytes: 10_000_000_000, batteryPercent: 80, powerState: 'CHARGING', thermalState: 'NORMAL', ramPressure: 'NORMAL', backgroundRestricted: false,
    }),
  }, {
    detect: async (kind: RuntimeKind) => kind === 'NNAPI',
  });

  const decision = await admission.admit(model, ['SEGMENTATION'], 'LOCAL_ONLY');
  assert.equal(decision.allowed, true);
  assert.equal(decision.device.nnapi, true);
  assert.equal(decision.runtimes.NNAPI, true);
  assert.deepEqual(decision.device.runtimeCapabilities, decision.runtimes);
  assert.equal(decision.device.benchmarkEvidence, undefined);
});
