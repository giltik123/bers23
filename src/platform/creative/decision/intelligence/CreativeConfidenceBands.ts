import { clamp, immutable } from "./immutable";
import type { ConfidenceBandResult } from "./refinementTypes";

export class CreativeConfidenceBands {
  classify(confidence: number, variance = .04): ConfidenceBandResult {
    const calibrated = clamp(confidence); const radius = Math.min(.25, Math.sqrt(Math.max(0, variance)) * .2);
    const band = calibrated < .5 ? "LOW" : calibrated < .7 ? "MEDIUM" : calibrated < .87 ? "HIGH" : "VERY_HIGH";
    return immutable({ band, interval: [clamp(calibrated - radius), clamp(calibrated + radius)], calibrated });
  }
}
