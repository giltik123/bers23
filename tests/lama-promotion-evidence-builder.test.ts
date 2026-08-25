import assert from 'node:assert/strict';
import test from 'node:test';
import { buildLaMaPromotionEvidence } from '../src/platform/creative/local-ai/benchmark/LaMaPromotionEvidenceBuilder.ts';
import { LAMA_RELEASE_KEY_ID } from '../src/platform/creative/local-ai/benchmark/LaMaProductionPromotion.ts';
import { LAMA_MODEL_ID, LAMA_ONNX_SHA256, LAMA_ONNX_SIZE, LAMA_VERSION } from '../src/platform/creative/local-ai/models/LaMaRelease.ts';

const releaseBase = 'https://github.com/giltik123/bers23/releases/download/lama-big-places-inpainting-v1.0.0-candidate.1';
const SHA = (value: string) => value.repeat(64);

function draft() {
  return {
    capturedAt: 1_000,
    expiresAt: 2_000,
    attestation: {
      evidenceUrl: 'https://evidence.example/lama/run.json',
      signatureUrl: 'https://evidence.example/lama/run.json.sig',
    },
    release: {
      artifactState: 'SIGNED_RELEASE' as const,
      modelId: LAMA_MODEL_ID,
      version: LAMA_VERSION,
      modelSize: LAMA_ONNX_SIZE,
      modelSha256: LAMA_ONNX_SHA256,
      verificationKeyId: LAMA_RELEASE_KEY_ID,
      modelUrl: `${releaseBase}/lama-big-places-inpainting.onnx`,
      modelSignatureUrl: `${releaseBase}/lama-big-places-inpainting.onnx.sig`,
      manifestUrl: 'https://evidence.example/lama/manifest.json',
      manifestSignatureUrl: 'https://evidence.example/lama/manifest.json.sig',
    },
    device: {
      evidenceKind: 'REAL_PHYSICAL_DEVICE' as const,
      platform: 'WINDOWS' as const,
      deviceClass: 'DESKTOP' as const,
      deviceTier: 'HIGH' as const,
      provider: 'wasm' as const,
      runtimeName: 'onnxruntime-web/wasm',
      runtimeVersion: '1.27.0',
      browserVersion: 'Chrome 150',
      adapterKind: 'CPU' as const,
      softwareAdapter: false,
      coarseDeviceEvidenceKey: 'opaque-coarse-device-key',
    },
    benchmark: {
      warmupCount: 2,
      samples: [
        { latencyMs: 50, success: true },
        { latencyMs: 10, success: true },
        { latencyMs: 30, success: false },
        { latencyMs: 20, success: true },
        { latencyMs: 40, success: true },
      ],
      peakRamBytes: 'UNKNOWN' as const,
      peakVramBytes: 'UNKNOWN' as const,
      testedShapes: [[256, 256], [512, 512]] as const,
    },
    quality: {
      datasetId: 'real-images-v1',
      datasetEvidenceUrl: 'https://evidence.example/lama/dataset.json',
      cases: Array.from({ length: 5 }, (_, index) => ({
        caseId: `case-${index}`,
        sourceImageSha256: SHA('a'),
        maskSha256: SHA('b'),
        rawOutputSha256: SHA('c'),
        compositeSha256: SHA('d'),
        width: 512,
        height: 512,
        knownRegionBitExact: true,
        outputGeometryValid: true,
        outputRangeValid: true,
        humanDecision: 'PASS' as const,
      })),
      reviewer: {
        reviewerId: 'opaque-reviewer',
        reviewedAt: 900,
        decision: 'PASS' as const,
        reviewEvidenceUrl: 'https://evidence.example/lama/review.json',
      },
    },
    localExecution: {
      executionTarget: 'LOCAL' as const,
      externalNetworkRequests: 0,
      providerApiCalls: 0,
      aiCreditsConsumed: 0,
    },
  };
}

test('builder deterministically derives sample counts and latency order statistics', () => {
  const evidence = buildLaMaPromotionEvidence(draft());
  assert.equal(evidence.schemaVersion, 1);
  assert.equal(evidence.benchmark.sampleCount, 5);
  assert.equal(evidence.benchmark.successfulSamples, 4);
  assert.deepEqual(evidence.benchmark.latencyMs, { min: 10, median: 30, p95: 50, max: 50 });
  assert.equal(Object.isFrozen(evidence), true);
  assert.equal(Object.isFrozen(evidence.benchmark), true);
});

test('builder rejects missing or invalid measured latency instead of inventing values', () => {
  const empty = draft();
  empty.benchmark.samples = [];
  assert.throws(() => buildLaMaPromotionEvidence(empty), /at least one measured inference sample/);

  const invalid = draft();
  invalid.benchmark.samples[0] = { latencyMs: Number.NaN, success: true };
  assert.throws(() => buildLaMaPromotionEvidence(invalid), /finite and non-negative/);
});

test('builder preserves failures and UNKNOWN memory; it has no promotion decision output', () => {
  const evidence = buildLaMaPromotionEvidence(draft());
  assert.equal(evidence.benchmark.successfulSamples, 4);
  assert.equal(evidence.benchmark.peakRamBytes, 'UNKNOWN');
  assert.equal(evidence.benchmark.peakVramBytes, 'UNKNOWN');
  assert.equal('eligible' in (evidence as unknown as Record<string, unknown>), false);
  assert.equal('productionApprovalEvidence' in (evidence as unknown as Record<string, unknown>), false);
});
