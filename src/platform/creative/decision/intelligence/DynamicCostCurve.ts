import { immutable } from "./immutable";
import type { CostCurveAnalysis, CostCurvePoint, MarginalUtilityPoint } from "./refinementTypes";

export class DynamicCostCurve {
  analyze(points: readonly CostCurvePoint[], minimumUtility = .01): CostCurveAnalysis {
    const sorted = [...points].sort((left, right) => left.credits - right.credits);
    const analyzed: MarginalUtilityPoint[] = sorted.map((point, index) => {
      const previous = sorted[index - 1]; const creditsDelta = previous ? point.credits - previous.credits : point.credits;
      const qualityDelta = previous ? point.quality - previous.quality : point.quality;
      const marginalQualityPerCredit = creditsDelta > 0 ? qualityDelta / creditsDelta : qualityDelta > 0 ? Number.POSITIVE_INFINITY : 0;
      return { ...point, marginalQualityPerCredit, worthwhile: marginalQualityPerCredit >= minimumUtility };
    });
    const recommended = [...analyzed].reverse().find(({ worthwhile }) => worthwhile) ?? analyzed[0];
    return immutable({ points: analyzed, recommendedCredits: recommended?.credits ?? 0,
      reason: "Стоимость ограничена точкой, после которой прирост качества становится невыгодным." });
  }
}
