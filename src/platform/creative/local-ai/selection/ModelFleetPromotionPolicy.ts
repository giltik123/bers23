import { immutableClone } from '../immutable';
import type { BenchmarkEvidence } from '../benchmark/BenchmarkEvidence';
import type {
  DeviceCapabilitySnapshot,
  DeviceTier,
  ExecutionProvider,
  ModelManifest,
  RuntimeKind,
} from '../types';

const MIB = 1024 * 1024;
const SAFE_MODEL_STATUSES = new Set(['AVAILABLE', 'INSTALLED', 'READY']);

export type ModelPromotionStatus = 'PROMOTED' | 'BENCHMARK_REQUIRED' | 'STALE' | 'REJECTED';
export type ModelPromotionReason =
  | 'UNKNOWN_DEVICE_EVIDENCE'
  | 'UNSAFE_MODEL_STATUS'
  | 'NO_PROMOTION_CRITERIA'
  | 'BENCHMARK_MISSING'
  | 'BINDING_MISMATCH'
  | 'BENCHMARK_STALE'
  | 'BENCHMARK_FROM_FUTURE'
  | 'INSUFFICIENT_SAMPLES'
  | 'SUCCESS_RATE_BELOW_CRITERIA'
  | 'LATENCY_ABOVE_CRITERIA'
  | 'COLD_START_ABOVE_CRITERIA'
  | 'RAM_ABOVE_CRITERIA'
  | 'VRAM_ABOVE_CRITERIA'
  | 'ENERGY_ABOVE_CRITERIA'
  | 'RAM_EXCEEDS_DEVICE'
  | 'VRAM_EXCEEDS_DEVICE'
  | 'UNKNOWN_RAM_EVIDENCE'
  | 'UNKNOWN_VRAM_EVIDENCE'
  | 'QUALITY_BELOW_CRITERIA'
  | 'STABILITY_BELOW_CRITERIA';

export type ModelPromotionCriteria = Readonly<{
  tier: Exclude<DeviceTier, 'UNKNOWN'>;
  runtime: RuntimeKind;
  provider: ExecutionProvider;
  maxAgeMs: number;
  minSamples: number;
  minSuccessRate: number;
  maxLatencyMs: number;
  maxColdStartMs?: number;
  maxRamBytes?: number;
  maxVramBytes?: number;
  maxEnergyEstimate?: number;
  minQualityScore: number;
  minStabilityScore: number;
}>;

export type ModelPromotionDecision = Readonly<{
  modelKey: string;
  status: ModelPromotionStatus;
  reasons: readonly ModelPromotionReason[];
  evidenceKey?: string;
  provider?: ExecutionProvider;
}>;

export class ModelFleetPromotionPolicy {
  evaluate(input: Readonly<{
    snapshot: DeviceCapabilitySnapshot;
    deviceCapabilityKey: string;
    manifest: ModelManifest;
    evidence: readonly BenchmarkEvidence[];
    criteria: readonly ModelPromotionCriteria[];
    now: number;
  }>): ModelPromotionDecision {
    const { snapshot, manifest } = input;
    if (!Number.isFinite(input.now) || input.now < 0) throw new Error('Promotion evaluation time must be finite and non-negative');
    const modelKey = `${manifest.modelId}@${manifest.version}`;

    if (snapshot.profile.platform === 'UNKNOWN' || snapshot.profile.deviceClass === 'UNKNOWN' || snapshot.profile.tier === 'UNKNOWN') {
      return decision(modelKey, 'REJECTED', ['UNKNOWN_DEVICE_EVIDENCE']);
    }
    if (!SAFE_MODEL_STATUSES.has(manifest.status)) return decision(modelKey, 'REJECTED', ['UNSAFE_MODEL_STATUS']);

    const matchingCriteria = input.criteria
      .filter((item) => item.tier === snapshot.profile.tier && item.runtime === manifest.runtime)
      .sort((a, b) => a.provider.localeCompare(b.provider));
    for (const item of matchingCriteria) validateCriteria(item);
    if (!matchingCriteria.length) return decision(modelKey, 'BENCHMARK_REQUIRED', ['NO_PROMOTION_CRITERIA']);

    const modelEvidence = input.evidence.filter((item) => item.modelId === manifest.modelId);
    const exact = modelEvidence
      .filter((item) => exactEvidenceBinding(item, input.deviceCapabilityKey, manifest))
      .filter((item) => matchingCriteria.some((criteria) => criteria.provider === item.provider))
      .sort((a, b) => b.capturedAt - a.capturedAt || a.provider.localeCompare(b.provider));

    if (!exact.length) {
      return decision(modelKey, 'BENCHMARK_REQUIRED', [modelEvidence.length ? 'BINDING_MISMATCH' : 'BENCHMARK_MISSING']);
    }

    const staleReasons = new Set<ModelPromotionReason>();
    const rejectionReasons = new Set<ModelPromotionReason>();
    for (const evidence of exact) {
      const criteria = matchingCriteria.find((item) => item.provider === evidence.provider)!;
      if (evidence.capturedAt > input.now) {
        staleReasons.add('BENCHMARK_FROM_FUTURE');
        continue;
      }
      const criteriaExpiry = evidence.capturedAt + criteria.maxAgeMs;
      if (evidence.expiresAt < input.now || criteriaExpiry < input.now) {
        staleReasons.add('BENCHMARK_STALE');
        continue;
      }
      const reasons = thresholdReasons(snapshot, manifest, evidence, criteria);
      if (!reasons.length) {
        return decision(modelKey, 'PROMOTED', [], evidence.evidenceKey, evidence.provider);
      }
      reasons.forEach((reason) => rejectionReasons.add(reason));
    }

    if (rejectionReasons.size) return decision(modelKey, 'REJECTED', [...rejectionReasons].sort());
    return decision(modelKey, 'STALE', [...staleReasons].sort());
  }
}

