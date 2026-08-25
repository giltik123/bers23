import {
  LAMA_MODEL_ID,
  LAMA_ONNX_SHA256,
  LAMA_ONNX_SIZE,
  LAMA_VERSION,
} from '../models/LaMaRelease';
import type { DeviceClass, DeviceTier, ExecutionProvider, Platform } from '../types';

export const LAMA_PROMOTION_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const LAMA_PROMOTION_MIN_INFERENCE_SAMPLES = 5;
export const LAMA_PROMOTION_MIN_REAL_IMAGE_CASES = 5;
export const LAMA_RELEASE_KEY_ID = 'bers-lama-inpainting-release-2026-08' as const;

export type LaMaPromotionBlocker =
  | 'INVALID_SCHEMA'
  | 'WRONG_MODEL_IDENTITY'
  | 'SIGNED_RELEASE_REQUIRED'
  | 'RELEASE_SIGNATURE_UNVERIFIED'
  | 'WRONG_RELEASE_KEY'
  | 'INVALID_EVIDENCE_URL'
  | 'STALE_EVIDENCE'
  | 'FUTURE_EVIDENCE'
  | 'UNSUPPORTED_PROVIDER'
  | 'REAL_DEVICE_REQUIRED'
  | 'SOFTWARE_ADAPTER_REJECTED'
  | 'INCOMPLETE_RUNTIME_IDENTITY'
  | 'INSUFFICIENT_BENCHMARK_SAMPLES'
  | 'INVALID_BENCHMARK_METRICS'
  | 'REAL_IMAGE_REVIEW_REQUIRED'
  | 'INVALID_REAL_IMAGE_BINDING'
  | 'KNOWN_REGION_INVARIANT_FAILED'
  | 'OUTPUT_CONTRACT_FAILED'
  | 'HUMAN_REVIEW_REQUIRED'
  | 'EXTERNAL_NETWORK_USAGE_DETECTED'
  | 'PROVIDER_API_USAGE_DETECTED'
  | 'AI_CREDIT_USAGE_DETECTED';

export type LaMaSignedReleaseEvidence = Readonly<{
  artifactState: 'SIGNED_RELEASE' | 'EXPORT_PINNED_RELEASE_REQUIRED';
  modelId: string;
  version: string;
  modelSize: number;
  modelSha256: string;
  verificationKeyId: string | null;
  modelSignatureVerified: boolean;
  manifestSignatureVerified: boolean;
  releaseEvidenceUrl: string | null;
}>;

export type LaMaRealDeviceEvidence = Readonly<{
  evidenceKind: 'REAL_PHYSICAL_DEVICE' | 'HOSTED_SOFTWARE_ADAPTER' | 'UNKNOWN';
  platform: Platform;
  deviceClass: DeviceClass;
  deviceTier: DeviceTier;
  provider: ExecutionProvider;
  runtimeName: string;
  runtimeVersion: string;
  browserVersion: string | 'NOT_APPLICABLE';
  adapterKind: 'PHYSICAL' | 'SOFTWARE' | 'CPU' | 'NOT_APPLICABLE' | 'UNKNOWN';
  softwareAdapter: boolean;
  coarseDeviceEvidenceKey: string;
}>;

export type LaMaBenchmarkPromotionEvidence = Readonly<{
  warmupCount: number;
  sampleCount: number;
  successfulSamples: number;
  latencyMs: Readonly<{
    min: number;
    median: number;
    p95: number;
    max: number;
  }>;
  peakRamBytes: number | 'UNKNOWN';
  peakVramBytes: number | 'UNKNOWN';
  testedShapes: readonly Readonly<[number, number]>[];
}>;

export type LaMaRealImageReviewCase = Readonly<{
  caseId: string;
  sourceImageSha256: string;
  maskSha256: string;
  rawOutputSha256: string;
  compositeSha256: string;
  width: number;
  height: number;
  knownRegionBitExact: boolean;
  outputGeometryValid: boolean;
  outputRangeValid: boolean;
  humanDecision: 'PASS' | 'FAIL' | 'NOT_REVIEWED';
}>;

export type LaMaQualityPromotionEvidence = Readonly<{
  datasetId: string;
  datasetEvidenceUrl: string;
  cases: readonly LaMaRealImageReviewCase[];
  reviewer: Readonly<{
    reviewerId: string;
    reviewedAt: number;
    decision: 'PASS' | 'FAIL' | 'NOT_REVIEWED';
    reviewEvidenceUrl: string;
  }>;
}>;

export type LaMaLocalExecutionEvidence = Readonly<{
  executionTarget: 'LOCAL';
  externalNetworkRequests: number;
  providerApiCalls: number;
  aiCreditsConsumed: number;
}>;

