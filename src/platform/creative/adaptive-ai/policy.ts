import { immutableClone } from '../local-ai';
import { StatisticalModelRanker, clamp } from './statistics';
import type { AdaptivePolicy, AdaptivePolicyModel, ExplorationMode, ExplorationPolicy, MatrixEntry, PolicyTrainer } from './types';

export const DEFAULT_ADAPTIVE_POLICY: AdaptivePolicy = Object.freeze({
  localQualityThreshold: .9,
  escalationThreshold: .9,
  deviceTierThreshold: .5,
  previewTarget: 'LOCAL',
  finalTarget: 'CLOUD',
  bundlePriority: Object.freeze([]),
  modelRanking: Object.freeze([]),
});

export class StatisticalExplorationPolicy implements ExplorationPolicy {
  explore(mode: ExplorationMode, sample: number, rate: number): boolean {
    if (mode === 'EXPLORE') return true;
    if (mode === 'EXPLOIT') return false;
    return sample < rate;
  }
}

export class StatisticalPolicyTrainer implements PolicyTrainer, AdaptivePolicyModel {
  train(current: AdaptivePolicy, evidence: readonly MatrixEntry[]): AdaptivePolicy {
    return this.propose(current, evidence);
  }

  propose(current: AdaptivePolicy, evidence: readonly MatrixEntry[]): AdaptivePolicy {
    if (!evidence.length) return immutableClone(current);
    const stable = evidence.filter((entry) => entry.stability >= .5);
    if (!stable.length) return immutableClone(current);
    const ranked = new StatisticalModelRanker().rank(stable);
    const acceptedQuality = stable
      .filter((entry) => entry.acceptanceRate >= .7 && entry.successRate >= .8)
      .map((entry) => entry.quality);
    const threshold = acceptedQuality.length
      ? acceptedQuality.reduce((sum, value) => sum + value, 0) / acceptedQuality.length
      : current.localQualityThreshold;
    return immutableClone({
      ...current,
      localQualityThreshold: clamp(threshold, .5, .99),
      escalationThreshold: clamp(threshold - .02, .5, .99),
      modelRanking: ranked.map((entry) => entry.modelId),
      bundlePriority: ranked.filter((entry) => entry.cloudSavings > 0).map((entry) => entry.modelId),
    });
  }
}
