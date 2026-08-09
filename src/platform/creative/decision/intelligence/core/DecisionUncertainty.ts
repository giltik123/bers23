import { clamp, immutable } from "./immutable";
import type { DecisionUncertainty as Result, PosteriorConfidence, RiskScore, UncertaintyAction } from "./types";

export class UncertaintyResolver {
  resolve(confidence: PosteriorConfidence, risk: RiskScore, candidateGap: number): Result {
    const width = confidence.interval[1] - confidence.interval[0]; const score = clamp((1 - confidence.mean) * .5 + width * .25 + risk.total * .15 + (1 - clamp(candidateGap)) * .1);
    const reasons = [...(confidence.mean < .6 ? [{ id: "low-confidence", message: "Недостаточно подтверждённой истории.", contribution: 1 - confidence.mean }] : []),
      ...(width > .3 ? [{ id: "wide-interval", message: "Широкий интервал уверенности.", contribution: width }] : []),
      ...(risk.total > .6 ? [{ id: "high-risk", message: "Высокий творческий риск.", contribution: risk.total }] : [])];
    const level = score >= .65 ? "HIGH" : score >= .35 ? "MEDIUM" : "LOW";
    const action: UncertaintyAction = level === "HIGH" ? "ASK_USER" : confidence.mean < .7 ? "SHOW_PREVIEW" : candidateGap < .1 ? "GENERATE_VARIANTS" : "LOCAL_FIRST";
    return immutable({ score, level, reasons, recommendedAction: action });
  }
}
