import { DecisionModelEvaluator } from './DecisionModelEvaluator';
import { DecisionModelRegistry } from './DecisionModelRegistry';
import { DecisionTrainerV1 } from './DecisionTrainerV1';
import { DecisionConstraintLayer } from './DecisionConstraintLayer';
import { DECISION_BENCHMARK_V1 } from './benchmark';
import { CreativeDecisionModelV2, DecisionConfidenceCalibratorV2 } from './CreativeDecisionModelV2';
import { immutable, mean } from './immutable';
import type { DecisionCandidateV1, DecisionContextV1, DecisionDatasetRecord, DecisionFeaturesV1, DecisionHistoryV1, DecisionModelV1, ModelManifest, UtilityPolicy } from './types';

export class HeuristicBaselineModel implements DecisionModelV1 {
  private readonly gate = new DecisionConstraintLayer();
  version() { return 'heuristic-baseline-v0'; }
  predict(features: DecisionFeaturesV1, policy: Partial<UtilityPolicy> = {}) { const { candidate, history, context } = features, quality = candidate.estimatedQuality, successProbability = (candidate.reliability + history.modelSuccessRate + history.providerSuccessRate) / 3, acceptanceProbability = (history.acceptanceRate + quality) / 2, latency = candidate.estimatedLatency, cost = candidate.estimatedCost, escalationProbability = Math.max(0, 1 - successProbability), expectedUtility = (policy.quality ?? 3) * quality + (policy.success ?? 2) * successProbability + (policy.acceptance ?? 1.5) * acceptanceProbability - (policy.latency ?? 1) * Math.min(1, latency / Math.max(1, context.latencyTarget)) - (policy.cost ?? 1) * Math.min(1, cost / Math.max(.01, context.budget)) - (policy.escalation ?? .5) * escalationProbability; return immutable({ quality, successProbability, acceptanceProbability, latency, cost, escalationProbability, expectedUtility, predictionConfidence: .5, calibration: .5, uncertainty: .5, ood: false }); }
  rank(context: DecisionContextV1, candidates: readonly DecisionCandidateV1[], history: Partial<DecisionHistoryV1> = {}, policy: Partial<UtilityPolicy> = {}) { const defaults = { modelSuccessRate: .5, providerSuccessRate: .5, deviceSpecificSuccessRate: .5, cloudAvoidance: .5, acceptanceRate: .5, undoRate: 0 }; return immutable(candidates.map(candidate => { const gate = this.gate.evaluate(context, candidate); return { candidate, prediction: this.predict({ context, candidate, history: { ...defaults, ...history } }, policy), excluded: !gate.allowed, exclusions: gate.exclusions, rank: 0 }; }).sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.prediction.expectedUtility - a.prediction.expectedUtility || a.candidate.id.localeCompare(b.candidate.id)).map((item, index) => ({ ...item, rank: index + 1 }))); }
  estimateReward(features: DecisionFeaturesV1, policy?: Partial<UtilityPolicy>) { return this.predict(features, policy).expectedUtility; } estimateQuality(features: DecisionFeaturesV1) { return this.predict(features).quality; } estimateCost(features: DecisionFeaturesV1) { return this.predict(features).cost; } estimateLatency(features: DecisionFeaturesV1) { return this.predict(features).latency; } estimateAcceptance(features: DecisionFeaturesV1) { return this.predict(features).acceptanceProbability; }
  explain(features: DecisionFeaturesV1) { const prediction = this.predict(features); return immutable({ modelVersion: this.version(), topInfluentialFeatures: [], candidateScores: [{ candidateId: features.candidate.id, utility: prediction.expectedUtility }], predictedOutcomes: prediction, constraintExclusions: [], finalUtility: prediction.expectedUtility, summary: ['Adaptive heuristic baseline prediction.'] }); }
}

