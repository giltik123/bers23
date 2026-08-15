import { DecisionModelV2 } from './DecisionModelV2';
import { MultimodalFusionV3 } from './MultimodalFusionV3';
import { CompactNeuralDecisionRanker } from './NeuralDecisionRanker';
import { clamp, immutable, round } from './immutable';
import { decisionConstraintExclusions } from './TabularDecisionModelV1';
import { OperationNeedPredictor, VisualGoalAlignmentEngine, VisualQualityHead } from './VisualDecisionHeads';
import type { DecisionCandidate } from './types';
import type { MultimodalDecisionInput, MultimodalDecisionPrediction, VisualCounterfactualResult, VisualQualityPrediction } from './visual-types';

export interface MultimodalModelConfig {
  readonly decisionModel?: DecisionModelV2;
  readonly fusion?: MultimodalFusionV3;
  readonly ranker?: CompactNeuralDecisionRanker;
  readonly criticalVisualUncertainty?: number;
}

export class MultimodalDecisionModel {
  readonly version = 'multimodal-decision-model-v2.1';
  private readonly decisionModel: DecisionModelV2;
  private readonly fusion: MultimodalFusionV3;
  private readonly ranker: CompactNeuralDecisionRanker;
  private readonly qualityHead = new VisualQualityHead();
  private readonly alignmentEngine = new VisualGoalAlignmentEngine();
  private readonly needPredictor = new OperationNeedPredictor();
  private readonly criticalVisualUncertainty: number;

  constructor(config: MultimodalModelConfig = {}) {
    this.decisionModel = config.decisionModel ?? new DecisionModelV2();
    this.fusion = config.fusion ?? new MultimodalFusionV3();
    const probeVisual = immutable({ schemaVersion: 'probe', encoderVersion: 'probe', source: 'LOCAL' as const, width: 1, height: 1,
      values: Array(26).fill(0), observations: immutable({ composition: 0.5, subjectCount: 0, facePresence: 0, objectClasses: [], lighting: 'BALANCED' as const,
        colorDistribution: Array(12).fill(0), backgroundComplexity: 0.5, estimatedQuality: 0.5, depthCues: 0.5, segmentationComplexity: 0.5, visualStyle: 'UNKNOWN' as const, requestedStyleSimilarity: 0.5 }),
      privacy: immutable({ rawImageRetained: false as const, rawImageTransmitted: false as const, featureOnly: true as const }) });
    const probe = this.fusion.encode({ context: { operation: '', intent: '', goal: '', deviceClass: '', platform: '', projectType: '', privacyMode: 'STANDARD', budget: 1, latencyTarget: 1, qualityTarget: 0.5 },
      candidate: { id: '', executionTarget: 'LOCAL', model: '', provider: '', runtime: '', estimatedQuality: 0.5, estimatedLatency: 1, estimatedCost: 0, energy: 0, memory: 0, reliability: 0.5 }, visual: probeVisual });
    this.ranker = config.ranker ?? new CompactNeuralDecisionRanker({ inputSize: probe.values.length, version: 'multimodal-neural-ranker-v1' });
    this.criticalVisualUncertainty = config.criticalVisualUncertainty ?? 0.7;
  }

  encode(input: MultimodalDecisionInput) { return this.fusion.encode(input); }

  predict(input: MultimodalDecisionInput): MultimodalDecisionPrediction {
    const representationV3 = this.fusion.encode(input);
    const base = this.decisionModel.predict(input);
    const visualQuality = this.qualityHead.predict(input.visual);
    const goalAlignment = this.alignmentEngine.align(input.context, input.visual);
    const operationNeed = this.needPredictor.predict(input.context, input.visual, goalAlignment);
    const exclusions = [...decisionConstraintExclusions(input.candidate, input.context, input.constraints ?? {})];
    if (input.context.privacyMode === 'LOCAL_ONLY' && input.visual.source === 'CLOUD') exclusions.push('CLOUD_VISUAL_FEATURES_FORBIDDEN');
    const neuralScore = this.ranker.score(representationV3);
    const visualUtility = Object.values(visualQuality).reduce((sum, value) => sum + value, 0) / 4;
    const utility = exclusions.length ? -1 : round(base.expectedUtility * 0.65 + visualUtility * 0.15 + goalAlignment.similarity * 0.12 + Math.tanh(neuralScore) * 0.04 - operationNeed.unnecessaryAIProbability * 0.08);
    const visualUncertainty = round(clamp((1 - representationV3.coverage) * 0.55 + (1 - input.visual.observations.estimatedQuality) * 0.45));
    const action = exclusions.length || visualUncertainty >= this.criticalVisualUncertainty ? 'FALLBACK_TO_HEURISTIC' : base.action;
    return immutable({ ...base, expectedUtility: utility, action, uncertainty: Math.max(base.uncertainty, visualUncertainty),
      predictionConfidence: round(Math.min(base.predictionConfidence, 1 - visualUncertainty)), ood: base.ood || visualUncertainty >= this.criticalVisualUncertainty,
      representationV3, visualQuality, goalAlignment, operationNeed,
      explanation: immutable({ ...base.explanation, candidateScores: immutable({ ...base.explanation.candidateScores, multimodalRank: neuralScore, visualUtility }),
        constraintExclusions: immutable(exclusions), finalUtility: utility,
        topInfluentialFeatures: immutable([...base.explanation.topInfluentialFeatures, ...Object.entries(representationV3.crossModalInteractions).map(([feature, contribution]) => ({ feature, contribution: Math.abs(contribution) }))].sort((a, b) => b.contribution - a.contribution).slice(0, 8)) }),
    });
  }

  rank(input: Omit<MultimodalDecisionInput, 'candidate'>, candidates: readonly DecisionCandidate[]): readonly MultimodalDecisionPrediction[] {
    return immutable(candidates.map((candidate) => this.predict({ ...input, candidate })).sort((a, b) => b.expectedUtility - a.expectedUtility || a.candidate.id.localeCompare(b.candidate.id)));
  }

  counterfactual(current: MultimodalDecisionInput, alternative: DecisionCandidate): VisualCounterfactualResult {
    const currentPrediction = this.predict(current);
    const alternativePrediction = this.predict({ ...current, candidate: alternative });
    const keys = Object.keys(currentPrediction.visualQuality) as (keyof VisualQualityPrediction)[];
    const delta = Object.fromEntries(keys.map((key) => [key, round(alternativePrediction.visualQuality[key] - currentPrediction.visualQuality[key])])) as Record<keyof VisualQualityPrediction, number>;
    const noAI = Math.max(currentPrediction.operationNeed.unnecessaryAIProbability, alternativePrediction.operationNeed.unnecessaryAIProbability) > 0.65;
    return immutable({ current: currentPrediction, alternative: alternativePrediction, utilityDelta: round(alternativePrediction.expectedUtility - currentPrediction.expectedUtility),
      visualQualityDelta: immutable(delta), recommended: noAI ? 'NO_AI' : alternativePrediction.expectedUtility > currentPrediction.expectedUtility ? 'ALTERNATIVE' : 'CURRENT' });
  }
}
