import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessLaMaProductionPromotion,
  LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS,
  LAMA_RELEASE_KEY_ID,
  type LaMaProductionPromotionEvidence,
  type LaMaPromotionTrustPort,
} from '../src/platform/creative/local-ai/benchmark/LaMaProductionPromotion.ts';
import {
  LAMA_MODEL_ID,
  LAMA_ONNX_SHA256,
  LAMA_ONNX_SIZE,
  LAMA_VERSION,
} from '../src/platform/creative/local-ai/models/LaMaRelease.ts';

const NOW = 2_000_000_000_000;
const TESTED_COMMIT_SHA = '1'.repeat(40);
const indexedSha = (value: number) => value.toString(16).padStart(64, '0');
const TRUSTED: LaMaPromotionTrustPort = {
  verifySignedRelease: async () => true,
  verifyPromotionEvidence: async () => true,
};

function evidence(): LaMaProductionPromotionEvidence {
  const releaseBase = 'https://github.com/giltik123/bers23/releases/download/lama-big-places-inpainting-v1.0.0-candidate.1';
  return {
    schemaVersion: 2,
    testedCommitSha: TESTED_COMMIT_SHA,
    capturedAt: NOW - 60_000,
    expiresAt: NOW + 60_000,
    attestation: {
      evidenceUrl: 'https://evidence.example/lama/device.json',
      signatureUrl: 'https://evidence.example/lama/device.json.sig',
    },
    release: {
      artifactState: 'SIGNED_RELEASE',
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
      evidenceKind: 'REAL_PHYSICAL_DEVICE',
      platform: 'WINDOWS',
      deviceClass: 'DESKTOP',
      deviceTier: 'HIGH',
      provider: 'webgpu',
      runtimeName: 'onnxruntime-web/webgpu',
      runtimeVersion: '1.27.0',
      browserVersion: 'Chrome 150',
      adapterKind: 'PHYSICAL',
      softwareAdapter: false,
      coarseDeviceEvidenceKey: 'coarse-real-device-key',
    },
    benchmark: {
      warmupCount: 1,
      sampleCount: 5,
      successfulSamples: 5,
      latencyMs: { min: 10, median: 12, p95: 15, max: 16 },
      peakRamBytes: 'UNKNOWN',
      peakVramBytes: 'UNKNOWN',
      testedShapes: [[256, 256], [512, 512]],
    },
    quality: {
      datasetId: 'lama-real-v1',
      datasetEvidenceUrl: 'https://evidence.example/lama/dataset.json',
      cases: Array.from({ length: 5 }, (_, index) => ({
        caseId: `case-${index + 1}`,
        sourceImageSha256: indexedSha(index + 1),
        maskSha256: indexedSha(index + 101),
        rawOutputSha256: indexedSha(index + 201),
        compositeSha256: indexedSha(index + 301),
        width: 512,
        height: 512,
        knownRegionBitExact: true,
        outputGeometryValid: true,
        outputRangeValid: true,
        humanDecision: 'PASS' as const,
      })),
      reviewer: {
        reviewerId: 'opaque-reviewer',
        reviewedAt: NOW - 90_000,
        decision: 'PASS',
        reviewEvidenceUrl: 'https://evidence.example/lama/review.json',
      },
    },
    localExecution: {
      executionTarget: 'LOCAL',
      externalNetworkRequests: 0,
      providerApiCalls: 0,
      aiCreditsConsumed: 0,
    },
  };
}

function mutate(change: (value: any) => void): unknown {
  const value = structuredClone(evidence()) as any;
  change(value);
  return value;
}

async function assess(value: unknown) {
  return assessLaMaProductionPromotion(value, TRUSTED, TESTED_COMMIT_SHA, NOW);
}

