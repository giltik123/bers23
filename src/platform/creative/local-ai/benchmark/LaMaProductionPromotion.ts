import {
  LAMA_MODEL_ID,
  LAMA_ONNX_SHA256,
  LAMA_ONNX_SIZE,
  LAMA_VERSION,
} from '../models/LaMaRelease';
import type { DeviceClass, DeviceTier, ExecutionProvider, Platform } from '../types';

export const LAMA_PROMOTION_EVIDENCE_SCHEMA_VERSION = 2 as const;
export const LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
export const LAMA_PROMOTION_MIN_INFERENCE_SAMPLES = 5;
export const LAMA_PROMOTION_MIN_REAL_IMAGE_CASES = 5;
export const LAMA_RELEASE_KEY_ID = 'bers-lama-inpainting-release-2026-08' as const;
export const LAMA_RELEASE_TAG = 'lama-big-places-inpainting-v1.0.0-candidate.1' as const;

const LAMA_RELEASE_BASE = `https://github.com/giltik123/bers23/releases/download/${LAMA_RELEASE_TAG}`;
const REAL_PLATFORMS = ['ANDROID', 'IOS', 'WINDOWS', 'MACOS', 'LINUX'] as const;
const REAL_DEVICE_CLASSES = ['MOBILE', 'DESKTOP'] as const;
const REAL_DEVICE_TIERS = ['LOW', 'MEDIUM', 'HIGH', 'EXTREME'] as const;
const ACCEPTED_PROVIDERS = ['webgpu', 'wasm'] as const;
const COMMIT_SHA = /^[a-f0-9]{40}$/;

export type LaMaPromotionBlocker =
  | 'INVALID_SCHEMA'
  | 'TESTED_COMMIT_MISMATCH'
  | 'WRONG_MODEL_IDENTITY'
  | 'SIGNED_RELEASE_REQUIRED'
  | 'RELEASE_SIGNATURE_UNVERIFIED'
  | 'EVIDENCE_SIGNATURE_UNVERIFIED'
  | 'WRONG_RELEASE_KEY'
  | 'INVALID_EVIDENCE_URL'
  | 'STALE_EVIDENCE'
  | 'FUTURE_EVIDENCE'
  | 'UNSUPPORTED_PROVIDER'
  | 'PHYSICAL_WEBGPU_REQUIRED'
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
  modelUrl: string | null;
  modelSignatureUrl: string | null;
  manifestUrl: string | null;
  manifestSignatureUrl: string | null;
}>;

export type LaMaPromotionAttestation = Readonly<{
  evidenceUrl: string;
  signatureUrl: string;
}>;

/**
 * Cryptographic verification is outside the untrusted evidence document. Promotion signatures are
 * defined over the exact canonical JSON payload supplied to verifyPromotionEvidence, not merely over
 * the attestation URLs. Production implementations must compare/verify that payload at the trust boundary.
 */
export interface LaMaPromotionTrustPort {
  verifySignedRelease(release: LaMaSignedReleaseEvidence): Promise<boolean>;
  verifyPromotionEvidence(attestation: LaMaPromotionAttestation, canonicalPayload: string): Promise<boolean>;
}

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
  latencyMs: Readonly<{ min: number; median: number; p95: number; max: number }>;
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

export type LaMaProductionPromotionSignedPayload = Readonly<{
  schemaVersion: 2;
  testedCommitSha: string;
  capturedAt: number;
  expiresAt: number;
  release: LaMaSignedReleaseEvidence;
  device: LaMaRealDeviceEvidence;
  benchmark: LaMaBenchmarkPromotionEvidence;
  quality: LaMaQualityPromotionEvidence;
  localExecution: LaMaLocalExecutionEvidence;
}>;

export type LaMaProductionPromotionEvidence = Readonly<LaMaProductionPromotionSignedPayload & {
  attestation: LaMaPromotionAttestation;
}>;

export type LaMaPromotionAssessment = Readonly<{
  eligible: boolean;
  blockers: readonly LaMaPromotionBlocker[];
}>;

