import { immutable } from "./immutable";
import type { DecisionAnalyticsResult, DecisionExperience, DecisionLearningSignal } from "./types";

export class DecisionAnalytics {
  calculate(experiences: readonly DecisionExperience[], signals: readonly DecisionLearningSignal[], scores: readonly number[] = []): DecisionAnalyticsResult {
    const count = experiences.length;
    const average = (values: readonly number[]) => values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
    return immutable({ decisions: count, averageScore: average(scores),
      averageSavedCredits: average(experiences.map(({ savedCredits }) => savedCredits)),
      aiUsage: experiences.filter(({ chosenCandidate }) => chosenCandidate.mode === "AI").length,
      localUsage: experiences.filter(({ chosenCandidate }) => chosenCandidate.mode === "LOCAL").length,
      hybridUsage: experiences.filter(({ chosenCandidate }) => chosenCandidate.mode === "HYBRID").length,
      acceptanceRate: count ? experiences.filter(({ accepted }) => accepted).length / count : 0,
      undoRate: count ? signals.filter(({ type }) => type === "UNDO").length / count : 0 });
  }
}
