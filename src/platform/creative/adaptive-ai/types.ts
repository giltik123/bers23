import type { PrivacyMode, Scope } from '../local-ai';
import type { DeviceClassLabel, ModelBundle } from '../model-distribution';

export type ExecutionTarget = 'LOCAL' | 'CLOUD' | 'HYBRID';
export type ExplorationMode = 'EXPLOIT' | 'EXPLORE' | 'BALANCED';
export type PolicyStatus = 'CANARY' | 'ACTIVE' | 'DEPRECATED' | 'REJECTED' | 'ROLLED_BACK';
export type Runtime = 'WEBGPU' | 'WASM' | 'CUDA' | 'METAL' | 'NNAPI' | 'CPU' | string;

export type MatrixKey = Readonly<{
  deviceClass: DeviceClassLabel;
  operation: string;
  modelId: string;
  runtime: Runtime;
}>;

export type Prediction = Readonly<{
  quality: number;
  latencyMs: number;
  cost: number;
  successProbability: number;
  energy: number;
}>;

export type ExecutionObservation = Readonly<{
  observationId: string;
  scope: Scope;
  key: MatrixKey;
  target: ExecutionTarget;
  phase: 'PREVIEW' | 'FINAL';
  prediction: Prediction;
  actual: Readonly<{
    quality: number;
    latencyMs: number;
    cost: number;
    success: boolean;
    energy: number;
    memoryMb: number;
    cloudSavings: number;
    fallbackUsed: boolean;
    accepted: boolean;
  }>;
  at: number;
}>;

export type PredictionError = Readonly<{
  quality: number;
  latencyMs: number;
  cost: number;
  success: number;
  energy: number;
  absoluteMean: number;
}>;

export type EvaluatedOutcome = Readonly<{
  observation: ExecutionObservation;
  error: PredictionError;
  utility: number;
}>;

export type MatrixEntry = MatrixKey & Readonly<{
  quality: number;
  latencyMs: number;
  successRate: number;
  energy: number;
  memoryMb: number;
  cloudSavings: number;
  fallbackRate: number;
  acceptanceRate: number;
  confidence: number;
  variance: number;
  stability: number;
  sampleCount: number;
  effectiveSampleCount: number;
  updatedAt: number;
}>;

export type AdaptivePolicy = Readonly<{
  localQualityThreshold: number;
  escalationThreshold: number;
  deviceTierThreshold: number;
  previewTarget: ExecutionTarget;
  finalTarget: ExecutionTarget;
  bundlePriority: readonly string[];
  modelRanking: readonly string[];
}>;

export type PolicyVersion = Readonly<{
  policyId: string;
  version: number;
  parentVersion: number | null;
  status: PolicyStatus;
  policy: AdaptivePolicy;
  reason: string;
  evidenceCount: number;
  expectedImpact: number;
  createdAt: number;
}>;

export type PolicyChange = Readonly<{
  oldPolicy: AdaptivePolicy;
  newPolicy: AdaptivePolicy;
  reason: string;
  evidenceCount: number;
  expectedImpact: number;
  version: PolicyVersion;
}>;

export type Experiment = Readonly<{
  experimentId: string;
  policyA: number;
  policyB: number;
  samplesA: number;
  samplesB: number;
  utilityA: number;
  utilityB: number;
  status: 'RUNNING' | 'COMPLETED';
}>;

export type CalibrationState = Readonly<{
  qualityBias: number;
  latencyMultiplier: number;
  energyMultiplier: number;
  sampleCount: number;
}>;

export type LearningConfig = Readonly<{
  minimumEvidence: number;
  activationEvidence: number;
  maximumVariance: number;
  decayHalfLifeMs: number;
  explorationRate: number;
  canaryShare: number;
  rollbackQualityDrop: number;
  rollbackLatencyIncrease: number;
  rollbackCostIncrease: number;
  rollbackFallbackIncrease: number;
}>;

export type Recommendation = Readonly<{
  key: MatrixKey;
  target: ExecutionTarget;
  phase: 'PREVIEW' | 'FINAL';
  score: number;
  confidence: number;
  exploration: boolean;
  policyVersion: number;
  explanation: readonly string[];
}>;

export type RecommendationCandidate = Readonly<{
  key: MatrixKey;
  target: ExecutionTarget;
  trustedModel: boolean;
  runtimeAllowed: boolean;
  quarantined: boolean;
  outboundNetworkRequired: boolean;
}>;

export type RecommendationRequest = Readonly<{
  scope: Scope;
  phase: 'PREVIEW' | 'FINAL';
  mode: ExplorationMode;
  candidates: readonly RecommendationCandidate[];
  cloudAllowed: boolean;
  outboundNetworkAllowed: boolean;
}>;

export type SimulationResult = Readonly<{
  runs: number;
  averageUtility: number;
  predictedCloudSavings: number;
  recommended: Recommendation;
}>;

export type CreativeAdaptiveSnapshot = Readonly<{
  scope: Scope;
  deviceMatrix: readonly MatrixEntry[];
  modelRankings: Readonly<Record<string, readonly string[]>>;
  policyVersions: readonly PolicyVersion[];
  experiments: readonly Experiment[];
  calibration: CalibrationState;
  confidence: number;
  learningStatistics: Readonly<{ observations: number; evaluated: number; adaptations: number }>;
  activeCanaries: readonly PolicyVersion[];
  rollbackHistory: readonly PolicyVersion[];
  timeline: readonly Readonly<{ sequence: number; at: number; event: string }>[];
}>;

export interface AdaptivePolicyModel { propose(current: AdaptivePolicy, evidence: readonly MatrixEntry[]): AdaptivePolicy; }
export interface OutcomePredictor { predict(key: MatrixKey, entry?: MatrixEntry): Prediction; }
export interface PolicyEvaluator { evaluate(observation: ExecutionObservation): EvaluatedOutcome; }
export interface PolicyTrainer { train(current: AdaptivePolicy, evidence: readonly MatrixEntry[]): AdaptivePolicy; }
export interface ModelRanker { rank(entries: readonly MatrixEntry[]): readonly MatrixEntry[]; }
export interface ExplorationPolicy { explore(mode: ExplorationMode, sample: number, rate: number): boolean; }
export interface CalibrationModel { calibrate(prediction: Prediction, state: CalibrationState): Prediction; update(state: CalibrationState, outcome: EvaluatedOutcome): CalibrationState; }
export interface AdaptivePorts { now(): number; random(): number; }

export type AdaptiveOptions = Readonly<{
  scope: Scope;
  privacyMode: PrivacyMode;
  config?: Partial<LearningConfig>;
  initialPolicy?: Partial<AdaptivePolicy>;
  policyModel?: AdaptivePolicyModel;
  predictor?: OutcomePredictor;
  evaluator?: PolicyEvaluator;
  trainer?: PolicyTrainer;
  ranker?: ModelRanker;
  exploration?: ExplorationPolicy;
  calibration?: CalibrationModel;
}>;

export type BundleAdaptation = Readonly<{ original: ModelBundle; recommendedModelIds: readonly string[]; redundantModelIds: readonly string[]; reason: string }>;