/**
 * Admission-only global production gate. The caller supplies the trusted commit SHA being promoted.
 * The untrusted input is first snapshotted through canonical JSON, then validated, and the exact signed
 * payload snapshot is passed to the trust port. This function never mutates model, runtime, or Core state.
 */
export async function assessLaMaProductionPromotion(
  value: unknown,
  trust: LaMaPromotionTrustPort,
  expectedCommitSha: string,
  now: number = Date.now(),
): Promise<LaMaPromotionAssessment> {
  const blockers = new Set<LaMaPromotionBlocker>();
  const evidence = snapshotJsonRecord(value);
  if (!evidence || evidence.schemaVersion !== LAMA_PROMOTION_EVIDENCE_SCHEMA_VERSION) {
    return assessment(['INVALID_SCHEMA']);
  }

  if (!commitSha(evidence.testedCommitSha)) blockers.add('INVALID_SCHEMA');
  if (!commitSha(expectedCommitSha) || evidence.testedCommitSha !== expectedCommitSha) blockers.add('TESTED_COMMIT_MISMATCH');

  const capturedAt = finiteNonNegative(evidence.capturedAt);
  const expiresAt = finiteNonNegative(evidence.expiresAt);
  if (capturedAt === null || expiresAt === null || expiresAt < capturedAt) blockers.add('INVALID_SCHEMA');
  if (capturedAt !== null && expiresAt !== null && expiresAt - capturedAt > LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS) blockers.add('INVALID_SCHEMA');
  if (!Number.isFinite(now) || now < 0) blockers.add('INVALID_SCHEMA');
  if (capturedAt !== null && capturedAt > now) blockers.add('FUTURE_EVIDENCE');
  if (capturedAt !== null && now - capturedAt > LAMA_PROMOTION_EVIDENCE_MAX_AGE_MS) blockers.add('STALE_EVIDENCE');
  if (expiresAt !== null && expiresAt < now) blockers.add('STALE_EVIDENCE');

  const release = parseRelease(asRecord(evidence.release), blockers);
  const attestation = parseAttestation(asRecord(evidence.attestation), blockers);
  validateDevice(asRecord(evidence.device), blockers);
  validateBenchmark(asRecord(evidence.benchmark), blockers);
  validateQuality(asRecord(evidence.quality), blockers, capturedAt);
  validateLocalExecution(asRecord(evidence.localExecution), blockers);
  const canonicalPayload = canonicalPromotionPayload(evidence);
  if (canonicalPayload === null) blockers.add('INVALID_SCHEMA');

  if (release) {
    let verified = false;
    try {
      verified = await trust.verifySignedRelease(release);
    } catch {
      verified = false;
    }
    if (!verified) blockers.add('RELEASE_SIGNATURE_UNVERIFIED');
  } else {
    blockers.add('RELEASE_SIGNATURE_UNVERIFIED');
  }

  if (attestation && canonicalPayload !== null) {
    let verified = false;
    try {
      verified = await trust.verifyPromotionEvidence(attestation, canonicalPayload);
    } catch {
      verified = false;
    }
    if (!verified) blockers.add('EVIDENCE_SIGNATURE_UNVERIFIED');
  } else {
    blockers.add('EVIDENCE_SIGNATURE_UNVERIFIED');
  }

  return assessment([...blockers]);
}