test('garbage platform, device class and tier cannot masquerade as real hardware', async () => {
  const result = await assess(mutate(value => {
    value.device.platform = 'GARbage';
    value.device.deviceClass = 'SERVER_FARM';
    value.device.deviceTier = 'MAGIC';
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('INCOMPLETE_RUNTIME_IDENTITY'));
});

test('provider/runtime pairing and exact runtime version are closed allowlists', async () => {
  const wrongName = await assess(mutate(value => { value.device.runtimeName = 'onnxruntime-web/wasm'; }));
  assert.ok(wrongName.blockers.includes('INCOMPLETE_RUNTIME_IDENTITY'));

  const wrongVersion = await assess(mutate(value => { value.device.runtimeVersion = '1.28.0'; }));
  assert.ok(wrongVersion.blockers.includes('INCOMPLETE_RUNTIME_IDENTITY'));

  const unknownProvider = await assess(mutate(value => { value.device.provider = 'cuda'; }));
  assert.ok(unknownProvider.blockers.includes('UNSUPPORTED_PROVIDER'));
  assert.ok(unknownProvider.blockers.includes('PHYSICAL_WEBGPU_REQUIRED'));
});

test('CPU/WASM evidence remains diagnostic and cannot satisfy global physical-WebGPU production eligibility', async () => {
  const result = await assess(mutate(value => {
    value.device.provider = 'wasm';
    value.device.runtimeName = 'onnxruntime-web/wasm';
    value.device.adapterKind = 'CPU';
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('PHYSICAL_WEBGPU_REQUIRED'));
});

test('release model and signature URLs are pinned to the exact C8 tag and filenames', async () => {
  const wrongModelUrl = await assess(mutate(value => {
    value.release.modelUrl = 'https://example.com/lama-big-places-inpainting.onnx';
  }));
  assert.ok(wrongModelUrl.blockers.includes('INVALID_EVIDENCE_URL'));
  assert.ok(wrongModelUrl.blockers.includes('RELEASE_SIGNATURE_UNVERIFIED'));

  const wrongTag = await assess(mutate(value => {
    value.release.modelSignatureUrl = 'https://github.com/giltik123/bers23/releases/download/other/lama-big-places-inpainting.onnx.sig';
  }));
  assert.ok(wrongTag.blockers.includes('INVALID_EVIDENCE_URL'));
});

test('evidence lifetime cannot exceed the maximum TTL even when not yet expired', async () => {
  const result = await assess(mutate(value => {
    value.capturedAt = NOW - 1;
    value.expiresAt = value.capturedAt + LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS + 1;
  }));
  assert.ok(result.blockers.includes('INVALID_SCHEMA'));
});

test('human review must already exist when the evidence capture is finalized', async () => {
  const result = await assess(mutate(value => {
    value.quality.reviewer.reviewedAt = value.capturedAt + 1;
  }));
  assert.ok(result.blockers.includes('HUMAN_REVIEW_REQUIRED'));
});

test('duplicate real-image case IDs are rejected instead of inflating review count', async () => {
  const result = await assess(mutate(value => {
    value.quality.cases[1].caseId = value.quality.cases[0].caseId;
  }));
  assert.ok(result.blockers.includes('INVALID_REAL_IMAGE_BINDING'));
});

test('duplicate source/mask bindings cannot be relabeled into the minimum real-image count', async () => {
  const result = await assess(mutate(value => {
    value.quality.cases[1].sourceImageSha256 = value.quality.cases[0].sourceImageSha256;
    value.quality.cases[1].maskSha256 = value.quality.cases[0].maskSha256;
  }));
  assert.ok(result.blockers.includes('INVALID_REAL_IMAGE_BINDING'));
  assert.ok(result.blockers.includes('REAL_IMAGE_REVIEW_REQUIRED'));
});

test('cyclic or otherwise non-canonical evidence fails closed before trust verification', async () => {
  const hostile = structuredClone(evidence()) as any;
  hostile.quality.loop = hostile;
  let promotionVerifyCalls = 0;
  const trust: LaMaPromotionTrustPort = {
    verifySignedRelease: async () => true,
    verifyPromotionEvidence: async () => {
      promotionVerifyCalls += 1;
      return true;
    },
  };
  const result = await assessLaMaProductionPromotion(hostile, trust, TESTED_COMMIT_SHA, NOW);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('INVALID_SCHEMA'));
  assert.equal(promotionVerifyCalls, 0);
});
