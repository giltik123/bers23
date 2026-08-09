export type GoalCategory = "LUXURY" | "CATALOG" | "PORTRAIT" | "MARKETING" | "SOCIAL_MEDIA" | "CREATIVE" | "ENHANCEMENT";
export type GoalPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ConstraintKind = "BUDGET" | "LATENCY" | "RISK" | "PRIVACY" | "AI_AVAILABILITY" | "PROVIDER_AVAILABILITY" | "WORKFLOW_RESTRICTION";
export type DecisionPersonaName = "ECONOMY" | "PROFESSIONAL" | "CREATIVE" | "LUXURY" | "MARKETING" | "CATALOG" | "PORTRAIT" | "SOCIAL_MEDIA";
export type MetaAction = "SKIP_AI" | "LOCAL_FIRST" | "SHOW_PREVIEW" | "ASK_USER" | "DEFER_AI" | "EXECUTE";
export type UncertaintyAction = "ASK_USER" | "LOCAL_FIRST" | "SHOW_PREVIEW" | "GENERATE_VARIANTS";

export interface CreativeGoal { readonly id: string; readonly category: GoalCategory; readonly name: string; readonly priority: GoalPriority; readonly qualityTarget: number; readonly budgetFlexibility: "FIXED" | "FLEXIBLE"; readonly confidence: number }
export interface GoalContext { readonly prompt: string; readonly goals: readonly CreativeGoal[]; readonly primaryGoal: CreativeGoal }
export interface DecisionConstraint { readonly id: string; readonly kind: ConstraintKind; readonly operator: "LTE" | "EQ" | "DISALLOW"; readonly value: number | boolean | string; readonly reason: string }
export interface ConstraintNode { readonly constraint: DecisionConstraint; readonly dependsOn: readonly string[] }
export interface ConstraintGraph { readonly nodes: readonly ConstraintNode[]; readonly conflicts: readonly string[]; readonly feasible: boolean }
export interface OptimizationWeights { readonly quality: number; readonly cost: number; readonly speed: number; readonly risk: number; readonly creativity: number; readonly success: number; readonly preference: number }
export interface CoreCandidate { readonly id: string; readonly mode: "LOCAL" | "HYBRID" | "AI"; readonly operations: readonly string[]; readonly expectedQuality: number; readonly estimatedCost: number; readonly estimatedLatencyMs: number; readonly risk: number; readonly creativity: number; readonly successProbability: number; readonly preferenceMatch: number }
export interface UtilityScore { readonly candidateId: string; readonly utility: number; readonly components: Readonly<Record<keyof OptimizationWeights, number>> }
export interface UtilityOptimization { readonly selected: CoreCandidate; readonly scores: readonly UtilityScore[]; readonly feasibleCandidates: readonly CoreCandidate[] }
export interface DecisionPersona { readonly name: DecisionPersonaName; readonly weights: OptimizationWeights; readonly riskTolerance: number; readonly description: string }
export interface ConfidenceEvidence { readonly datasetSize: number; readonly historicalAcceptance: number; readonly similarity: number; readonly variance: number; readonly preferenceConfidence: number }
export interface PosteriorConfidence { readonly alpha: number; readonly beta: number; readonly mean: number; readonly interval: readonly [number, number]; readonly evidenceStrength: number }
export interface UncertaintyReason { readonly id: string; readonly message: string; readonly contribution: number }
export interface DecisionUncertainty { readonly score: number; readonly level: "LOW" | "MEDIUM" | "HIGH"; readonly reasons: readonly UncertaintyReason[]; readonly recommendedAction: UncertaintyAction }
export interface CreativeRisk { readonly category: "IDENTITY" | "COPYRIGHT" | "PROVIDER" | "BUDGET" | "LARGE_EDIT" | "UNSAFE_WORKFLOW"; readonly score: number; readonly reason: string; readonly mitigation: string }
export interface RiskMitigation { readonly category: CreativeRisk["category"]; readonly action: string; readonly required: boolean }
export interface RiskScore { readonly total: number; readonly level: "LOW" | "MEDIUM" | "HIGH"; readonly risks: readonly CreativeRisk[]; readonly mitigations: readonly string[] }
export interface AdaptiveWeights { readonly persona: DecisionPersonaName; readonly weights: OptimizationWeights; readonly version: number; readonly sampleSize: number }
export interface LearningStatistics { readonly samples: number; readonly accepted: number; readonly rejected: number; readonly acceptanceRate: number; readonly weightVersion: number }
export interface WeightEvolution { readonly before: AdaptiveWeights; readonly after: AdaptiveWeights; readonly reason: string }
export interface MetaDecisionReason { readonly category: "CONFIDENCE" | "RISK" | "COST" | "QUALITY" | "CONSTRAINT"; readonly message: string }
export interface MetaDecision { readonly action: MetaAction; readonly reasons: readonly MetaDecisionReason[]; readonly requiresConfirmation: boolean }
export interface PredictionError { readonly quality: number; readonly cost: number; readonly latency: number; readonly absoluteMean: number }
export interface DecisionEvaluation { readonly decisionId: string; readonly error: PredictionError; readonly calibrated: boolean }
export interface CalibrationStatistics { readonly evaluations: number; readonly meanAbsoluteError: number; readonly qualityError: number; readonly costError: number; readonly latencyError: number }
export interface PairwiseComparison { readonly leftId: string; readonly rightId: string; readonly winnerId: string; readonly margin: number; readonly reason: string }
export interface TournamentBracket { readonly rounds: readonly (readonly PairwiseComparison[])[]; readonly winner: CoreCandidate }
export interface ExplainabilityNode { readonly id: string; readonly label: string; readonly value: string; readonly children: readonly ExplainabilityNode[] }
export interface DecisionEpisode { readonly id: string; readonly userId: string; readonly tenantId: string; readonly projectId: string; readonly goal: GoalContext; readonly constraints: ConstraintGraph; readonly candidates: readonly CoreCandidate[]; readonly selectedDecision: CoreCandidate; readonly executionSummary?: string; readonly userReaction?: "ACCEPTED" | "REJECTED" | "UNDO" | "NONE"; readonly actualCost?: number; readonly actualLatencyMs?: number; readonly actualQuality?: number; readonly createdAt: number }
export interface DecisionStatistics { readonly episodes: number; readonly acceptanceRate: number; readonly averageCost: number; readonly averageLatencyMs: number; readonly averageQuality: number }
export interface DecisionGeneration { readonly decisionId: string; readonly parentDecisionId?: string; readonly generation: number; readonly createdAt: number }
export interface DecisionParent { readonly decisionId: string; readonly parentDecisionId?: string }
export interface EvolutionStatistics { readonly decisions: number; readonly roots: number; readonly maximumGeneration: number }
export interface CoreDecisionContext { readonly userId: string; readonly tenantId: string; readonly projectId: string; readonly prompt: string; readonly availableOperations: readonly string[]; readonly constraints?: readonly DecisionConstraint[]; readonly persona?: DecisionPersonaName; readonly features?: readonly string[] }
export interface CoreDependencies { readonly createId: () => string; readonly now: () => number; readonly generateCandidates: (context: CoreDecisionContext, goal: GoalContext) => readonly CoreCandidate[]; readonly extractFeatures: (prompt: string) => readonly string[] }
export interface CoreDebugSnapshot { readonly prompt: string; readonly goal: GoalContext; readonly constraints: ConstraintGraph; readonly extractedFeatures: readonly string[]; readonly candidates: readonly CoreCandidate[]; readonly paretoFrontier: readonly CoreCandidate[]; readonly utilityScores: readonly UtilityScore[]; readonly tournament: TournamentBracket; readonly selectedDecision: CoreCandidate; readonly confidence: PosteriorConfidence; readonly risk: RiskScore; readonly expectedCost: number; readonly expectedQuality: number; readonly expectedSatisfaction: number; readonly metaDecision: MetaDecision; readonly learningStatistics: LearningStatistics }