function parseRelease(
  release: Readonly<Record<string, unknown>> | null,
  blockers: Set<LaMaPromotionBlocker>,
): LaMaSignedReleaseEvidence | null {
  if (!release) {
    blockers.add('SIGNED_RELEASE_REQUIRED');
    return null;
  }
  if (release.modelId !== LAMA_MODEL_ID
    || release.version !== LAMA_VERSION
    || release.modelSize !== LAMA_ONNX_SIZE
    || release.modelSha256 !== LAMA_ONNX_SHA256) blockers.add('WRONG_MODEL_IDENTITY');
  if (release.artifactState !== 'SIGNED_RELEASE') blockers.add('SIGNED_RELEASE_REQUIRED');
  if (release.verificationKeyId !== LAMA_RELEASE_KEY_ID) blockers.add('WRONG_RELEASE_KEY');

  const expectedModelUrl = `${LAMA_RELEASE_BASE}/lama-big-places-inpainting.onnx`;
  const expectedSignatureUrl = `${LAMA_RELEASE_BASE}/lama-big-places-inpainting.onnx.sig`;
  if (release.modelUrl !== expectedModelUrl || release.modelSignatureUrl !== expectedSignatureUrl) blockers.add('INVALID_EVIDENCE_URL');
  if (!safeHttpsUrl(release.manifestUrl) || !safeHttpsUrl(release.manifestSignatureUrl)) blockers.add('INVALID_EVIDENCE_URL');

  if (release.artifactState !== 'SIGNED_RELEASE'
    || typeof release.modelId !== 'string'
    || typeof release.version !== 'string'
    || typeof release.modelSize !== 'number'
    || typeof release.modelSha256 !== 'string'
    || typeof release.verificationKeyId !== 'string'
    || release.modelUrl !== expectedModelUrl
    || release.modelSignatureUrl !== expectedSignatureUrl
    || !safeHttpsUrl(release.manifestUrl)
    || !safeHttpsUrl(release.manifestSignatureUrl)) return null;
  return release as unknown as LaMaSignedReleaseEvidence;
}

function parseAttestation(
  attestation: Readonly<Record<string, unknown>> | null,
  blockers: Set<LaMaPromotionBlocker>,
): LaMaPromotionAttestation | null {
  if (!attestation || !safeHttpsUrl(attestation.evidenceUrl) || !safeHttpsUrl(attestation.signatureUrl)) {
    blockers.add('INVALID_EVIDENCE_URL');
    return null;
  }
  return attestation as unknown as LaMaPromotionAttestation;
}

function validateDevice(device: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!device || device.evidenceKind !== 'REAL_PHYSICAL_DEVICE') blockers.add('REAL_DEVICE_REQUIRED');
  if (!device) {
    blockers.add('PHYSICAL_WEBGPU_REQUIRED');
    return;
  }
  if (!REAL_PLATFORMS.includes(String(device.platform) as (typeof REAL_PLATFORMS)[number])
    || !REAL_DEVICE_CLASSES.includes(String(device.deviceClass) as (typeof REAL_DEVICE_CLASSES)[number])
    || !REAL_DEVICE_TIERS.includes(String(device.deviceTier) as (typeof REAL_DEVICE_TIERS)[number])) blockers.add('INCOMPLETE_RUNTIME_IDENTITY');
  if (device.softwareAdapter !== false || device.adapterKind === 'SOFTWARE') blockers.add('SOFTWARE_ADAPTER_REJECTED');
  if (!ACCEPTED_PROVIDERS.includes(String(device.provider) as (typeof ACCEPTED_PROVIDERS)[number])) blockers.add('UNSUPPORTED_PROVIDER');

  const expectedRuntime = device.provider === 'webgpu'
    ? 'onnxruntime-web/webgpu'
    : device.provider === 'wasm'
      ? 'onnxruntime-web/wasm'
      : null;
  if (expectedRuntime === null || device.runtimeName !== expectedRuntime || device.runtimeVersion !== '1.27.0') blockers.add('INCOMPLETE_RUNTIME_IDENTITY');
  if (typeof device.browserVersion !== 'string' || !device.browserVersion.trim() || device.browserVersion === 'NOT_APPLICABLE') blockers.add('INCOMPLETE_RUNTIME_IDENTITY');
  if (typeof device.coarseDeviceEvidenceKey !== 'string' || !device.coarseDeviceEvidenceKey.trim()) blockers.add('INCOMPLETE_RUNTIME_IDENTITY');

  if (device.provider !== 'webgpu' || device.adapterKind !== 'PHYSICAL') blockers.add('PHYSICAL_WEBGPU_REQUIRED');
  if (device.provider === 'webgpu' && device.adapterKind !== 'PHYSICAL') blockers.add('REAL_DEVICE_REQUIRED');
  if (device.provider === 'wasm' && device.adapterKind !== 'CPU') blockers.add('REAL_DEVICE_REQUIRED');
}

