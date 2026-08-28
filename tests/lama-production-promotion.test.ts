import assert from 'node:assert/strict';
import test from 'node:test';
import manifest from '../src/platform/creative/local-ai/models/lama-inpainting.manifest.json' with { type: 'json' };
import {
  assessLaMaProductionPromotion,
  LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS,
  LAMA_PROMOTION_MIN_INFERENCE_SAMPLES,
  LAMA_PROMOTION_MIN_REAL_IMAGE_CASES,
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
import { productionLocalModelsByCapability } from '../server/core/localExecution/productionLocalModelPolicy.ts';
import { productionLocalExecutorsByCapability } from '../server/core/localExecution/productionLocalExecutorPolicy.ts';

const NOW = 2_000_000_000_000;
const TESTED_COMMIT_SHA = '1'.repeat(40);
const OTHER_COMMIT_SHA = '2'.repeat(40);
const SHA = (character: string) => character.repeat(64);
const indexedSha = (value: number) => value.toString(16).padStart(64, '0');
const TRUSTED: LaMaPromotionTrustPort = {
  verifySignedRelease: async () => true,
  verifyPromotionEvidence: async () => true,
};
const UNTRUSTED: LaMaPromotionTrustPort = {
  verifySignedRelease: async () => false,
  verifyPromotionEvidence: async () => false,
};

function validEvidence(provider: 'webgpu' | 'wasm' = 'webgpu'): LaMaProductionPromotionEvidence {
  const cases = Array.from({ length: LAMA_PROMOTION_MIN_REAL_IMAGE_CASES }, (_, index) => ({
    caseId: `real-image-${index + 1}`,
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
  }));
  const releaseBase = 'https://github.com/giltik123/bers23/releases/download/lama-big-places-inpainting-v1.0.0-candidate.1';
  return {
    schemaVersion: 2,
    testedCommitSha: TESTED_COMMIT_SHA,
    capturedAt: NOW - 60_000,
    expiresAt: NOW + 60_000,
    attestation: {
      evidenceUrl: 'https://evidence.example/lama/device-run.json',
      signatureUrl: 'https://evidence.example/lama/device-run.json.sig',
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
      manifestUrl: 'https://evidence.example/lama/lama-inpainting.manifest.json',
      manifestSignatureUrl: 'https://evidence.example/lama/lama-inpainting.manifest.sig',
    },
    device: {
      evidenceKind: 'REAL_PHYSICAL_DEVICE',
      platform: 'WINDOWS',
      deviceClass: 'DESKTOP',
      deviceTier: 'HIGH',
      provider,
      runtimeName: provider === 'webgpu' ? 'onnxruntime-web/webgpu' : 'onnxruntime-web/wasm',
      runtimeVersion: '1.27.0',
      browserVersion: 'Chrome 150',
      adapterKind: provider === 'webgpu' ? 'PHYSICAL' : 'CPU',
      softwareAdapter: false,
      coarseDeviceEvidenceKey: 'desktop-high-windows-web-runtime',
    },
    benchmark: {
      warmupCount: 1,
      sampleCount: LAMA_PROMOTION_MIN_INFERENCE_SAMPLES,
      successfulSamples: LAMA_PROMOTION_MIN_INFERENCE_SAMPLES,
      latencyMs: { min: 100, median: 120, p95: 150, max: 160 },
      peakRamBytes: 'UNKNOWN',
      peakVramBytes: 'UNKNOWN',
      testedShapes: [[256, 256], [512, 512]],
    },
    quality: {
      datasetId: 'lama-real-image-review-v1',
      datasetEvidenceUrl: 'https://evidence.example/lama/dataset.json',
      cases,
      reviewer: {
        reviewerId: 'reviewer-opaque-1',
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

function mutate(base: LaMaProductionPromotionEvidence, change: (value: any) => void): unknown {
  const value = structuredClone(base) as any;
  change(value);
  return value;
}

async function assess(value: unknown, trust: LaMaPromotionTrustPort = TRUSTED) {
  return assessLaMaProductionPromotion(value, trust, TESTED_COMMIT_SHA, NOW);
}

test('complete externally verified physical-WebGPU evidence envelope is structurally eligible but grants no authority by itself', async () => {
  const result = await assess(validEvidence());
  assert.equal(result.eligible, true);
  assert.deepEqual(result.blockers, []);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.productionApprovalEvidence, null);
});

test('WASM evidence cannot satisfy the global production gate while physical WebGPU remains outstanding', async () => {
  const result = await assess(validEvidence('wasm'));
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('PHYSICAL_WEBGPU_REQUIRED'));
});

test('promotion attestation verification is bound to the exact canonical assessed payload', async () => {
  const base = validEvidence();
  let signedPayload = '';
  const capture: LaMaPromotionTrustPort = {
    verifySignedRelease: async () => true,
    verifyPromotionEvidence: async (_attestation, canonicalPayload) => {
      signedPayload = canonicalPayload;
      return true;
    },
  };
  const initial = await assess(base, capture);
  assert.equal(initial.eligible, true);
  assert.ok(signedPayload.includes(`\"testedCommitSha\":\"${TESTED_COMMIT_SHA}\"`));

  const boundTrust: LaMaPromotionTrustPort = {
    verifySignedRelease: async () => true,
    verifyPromotionEvidence: async (_attestation, canonicalPayload) => canonicalPayload === signedPayload,
  };
  const substituted = await assess(mutate(base, value => { value.device.deviceTier = 'LOW'; }), boundTrust);
  assert.equal(substituted.eligible, false);
  assert.ok(substituted.blockers.includes('EVIDENCE_SIGNATURE_UNVERIFIED'));
});

test('signed promotion evidence is bound to the trusted commit being promoted', async () => {
  const wrongHead = await assess(mutate(validEvidence(), value => { value.testedCommitSha = OTHER_COMMIT_SHA; }));
  assert.equal(wrongHead.eligible, false);
  assert.ok(wrongHead.blockers.includes('TESTED_COMMIT_MISMATCH'));

  const malformed = await assess(mutate(validEvidence(), value => { value.testedCommitSha = 'not-a-commit'; }));
  assert.ok(malformed.blockers.includes('INVALID_SCHEMA'));
  assert.ok(malformed.blockers.includes('TESTED_COMMIT_MISMATCH'));
});

test('self-asserted evidence cannot replace independent cryptographic verification', async () => {
  const result = await assess(validEvidence(), UNTRUSTED);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('RELEASE_SIGNATURE_UNVERIFIED'));
  assert.ok(result.blockers.includes('EVIDENCE_SIGNATURE_UNVERIFIED'));

  const throwing: LaMaPromotionTrustPort = {
    verifySignedRelease: async () => { throw new Error('verification backend unavailable'); },
    verifyPromotionEvidence: async () => { throw new Error('verification backend unavailable'); },
  };
  const unavailable = await assess(validEvidence(), throwing);
  assert.ok(unavailable.blockers.includes('RELEASE_SIGNATURE_UNVERIFIED'));
  assert.ok(unavailable.blockers.includes('EVIDENCE_SIGNATURE_UNVERIFIED'));
});

test('current repository is blocked because the signed C8 candidate release has not been activated', async () => {
  const evidence = mutate(validEvidence(), value => {
    value.release.artifactState = manifest.artifactState;
    value.release.verificationKeyId = manifest.verificationKeyId;
    value.release.modelUrl = manifest.artifacts.model.url;
    value.release.modelSignatureUrl = manifest.artifacts.model.signatureUrl;
  });
  const result = await assess(evidence);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('SIGNED_RELEASE_REQUIRED'));
  assert.ok(result.blockers.includes('WRONG_RELEASE_KEY'));
  assert.ok(result.blockers.includes('INVALID_EVIDENCE_URL'));
});

test('wrong exact model bytes or release key fail closed', async () => {
  const wrongSha = await assess(mutate(validEvidence(), value => { value.release.modelSha256 = SHA('e'); }));
  assert.ok(wrongSha.blockers.includes('WRONG_MODEL_IDENTITY'));
  const wrongSize = await assess(mutate(validEvidence(), value => { value.release.modelSize += 1; }));
  assert.ok(wrongSize.blockers.includes('WRONG_MODEL_IDENTITY'));
  const wrongKey = await assess(mutate(validEvidence(), value => { value.release.verificationKeyId = 'other'; }));
  assert.ok(wrongKey.blockers.includes('WRONG_RELEASE_KEY'));
});

test('hosted SwiftShader/software adapter can never satisfy real-device WebGPU promotion', async () => {
  const result = await assess(mutate(validEvidence('webgpu'), value => {
    value.device.evidenceKind = 'HOSTED_SOFTWARE_ADAPTER';
    value.device.adapterKind = 'SOFTWARE';
    value.device.softwareAdapter = true;
  }));
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('REAL_DEVICE_REQUIRED'));
  assert.ok(result.blockers.includes('SOFTWARE_ADAPTER_REJECTED'));
  assert.ok(result.blockers.includes('PHYSICAL_WEBGPU_REQUIRED'));
});

