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
const SHA = (character: string) => character.repeat(64);

function validEvidence(provider: 'webgpu' | 'wasm' = 'wasm'): LaMaProductionPromotionEvidence {
  const cases = Array.from({ length: LAMA_PROMOTION_MIN_REAL_IMAGE_CASES }, (_, index) => ({
    caseId: `real-image-${index + 1}`,
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
  }));
  return {
    schemaVersion: 1,
    capturedAt: NOW - 60_000,
    expiresAt: NOW + 60_000,
    evidenceUrl: 'https://evidence.example/lama/device-run.json',
    release: {
      artifactState: 'SIGNED_RELEASE',
      modelId: LAMA_MODEL_ID,
      version: LAMA_VERSION,
      modelSize: LAMA_ONNX_SIZE,
      modelSha256: LAMA_ONNX_SHA256,
      verificationKeyId: LAMA_RELEASE_KEY_ID,
      modelSignatureVerified: true,
      manifestSignatureVerified: true,
      releaseEvidenceUrl: 'https://github.com/giltik123/bers23/releases/tag/lama-big-places-inpainting-v1.0.0-candidate.1',
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
        reviewedAt: NOW - 30_000,
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

test('complete evidence envelope is structurally eligible but grants no authority by itself', () => {
  const assessment = assessLaMaProductionPromotion(validEvidence(), NOW);
  assert.equal(assessment.eligible, true);
  assert.deepEqual(assessment.blockers, []);
  assert.equal(manifest.status, 'CANDIDATE');
  assert.equal(manifest.productionApprovalEvidence, null);
});

test('current repository is blocked because the signed C8 candidate release has not been activated', () => {
  const current = validEvidence();
  const evidence = mutate(current, value => {
    value.release.artifactState = manifest.artifactState;
    value.release.verificationKeyId = manifest.verificationKeyId;
    value.release.modelSignatureVerified = false;
    value.release.manifestSignatureVerified = false;
    value.release.releaseEvidenceUrl = null;
  });
  const result = assessLaMaProductionPromotion(evidence, NOW);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('SIGNED_RELEASE_REQUIRED'));
  assert.ok(result.blockers.includes('RELEASE_SIGNATURE_UNVERIFIED'));
});

test('wrong exact model bytes or release key fail closed', () => {
  const wrongSha = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.release.modelSha256 = SHA('e'); }), NOW);
  assert.ok(wrongSha.blockers.includes('WRONG_MODEL_IDENTITY'));
  const wrongSize = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.release.modelSize += 1; }), NOW);
  assert.ok(wrongSize.blockers.includes('WRONG_MODEL_IDENTITY'));
  const wrongKey = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.release.verificationKeyId = 'other'; }), NOW);
  assert.ok(wrongKey.blockers.includes('WRONG_RELEASE_KEY'));
});

test('hosted SwiftShader/software adapter can never satisfy real-device WebGPU promotion', () => {
  const result = assessLaMaProductionPromotion(mutate(validEvidence('webgpu'), value => {
    value.device.evidenceKind = 'HOSTED_SOFTWARE_ADAPTER';
    value.device.adapterKind = 'SOFTWARE';
    value.device.softwareAdapter = true;
  }), NOW);
  assert.equal(result.eligible, false);
  assert.ok(result.blockers.includes('REAL_DEVICE_REQUIRED'));
  assert.ok(result.blockers.includes('SOFTWARE_ADAPTER_REJECTED'));
});

test('benchmark must include warmup, repeated successful samples and sane modulo-8 shapes', () => {
  const insufficient = assessLaMaProductionPromotion(mutate(validEvidence(), value => {
    value.benchmark.warmupCount = 0;
    value.benchmark.sampleCount = LAMA_PROMOTION_MIN_INFERENCE_SAMPLES - 1;
    value.benchmark.successfulSamples = 1;
  }), NOW);
  assert.ok(insufficient.blockers.includes('INSUFFICIENT_BENCHMARK_SAMPLES'));

  const invalid = assessLaMaProductionPromotion(mutate(validEvidence(), value => {
    value.benchmark.latencyMs = { min: 200, median: 150, p95: 100, max: 50 };
    value.benchmark.testedShapes = [[255, 256]];
  }), NOW);
  assert.ok(invalid.blockers.includes('INVALID_BENCHMARK_METRICS'));
});

test('real-image quality requires enough hash-bound cases, deterministic invariants and human PASS', () => {
  const tooFew = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.quality.cases.length = 1; }), NOW);
  assert.ok(tooFew.blockers.includes('REAL_IMAGE_REVIEW_REQUIRED'));

  const broken = assessLaMaProductionPromotion(mutate(validEvidence(), value => {
    value.quality.cases[0].sourceImageSha256 = 'not-a-sha';
    value.quality.cases[0].knownRegionBitExact = false;
    value.quality.cases[0].outputRangeValid = false;
    value.quality.cases[0].humanDecision = 'NOT_REVIEWED';
    value.quality.reviewer.decision = 'NOT_REVIEWED';
  }), NOW);
  assert.ok(broken.blockers.includes('INVALID_REAL_IMAGE_BINDING'));
  assert.ok(broken.blockers.includes('KNOWN_REGION_INVARIANT_FAILED'));
  assert.ok(broken.blockers.includes('OUTPUT_CONTRACT_FAILED'));
  assert.ok(broken.blockers.includes('HUMAN_REVIEW_REQUIRED'));
});

test('stale/future evidence and credential-bearing/non-HTTPS evidence URLs are rejected', () => {
  const stale = assessLaMaProductionPromotion(mutate(validEvidence(), value => {
    value.capturedAt = NOW - LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS - 1;
    value.expiresAt = NOW + 1;
  }), NOW);
  assert.ok(stale.blockers.includes('STALE_EVIDENCE'));

  const future = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.capturedAt = NOW + 1; }), NOW);
  assert.ok(future.blockers.includes('FUTURE_EVIDENCE'));

  const unsafeUrl = assessLaMaProductionPromotion(mutate(validEvidence(), value => {
    value.evidenceUrl = 'https://user:secret@example.com/evidence';
  }), NOW);
  assert.ok(unsafeUrl.blockers.includes('INVALID_EVIDENCE_URL'));
});

test('any cloud/provider/credit use blocks LOCAL promotion', () => {
  const network = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.localExecution.externalNetworkRequests = 1; }), NOW);
  assert.ok(network.blockers.includes('EXTERNAL_NETWORK_USAGE_DETECTED'));
  const provider = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.localExecution.providerApiCalls = 1; }), NOW);
  assert.ok(provider.blockers.includes('PROVIDER_API_USAGE_DETECTED'));
  const credits = assessLaMaProductionPromotion(mutate(validEvidence(), value => { value.localExecution.aiCreditsConsumed = 1; }), NOW);
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
