import { DecisionConstraintLayer } from './DecisionConstraintLayer';
import { DecisionFeatureEncoderV1 } from './DecisionFeatureEncoderV1';
import { clamp, immutable, mean } from './immutable';
import type { DecisionCandidateV1, DecisionContextV1, DecisionDatasetRecord, DecisionFeaturesV1, DecisionHistoryV1, DecisionModelExplanation, DecisionModelV1, MultiHeadPrediction, UtilityPolicy } from './types';

const DEFAULT_HISTORY: DecisionHistoryV1 = Object.freeze({ modelSuccessRate: .5, providerSuccessRate: .5, deviceSpecificSuccessRate: .5, cloudAvoidance: .5, acceptanceRate: .5, undoRate: 0 });
const DEFAULT_UTILITY: UtilityPolicy = Object.freeze({ quality: 3, success: 2, acceptance: 1.5, latency: 1, cost: 1, escalation: .5 });
type Head = 'quality' | 'successProbability' | 'acceptanceProbability' | 'latency' | 'cost' | 'escalationProbability';
type Stump = Readonly<{ feature: number; threshold: number; left: number; right: number }>;
const targets: Record<Head, (record: DecisionDatasetRecord) => number> = { quality: record => record.actualOutcome.quality, successProbability: record => Number(record.actualOutcome.success), acceptanceProbability: record => Number(record.actualOutcome.accepted), latency: record => record.actualOutcome.latency, cost: record => record.actualOutcome.cost, escalationProbability: record => Number(record.actualOutcome.escalated) };
export class TabularDecisionModelV1 implements DecisionModelV1 {
  private readonly encoder: DecisionFeatureEncoderV1;
  private readonly gate: DecisionConstraintLayer;
  private readonly heads: Readonly<Record<Head, readonly Stump[]>>;
  private readonly baselines: Readonly<Record<Head, number>>;
  private readonly trainingCentroid: readonly number[];
  constructor(private readonly modelVersion = 'v1', state: Partial<{ heads: Record<Head, readonly Stump[]>; baselines: Record<Head, number>; trainingCentroid: readonly number[] }> = {}, encoder = new DecisionFeatureEncoderV1(), gate = new DecisionConstraintLayer()) {
    this.encoder = encoder; this.gate = gate;
    this.heads = state.heads ?? { quality: [], successProbability: [], acceptanceProbability: [], latency: [], cost: [], escalationProbability: [] };
    this.baselines = state.baselines ?? { quality: .5, successProbability: .5, acceptanceProbability: .5, latency: 1000, cost: 1, escalationProbability: .1 };
    this.trainingCentroid = state.trainingCentroid ?? [];
  }
  static train(records: readonly DecisionDatasetRecord[], options: { modelVersion?: string; trees?: number; learningRate?: number } = {}) {
    if (!records.length) throw new Error('Training dataset cannot be empty');
    const encoder = new DecisionFeatureEncoderV1(), vectors = records.map(record => encoder.encode(record.features));
    const heads = {} as Record<Head, Stump[]>, baselines = {} as Record<Head, number>;
    for (const head of Object.keys(targets) as Head[]) {
      const y = records.map(targets[head]); baselines[head] = mean(y); const prediction = y.map(() => baselines[head]); heads[head] = [];
      for (let tree = 0; tree < (options.trees ?? 12); tree++) {
        const feature = tree % vectors[0].length, threshold = mean(vectors.map(vector => vector[feature])), residuals = y.map((value, index) => value - prediction[index]);
        const left = mean(residuals.filter((_, index) => vectors[index][feature] <= threshold)) * (options.learningRate ?? .2), right = mean(residuals.filter((_, index) => vectors[index][feature] > threshold)) * (options.learningRate ?? .2);
        heads[head].push({ feature, threshold, left, right }); prediction.forEach((_, index) => prediction[index] += vectors[index][feature] <= threshold ? left : right);
      }
    }
    return new TabularDecisionModelV1(options.modelVersion ?? 'v1', { heads, baselines, trainingCentroid: vectors[0].map((_, index) => mean(vectors.map(vector => vector[index]))) }, encoder);
  }
  predict(features: DecisionFeaturesV1, policy: Partial<UtilityPolicy> = {}): MultiHeadPrediction {
    const vector = this.encoder.encode(features), raw = (head: Head) => this.baselines[head] + this.heads[head].reduce((sum, stump) => sum + (vector[stump.feature] <= stump.threshold ? stump.left : stump.right), 0);
    const distance = this.trainingCentroid.length ? mean(vector.map((value, index) => Math.abs(value - this.trainingCentroid[index]))) : .5;
    const ood = distance > .42, uncertainty = clamp(distance * 1.8 + 1 / Math.sqrt(Math.max(1, this.heads.quality.length)) * .15), weights = { ...DEFAULT_UTILITY, ...policy };
    const quality = clamp(raw('quality')), successProbability = clamp(raw('successProbability')), acceptanceProbability = clamp(raw('acceptanceProbability')), latency = Math.max(0, raw('latency')), cost = Math.max(0, raw('cost')), escalationProbability = clamp(raw('escalationProbability'));
    const expectedUtility = weights.quality * quality + weights.success * successProbability + weights.acceptance * acceptanceProbability - weights.latency * clamp(latency / Math.max(features.context.latencyTarget, 1)) - weights.cost * clamp(cost / Math.max(features.context.budget, .01)) - weights.escalation * escalationProbability;
    return immutable({ quality, successProbability, acceptanceProbability, latency, cost, escalationProbability, expectedUtility, predictionConfidence: clamp(1 - uncertainty), calibration: clamp(1 - Math.abs(successProbability - features.candidate.reliability)), uncertainty, ood, recommendedAction: ood ? 'FALLBACK_TO_HEURISTIC' : uncertainty > .55 ? 'SHOW_PREVIEW' : undefined });
  }
  rank(context: DecisionContextV1, candidates: readonly DecisionCandidateV1[], history: Partial<DecisionHistoryV1> = {}, policy: Partial<UtilityPolicy> = {}) { return immutable(candidates.map(candidate => { const features = { context, candidate, history: { ...DEFAULT_HISTORY, ...history } }; const constraint = this.gate.evaluate(context, candidate); return { candidate, prediction: this.predict(features, policy), excluded: !constraint.allowed, exclusions: constraint.exclusions, rank: 0 }; }).sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.prediction.expectedUtility - a.prediction.expectedUtility || a.candidate.id.localeCompare(b.candidate.id)).map((item, index) => ({ ...item, rank: index + 1 }))); }
  estimateReward(features: DecisionFeaturesV1, policy?: Partial<UtilityPolicy>) { return this.predict(features, policy).expectedUtility; }
  estimateQuality(features: DecisionFeaturesV1) { return this.predict(features).quality; }
  estimateCost(features: DecisionFeaturesV1) { return this.predict(features).cost; }
  estimateLatency(features: DecisionFeaturesV1) { return this.predict(features).latency; }
  estimateAcceptance(features: DecisionFeaturesV1) { return this.predict(features).acceptanceProbability; }
  explain(features: DecisionFeaturesV1): DecisionModelExplanation { const prediction = this.predict(features), vector = this.encoder.encode(features); const influences = vector.map((value, index) => ({ feature: this.encoder.featureNames[index], value, influence: Math.abs(value - (this.trainingCentroid[index] ?? .5)) })).sort((a, b) => b.influence - a.influence).slice(0, 5); const constraint = this.gate.evaluate(features.context, features.candidate); return immutable({ modelVersion: this.version(), topInfluentialFeatures: influences, candidateScores: [{ candidateId: features.candidate.id, utility: prediction.expectedUtility }], predictedOutcomes: prediction, constraintExclusions: constraint.exclusions, finalUtility: constraint.allowed ? prediction.expectedUtility : Number.NEGATIVE_INFINITY, summary: [`${features.candidate.id} predicted with ${(prediction.predictionConfidence * 100).toFixed(0)}% confidence.`, constraint.allowed ? 'System constraints allow this candidate.' : 'System constraints excluded this candidate.'] }); }
  version() { return this.modelVersion; }
}