export class CreativeDecisionModel {
  private readonly shadows: Array<Readonly<{ at: number; model: string; baseline: string; modelUtility: number; baselineUtility: number }>> = [];
  private readonly trainer: DecisionTrainerV1; private readonly evaluator: DecisionModelEvaluator;
  constructor(private model: DecisionModelV1 = new HeuristicBaselineModel(), private readonly baseline: DecisionModelV1 = new HeuristicBaselineModel(), private readonly registry = new DecisionModelRegistry(), evaluator = new DecisionModelEvaluator(), trainer?: DecisionTrainerV1, private readonly now: () => number = Date.now) { this.evaluator = evaluator; this.trainer = trainer ?? new DecisionTrainerV1(evaluator); }
  predict(features: DecisionFeaturesV1) { const prediction = this.model.predict(features); return prediction.ood ? this.baseline.predict(features) : prediction; }
  encode(features: DecisionFeaturesV1) { return this.v2().encode(features); }
  rank(context: DecisionContextV1, candidates: readonly DecisionCandidateV1[], history?: Partial<DecisionHistoryV1>) { const ranking = this.model.rank(context, candidates, history); return ranking.every(item => item.excluded || item.prediction.ood) ? this.baseline.rank(context, candidates, history) : ranking; }
  rankPairwise(a: DecisionFeaturesV1, b: DecisionFeaturesV1) { return this.v2().rankPairwise(a, b); }
  predictList(items: readonly DecisionFeaturesV1[]) { return this.v2().predictList(items); }
  counterfactual(actual: DecisionFeaturesV1, alternative: DecisionFeaturesV1) { return this.v2().counterfactual(actual, alternative); }
  calibrate(predicted: readonly number[], observed: readonly number[]) { return new DecisionConfidenceCalibratorV2().reliability(predicted, observed); }
  distill(samples: readonly DecisionFeaturesV1[]) { return this.v2().distill(samples); }
  evaluate(records: readonly DecisionDatasetRecord[]) { return this.evaluator.evaluate(this.model, records); }
  explain(features: DecisionFeaturesV1) { return this.model.explain(features); }
  benchmark() { return DECISION_BENCHMARK_V1; }
  train(records: readonly DecisionDatasetRecord[], config = {}) { return this.trainer.train(records, config); }
  validate(records: readonly DecisionDatasetRecord[]) { return this.trainer.validate(records); }
  register(model: DecisionModelV1, metadata: Omit<ModelManifest, 'modelVersion' | 'status'>) { return this.registry.register(model, metadata); }
  promote(version: string) { const manifest = this.registry.promote(version), entry = this.registry.get(version); if (entry) this.model = entry.model; return manifest; }
  rollback(version: string) { const manifest = this.registry.rollback(version), active = this.registry.active(); this.model = active?.model ?? this.baseline; return manifest; }
  shadow(features: DecisionFeaturesV1) { const modelPrediction = this.model.predict(features), baselinePrediction = this.baseline.predict(features); this.shadows.push(immutable({ at: this.now(), model: this.model.version(), baseline: this.baseline.version(), modelUtility: modelPrediction.expectedUtility, baselineUtility: baselinePrediction.expectedUtility })); return immutable({ mode: 'MODEL_SHADOW' as const, executedBy: this.baseline.version(), modelPrediction, baselinePrediction }); }
  compareVersions(records: readonly DecisionDatasetRecord[]) { const candidate = this.evaluator.evaluate(this.model, records), baseline = this.evaluator.evaluate(this.baseline, records); return immutable({ candidateVersion: this.model.version(), baselineVersion: this.baseline.version(), ...this.evaluator.compare(candidate, baseline), promotionEligible: candidate.rankingQuality > baseline.rankingQuality && candidate.acceptancePredictionError <= baseline.acceptancePredictionError && candidate.decisionRegret <= baseline.decisionRegret && candidate.costPredictionError <= baseline.costPredictionError && candidate.stability >= baseline.stability }); }
  drift(records: readonly DecisionDatasetRecord[], threshold = .2) { const predictions = records.map(record => this.model.predict(record.features)); const featureDrift = mean(predictions.map(prediction => Number(prediction.ood))), predictionDrift = mean(predictions.map(prediction => prediction.uncertainty)), qualityDrift = this.evaluate(records).qualityPredictionError; return immutable({ featureDrift, predictionDrift, qualityDrift, deviceDrift: featureDrift, providerDrift: featureDrift, status: Math.max(featureDrift, predictionDrift, qualityDrift) > threshold ? 'RETRAIN_REQUIRED' as const : 'STABLE' as const }); }
  snapshot() { return immutable({ activeModel: this.model.version(), baselineModel: this.baseline.version(), registry: this.registry.list(), shadowEvents: this.shadows }); }
  debug() { return immutable({ pipeline: ['Real Outcomes', 'Dataset', 'Features', 'Prediction', 'OOD', 'Constraints', 'Policy', 'Security', 'Decision'], securityBoundary: 'NON_LEARNABLE', snapshot: this.snapshot() }); }
  private v2() { return this.model instanceof CreativeDecisionModelV2 ? this.model : new CreativeDecisionModelV2(); }
}