function validateBenchmark(benchmark: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!benchmark) {
    blockers.add('INSUFFICIENT_BENCHMARK_SAMPLES');
    return;
  }
  if (!Number.isInteger(benchmark.warmupCount) || Number(benchmark.warmupCount) < 1
    || !Number.isInteger(benchmark.sampleCount) || Number(benchmark.sampleCount) < LAMA_PROMOTION_MIN_INFERENCE_SAMPLES
    || !Number.isInteger(benchmark.successfulSamples)
    || benchmark.successfulSamples !== benchmark.sampleCount) blockers.add('INSUFFICIENT_BENCHMARK_SAMPLES');
  const latency = asRecord(benchmark.latencyMs);
  const values = latency ? [latency.min, latency.median, latency.p95, latency.max].map(finiteNonNegative) : [];
  if (!latency || values.length !== 4 || values.some((item) => item === null)
    || Number(latency.min) > Number(latency.median)
    || Number(latency.median) > Number(latency.p95)
    || Number(latency.p95) > Number(latency.max)) blockers.add('INVALID_BENCHMARK_METRICS');
  for (const key of ['peakRamBytes', 'peakVramBytes'] as const) {
    const metric = benchmark[key];
    if (metric !== 'UNKNOWN' && finiteNonNegative(metric) === null) blockers.add('INVALID_BENCHMARK_METRICS');
  }
  if (!Array.isArray(benchmark.testedShapes) || benchmark.testedShapes.length === 0
    || benchmark.testedShapes.some((shape) => !Array.isArray(shape) || shape.length !== 2
      || shape.some((dimension) => !Number.isInteger(dimension) || Number(dimension) <= 0 || Number(dimension) % 8 !== 0))) {
    blockers.add('INVALID_BENCHMARK_METRICS');
  }
}

function validateQuality(
  quality: Readonly<Record<string, unknown>> | null,
  blockers: Set<LaMaPromotionBlocker>,
  capturedAt: number | null,
): void {
  if (!quality) {
    blockers.add('REAL_IMAGE_REVIEW_REQUIRED');
    return;
  }
  if (typeof quality.datasetId !== 'string' || !quality.datasetId.trim() || !safeHttpsUrl(quality.datasetEvidenceUrl)) blockers.add('INVALID_REAL_IMAGE_BINDING');
  const cases = Array.isArray(quality.cases) ? quality.cases : [];
  if (cases.length < LAMA_PROMOTION_MIN_REAL_IMAGE_CASES) blockers.add('REAL_IMAGE_REVIEW_REQUIRED');
  const caseIds = new Set<string>();
  const sourceMaskBindings = new Set<string>();
  for (const item of cases) {
    const testCase = asRecord(item);
    const validSourceMask = Boolean(testCase && sha256(testCase.sourceImageSha256) && sha256(testCase.maskSha256));
    if (!testCase || typeof testCase.caseId !== 'string' || !testCase.caseId.trim()
      || ![testCase.sourceImageSha256, testCase.maskSha256, testCase.rawOutputSha256, testCase.compositeSha256].every(sha256)
      || !positiveInteger(testCase.width) || !positiveInteger(testCase.height)) blockers.add('INVALID_REAL_IMAGE_BINDING');
    if (testCase && typeof testCase.caseId === 'string') {
      if (caseIds.has(testCase.caseId)) blockers.add('INVALID_REAL_IMAGE_BINDING');
      caseIds.add(testCase.caseId);
    }
    if (testCase && validSourceMask) {
      const binding = `${String(testCase.sourceImageSha256)}:${String(testCase.maskSha256)}`;
      if (sourceMaskBindings.has(binding)) blockers.add('INVALID_REAL_IMAGE_BINDING');
      sourceMaskBindings.add(binding);
    }
    if (testCase?.knownRegionBitExact !== true) blockers.add('KNOWN_REGION_INVARIANT_FAILED');
    if (testCase?.outputGeometryValid !== true || testCase?.outputRangeValid !== true) blockers.add('OUTPUT_CONTRACT_FAILED');
    if (testCase?.humanDecision !== 'PASS') blockers.add('HUMAN_REVIEW_REQUIRED');
  }
  if (sourceMaskBindings.size < LAMA_PROMOTION_MIN_REAL_IMAGE_CASES) blockers.add('REAL_IMAGE_REVIEW_REQUIRED');
  const reviewer = asRecord(quality.reviewer);
  const reviewedAt = reviewer ? finiteNonNegative(reviewer.reviewedAt) : null;
  if (!reviewer || reviewer.decision !== 'PASS'
    || typeof reviewer.reviewerId !== 'string' || !reviewer.reviewerId.trim()
    || reviewedAt === null
    || (capturedAt !== null && reviewedAt > capturedAt)
    || !safeHttpsUrl(reviewer.reviewEvidenceUrl)) blockers.add('HUMAN_REVIEW_REQUIRED');
}

