import type { CalibrationModel, CalibrationState, EvaluatedOutcome, ExecutionObservation, MatrixEntry, MatrixKey, ModelRanker, OutcomePredictor, PolicyEvaluator, Prediction } from './types';

export const clamp = (value: number, minimum = 0, maximum = 1): number =>
  Math.max(minimum, Math.min(maximum, value));

export const matrixId = (key: MatrixKey): string =>
  [key.deviceClass, key.operation, key.modelId, key.runtime].join('\u001f');

export class StatisticalOutcomeEvaluator implements PolicyEvaluator {
  evaluate(observation: ExecutionObservation): EvaluatedOutcome {
    const error = {
      quality: observation.actual.quality - observation.prediction.quality,
      latencyMs: observation.actual.latencyMs - observation.prediction.latencyMs,
      cost: observation.actual.cost - observation.prediction.cost,
      success: Number(observation.actual.success) - observation.prediction.successProbability,
      energy: observation.actual.energy - observation.prediction.energy,
      absoluteMean: 0,
    };
    error.absoluteMean = (
      Math.abs(error.quality) +
      Math.abs(error.latencyMs) / Math.max(1, observation.prediction.latencyMs) +
      Math.abs(error.cost) / Math.max(1, observation.prediction.cost) +
      Math.abs(error.success) +
      Math.abs(error.energy) / Math.max(1, observation.prediction.energy)
    ) / 5;
    const utility = observation.actual.quality * 3 + Number(observation.actual.success) * 2 +
      observation.actual.cloudSavings * 1.5 + Number(observation.actual.accepted) -
      clamp(observation.actual.latencyMs / 10_000) - clamp(observation.actual.energy) -
      clamp(observation.actual.cost) - Number(observation.actual.fallbackUsed);
    return Object.freeze({ observation, error: Object.freeze(error), utility });
  }
}

export class StatisticalOutcomePredictor implements OutcomePredictor {
  predict(_key: MatrixKey, entry?: MatrixEntry): Prediction {
    return Object.freeze({
      quality: entry?.quality ?? .75,
      latencyMs: entry?.latencyMs ?? 1_000,
      cost: entry ? Math.max(0, 1 - entry.cloudSavings) : .5,
      successProbability: entry?.successRate ?? .7,
      energy: entry?.energy ?? .5,
    });
  }
}

export class AdaptiveQualityCalibrator implements CalibrationModel {
  calibrate(prediction: Prediction, state: CalibrationState): Prediction {
    return Object.freeze({
      ...prediction,
      quality: clamp(prediction.quality + state.qualityBias),
      latencyMs: prediction.latencyMs * state.latencyMultiplier,
      energy: prediction.energy * state.energyMultiplier,
    });
  }

  update(state: CalibrationState, outcome: EvaluatedOutcome): CalibrationState {
    const count = state.sampleCount + 1;
    const blend = (current: number, next: number) => current + (next - current) / count;
    return Object.freeze({
      qualityBias: blend(state.qualityBias, outcome.error.quality),
      latencyMultiplier: blend(state.latencyMultiplier, outcome.observation.actual.latencyMs / Math.max(1, outcome.observation.prediction.latencyMs)),
      energyMultiplier: blend(state.energyMultiplier, outcome.observation.actual.energy / Math.max(.001, outcome.observation.prediction.energy)),
      sampleCount: count,
    });
  }
}

export class StatisticalModelRanker implements ModelRanker {
  rank(entries: readonly MatrixEntry[]): readonly MatrixEntry[] {
    return [...entries].sort((left, right) => this.score(right) - this.score(left) || left.modelId.localeCompare(right.modelId));
  }

  score(entry: MatrixEntry): number {
    return entry.quality * 3 + entry.successRate * 2 + entry.cloudSavings * 1.5 +
      entry.acceptanceRate - clamp(entry.latencyMs / 10_000) - clamp(entry.energy) -
      clamp(entry.memoryMb / 16_384) - entry.fallbackRate;
  }
}
