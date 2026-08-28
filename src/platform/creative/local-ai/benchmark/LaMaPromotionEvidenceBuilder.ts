import { immutableClone } from '../immutable';
import type {
  LaMaLocalExecutionEvidence,
  LaMaProductionPromotionEvidence,
  LaMaPromotionAttestation,
  LaMaQualityPromotionEvidence,
  LaMaRealDeviceEvidence,
  LaMaSignedReleaseEvidence,
} from './LaMaProductionPromotion';
import { LAMA_PROMOTION_EVIDENCE_SCHEMA_VERSION } from './LaMaProductionPromotion';

export type LaMaMeasuredInferenceSample = Readonly<{
  latencyMs: number;
  success: boolean;
}>;

export type LaMaPromotionEvidenceDraft = Readonly<{
  testedCommitSha: string;
  capturedAt: number;
  expiresAt: number;
  attestation: LaMaPromotionAttestation;
  release: LaMaSignedReleaseEvidence;
  device: LaMaRealDeviceEvidence;
  benchmark: Readonly<{
    warmupCount: number;
    samples: readonly LaMaMeasuredInferenceSample[];
    peakRamBytes: number | 'UNKNOWN';
    peakVramBytes: number | 'UNKNOWN';
    testedShapes: readonly Readonly<[number, number]>[];
  }>;
  quality: LaMaQualityPromotionEvidence;
  localExecution: LaMaLocalExecutionEvidence;
}>;

/**
 * Converts raw, already-observed device measurements into the canonical C9 evidence shape.
 * The result remains untrusted. This builder has no trust port, no signature verification and no
 * promotion method; only assessLaMaProductionPromotion may evaluate it through an external trust port.
 */
export function buildLaMaPromotionEvidence(draft: LaMaPromotionEvidenceDraft): LaMaProductionPromotionEvidence {
  if (!/^[a-f0-9]{40}$/.test(draft.testedCommitSha)) {
    throw new Error('LaMa promotion evidence requires an exact lowercase 40-hex tested commit SHA');
  }
  if (!Array.isArray(draft.benchmark.samples) || draft.benchmark.samples.length === 0) {
    throw new Error('LaMa promotion evidence requires at least one measured inference sample');
  }
  const latencies = draft.benchmark.samples.map((sample) => {
    if (typeof sample.success !== 'boolean') {
      throw new Error('LaMa measured inference success must be boolean');
    }
    if (!Number.isFinite(sample.latencyMs) || sample.latencyMs < 0) {
      throw new Error('LaMa measured inference latency must be finite and non-negative');
    }
    return sample.latencyMs;
  }).sort((a, b) => a - b);

  const evidence: LaMaProductionPromotionEvidence = {
    schemaVersion: LAMA_PROMOTION_EVIDENCE_SCHEMA_VERSION,
    testedCommitSha: draft.testedCommitSha,
    capturedAt: draft.capturedAt,
    expiresAt: draft.expiresAt,
    attestation: draft.attestation,
    release: draft.release,
    device: draft.device,
    benchmark: {
      warmupCount: draft.benchmark.warmupCount,
      sampleCount: draft.benchmark.samples.length,
      successfulSamples: draft.benchmark.samples.filter((sample) => sample.success === true).length,
      latencyMs: {
        min: latencies[0]!,
        median: percentileNearestRank(latencies, 0.5),
        p95: percentileNearestRank(latencies, 0.95),
        max: latencies[latencies.length - 1]!,
      },
      peakRamBytes: draft.benchmark.peakRamBytes,
      peakVramBytes: draft.benchmark.peakVramBytes,
      testedShapes: draft.benchmark.testedShapes,
    },
    quality: draft.quality,
    localExecution: draft.localExecution,
  };
  return immutableClone(evidence) as LaMaProductionPromotionEvidence;
}

function percentileNearestRank(sorted: readonly number[], quantile: number): number {
  if (!sorted.length) throw new Error('Cannot calculate a percentile without samples');
  if (!Number.isFinite(quantile) || quantile <= 0 || quantile > 1) throw new Error('Percentile quantile must be in (0, 1]');
  const rank = Math.max(1, Math.ceil(quantile * sorted.length));
  return sorted[rank - 1]!;
}
