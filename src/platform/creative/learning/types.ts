export type ScopeKind = 'USER' | 'PROJECT' | 'TENANT' | 'GLOBAL_AGGREGATE';
export type UserReaction = 'ACCEPTED' | 'REJECTED' | 'UNDO' | 'CORRECTED' | 'RETRIED' | 'REPEATED_EDIT' | 'CANCELLED' | 'NO_REACTION';
export type ValidationStatus = 'VALID' | 'REJECTED_FROM_LEARNING';
export type QueueState = 'NEW' | 'SELECTED' | 'IN_TRAINING' | 'EVALUATED' | 'REJECTED' | 'PROMOTED' | 'ARCHIVED';
export type DatasetSplit = 'TRAIN' | 'VALIDATION' | 'TEST';
export type PromotionRecommendation = 'PROMOTE' | 'HOLD' | 'REJECT';

export interface Scope { tenantId: string; projectId: string; userId: string; kind?: ScopeKind }
export interface PredictionSnapshot { predictedQuality: number; predictedAcceptance: number; predictedCost: number; predictedLatency: number; predictedSuccess: number; predictedEscalation: number; predictedSatisfaction: number; modelVersion: string; policyVersion: string; featureSchemaVersion: string }
export interface ActualOutcome { actualQuality: number; actualLatency: number; actualCost: number; actualSuccess: boolean | number; actualAcceptance: boolean | number; actualSatisfaction: number; actualEscalation: boolean | number; actualFallbacks: number; actualRetries: number }
export interface OutcomeError { qualityError: number; costError: number; latencyError: number; successError: number; acceptanceError: number; satisfactionError: number; escalationError: number }
export interface Candidate { candidateId: string; model?: string; provider?: string; predictedQuality?: number; predictedCost?: number; predictedLatency?: number; observedQuality?: number; observedCost?: number; observedLatency?: number; observedSatisfaction?: number; [key: string]: unknown }
export interface CreativeOutcome {
  requestId: string; executionId: string; operationId: string; decisionId: string; planId: string; strategyId: string; outcomeVersion: string;
  scope: Scope; target: string; model: string; provider: string; device: { class: string; [key: string]: unknown };
  predictions: PredictionSnapshot; actuals: ActualOutcome; verification: { valid: boolean; artifactIntegrityValid: boolean; [key: string]: unknown };
  billing: { state: string; actualCost?: number; [key: string]: unknown }; userReaction: UserReaction; candidateSet: Candidate[]; selectedCandidateId: string;
  occurredAt: string; completedAt: string; context?: Record<string, unknown>; goal?: Record<string, unknown> | string; operationFeatures?: Record<string, unknown>;
  sanitizedIntent?: string; structuredVisualRepresentation?: Record<string, unknown>; preferenceSignals?: Record<string, number>; domain?: string;
}
export interface ValidationResult { status: ValidationStatus; valid: boolean; reasons: string[] }
export interface Regret { total: number; qualityDelta: number; costDelta: number; latencyDelta: number; satisfactionDelta: number; chosenCandidate: string; bestObservedAlternative?: string }
export interface TrainingLabels { quality: number; success: number; acceptance: number; cost: number; latency: number; satisfaction: number; escalation: number; regret: number }
export interface EconomicOutcome { actualCost: number; costEfficiency: number; billingState: string }
export interface ModelLineage { featureSchemaVersion: string; rewardSchemaVersion: string; trainingConfigVersion: string; parentModelVersion?: string }
export interface CreativeLearningRecord { recordId: string; identity: string; outcomeVersion: string; scope: Scope; context: Record<string, unknown>; goal: Record<string, unknown> | string; operation: { operationId: string; features: Record<string, unknown> }; candidateSet: Candidate[]; selectedCandidate: Candidate; predictions: PredictionSnapshot; actualOutcome: ActualOutcome; predictionError: OutcomeError; userReaction: UserReaction; economicOutcome: EconomicOutcome; deviceContext: Record<string, unknown>; modelVersions: string[]; policyVersions: string[]; labels: TrainingLabels; reward: VersionedReward; regret: Regret; occurredAt: string; domain?: string }
export interface VersionedReward { reward: number; rewardSchemaVersion: string; components: Record<string, number> }
export interface DatasetMetadata { datasetId: string; version: string; featureSchemaVersion: string; sourcePeriod: { from: string; to: string }; sampleCount: number; scopePolicy: ScopeKind; createdAt: string; parentDataset?: string }
export interface DatasetSnapshot { metadata: DatasetMetadata; records: readonly CreativeLearningRecord[] }
export interface DatasetQualityReport { missingFeatures: number; duplicateRate: number; labelConsistency: number; scopeViolations: number; predictionCoverage: number; classDistribution: Record<string, number>; deviceDistribution: Record<string, number>; operationDistribution: Record<string, number>; domainDistribution: Record<string, number> }
