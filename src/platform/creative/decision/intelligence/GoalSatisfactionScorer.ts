import { clamp, immutable } from "./immutable";
import type { GoalSatisfaction } from "./refinementTypes";

export class GoalSatisfactionScorer {
  score(current: number, goals: readonly string[], supportedGoals: readonly string[], expectedQualityGain = 0): GoalSatisfaction {
    const matchedGoals = goals.filter((goal) => supportedGoals.includes(goal));
    const coverage = goals.length ? matchedGoals.length / goals.length : 1;
    const predicted = clamp(current + coverage * .38 + expectedQualityGain * .32);
    return immutable({ current: clamp(current), predicted, improvement: Math.max(0, predicted - clamp(current)), matchedGoals });
  }
}
