import { DecisionConstraintLayer } from './DecisionConstraintLayer';
import { DecisionRepresentationEncoderV2 } from './DecisionRepresentationEncoderV2';
import { MultiTaskDecisionHeadsV2, NeuralDecisionRanker } from './NeuralDecisionRanker';
import { clamp, immutable } from './immutable';
import type { DecisionCandidateV1, DecisionContextV1, DecisionFeaturesV1, DecisionHistoryV1, DecisionModelExplanation, DecisionModelV1, PairwisePreference, UtilityPolicy } from './types';

const HISTORY: DecisionHistoryV1 = Object.freeze({ modelSuccessRate: .5, providerSuccessRate: .5, deviceSpecificSuccessRate: .5, cloudAvoidance: .5, acceptanceRate: .5, undoRate: 0 });
export class DecisionConfidenceCalibratorV2 {
  calibrate(value: number, curve: readonly { predicted: number; observed: number }[] = []) { if (!curve.length) return clamp(value); const nearest = [...curve].sort((a, b) => Math.abs(a.predicted - value) - Math.abs(b.predicted - value))[0]; return clamp(nearest.observed); }
  reliability(predicted: readonly number[], observed: readonly number[]) { if (predicted.length !== observed.length) throw new Error('Calibration arrays must have equal length'); return immutable(Array.from({ length: 10 }, (_, bin) => { const rows = predicted.map((value, i) => ({ value, actual: observed[i] })).filter(row => Math.min(9, Math.floor(clamp(row.value) * 10)) === bin); return { bin, predicted: rows.length ? rows.reduce((s, x) => s + x.value, 0) / rows.length : 0, observed: rows.length ? rows.reduce((s, x) => s + x.actual, 0) / rows.length : 0, count: rows.length }; })); }
}

export class CreativeDecisionModelV2 implements DecisionModelV1 {
  private readonly heads = new MultiTaskDecisionHeadsV2(); private readonly gate = new DecisionConstraintLayer();
  constructor(readonly ranker = new NeuralDecisionRanker(), readonly encoder = new DecisionRepresentationEncoderV2(), private readonly modelVersion = 'decision-model-v2.1') {}
  version() { return this.modelVersion; }
  encode(features: DecisionFeaturesV1) { return this.encoder.encode(features); }
  predict(features: DecisionFeaturesV1, policy: Partial<UtilityPolicy> = {}) { return this.heads.predict(features, this.ranker, policy); }
  rank(context: DecisionContextV1, candidates: readonly DecisionCandidateV1[], history: Partial<DecisionHistoryV1> = {}, policy: Partial<UtilityPolicy> = {}) { return immutable(candidates.map(candidate => { const features = { context, candidate, history: { ...HISTORY, ...history } }, constraint = this.gate.evaluate(context, candidate); return { candidate, prediction: this.predict(features, policy), excluded: !constraint.allowed, exclusions: constraint.exclusions, rank: 0 }; }).sort((a, b) => Number(a.excluded) - Number(b.excluded) || b.prediction.expectedUtility - a.prediction.expectedUtility || a.candidate.id.localeCompare(b.candidate.id)).map((item, i) => ({ ...item, rank: i + 1 }))); }
  rankPairwise(a: DecisionFeaturesV1, b: DecisionFeaturesV1) { return this.ranker.compare(a, b); }
  predictList(items: readonly DecisionFeaturesV1[]) { return immutable(items.map(features => ({ candidateId: features.candidate.id, prediction: this.predict(features) })).sort((a, b) => b.prediction.expectedUtility - a.prediction.expectedUtility)); }
  counterfactual(actual: DecisionFeaturesV1, alternative: DecisionFeaturesV1) { const chosen = this.predict(actual), counterfactual = this.predict(alternative); return immutable({ actual: chosen, counterfactual, utilityDelta: counterfactual.expectedUtility - chosen.expectedUtility, recommendedSwitch: counterfactual.expectedUtility > chosen.expectedUtility && !counterfactual.ood }); }
  learnPairwise(pairs: readonly PairwisePreference[]) { return new CreativeDecisionModelV2(this.ranker.train(pairs), this.encoder, this.modelVersion); }
  learnListwise(lists: readonly (readonly DecisionFeaturesV1[])[]) { return new CreativeDecisionModelV2(this.ranker.trainListwise(lists), this.encoder, this.modelVersion); }
  distill(samples: readonly DecisionFeaturesV1[]) { return this.ranker.distill(samples); }
  estimateReward(features: DecisionFeaturesV1, policy?: Partial<UtilityPolicy>) { return this.predict(features, policy).expectedUtility; } estimateQuality(features: DecisionFeaturesV1) { return this.predict(features).quality; } estimateCost(features: DecisionFeaturesV1) { return this.predict(features).cost; } estimateLatency(features: DecisionFeaturesV1) { return this.predict(features).latency; } estimateAcceptance(features: DecisionFeaturesV1) { return this.predict(features).acceptanceProbability; }
  explain(features: DecisionFeaturesV1): DecisionModelExplanation { const prediction = this.predict(features), constraint = this.gate.evaluate(features.context, features.candidate), representation = this.encode(features); return immutable({ modelVersion: this.version(), topInfluentialFeatures: representation.interactions.map((value, i) => ({ feature: `interaction.${i}`, value, influence: Math.abs(value) })).sort((a, b) => b.influence - a.influence), candidateScores: [{ candidateId: features.candidate.id, utility: prediction.expectedUtility }], predictedOutcomes: prediction, constraintExclusions: constraint.exclusions, finalUtility: constraint.allowed ? prediction.expectedUtility : Number.NEGATIVE_INFINITY, summary: [`Representation ${representation.schemaVersion}.`, `Coverage ${(representation.coverage * 100).toFixed(0)}%; cold start: ${representation.coldStart.join(', ') || 'none'}.`] }); }
}
