import { clamp, immutable } from "./immutable";
import type { PreferenceEvidence, ReliablePreference } from "./refinementTypes";

export class PreferenceReliabilityAnalyzer {
  constructor(private readonly minimumReliability = .6) {}
  analyze(preferences: readonly PreferenceEvidence[]): readonly ReliablePreference[] {
    return immutable(preferences.map(({ value, confidence, evidenceCount }) => {
      const evidenceFactor = 1 - Math.exp(-Math.max(0, evidenceCount) / 5);
      const reliability = clamp(confidence * .75 + evidenceFactor * .25);
      return { value, reliability, usable: reliability >= this.minimumReliability };
    }));
  }
}
