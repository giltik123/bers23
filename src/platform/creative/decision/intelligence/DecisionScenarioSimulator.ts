import { immutable } from "./immutable";
import type { ScenarioOverrides, ScenarioResult, StrategyProfileName } from "./advancedTypes";
import type { DecisionIntelligenceContext } from "./types";
import type { MultiCandidateGenerator } from "./MultiCandidateGenerator";
import type { AdaptiveStrategyProfiles } from "./ScoringProfiles";

export class DecisionScenarioSimulator {
  constructor(private readonly generator: MultiCandidateGenerator, private readonly profiles: AdaptiveStrategyProfiles) {}
  simulate(context: DecisionIntelligenceContext, overrides: ScenarioOverrides): ScenarioResult {
    const priorityProfile: Partial<Record<NonNullable<ScenarioOverrides["priority"]>, StrategyProfileName>> =
      { QUALITY: "MAXIMUM_QUALITY", SPEED: "MAXIMUM_SPEED", COST: "ECONOMY" };
    const next = immutable({ ...context, availableCredits: overrides.availableCredits ?? context.availableCredits,
      minimumQuality: overrides.minimumQuality ?? context.minimumQuality,
      availableOperations: overrides.providerAvailable === false ? context.availableOperations.filter((item) => !item.startsWith("ai:")) : context.availableOperations });
    const profile = this.profiles.select(next, overrides.priority ? priorityProfile[overrides.priority] : undefined);
    const candidates = this.generator.generate(next).filter((candidate) => overrides.providerAvailable !== false || candidate.mode === "LOCAL");
    return immutable({ context: next, profile, candidates });
  }
}
