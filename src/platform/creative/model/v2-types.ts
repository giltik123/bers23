import type {
  ActualOutcome,
  DecisionCandidate,
  DecisionConstraints,
  DecisionContext,
  DecisionHistoryFeatures,
  DecisionPrediction,
  DecisionPredictions,
  ModelMetadata,
  UtilityPolicy,
} from './types';

export const V2_HEAD_NAMES = [
  'quality',
  'successProbability',
  'acceptanceProbability',
  'cost',
  'latency',
  'escalationProbability',
  'satisfaction',
  'regret',
] as const;

export type V2HeadName = (typeof V2_HEAD_NAMES)[number];

export interface UserPreferenceSignals {
  readonly localPreference: number;
  readonly qualityPreference: number;
  readonly speedPreference: number;
  readonly costSensitivity: number;
  readonly styleAlignment: number;
}

/** Deliberately limited outcome context; it contains no prompts or user content. */
export interface RelevantOutcome {
  readonly operation: string;
  readonly deviceClass: string;
  readonly model: string;
  readonly provider: string;
  readonly target: string;
  readonly success: boolean;
  readonly accepted: boolean;
  readonly quality: number;
  readonly latency: number;
  readonly cost: number;
  readonly timestamp: number;
}

export interface DecisionRepresentationInput {
  readonly context: DecisionContext;
  readonly candidate: DecisionCandidate;
  readonly history?: Partial<DecisionHistoryFeatures>;
  readonly recentOutcomes?: readonly RelevantOutcome[];
  readonly preferences?: Partial<UserPreferenceSignals>;
  readonly constraints?: DecisionConstraints;
  readonly imageSize?: Readonly<{ width: number; height: number }>;
}

export interface DecisionRepresentation {
  readonly encoderVersion: string;
  readonly featureSchemaVersion: string;
  readonly values: readonly number[];
  readonly blocks: Readonly<Record<string, readonly number[]>>;
  readonly interactions: Readonly<Record<string, number>>;
  readonly coverage: number;
  readonly coldStartReasons: readonly ColdStartReason[];
}

export type ColdStartReason = 'NEW_DEVICE' | 'NEW_OPERATION' | 'NEW_MODEL' | 'NEW_PROVIDER';

export interface V2Predictions extends DecisionPredictions {
  readonly satisfaction: number;
  readonly regret: number;
}

export interface UncertaintyV2 {
  readonly aleatoric: number;
  readonly epistemic: number;
  readonly dataCoverage: number;
  readonly oodScore: number;
  readonly predictionConfidence: number;
}

export interface HeadCalibration {
  readonly quality: number;
  readonly acceptance: number;
  readonly cost: number;
  readonly latency: number;
  readonly utility: number;
  readonly reliabilityCurve: readonly Readonly<{ predicted: number; observed: number; count: number }>[];
  readonly version: string;
}

export interface V2DecisionPrediction extends Omit<DecisionPrediction, 'outcomes'> {
  readonly outcomes: V2Predictions;
  readonly uncertaintyV2: UncertaintyV2;
  readonly calibrationV2: HeadCalibration;
  readonly representation: DecisionRepresentation;
}

export interface PairwiseExample {
  readonly context: DecisionContext;
  readonly preferred: DecisionCandidate;
  readonly other: DecisionCandidate;
  readonly preferredOutcome?: ActualOutcome;
  readonly otherOutcome?: ActualOutcome;
  readonly source: 'OUTCOME' | 'HUMAN_PREFERENCE';
  readonly weight?: number;
}

export interface PairwiseResult {
  readonly preferred: DecisionCandidate;
  readonly other: DecisionCandidate;
  readonly probabilityPreferred: number;
  readonly margin: number;
  readonly reason: string;
}

export interface ListwiseExample {
  readonly context: DecisionContext;
  readonly candidates: readonly DecisionCandidate[];
  readonly relevance: readonly number[];
}

export interface NeuralDecisionRanker {
  score(representation: RankerRepresentation): number;
  compare(a: RankerRepresentation, b: RankerRepresentation): number;
  trainPairwise(examples: readonly Readonly<{ preferred: RankerRepresentation; other: RankerRepresentation; weight?: number }>[]): void;
  trainListwise(examples: readonly Readonly<{ representations: readonly RankerRepresentation[]; relevance: readonly number[] }>[]): void;
  version(): string;
  snapshot(): Readonly<{ version: string; weights: readonly number[]; bias: number }>;
}

export interface RankerRepresentation { readonly values: readonly number[] }

export interface CounterfactualResult {
  readonly selected: V2DecisionPrediction;
  readonly alternative: V2DecisionPrediction;
  readonly utilityDelta: number;
  readonly outcomeDeltas: Readonly<Record<keyof V2Predictions, number>>;
  readonly constraintsChanged: readonly string[];
}

export interface V2ModelMetadata extends ModelMetadata {
  readonly encoderVersion: string;
  readonly calibrationVersion: string;
  readonly benchmarkVersion: string;
}

export interface DistilledModelArtifact {
  readonly teacherVersion: string;
  readonly studentVersion: string;
  readonly samples: number;
  readonly fidelity: number;
  readonly weights: readonly number[];
  readonly createdAt: number;
}

export interface V2UtilityPolicy extends UtilityPolicy {
  readonly satisfaction: number;
  readonly regret: number;
}
