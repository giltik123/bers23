import { clamp, immutable } from "./immutable";
import type { DiminishingReturnsResult } from "./refinementTypes";

export class DiminishingReturnsAnalyzer {
  analyze(currentQuality: number, proposedGain: number): DiminishingReturnsResult {
    const remaining = 1 - clamp(currentQuality); const effectiveGain = Math.min(proposedGain, remaining) * remaining;
    const returnRate = proposedGain > 0 ? effectiveGain / proposedGain : 0;
    return immutable({ currentQuality: clamp(currentQuality), effectiveGain, returnRate, diminishing: currentQuality >= .85 || returnRate < .25 });
  }
}
