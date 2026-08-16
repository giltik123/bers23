import type { DecisionCandidateV1, DecisionContextV1, DecisionDatasetRecord, DecisionFeaturesV1, DecisionHistoryV1, MultiHeadPrediction, RankedDecisionCandidate, UncertaintyAction, UtilityPolicy } from './types';

export const REPRESENTATION_SCHEMA_VERSION_V2 = 'decision-representation-v2';
export type ModelLifecycleV2 = 'TRAINING' | 'VALIDATING' | 'SHADOW' | 'CANARY' | 'ACTIVE' | 'DEGRADED' | 'ROLLBACK' | 'RETIRED';
export interface HistoricalOutcomeV2 { operation: string; deviceClass: string; model: string; provider: string; target: DecisionCandidateV1['executionTarget']; quality: number; accepted: boolean; satisfaction: number; cost: number; latency: number; timestamp: number }
export interface UserPreferenceSignalsV2 { qualityBias: number; speedBias: number; costBias: number; localBias: number; styleAlignment: number; correctionRate: number; repeatedEditRate: number }
export interface DeviceProfileV2 { deviceId?: string; deviceClass: string; runtime: string; memoryMb: number; imageMegapixels: number; computeScore: number; thermalPressure: number; isNew: boolean }
export interface DecisionInputV2 extends DecisionFeaturesV1 { recentOutcomes?: readonly HistoricalOutcomeV2[]; preferences?: Partial<UserPreferenceSignalsV2>; device?: Partial<DeviceProfileV2> }
export interface RepresentationBlockV2 { name: 'context' | 'candidate' | 'history' | 'device' | 'goal' | 'constraint' | 'sequence' | 'preference' | 'interaction'; values: readonly number[] }
export interface DecisionRepresentationV2 { schemaVersion: typeof REPRESENTATION_SCHEMA_VERSION_V2; encoderVersion: string; blocks: readonly RepresentationBlockV2[]; values: readonly number[]; coverage: number; coldStart: boolean; unknowns: readonly string[] }
export interface UncertaintyV2 { aleatoric: number; epistemic: number; dataCoverage: number; oodScore: number; predictionConfidence: number; critical: boolean; action: UncertaintyAction | 'SAFE_LOCAL' }
export interface CalibrationHeadsV2 { quality: number; acceptance: number; cost: number; latency: number; utility: number }
export interface MultiTaskPredictionV2 extends MultiHeadPrediction { satisfaction: number; regret: number; uncertaintyV2: UncertaintyV2; calibrationHeads: CalibrationHeadsV2 }
export interface PairwiseExampleV2 { context: DecisionContextV1; left: DecisionInputV2; right: DecisionInputV2; preferred: 'LEFT' | 'RIGHT' | 'TIE'; source: 'OUTCOME' | 'HUMAN_PREFERENCE' | 'COUNTERFACTUAL'; weight: number }
export interface PairwisePredictionV2 { preferred: 'LEFT' | 'RIGHT' | 'TIE'; leftProbability: number; rightProbability: number; margin: number; confidence: number }
export interface ListwiseExampleV2 { context: DecisionContextV1; candidates: readonly DecisionInputV2[]; relevance: readonly number[] }
export interface CounterfactualResultV2 { chosen: MultiTaskPredictionV2; alternative: MultiTaskPredictionV2; utilityDelta: number; qualityDelta: number; costDelta: number; latencyDelta: number; acceptanceDelta: number; recommendation: string }
export interface DatasetLineageV2 { datasetVersion: string; featureSchemaVersion: string; encoderVersion: string; trainingConfigVersion: string; modelVersion: string; calibrationVersion: string; benchmarkVersion: string; parentModel: string | null; createdAt: number; anonymized: boolean }
export interface BenchmarkMetricsV2 { decisionRegret: number; acceptance: number; satisfaction: number; cloudAvoidance: number; cost: number; latency: number; quality: number; stability: number; oodSafety: number; calibration: number; rankingQuality: number; unnecessaryAI: number; securityViolations: number }
export interface NeuralDecisionRanker { encode(input: DecisionInputV2): DecisionRepresentationV2; predict(input: DecisionInputV2, policy?: Partial<UtilityPolicy>): MultiTaskPredictionV2; rankPairwise(left: DecisionInputV2, right: DecisionInputV2): PairwisePredictionV2; predictList(inputs: readonly DecisionInputV2[], policy?: Partial<UtilityPolicy>): readonly RankedDecisionCandidate[]; counterfactual(chosen: DecisionInputV2, alternative: DecisionInputV2): CounterfactualResultV2; version(): string }
export interface DistilledModelV2 { teacherVersion: string; student: NeuralDecisionRanker; sampleCount: number; fidelity: number }
export interface CalibrationDatasetV2 { records: readonly DecisionDatasetRecord[]; version: string }
export interface PromotionEvidenceV2 { candidate: BenchmarkMetricsV2; baseline: BenchmarkMetricsV2; privacyInvariant: boolean; securityInvariant: boolean }
export const DEFAULT_HISTORY_V2: DecisionHistoryV1 = Object.freeze({ modelSuccessRate: .5, providerSuccessRate: .5, deviceSpecificSuccessRate: .5, cloudAvoidance: .5, acceptanceRate: .5, undoRate: 0 });
