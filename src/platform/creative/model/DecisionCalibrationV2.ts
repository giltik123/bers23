import { clamp, immutable, mean } from './immutable';
import type { CalibrationHeadsV2, MultiTaskPredictionV2 } from './v2-types';
type Target = Readonly<{ quality: number; acceptance: number; cost: number; latency: number; utility: number }>;
export class DecisionCalibrationV2 {
  constructor(readonly version = 'calibration-v2.0', private readonly temperatures: CalibrationHeadsV2 = { quality: 1, acceptance: 1, cost: 1, latency: 1, utility: 1 }) {}
  fit(predictions: readonly MultiTaskPredictionV2[], targets: readonly Target[]) {
    if (predictions.length !== targets.length || !predictions.length) throw new Error('Calibration requires aligned non-empty predictions and targets');
    const error = (selectPrediction: (value: MultiTaskPredictionV2) => number, selectTarget: (value: Target) => number) => clamp(1 + mean(predictions.map((prediction, index) => Math.abs(selectPrediction(prediction) - selectTarget(targets[index])))), .5, 2);
    return new DecisionCalibrationV2(`${this.version}+fit`, { quality: error(value => value.quality, value => value.quality), acceptance: error(value => value.acceptanceProbability, value => value.acceptance), cost: error(value => value.cost / 100, value => value.cost / 100), latency: error(value => value.latency / 60_000, value => value.latency / 60_000), utility: error(value => clamp(value.expectedUtility / 10), value => clamp(value.utility / 10)) });
  }
  apply(value: number, head: keyof CalibrationHeadsV2) { const probability = clamp(value); const logit = Math.log(Math.max(1e-6, probability) / Math.max(1e-6, 1 - probability)); return clamp(1 / (1 + Math.exp(-logit / this.temperatures[head]))); }
  heads(): CalibrationHeadsV2 { return immutable({ quality: 1 / this.temperatures.quality, acceptance: 1 / this.temperatures.acceptance, cost: 1 / this.temperatures.cost, latency: 1 / this.temperatures.latency, utility: 1 / this.temperatures.utility }); }
  reliabilityCurve(predictions: readonly number[], outcomes: readonly number[], bins = 10) { return immutable(Array.from({ length: bins }, (_, index) => { const minimum = index / bins, maximum = (index + 1) / bins, rows = predictions.map((prediction, row) => ({ prediction, outcome: outcomes[row] })).filter(row => row.prediction >= minimum && (index === bins - 1 ? row.prediction <= maximum : row.prediction < maximum)); return { minimum, maximum, count: rows.length, confidence: mean(rows.map(row => row.prediction)), observed: mean(rows.map(row => row.outcome)) }; })); }
}
