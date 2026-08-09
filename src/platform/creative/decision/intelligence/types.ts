export type CandidateMode = "LOCAL" | "HYBRID" | "AI";
export type LearningSignalType = "ACCEPTED" | "REJECTED" | "UNDO" | "REPEATED_EDIT" | "CANCELLED" | "MANUAL_CORRECTION";

export interface DecisionIntelligenceContext {
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly prompt: string;
  readonly intent: string;
  readonly availableOperations: readonly string[];
  readonly preferredOperations?: readonly string[];
  readonly availableCredits?: number;
  readonly currentQuality?: number;
  readonly minimumQuality?: number;
}

export interface DecisionCandidate {
  readonly id: string;
  readonly mode: CandidateMode;
  readonly operations: readonly string[];
  readonly estimatedCredits: number;
  readonly expectedQualityGain: number;
  readonly speed: number;
  readonly successProbability: number;
  readonly optionalAI: readonly string[];
  readonly requiredAI: readonly string[];
}

export interface DecisionScore {
  readonly qualityScore: number;
  readonly costScore: number;
  readonly preferenceScore: number;
  readonly speedScore: number;
  readonly executionProbability: number;
  readonly finalScore: number;
}

export interface DecisionScoreWeights {
  readonly quality: number;
  readonly cost: number;
  readonly preference: number;
  readonly speed: number;
  readonly successProbability: number;
}

export interface RankedCandidate {
  readonly candidate: DecisionCandidate;
  readonly score: DecisionScore;
}

export interface DecisionRanking {
  readonly bestCandidate: DecisionCandidate;
  readonly score: number;
  readonly confidence: number;
  readonly explanation: string;
  readonly candidates: readonly RankedCandidate[];
}

export interface DecisionCostSimulation {
  readonly originalCost: number;
  readonly optimizedCost: number;
  readonly savedCredits: number;
  readonly optionalAI: readonly string[];
  readonly requiredAI: readonly string[];
}

export interface DecisionQualityPrediction {
  readonly expectedQuality: number;
  readonly confidence: number;
  readonly shouldEscalate: boolean;
  readonly reason: string;
}

export interface DecisionExplanationResult {
  readonly candidateId: string;
  readonly summary: string;
  readonly reasons: readonly string[];
}

export interface DecisionLearningSignal {
  readonly id: string;
  readonly decisionId: string;
  readonly userId: string;
  readonly tenantId: string;
  readonly projectId: string;
  readonly type: LearningSignalType;
  readonly createdAt: number;
}

export interface DecisionExperience {
  readonly id: string;
  readonly decisionId: string;
  readonly context: DecisionIntelligenceContext;
  readonly chosenCandidate: DecisionCandidate;
  readonly result?: string;
  readonly accepted: boolean;
  readonly rejected: boolean;
  readonly savedCredits: number;
  readonly executionTimeMs: number;
  readonly createdAt: number;
}

export interface DecisionAnalyticsResult {
  readonly decisions: number;
  readonly averageScore: number;
  readonly averageSavedCredits: number;
  readonly aiUsage: number;
  readonly localUsage: number;
  readonly hybridUsage: number;
  readonly acceptanceRate: number;
  readonly undoRate: number;
}

export interface DecisionDebugSnapshot {
  readonly prompt: string;
  readonly intent: string;
  readonly candidates: readonly DecisionCandidate[];
  readonly ranking: DecisionRanking;
  readonly selectedDecision: DecisionCandidate;
  readonly expectedQuality: DecisionQualityPrediction;
  readonly expectedCost: DecisionCostSimulation;
  readonly explanation: DecisionExplanationResult;
  readonly learningSignals: readonly DecisionLearningSignal[];
}

export interface DecisionIntelligenceDependencies {
  readonly createId: () => string;
  readonly now: () => number;
}
