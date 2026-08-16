import { clamp, immutable, round } from './immutable';
import type { HeadCalibration, V2DecisionPrediction } from './v2-types';

export interface CalibrationObservation {
  readonly prediction: V2DecisionPrediction;
  readonly actual: Readonly<{ quality: number; accepted: boolean; cost: number; latency: number; utility: number }>;
}

const calibrationError = (predicted: readonly number[], observed: readonly number[]): number => {
  if (!predicted.length) return 1;
  return round(predicted.reduce((sum, value, index) => sum + Math.abs(value - observed[index]), 0) / predicted.length);
};

export class DecisionCalibrationV2 {
  readonly version = 'decision-calibration-v2.0';
  private calibration: HeadCalibration = immutable({ quality: 0.5, acceptance: 0.5, cost: 0.5, latency: 0.5, utility: 0.5, reliabilityCurve: [], version: this.version });

  fit(observations: readonly CalibrationObservation[]): HeadCalibration {
    if (!observations.length) return this.calibration;
    const predictedUtility = observations.map((item) => clamp((item.prediction.expectedUtility + 1) / 2));
    const actualUtility = observations.map((item) => clamp((item.actual.utility + 1) / 2));
    const reliabilityCurve = Array.from({ length: 10 }, (_, bin) => {
      const members = observations.filter((item) => Math.min(9, Math.floor(item.prediction.outcomes.acceptanceProbability * 10)) === bin);
      return immutable({
        predicted: round(members.reduce((sum, item) => sum + item.prediction.outcomes.acceptanceProbability, 0) / Math.max(1, members.length)),
        observed: round(members.reduce((sum, item) => sum + Number(item.actual.accepted), 0) / Math.max(1, members.length)),
        count: members.length,
      });
    }).filter((item) => item.count > 0);
    this.calibration = immutable({
      quality: round(1 - calibrationError(observations.map((item) => item.prediction.outcomes.quality), observations.map((item) => item.actual.quality))),
      acceptance: round(1 - calibrationError(observations.map((item) => item.prediction.outcomes.acceptanceProbability), observations.map((item) => Number(item.actual.accepted)))),
      cost: round(1 - calibrationError(observations.map((item) => clamp(item.prediction.outcomes.cost / 100)), observations.map((item) => clamp(item.actual.cost / 100)))),
      latency: round(1 - calibrationError(observations.map((item) => clamp(item.prediction.outcomes.latency / 60_000)), observations.map((item) => clamp(item.actual.latency / 60_000)))),
      utility: round(1 - calibrationError(predictedUtility, actualUtility)), reliabilityCurve, version: this.version,
    });
    return this.calibration;
  }

  current(): HeadCalibration { return this.calibration; }
}
