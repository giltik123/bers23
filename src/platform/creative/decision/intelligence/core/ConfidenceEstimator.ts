import { clamp, immutable } from "./immutable";
import type { ConfidenceEvidence, PosteriorConfidence } from "./types";

export class ConfidenceEstimator {
  estimate(evidence: ConfidenceEvidence): PosteriorConfidence {
    const effectiveSamples = Math.min(100, Math.max(0, evidence.datasetSize) * clamp(evidence.similarity));
    const priorStrength = 4; const reliability = clamp(evidence.historicalAcceptance * .55 + evidence.preferenceConfidence * .25 + (1 - clamp(evidence.variance)) * .2);
    const alpha = 1 + priorStrength * reliability + effectiveSamples * reliability; const beta = 1 + priorStrength * (1 - reliability) + effectiveSamples * (1 - reliability);
    const mean = alpha / (alpha + beta); const radius = 1.96 * Math.sqrt(alpha * beta / ((alpha + beta) ** 2 * (alpha + beta + 1)));
    return immutable({ alpha, beta, mean, interval: [clamp(mean - radius), clamp(mean + radius)], evidenceStrength: clamp(effectiveSamples / 50) });
  }
}