test('benchmark must include warmup, repeated successful samples and sane modulo-8 shapes', async () => {
  const insufficient = await assess(mutate(validEvidence(), value => {
    value.benchmark.warmupCount = 0;
    value.benchmark.sampleCount = LAMA_PROMOTION_MIN_INFERENCE_SAMPLES - 1;
    value.benchmark.successfulSamples = 1;
  }));
  assert.ok(insufficient.blockers.includes('INSUFFICIENT_BENCHMARK_SAMPLES'));

  const invalid = await assess(mutate(validEvidence(), value => {
    value.benchmark.latencyMs = { min: 200, median: 150, p95: 100, max: 50 };
    value.benchmark.testedShapes = [[255, 256]];
  }));
  assert.ok(invalid.blockers.includes('INVALID_BENCHMARK_METRICS'));
});

test('real-image quality requires distinct hash-bound inputs, deterministic invariants and human PASS', async () => {
  const tooFew = await assess(mutate(validEvidence(), value => { value.quality.cases.length = 1; }));
  assert.ok(tooFew.blockers.includes('REAL_IMAGE_REVIEW_REQUIRED'));

  const duplicateInput = await assess(mutate(validEvidence(), value => {
    value.quality.cases[1].sourceImageSha256 = value.quality.cases[0].sourceImageSha256;
    value.quality.cases[1].maskSha256 = value.quality.cases[0].maskSha256;
  }));
  assert.ok(duplicateInput.blockers.includes('INVALID_REAL_IMAGE_BINDING'));
  assert.ok(duplicateInput.blockers.includes('REAL_IMAGE_REVIEW_REQUIRED'));

  const broken = await assess(mutate(validEvidence(), value => {
    value.quality.cases[0].sourceImageSha256 = 'not-a-sha';
    value.quality.cases[0].knownRegionBitExact = false;
    value.quality.cases[0].outputRangeValid = false;
    value.quality.cases[0].humanDecision = 'NOT_REVIEWED';
    value.quality.reviewer.decision = 'NOT_REVIEWED';
  }));
  assert.ok(broken.blockers.includes('INVALID_REAL_IMAGE_BINDING'));
  assert.ok(broken.blockers.includes('KNOWN_REGION_INVARIANT_FAILED'));
  assert.ok(broken.blockers.includes('OUTPUT_CONTRACT_FAILED'));
  assert.ok(broken.blockers.includes('HUMAN_REVIEW_REQUIRED'));
});

