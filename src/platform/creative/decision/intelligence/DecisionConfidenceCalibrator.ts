import { clamp } from "./immutable";
import type { ConfidenceCalibrationInput } from "./advancedTypes";

export class DecisionConfidenceCalibrator {
  calibrate(input: ConfidenceCalibrationInput): number {
    const evidence = Math.min(1, Math.log10(input.datasetSize + 1) / 3);
    return clamp(input.rawConfidence * .35 + evidence * .2 + input.similarity * .2
      + input.historySuccessRate * .2 - clamp(input.variance) * .15 + .05);
  }
}
