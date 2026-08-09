import { immutable } from "./immutable";
import type { CalibrationStatistics, DecisionEvaluation } from "./types";

export class DecisionEvaluator {
  private evaluations: readonly DecisionEvaluation[] = immutable([]);
  evaluate(decisionId: string, predicted: { readonly quality: number; readonly cost: number; readonly latencyMs: number }, actual: { readonly quality: number; readonly cost: number; readonly latencyMs: number }): DecisionEvaluation {
    const quality = Math.abs(predicted.quality - actual.quality); const cost = Math.abs(predicted.cost - actual.cost); const latency = Math.abs(predicted.latencyMs - actual.latencyMs);
    const error = immutable({ quality, cost, latency, absoluteMean: (quality + cost / Math.max(actual.cost, 1) + latency / Math.max(actual.latencyMs, 1)) / 3 });
    const evaluation = immutable({ decisionId, error, calibrated: error.absoluteMean <= .2 }); this.evaluations = immutable([...this.evaluations, evaluation]); return evaluation;
  }
  statistics(): CalibrationStatistics { const average = (selector: (item: DecisionEvaluation) => number) => this.evaluations.length ? this.evaluations.reduce((sum, item) => sum + selector(item), 0) / this.evaluations.length : 0;
    return immutable({ evaluations: this.evaluations.length, meanAbsoluteError: average(({ error }) => error.absoluteMean), qualityError: average(({ error }) => error.quality), costError: average(({ error }) => error.cost), latencyError: average(({ error }) => error.latency) }); }
}
