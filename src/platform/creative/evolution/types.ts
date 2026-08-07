export interface EvolutionScope { readonly tenantId: string; readonly projectId: string; readonly userId: string }
export interface EvolutionDependencies { readonly nextId: () => string; readonly now: () => number; readonly random: () => number }
export type EvolutionDomain = 'REASONING' | 'PLANNING' | 'STRATEGY' | 'DEBATE' | 'EXPLORATION' | 'REFLECTION';
export interface PerformanceVector { readonly quality: number; readonly reasoning: number; readonly planning: number; readonly creativity: number; readonly cost: number; readonly brand: number; readonly composition: number; readonly stability: number }
export interface ArchitectureVersion { readonly id: string; readonly domain: EvolutionDomain; readonly version: number; readonly parentId?: string; readonly createdAt: number; readonly metrics: PerformanceVector; readonly status: 'CANDIDATE' | 'ACTIVE' | 'REJECTED' | 'RETIRED'; readonly change: string }
export interface VersionComparison { readonly baselineId: string; readonly candidateId: string; readonly deltas: PerformanceVector; readonly aggregateDelta: number; readonly regressed: boolean; readonly verdict: 'PROMOTE' | 'REJECT' | 'HOLD' }

export type GenomeWeight = 'LIGHTING' | 'COMPOSITION' | 'CREATIVITY' | 'RISK' | 'BRAND' | 'COST' | 'EMOTION';
export type HeuristicGenes = Readonly<Record<GenomeWeight, number>>;
export interface HeuristicGenome { readonly id: string; readonly generation: number; readonly parentIds: readonly string[]; readonly genes: HeuristicGenes; readonly fitness: number; readonly createdAt: number }
export interface StrategyNode { readonly id: string; readonly name: string; readonly version: number; readonly parentId?: string; readonly childIds: readonly string[]; readonly performance: number; readonly support: number; readonly confidence: number; readonly roi: number; readonly status: 'EXPERIMENTAL' | 'ACTIVE' | 'REJECTED' }

export interface DecisionGenome { readonly id: string; readonly goal: string; readonly intent: string; readonly reasoning: readonly string[]; readonly operations: readonly string[]; readonly evaluation: PerformanceVector; readonly reflection: readonly string[]; readonly outcome: number; readonly parentIds: readonly string[]; readonly generation: number }
export interface SimilarGenome { readonly genomeId: string; readonly similarity: number }

export interface BenchmarkScenario { readonly id: string; readonly domain: string; readonly difficulty: number; readonly expected: PerformanceVector }
export interface BenchmarkResult { readonly id: string; readonly versionId: string; readonly scenarioCount: number; readonly scores: PerformanceVector; readonly creativeIQ: number; readonly reasoningIQ: number; readonly planningIQ: number; readonly costIQ: number; readonly brandIQ: number; readonly compositionIQ: number; readonly createdAt: number }
export interface RegressionFinding { readonly metric: keyof PerformanceVector; readonly delta: number; readonly severity: 'NONE' | 'WARNING' | 'BLOCKING' }

export interface KnowledgeClaim { readonly key: string; readonly value: string; readonly confidence: number; readonly updatedAt: number }
export interface WorldKnowledgeVersion { readonly id: string; readonly version: number; readonly parentId?: string; readonly claims: readonly KnowledgeClaim[]; readonly added: readonly string[]; readonly strengthened: readonly string[]; readonly deprecated: readonly string[]; readonly createdAt: number }
export type ReasoningProgramName = 'LUXURY' | 'PORTRAIT' | 'FASHION' | 'MARKETING' | 'BRAND' | 'REPAIR' | 'CREATIVE' | 'MINIMAL' | 'EXPLORATION' | 'VERIFICATION';
export interface ReasoningProgram { readonly id: string; readonly name: ReasoningProgramName; readonly steps: readonly string[]; readonly compatibleWith: readonly ReasoningProgramName[] }
export interface ResearchAlternative { readonly id: string; readonly hypothesis: string; readonly feasibility: number; readonly quality: number; readonly cost: number; readonly satisfaction: number; readonly score: number }
export interface ResearchConclusion { readonly question: string; readonly alternatives: readonly ResearchAlternative[]; readonly winnerId: string; readonly conclusion: string }

export type ConstitutionalPrinciple = 'BEAUTY_FIRST' | 'RESPECT_USER_INTENT' | 'MINIMAL_NECESSARY_AI' | 'PRESERVE_IDENTITY' | 'BRAND_CONSISTENCY' | 'NON_DESTRUCTIVE_EDITING' | 'EXPLAIN_DECISIONS' | 'PREFER_SIMPLICITY';
export interface ConstitutionAssessment { readonly compliant: boolean; readonly score: number; readonly satisfied: readonly ConstitutionalPrinciple[]; readonly violations: readonly ConstitutionalPrinciple[] }
export interface ObservatorySnapshot extends EvolutionScope { readonly id: string; readonly at: number; readonly moduleStates: Readonly<Record<string, 'HEALTHY' | 'WATCH' | 'DISABLED'>>; readonly activeHeuristics: readonly string[]; readonly generation: number; readonly reasoningQuality: number; readonly activeStrategies: readonly string[]; readonly stability: number; readonly confidenceDistribution: readonly number[]; readonly workingMemoryLoad: number; readonly overallHealth: number }

export interface TokenizedDecision { readonly tokens: readonly number[]; readonly vocabularyVersion: number }
export interface LatentDecision { readonly values: readonly number[]; readonly dimensions: number }
export interface DecisionHeads { readonly policy: readonly number[]; readonly planning: readonly number[]; readonly ranking: readonly number[]; readonly reflection: readonly number[]; readonly critic: readonly number[]; readonly memory: readonly number[] }
export interface DecisionModelOutput { readonly strategy: string; readonly confidence: number; readonly explanation: readonly string[] }
export interface DecisionTokenizer { tokenize(genome: DecisionGenome): TokenizedDecision }
export interface DecisionEncoder { encode(tokens: TokenizedDecision): LatentDecision }
export interface LatentReasoningSpace { transform(latent: LatentDecision): LatentDecision }
export interface PolicyNetwork { evaluate(latent: LatentDecision): readonly number[] }
export interface PlanningHead { evaluate(latent: LatentDecision): readonly number[] }
export interface RankingHead { evaluate(latent: LatentDecision): readonly number[] }
export interface ReflectionHead { evaluate(latent: LatentDecision): readonly number[] }
export interface CriticHead { evaluate(latent: LatentDecision): readonly number[] }
export interface MemoryHead { evaluate(latent: LatentDecision): readonly number[] }
export interface DecisionDecoder { decode(heads: DecisionHeads): DecisionModelOutput }
