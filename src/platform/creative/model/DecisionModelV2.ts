import { DecisionCalibrationV2 } from './DecisionCalibrationV2';
import { DecisionRepresentationEncoderV2 } from './DecisionRepresentationEncoderV2';
import { CompactNeuralDecisionRanker } from './NeuralDecisionRanker';
import { clamp, immutable, round } from './immutable';
import { decisionConstraintExclusions } from './TabularDecisionModelV1';
import type { ConfidenceAction, DecisionCandidate, DecisionConstraints, DecisionContext, DecisionHistoryFeatures } from './types';
import type {
  CounterfactualResult,
  DecisionRepresentationInput,
  ListwiseExample,
  PairwiseExample,
  PairwiseResult,
  RelevantOutcome,
  UserPreferenceSignals,
  V2DecisionPrediction,
  V2ModelMetadata,
  V2Predictions,
  V2UtilityPolicy,
} from './v2-types';

const DEFAULT_POLICY: V2UtilityPolicy = immutable({
  quality: 0.21, success: 0.16, acceptance: 0.17, satisfaction: 0.16,
  latency: 0.07, cost: 0.08, escalation: 0.05, regret: 0.05,
  privacy: 0.03, unnecessaryAI: 0.02,
});

export interface DecisionModelV2Config {
  readonly encoder?: DecisionRepresentationEncoderV2;
  readonly ranker?: CompactNeuralDecisionRanker;
  readonly calibration?: DecisionCalibrationV2;
  readonly metadata?: Partial<V2ModelMetadata>;
  readonly now?: () => number;
  readonly criticalUncertainty?: number;
}

export class DecisionModelV2 {
  readonly encoder: DecisionRepresentationEncoderV2;
  readonly ranker: CompactNeuralDecisionRanker;
  readonly calibration: DecisionCalibrationV2;
  private readonly metadata: V2ModelMetadata;
  private readonly criticalUncertainty: number;

  constructor(config: DecisionModelV2Config = {}) {
    this.encoder = config.encoder ?? new DecisionRepresentationEncoderV2();
    const probe = this.encoder.encode({ context: DecisionModelV2.probeContext(), candidate: DecisionModelV2.probeCandidate() });
    this.ranker = config.ranker ?? new CompactNeuralDecisionRanker({ inputSize: probe.values.length });
    this.calibration = config.calibration ?? new DecisionCalibrationV2();
    this.criticalUncertainty = config.criticalUncertainty ?? 0.72;
    this.metadata = immutable({
      featureSchemaVersion: probe.featureSchemaVersion,
      encoderVersion: this.encoder.version,
      datasetVersion: 'decision-dataset-v2',
      trainingConfigVersion: 'pairwise-listwise-v2',
      calibrationVersion: this.calibration.version,
      benchmarkVersion: 'decision-benchmark-v2',
      modelVersion: 'v2', metrics: {}, createdAt: config.now?.() ?? 0,
      ...config.metadata,
    });
  }

  encode(input: DecisionRepresentationInput) { return this.encoder.encode(input); }

  predict(input: DecisionRepresentationInput): V2DecisionPrediction {
    const representation = this.encoder.encode(input);
    const outcomes = this.predictHeads(input, representation.values);
    const rankScore = this.ranker.score(representation);
    const exclusions = decisionConstraintExclusions(input.candidate, input.context, input.constraints ?? {});
    const utility = exclusions.length ? -1 : this.utility(outcomes, input, rankScore);
    const uncertaintyV2 = this.uncertainty(input, representation.coverage, outcomes);
    const action = this.safeAction(input, exclusions, uncertaintyV2.oodScore, uncertaintyV2.epistemic);
    const influence = Object.entries(representation.interactions)
      .map(([feature, contribution]) => ({ feature, contribution: round(Math.abs(contribution)) }))
      .sort((a, b) => b.contribution - a.contribution || a.feature.localeCompare(b.feature)).slice(0, 6);
    return immutable({
      candidate: immutable({ ...input.candidate }), outcomes, expectedUtility: utility,
      predictionConfidence: uncertaintyV2.predictionConfidence,
      calibration: this.calibration.current().utility,
      uncertainty: round(Math.max(uncertaintyV2.aleatoric, uncertaintyV2.epistemic)),
      ood: uncertaintyV2.oodScore >= this.criticalUncertainty, action, uncertaintyV2,
      calibrationV2: this.calibration.current(), representation,
      explanation: immutable({
        topInfluentialFeatures: influence,
        candidateScores: { neuralRank: rankScore, utility }, predictedOutcomes: outcomes,
        constraintExclusions: exclusions, finalUtility: utility,
      }),
    });
  }

