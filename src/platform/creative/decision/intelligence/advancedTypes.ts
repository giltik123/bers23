import type { CandidateMode, DecisionCandidate, DecisionIntelligenceContext } from "./types";

export type StrategyProfileName = "ECONOMY" | "BALANCED" | "PROFESSIONAL" | "CREATIVE" | "MAXIMUM_QUALITY" | "MAXIMUM_SPEED" | "EXPERIMENTAL";

export interface ScoringProfile {
  readonly name: StrategyProfileName;
  readonly qualityWeight: number;
  readonly speedWeight: number;
  readonly costWeight: number;
  readonly creativityWeight: number;
  readonly preferenceWeight: number;
  readonly riskWeight: number;
  readonly successWeight: number;
}

export interface AdvancedDecisionCandidate extends DecisionCandidate {
  readonly strategy: string;
  readonly creativity: number;
  readonly risk: number;
  readonly latency: number;
  readonly parentId?: string;
}

export interface CandidateObjectives {
  readonly quality: number;
  readonly credits: number;
  readonly latency: number;
  readonly probability: number;
  readonly preference: number;
  readonly creativity: number;
  readonly risk: number;
}

export interface ScoredStrategy {
  readonly candidate: AdvancedDecisionCandidate;
  readonly objectives: CandidateObjectives;
  readonly utility: number;
}

export interface DecisionScoringModel {
  evaluate(candidate: AdvancedDecisionCandidate, context: DecisionIntelligenceContext, profile: ScoringProfile): ScoredStrategy;
}

export interface StrategyTreeNode {
  readonly id: string;
  readonly label: string;
  readonly mode?: CandidateMode;
  readonly candidateId?: string;
  readonly children: readonly StrategyTreeNode[];
}

export interface ParetoOptimizationResult {
  readonly frontier: readonly ScoredStrategy[];
  readonly dominated: readonly ScoredStrategy[];
  readonly recommended: ScoredStrategy;
}

export interface DecisionDatasetRecord {
  readonly id: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly prompt: string;
  readonly intent: string;
  readonly operations: readonly string[];
  readonly strategy: string;
  readonly decision: string;
  readonly accepted: boolean;
  readonly rejected: boolean;
  readonly undo: boolean;
  readonly quality: number;
  readonly credits: number;
  readonly executionTimeMs: number;
  readonly provider?: string;
  readonly createdAt: number;
}

export interface DecisionFeatures { readonly labels: readonly string[]; readonly values: Readonly<Record<string, number>> }
export interface DecisionVector { readonly dimensions: readonly number[] }
export interface SimilarDecision { readonly record: DecisionDatasetRecord; readonly similarity: number }

export interface DecisionOutcomePrediction {
  readonly acceptanceProbability: number;
  readonly undoProbability: number;
  readonly retryProbability: number;
  readonly correctionProbability: number;
  readonly failureProbability: number;
}

export interface ConfidenceCalibrationInput {
  readonly rawConfidence: number;
  readonly datasetSize: number;
  readonly similarity: number;
  readonly historySuccessRate: number;
  readonly variance: number;
}

export interface ExplainabilityNode { readonly id: string; readonly label: string; readonly value: string; readonly children: readonly ExplainabilityNode[] }

export interface ScenarioOverrides {
  readonly availableCredits?: number;
  readonly minimumQuality?: number;
  readonly priority?: "QUALITY" | "SPEED" | "COST";
  readonly providerAvailable?: boolean;
}

export interface ScenarioResult { readonly context: DecisionIntelligenceContext; readonly profile: ScoringProfile; readonly candidates: readonly AdvancedDecisionCandidate[] }
export interface DecisionEvolutionRecord { readonly decisionId: string; readonly parentDecisionId?: string; readonly generation: number; readonly createdAt: number }
export interface KnowledgeEdge { readonly from: string; readonly to: string; readonly occurrences: number; readonly successes: number }