test('stale/future evidence and credential-bearing/non-HTTPS evidence URLs are rejected', async () => {
  const stale = await assess(mutate(validEvidence(), value => {
    value.capturedAt = NOW - LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS - 1;
    value.expiresAt = NOW + 1;
  }));
  assert.ok(stale.blockers.includes('STALE_EVIDENCE'));

  const future = await assess(mutate(validEvidence(), value => { value.capturedAt = NOW + 1; }));
  assert.ok(future.blockers.includes('FUTURE_EVIDENCE'));

  const unsafeUrl = await assess(mutate(validEvidence(), value => {
    value.attestation.evidenceUrl = 'https://user:secret@example.com/evidence';
  }));
  assert.ok(unsafeUrl.blockers.includes('INVALID_EVIDENCE_URL'));
  assert.ok(unsafeUrl.blockers.includes('EVIDENCE_SIGNATURE_UNVERIFIED'));
});

test('any cloud/provider/credit use blocks LOCAL promotion', async () => {
  const network = await assess(mutate(validEvidence(), value => { value.localExecution.externalNetworkRequests = 1; }));
  assert.ok(network.blockers.includes('EXTERNAL_NETWORK_USAGE_DETECTED'));
  const provider = await assess(mutate(validEvidence(), value => { value.localExecution.providerApiCalls = 1; }));
  assert.ok(provider.blockers.includes('PROVIDER_API_USAGE_DETECTED'));
  const credits = await assess(mutate(validEvidence(), value => { value.localExecution.aiCreditsConsumed = 1; }));
  assert.ok(credits.blockers.includes('AI_CREDIT_USAGE_DETECTED'));
});

test('C9 adds no production model or executor authority', () => {
  for (const models of Object.values(productionLocalModelsByCapability)) {
    assert.equal(models.some(model => model.modelId === LAMA_MODEL_ID), false);
  }
  for (const executors of Object.values(productionLocalExecutorsByCapability)) {
    assert.equal(executors.some(executor => executor.kind === 'MODEL' && executor.modelId === LAMA_MODEL_ID), false);
  }
});
