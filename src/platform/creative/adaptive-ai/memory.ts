import { immutableClone } from '../local-ai';
import { clamp, matrixId } from './statistics';
import type { EvaluatedOutcome, LearningConfig, MatrixEntry, MatrixKey } from './types';

type MutableEntry = MatrixEntry & { meanUtility: number; utilityM2: number };

export class AdaptiveSelectionMemory {
  readonly #entries = new Map<string, MutableEntry>();

  record(outcome: EvaluatedOutcome, config: LearningConfig): MatrixEntry {
    const { observation } = outcome;
    const id = matrixId(observation.key);
    const previous = this.#entries.get(id);
    const age = previous ? Math.max(0, observation.at - previous.updatedAt) : 0;
    const decay = previous ? Math.pow(.5, age / config.decayHalfLifeMs) : 0;
    const effective = (previous?.effectiveSampleCount ?? 0) * decay + 1;
    const count = (previous?.sampleCount ?? 0) + 1;
    const average = (old: number | undefined, value: number) =>
      old === undefined ? value : old + (value - old) / effective;
    const utilityDelta = outcome.utility - (previous?.meanUtility ?? outcome.utility);
    const meanUtility = average(previous?.meanUtility, outcome.utility);
    const utilityM2 = (previous?.utilityM2 ?? 0) * decay + utilityDelta * (outcome.utility - meanUtility);
    const variance = effective > 1 ? utilityM2 / (effective - 1) : 0;
    const entry: MutableEntry = {
      ...observation.key,
      quality: average(previous?.quality, observation.actual.quality),
      latencyMs: average(previous?.latencyMs, observation.actual.latencyMs),
      successRate: average(previous?.successRate, Number(observation.actual.success)),
      energy: average(previous?.energy, observation.actual.energy),
      memoryMb: average(previous?.memoryMb, observation.actual.memoryMb),
      cloudSavings: average(previous?.cloudSavings, observation.actual.cloudSavings),
      fallbackRate: average(previous?.fallbackRate, Number(observation.actual.fallbackUsed)),
      acceptanceRate: average(previous?.acceptanceRate, Number(observation.actual.accepted)),
      confidence: clamp(effective / config.activationEvidence),
      variance,
      stability: clamp(1 - variance / Math.max(config.maximumVariance, .0001)),
      sampleCount: count,
      effectiveSampleCount: effective,
      updatedAt: observation.at,
      meanUtility,
      utilityM2,
    };
    this.#entries.set(id, entry);
    return this.publicEntry(entry);
  }

  get(key: MatrixKey): MatrixEntry | undefined {
    const entry = this.#entries.get(matrixId(key));
    return entry && this.publicEntry(entry);
  }

  list(): readonly MatrixEntry[] {
    return immutableClone([...this.#entries.values()]
      .map((entry) => this.publicEntry(entry))
      .sort((a, b) => matrixId(a).localeCompare(matrixId(b))));
  }

  private publicEntry(entry: MutableEntry): MatrixEntry {
    const { meanUtility: _meanUtility, utilityM2: _utilityM2, ...result } = entry;
    return immutableClone(result);
  }
}