  rank(context: DecisionContext, candidates: readonly DecisionCandidate[], options: Omit<DecisionRepresentationInput, 'context' | 'candidate'> = {}): readonly V2DecisionPrediction[] {
    return immutable(candidates.map((candidate) => this.predict({ ...options, context, candidate }))
      .sort((a, b) => b.expectedUtility - a.expectedUtility || a.candidate.id.localeCompare(b.candidate.id)));
  }

  rankPairwise(context: DecisionContext, a: DecisionCandidate, b: DecisionCandidate, options: Omit<DecisionRepresentationInput, 'context' | 'candidate'> = {}): PairwiseResult {
    const aRepresentation = this.encoder.encode({ ...options, context, candidate: a });
    const bRepresentation = this.encoder.encode({ ...options, context, candidate: b });
    const probabilityA = this.ranker.compare(aRepresentation, bRepresentation);
    return immutable({
      preferred: probabilityA >= 0.5 ? a : b, other: probabilityA >= 0.5 ? b : a,
      probabilityPreferred: round(Math.max(probabilityA, 1 - probabilityA)),
      margin: round(Math.abs(probabilityA - 0.5) * 2), reason: 'pairwise neural preference',
    });
  }

  predictList(example: Omit<ListwiseExample, 'relevance'>, options: Omit<DecisionRepresentationInput, 'context' | 'candidate'> = {}) {
    return this.rank(example.context, example.candidates, options);
  }

  trainPairwise(examples: readonly PairwiseExample[]): void {
    this.ranker.trainPairwise(examples.map((example) => ({
      preferred: this.encoder.encode({ context: example.context, candidate: example.preferred }),
      other: this.encoder.encode({ context: example.context, candidate: example.other }),
      weight: example.source === 'HUMAN_PREFERENCE' ? Math.min(example.weight ?? 1, 2) : example.weight,
    })));
  }

  trainListwise(examples: readonly ListwiseExample[]): void {
    this.ranker.trainListwise(examples.map((example) => ({
      representations: example.candidates.map((candidate) => this.encoder.encode({ context: example.context, candidate })),
      relevance: example.relevance,
    })));
  }

  counterfactual(selected: DecisionRepresentationInput, alternative: DecisionCandidate): CounterfactualResult {
    const selectedPrediction = this.predict(selected);
    const alternativePrediction = this.predict({ ...selected, candidate: alternative });
    const keys = Object.keys(selectedPrediction.outcomes) as (keyof V2Predictions)[];
    return immutable({ selected: selectedPrediction, alternative: alternativePrediction,
      utilityDelta: round(alternativePrediction.expectedUtility - selectedPrediction.expectedUtility),
      outcomeDeltas: Object.fromEntries(keys.map((key) => [key, round(alternativePrediction.outcomes[key] - selectedPrediction.outcomes[key])])) as Record<keyof V2Predictions, number>,
      constraintsChanged: alternativePrediction.explanation.constraintExclusions,
    });
  }

  version(): V2ModelMetadata { return this.metadata; }