export type LaMaProductionPromotionEvidence = Readonly<{
  schemaVersion: 1;
  capturedAt: number;
  expiresAt: number;
  evidenceUrl: string;
  release: LaMaSignedReleaseEvidence;
  device: LaMaRealDeviceEvidence;
  benchmark: LaMaBenchmarkPromotionEvidence;
  quality: LaMaQualityPromotionEvidence;
  localExecution: LaMaLocalExecutionEvidence;
}>;

export type LaMaPromotionAssessment = Readonly<{
  eligible: boolean;
  blockers: readonly LaMaPromotionBlocker[];
}>;

/**
 * Pure admission predicate for untrusted promotion evidence.
 * It does not install a model, mutate the LaMa manifest, approve a runtime tier, or grant Core authority.
 */
export function assessLaMaProductionPromotion(
  value: unknown,
  now: number = Date.now(),
): LaMaPromotionAssessment {
  const blockers = new Set<LaMaPromotionBlocker>();
  const evidence = asRecord(value);
  if (!evidence || evidence.schemaVersion !== LAMA_PROMOTION_EVIDENCE_SCHEMA_VERSION) {
    return assessment(['INVALID_SCHEMA']);
  }

  const capturedAt = finiteNonNegative(evidence.capturedAt);
  const expiresAt = finiteNonNegative(evidence.expiresAt);
  if (capturedAt === null || expiresAt === null || expiresAt < capturedAt) blockers.add('INVALID_SCHEMA');
  if (!Number.isFinite(now) || now < 0) blockers.add('INVALID_SCHEMA');
  if (capturedAt !== null && capturedAt > now) blockers.add('FUTURE_EVIDENCE');
  if (capturedAt !== null && now - capturedAt > LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS) blockers.add('STALE_EVIDENCE');
  if (expiresAt !== null && expiresAt < now) blockers.add('STALE_EVIDENCE');
  if (!safeHttpsUrl(evidence.evidenceUrl)) blockers.add('INVALID_EVIDENCE_URL');

  validateRelease(asRecord(evidence.release), blockers);
  validateDevice(asRecord(evidence.device), blockers);
  validateBenchmark(asRecord(evidence.benchmark), blockers);
  validateQuality(asRecord(evidence.quality), blockers);
  validateLocalExecution(asRecord(evidence.localExecution), blockers);

  return assessment([...blockers]);
}

function validateRelease(release: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!release) {
    blockers.add('SIGNED_RELEASE_REQUIRED');
    return;
  }
  if (release.modelId !== LAMA_MODEL_ID
    || release.version !== LAMA_VERSION
    || release.modelSize !== LAMA_ONNX_SIZE
    || release.modelSha256 !== LAMA_ONNX_SHA256) {
    blockers.add('WRONG_MODEL_IDENTITY');
  }
  if (release.artifactState !== 'SIGNED_RELEASE') blockers.add('SIGNED_RELEASE_REQUIRED');
  if (release.verificationKeyId !== LAMA_RELEASE_KEY_ID) blockers.add('WRONG_RELEASE_KEY');
  if (release.modelSignatureVerified !== true || release.manifestSignatureVerified !== true) {
    blockers.add('RELEASE_SIGNATURE_UNVERIFIED');
  }
  if (!safeHttpsUrl(release.releaseEvidenceUrl)) blockers.add('INVALID_EVIDENCE_URL');
}

function validateDevice(device: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!device || device.evidenceKind !== 'REAL_PHYSICAL_DEVICE') blockers.add('REAL_DEVICE_REQUIRED');
  if (!device) return;
  if (device.softwareAdapter !== false || device.adapterKind === 'SOFTWARE') blockers.add('SOFTWARE_ADAPTER_REJECTED');
  if (!['webgpu', 'wasm'].includes(String(device.provider))) blockers.add('UNSUPPORTED_PROVIDER');
  if (device.provider === 'webgpu' && device.adapterKind !== 'PHYSICAL') blockers.add('REAL_DEVICE_REQUIRED');
  if (device.provider === 'wasm' && !['CPU', 'NOT_APPLICABLE'].includes(String(device.adapterKind))) blockers.add('REAL_DEVICE_REQUIRED');
  if (![device.runtimeName, device.runtimeVersion, device.coarseDeviceEvidenceKey]
    .every((item) => typeof item === 'string' && item.trim().length > 0)) blockers.add('INCOMPLETE_RUNTIME_IDENTITY');
  if (device.runtimeVersion !== '1.27.0') blockers.add('INCOMPLETE_RUNTIME_IDENTITY');
  if (device.platform === 'UNKNOWN' || device.deviceClass === 'UNKNOWN' || device.deviceTier === 'UNKNOWN') {
    blockers.add('INCOMPLETE_RUNTIME_IDENTITY');
  }
}