function validateLocalExecution(local: Readonly<Record<string, unknown>> | null, blockers: Set<LaMaPromotionBlocker>): void {
  if (!local || local.executionTarget !== 'LOCAL') {
    blockers.add('EXTERNAL_NETWORK_USAGE_DETECTED');
    blockers.add('PROVIDER_API_USAGE_DETECTED');
    blockers.add('AI_CREDIT_USAGE_DETECTED');
    return;
  }
  if (local.externalNetworkRequests !== 0) blockers.add('EXTERNAL_NETWORK_USAGE_DETECTED');
  if (local.providerApiCalls !== 0) blockers.add('PROVIDER_API_USAGE_DETECTED');
  if (local.aiCreditsConsumed !== 0) blockers.add('AI_CREDIT_USAGE_DETECTED');
}

function canonicalPromotionPayload(evidence: Readonly<Record<string, unknown>>): string | null {
  return canonicalJson({
    schemaVersion: evidence.schemaVersion,
    testedCommitSha: evidence.testedCommitSha,
    capturedAt: evidence.capturedAt,
    expiresAt: evidence.expiresAt,
    release: evidence.release,
    device: evidence.device,
    benchmark: evidence.benchmark,
    quality: evidence.quality,
    localExecution: evidence.localExecution,
  });
}

function snapshotJsonRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  const serialized = canonicalJson(value);
  if (serialized === null) return null;
  try {
    return asRecord(JSON.parse(serialized));
  } catch {
    return null;
  }
}

function canonicalJson(value: unknown): string | null {
  try {
    return canonicalJsonValue(value, new Set<object>());
  } catch {
    return null;
  }
}

function canonicalJsonValue(value: unknown, seen: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value)!;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('canonical payload contains a non-finite number');
    return JSON.stringify(value)!;
  }
  if (typeof value !== 'object') throw new Error('canonical payload contains a non-JSON value');
  if (seen.has(value)) throw new Error('canonical payload contains a cycle');
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalJsonValue(item, seen)).join(',')}]`;
    }
    const record = value as Readonly<Record<string, unknown>>;
    const keys = Object.keys(record).sort();
    return `{${keys.map((key) => `${canonicalJsonValue(key, seen)}:${canonicalJsonValue(record[key], seen)}`).join(',')}}`;
  } finally {
    seen.delete(value);
  }
}

function assessment(blockers: readonly LaMaPromotionBlocker[]): LaMaPromotionAssessment {
  return Object.freeze({ eligible: blockers.length === 0, blockers: Object.freeze([...new Set(blockers)].sort()) });
}
function asRecord(value: unknown): Readonly<Record<string, unknown>> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Readonly<Record<string, unknown>> : null;
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
function commitSha(value: unknown): value is string {
  return typeof value === 'string' && COMMIT_SHA.test(value);
}
function finiteNonNegative(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function positiveInteger(value: unknown): boolean {
  return Number.isInteger(value) && Number(value) > 0;
}
