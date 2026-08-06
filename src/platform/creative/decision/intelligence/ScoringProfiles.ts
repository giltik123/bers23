import { immutable } from "./immutable";
import type { ScoringProfile, StrategyProfileName } from "./advancedTypes";

const profiles: Record<StrategyProfileName, ScoringProfile> = {
  ECONOMY: { name: "ECONOMY", qualityWeight: .15, speedWeight: .1, costWeight: .4, creativityWeight: .05, preferenceWeight: .1, riskWeight: .1, successWeight: .1 },
  BALANCED: { name: "BALANCED", qualityWeight: .2, speedWeight: .12, costWeight: .18, creativityWeight: .1, preferenceWeight: .12, riskWeight: .12, successWeight: .16 },
  PROFESSIONAL: { name: "PROFESSIONAL", qualityWeight: .3, speedWeight: .08, costWeight: .08, creativityWeight: .08, preferenceWeight: .14, riskWeight: .12, successWeight: .2 },
  CREATIVE: { name: "CREATIVE", qualityWeight: .18, speedWeight: .06, costWeight: .08, creativityWeight: .32, preferenceWeight: .14, riskWeight: .08, successWeight: .14 },
  MAXIMUM_QUALITY: { name: "MAXIMUM_QUALITY", qualityWeight: .45, speedWeight: .04, costWeight: .04, creativityWeight: .1, preferenceWeight: .1, riskWeight: .1, successWeight: .17 },
  MAXIMUM_SPEED: { name: "MAXIMUM_SPEED", qualityWeight: .12, speedWeight: .45, costWeight: .12, creativityWeight: .04, preferenceWeight: .08, riskWeight: .08, successWeight: .11 },
  EXPERIMENTAL: { name: "EXPERIMENTAL", qualityWeight: .12, speedWeight: .05, costWeight: .05, creativityWeight: .4, preferenceWeight: .08, riskWeight: .05, successWeight: .25 },
};

export class AdaptiveStrategyProfiles {
  constructor(private readonly configured: Readonly<Record<StrategyProfileName, ScoringProfile>> = profiles) {}
  get(name: StrategyProfileName): ScoringProfile { return immutable(structuredClone(this.configured[name])); }
  select(context: { readonly availableCredits?: number; readonly minimumQuality?: number }, requested?: StrategyProfileName): ScoringProfile {
    if (requested) return this.get(requested);
    if (context.availableCredits === 0) return this.get("ECONOMY");
    if ((context.minimumQuality ?? 0) >= .9) return this.get("MAXIMUM_QUALITY");
    return this.get("BALANCED");
  }
}