function validateBenchmark(benchmark: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!benchmark) {
    blockers.add('INSUFFICIENT_BENCHMARK_SAMPLES');
    return;
  }
  if (!Number.isInteger(benchmark.warmupCount) || Number(benchmark.warmupCount) < 1
    || !Number.isInteger(benchmark.sampleCount) || Number(benchmark.sampleCount) < LAMA_PROMOTION_MIN_INFERENCE_SAMPLES
    || benchmark.successfulSamples !== benchmark.sampleCount) {
    blockers.add('INSUFFICIENT_BENCHMARK_SAMPLES');
  }
  const latency = asRecord(benchmark.latencyMs);
  const values = latency ? [latency.min, latency.median, latency.p95, latency.max].map(finiteNonNegative) : [];
  if (!latency || values.length !== 4 || values.some((item) => item === null)
    || Number(latency.min) > Number(latency.median)
    || Number(latency.median) > Number(latency.p95)
    || Number(latency.p95) > Number(latency.max)) blockers.add('INVALID_BENCHMARK_METRICS');
  for (const key of ['peakRamBytes', 'peakVramBytes'] as const) {
    const value = benchmark[key];
    if (value !== 'UNKNOWN' && finiteNonNegative(value) === null) blockers.add('INVALID_BENCHMARK_METRICS');
  }
  if (!Array.isArray(benchmark.testedShapes) || benchmark.testedShapes.length === 0
    || benchmark.testedShapes.some((shape) => !Array.isArray(shape) || shape.length !== 2
      || shape.some((dimension) => !Number.isInteger(dimension) || Number(dimension) <= 0 || Number(dimension) % 8 !== 0))) {
    blockers.add('INVALID_BENCHMARK_METRICS');
  }
}

function validateQuality(quality: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!quality) {
    blockers.add('REAL_IMAGE_REVIEW_REQUIRED');
    return;
  }
  if (typeof quality.datasetId !== 'string' || !quality.datasetId.trim() || !safeHttpsUrl(quality.datasetEvidenceUrl)) {
    blockers.add('INVALID_REAL_IMAGE_BINDING');
  }
  const cases = Array.isArray(quality.cases) ? quality.cases : [];
  if (cases.length < LAMA_PROMOTION_MIN_REAL_IMAGE_CASES) blockers.add('REAL_IMAGE_REVIEW_REQUIRED');
  for (const item of cases) {
    const testCase = asRecord(item);
    if (!testCase || typeof testCase.caseId !== 'string' || !testCase.caseId.trim()
      || ![testCase.sourceImageSha256, testCase.maskSha256, testCase.rawOutputSha256, testCase.compositeSha256].every(sha256)
      || !positiveInteger(testCase.width) || !positiveInteger(testCase.height)) blockers.add('INVALID_REAL_IMAGE_BINDING');
    if (testCase?.knownRegionBitExact !== true) blockers.add('KNOWN_REGION_INVARIANT_FAILED');
    if (testCase?.outputGeometryValid !== true || testCase?.outputRangeValid !== true) blockers.add('OUTPUT_CONTRACT_FAILED');
    if (testCase?.humanDecision !== 'PASS') blockers.add('HUMAN_REVIEW_REQUIRED');
  }
  const reviewer = asRecord(quality.reviewer);
  if (!reviewer || reviewer.decision !== 'PASS'
    || typeof reviewer.reviewerId !== 'string' || !reviewer.reviewerId.trim()
    || finiteNonNegative(reviewer.reviewedAt) === null
    || !safeHttpsUrl(reviewer.reviewEvidenceUrl)) blockers.add('HUMAN_REVIEW_REQUIRED');
}

function validateLocalExecution(local: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!local || local.executionTarget !== 'LOCAL') {
    blockers.add('EXTERNAL_NETWORK_USAGE_DETECTED');
    return;
  }
  if (local.externalNetworkRequests !== 0) blockers.add('EXTERNAL_NETWORK_USAGE_DETECTED');
  if (local.providerApiCalls !== 0) blockers.add('PROVIDER_API_USAGE_DETECTED');
  if (local.aiCreditsConsumed !== 0) blockers.add('AI_CREDIT_USAGE_DETECTED');
}

function assessment(blockers: readonly LaMaPromotionBlocker[]): LaMaPromotionAssessment {
  return Object.freeze({ eligible: blockers.length === 0, blockers: Object.freeze([...new Set(blockers)].sort()) });
}
function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : null;
}
function safeHttpsUrl(value: unknown): boolean {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && Boolean(url.hostname);
  } catch {
    return false;
  }
}
function sha256(value: unknown): boolean {
  return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
}
function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function positiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}
