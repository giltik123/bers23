import type { DecisionCandidate, DecisionConstraints, DecisionContext, DecisionHistoryFeatures } from './types';
import type { RelevantOutcome, UserPreferenceSignals, V2DecisionPrediction } from './v2-types';

export const VISUAL_FEATURE_SCHEMA_VERSION = 'visual-features-v1';
export const DECISION_REPRESENTATION_V3_VERSION = 'decision-representation-v3.0';

export type LightingClass = 'DARK' | 'BALANCED' | 'BRIGHT' | 'HIGH_CONTRAST';
export type VisualStyle = 'NATURAL' | 'LUXURY' | 'EDITORIAL' | 'CATALOG' | 'CINEMATIC' | 'MINIMAL' | 'UNKNOWN';
export type VisualOperation = 'SEGMENTATION' | 'RELIGHTING' | 'UPSCALE' | 'BACKGROUND_REPLACEMENT' | 'GENERATION';

/** Pixels are accepted only at the local trust boundary and are never retained. */
export interface LocalImageInput {
  readonly width: number;
  readonly height: number;
  readonly rgba?: Uint8Array | Uint8ClampedArray;
  readonly observations?: Partial<VisualObservations>;
}

export interface VisualObservations {
  readonly composition: number;
  readonly subjectCount: number;
  readonly facePresence: number;
  readonly objectClasses: readonly string[];
  readonly lighting: LightingClass;
  readonly colorDistribution: readonly number[];
  readonly backgroundComplexity: number;
  readonly estimatedQuality: number;
  readonly depthCues: number;
  readonly segmentationComplexity: number;
  readonly visualStyle: VisualStyle;
  readonly requestedStyleSimilarity: number;
}

export interface VisualRepresentation {
  readonly schemaVersion: string;
  readonly encoderVersion: string;
  readonly source: 'LOCAL' | 'CLOUD';
  readonly width: number;
  readonly height: number;
  readonly values: readonly number[];
  readonly observations: Readonly<VisualObservations>;
  readonly privacy: Readonly<{ rawImageRetained: false; rawImageTransmitted: false; featureOnly: true }>;
}

/** Cloud analysis receives only the local structured representation, never image bytes. */
export interface CloudVisualFeatureRequest {
  readonly localRepresentation: VisualRepresentation;
  readonly requestedStyle?: string;
  readonly allowedObjectVocabulary?: readonly string[];
}

export interface MultimodalDecisionInput {
  readonly context: DecisionContext;
  readonly candidate: DecisionCandidate;
  readonly visual: VisualRepresentation;
  readonly history?: Partial<DecisionHistoryFeatures>;
  readonly recentOutcomes?: readonly RelevantOutcome[];
  readonly preferences?: Partial<UserPreferenceSignals>;
  readonly constraints?: DecisionConstraints;
}

export interface DecisionRepresentationV3 {
  readonly version: string;
  readonly values: readonly number[];
  readonly decisionValues: readonly number[];
  readonly visualValues: readonly number[];
  readonly crossModalInteractions: Readonly<Record<string, number>>;
  readonly visual: VisualRepresentation;
  readonly coverage: number;
}

export interface VisualQualityPrediction {
  readonly technicalQuality: number;
  readonly visualCoherence: number;
  readonly identityPreservation: number;
  readonly compositionQuality: number;
}

export interface VisualGoalAlignment {
  readonly desiredStyle: VisualStyle;
  readonly currentStyle: VisualStyle;
  readonly similarity: number;
  readonly gap: number;
  readonly reasons: readonly string[];
}

export interface OperationNeed {
  readonly operation: VisualOperation;
  readonly probability: number;
  readonly needed: boolean;
  readonly reason: string;
}

export interface OperationNeedPrediction {
  readonly operations: readonly OperationNeed[];
  readonly unnecessaryAIProbability: number;
  readonly recommendedAction: 'NO_AI' | 'LOCAL_EDIT' | 'MODEL_RANKING';
}

export interface MultimodalDecisionPrediction extends V2DecisionPrediction {
  readonly representationV3: DecisionRepresentationV3;
  readonly visualQuality: VisualQualityPrediction;
  readonly goalAlignment: VisualGoalAlignment;
  readonly operationNeed: OperationNeedPrediction;
}

export interface VisualCounterfactualResult {
  readonly current: MultimodalDecisionPrediction;
  readonly alternative: MultimodalDecisionPrediction;
  readonly utilityDelta: number;
  readonly visualQualityDelta: Readonly<Record<keyof VisualQualityPrediction, number>>;
  readonly recommended: 'CURRENT' | 'ALTERNATIVE' | 'NO_AI';
}

export interface VisualFeatureEncoder<Input> {
  readonly version: string;
  encode(input: Input): VisualRepresentation;
}
