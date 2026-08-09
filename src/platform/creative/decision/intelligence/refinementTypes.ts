import type { AdvancedDecisionCandidate, DecisionDatasetRecord, DecisionFeatures, ScoredStrategy } from "./advancedTypes";

export interface DecomposedIntent {
  readonly primaryIntent: string;
  readonly secondaryIntents: readonly string[];
  readonly creativeGoals: readonly string[];
  readonly operations: readonly string[];
  readonly confidence: number;
}
export interface GoalSatisfaction { readonly current: number; readonly predicted: number; readonly improvement: number; readonly matchedGoals: readonly string[] }
export interface SemanticOperationNode { readonly operation: string; readonly dependsOn: readonly string[]; readonly affects: readonly string[] }
export interface SemanticOperationGraph { readonly nodes: readonly SemanticOperationNode[]; readonly executionOrder: readonly string[] }
export interface SynergyResult { readonly baseGain: number; readonly synergyBonus: number; readonly totalGain: number; readonly combinations: readonly string[] }
export interface DecisionConflict { readonly id: string; readonly severity: "WARNING" | "BLOCKING"; readonly goals: readonly string[]; readonly message: string }
export interface DecisionOpportunity { readonly id: string; readonly operation: string; readonly expectedGain: number; readonly additionalCredits: number; readonly reason: string }
export interface CostCurvePoint { readonly credits: number; readonly quality: number }
export interface MarginalUtilityPoint extends CostCurvePoint { readonly marginalQualityPerCredit: number; readonly worthwhile: boolean }
export interface CostCurveAnalysis { readonly points: readonly MarginalUtilityPoint[]; readonly recommendedCredits: number; readonly reason: string }
export interface DiminishingReturnsResult { readonly currentQuality: number; readonly effectiveGain: number; readonly returnRate: number; readonly diminishing: boolean }
export interface ProviderIndependenceResult { readonly score: number; readonly portableOperations: readonly string[]; readonly restrictedOperations: readonly string[] }
export interface DecisionStory { readonly headline: string; readonly steps: readonly string[]; readonly userMessage: string }
export interface StabilityResult { readonly score: number; readonly stable: boolean; readonly changedOperations: readonly string[] }
export interface ConfidenceBandResult { readonly band: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH"; readonly interval: readonly [number, number]; readonly calibrated: number }
export type TraceCompressionMode = "VERBOSE" | "COMPACT" | "MINIMAL";
export interface CompressedTrace { readonly mode: TraceCompressionMode; readonly lines: readonly string[] }
export interface MLTrainingExample { readonly features: DecisionFeatures; readonly decision: string; readonly outcome: Readonly<{ accepted: boolean; rejected: boolean; undo: boolean; quality: number; credits: number; executionTimeMs: number }> }
export interface CounterfactualReason { readonly mode: "LOCAL" | "HYBRID" | "AI"; readonly selected: boolean; readonly reason: string; readonly tradeoff: string }
export interface PreferenceEvidence { readonly value: string; readonly confidence: number; readonly evidenceCount: number }
export interface ReliablePreference { readonly value: string; readonly reliability: number; readonly usable: boolean }
export interface DecisionHealth { readonly score: number; readonly grade: "POOR" | "FAIR" | "GOOD" | "EXCELLENT"; readonly dimensions: Readonly<{ stability: number; risk: number; explainability: number; cost: number; quality: number; history: number }>; readonly warnings: readonly string[] }
export interface DecisionTraceInput { readonly prompt: string; readonly intent: string; readonly candidates: number; readonly selected: string; readonly explanation: string; readonly confidence: number; readonly quality: number; readonly credits: number }
export interface TrainingFeatureExtractor { extract(prompt: string, intent?: string): DecisionFeatures }
export interface DiversityResult { readonly selected: readonly ScoredStrategy[]; readonly averageDiversity: number }
export interface CounterfactualInput { readonly selected: AdvancedDecisionCandidate; readonly alternatives: readonly AdvancedDecisionCandidate[]; readonly localQualitySufficient: boolean; readonly budget: number }
export type TrainingRecord = DecisionDatasetRecord;