function thresholdReasons(
  snapshot: DeviceCapabilitySnapshot,
  manifest: ModelManifest,
  evidence: BenchmarkEvidence,
  criteria: ModelPromotionCriteria,
): ModelPromotionReason[] {
  const reasons: ModelPromotionReason[] = [];
  if (evidence.sampleCount < criteria.minSamples) reasons.push('INSUFFICIENT_SAMPLES');
  if (evidence.successRate < criteria.minSuccessRate) reasons.push('SUCCESS_RATE_BELOW_CRITERIA');
  if (evidence.latencyMs > criteria.maxLatencyMs) reasons.push('LATENCY_ABOVE_CRITERIA');
  if (criteria.maxColdStartMs !== undefined && evidence.coldStartMs > criteria.maxColdStartMs) reasons.push('COLD_START_ABOVE_CRITERIA');
  if (criteria.maxRamBytes !== undefined && evidence.ramBytes > criteria.maxRamBytes) reasons.push('RAM_ABOVE_CRITERIA');
  if (criteria.maxVramBytes !== undefined && evidence.vramBytes > criteria.maxVramBytes) reasons.push('VRAM_ABOVE_CRITERIA');
  if (criteria.maxEnergyEstimate !== undefined && evidence.energyEstimate > criteria.maxEnergyEstimate) reasons.push('ENERGY_ABOVE_CRITERIA');
  if (manifest.qualityScore < criteria.minQualityScore) reasons.push('QUALITY_BELOW_CRITERIA');
  if (manifest.stabilityScore < criteria.minStabilityScore) reasons.push('STABILITY_BELOW_CRITERIA');

  const ramMb = snapshot.profile.ramMb;
  if (evidence.ramBytes > 0 && typeof ramMb !== 'number') reasons.push('UNKNOWN_RAM_EVIDENCE');
  else if (typeof ramMb === 'number' && evidence.ramBytes > ramMb * MIB) reasons.push('RAM_EXCEEDS_DEVICE');

  const vramMb = snapshot.profile.vramMb;
  if (evidence.vramBytes > 0 && typeof vramMb !== 'number') reasons.push('UNKNOWN_VRAM_EVIDENCE');
  else if (typeof vramMb === 'number' && evidence.vramBytes > vramMb * MIB) reasons.push('VRAM_EXCEEDS_DEVICE');
  return [...new Set(reasons)].sort();
}

function exactEvidenceBinding(evidence: BenchmarkEvidence, deviceCapabilityKey: string, manifest: ModelManifest): boolean {
  return evidence.schemaVersion === 1
    && evidence.deviceCapabilityKey === deviceCapabilityKey
    && evidence.modelId === manifest.modelId
    && evidence.modelVersion === manifest.version
    && evidence.manifestSha256 === manifest.sha256
    && evidence.runtime === manifest.runtime;
}

function validateCriteria(criteria: ModelPromotionCriteria): void {
  const nonNegative = [
    criteria.maxAgeMs,
    criteria.minSamples,
    criteria.minSuccessRate,
    criteria.maxLatencyMs,
    criteria.maxColdStartMs,
    criteria.maxRamBytes,
    criteria.maxVramBytes,
    criteria.maxEnergyEstimate,
    criteria.minQualityScore,
    criteria.minStabilityScore,
  ].filter((value): value is number => value !== undefined);
  if (nonNegative.some((value) => !Number.isFinite(value) || value < 0)) throw new Error('Promotion criteria values must be finite and non-negative');
  if (!Number.isInteger(criteria.minSamples)) throw new Error('Promotion minSamples must be an integer');
  if (criteria.maxAgeMs <= 0) throw new Error('Promotion maxAgeMs must be positive');
  if (criteria.minSuccessRate > 1 || criteria.minQualityScore > 1 || criteria.minStabilityScore > 1) {
    throw new Error('Promotion score thresholds must be between 0 and 1');
  }
}

function decision(
  modelKey: string,
  status: ModelPromotionStatus,
  reasons: readonly ModelPromotionReason[],
  evidenceKey?: string,
  provider?: ExecutionProvider,
): ModelPromotionDecision {
  return immutableClone({ modelKey, status, reasons: [...reasons].sort(), evidenceKey, provider });
}