  private predictHeads(input: DecisionRepresentationInput, values: readonly number[]): V2Predictions {
    const { candidate } = input;
    const history = input.history ?? {};
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const interaction = Math.tanh(mean) * 0.08;
    const success = clamp(candidate.reliability * 0.55 + (history.modelSuccessRate ?? 0.5) * 0.25 + (history.deviceSpecificSuccessRate ?? 0.5) * 0.2 + interaction);
    const quality = clamp(candidate.estimatedQuality * 0.7 + success * 0.2 + input.context.qualityTarget * 0.1 + interaction);
    const acceptance = clamp(quality * 0.38 + (history.acceptanceRate ?? 0.5) * 0.32 + (input.preferences?.styleAlignment ?? 0.5) * 0.2 - (history.undoRate ?? 0) * 0.2 + success * 0.1);
    const satisfaction = clamp(acceptance * 0.4 + quality * 0.22 + (input.preferences?.styleAlignment ?? 0.5) * 0.18 + success * 0.1 - (history.undoRate ?? 0) * 0.18 + 0.1);
    const escalation = clamp((1 - success) * 0.7 + (candidate.executionTarget === 'LOCAL' ? 0.08 : 0));
    const cost = Math.max(0, candidate.estimatedCost * (1 + Math.max(-0.1, interaction)));
    const latency = Math.max(0, candidate.estimatedLatency * (1.05 - (history.deviceSpecificSuccessRate ?? 0.5) * 0.1));
    const regret = clamp((1 - quality) * 0.25 + (1 - acceptance) * 0.35 + escalation * 0.2 + clamp(cost / Math.max(1, input.context.budget)) * 0.2);
    return immutable({ quality: round(quality), successProbability: round(success), acceptanceProbability: round(acceptance), cost: round(cost), latency: round(latency), escalationProbability: round(escalation), satisfaction: round(satisfaction), regret: round(regret) });
  }

  private utility(outcomes: V2Predictions, input: DecisionRepresentationInput, rankScore: number): number {
    const policy = DEFAULT_POLICY;
    const privacy = input.context.privacyMode === 'LOCAL_ONLY' ? Number(input.candidate.executionTarget === 'LOCAL') : 1;
    return round(policy.quality * outcomes.quality + policy.success * outcomes.successProbability + policy.acceptance * outcomes.acceptanceProbability + policy.satisfaction * outcomes.satisfaction
      - policy.latency * clamp(outcomes.latency / 60_000) - policy.cost * clamp(outcomes.cost / 100) - policy.escalation * outcomes.escalationProbability
      - policy.regret * outcomes.regret + policy.privacy * privacy + Math.tanh(rankScore) * 0.03);
  }

  private uncertainty(input: DecisionRepresentationInput, coverage: number, outcomes: V2Predictions) {
    const aleatoric = round(clamp(1 - Math.abs(outcomes.successProbability - 0.5) * 2));
    const epistemic = round(clamp(1 - coverage));
    const coldStart = this.encoder.encode(input).coldStartReasons.length / 4;
    const oodScore = round(clamp(epistemic * 0.7 + coldStart * 0.3));
    return immutable({ aleatoric, epistemic, dataCoverage: coverage, oodScore, predictionConfidence: round(clamp(1 - Math.max(aleatoric * 0.4, epistemic))) });
  }

  private safeAction(input: DecisionRepresentationInput, exclusions: readonly string[], ood: number, epistemic: number): ConfidenceAction {
    if (exclusions.length || ood >= this.criticalUncertainty) return 'FALLBACK_TO_HEURISTIC';
    if (epistemic > 0.6) return input.context.privacyMode === 'LOCAL_ONLY' ? 'LOCAL_FIRST' : 'ASK_USER';
    if (epistemic > 0.4) return 'SHOW_PREVIEW';
    return 'EXECUTE';
  }

  private static probeContext(): DecisionContext { return { operation: '', intent: '', goal: '', deviceClass: '', platform: '', projectType: '', privacyMode: 'STANDARD', budget: 1, latencyTarget: 1, qualityTarget: 0.5 }; }
  private static probeCandidate(): DecisionCandidate { return { id: '', executionTarget: 'LOCAL', model: '', provider: '', runtime: '', estimatedQuality: 0.5, estimatedLatency: 1, estimatedCost: 0, energy: 0, memory: 0, reliability: 0.5 }; }
}

export type V2PredictionOptions = Readonly<{
  history?: Partial<DecisionHistoryFeatures>;
  recentOutcomes?: readonly RelevantOutcome[];
  preferences?: Partial<UserPreferenceSignals>;
  constraints?: DecisionConstraints;
}>;
