export type OperatingMode = 'FAST' | 'BALANCED' | 'QUALITY' | 'STUDIO' | 'AUTONOMOUS' | 'RESEARCH';
export type IntelligenceKind = 'DIRECTOR' | 'DECISION' | 'STUDIO' | 'SIMULATION' | 'SELF_CRITIC' | 'REPLAY' | 'RESULT';
export type ExpertKind = 'COMPOSITION' | 'LIGHTING' | 'BRAND' | 'FASHION' | 'MARKETING' | 'QUALITY' | 'COST' | 'AI';
export type Strategy = 'LOCAL' | 'AI' | 'HYBRID' | 'DEFER';

export interface Scope { tenantId: string; projectId: string; userId: string }
export interface Goals { quality?: number; satisfaction?: number; deadlineMs?: number; tags?: readonly string[] }
export interface CreativeBudget { total: number; spent: number; aiUnitCost?: number; expectedAiValue?: number }
export interface OrchestratorContext { domain?: string; metadata?: Readonly<Record<string, unknown>> }
export interface IntelligenceSignal { source: 'DIRECTOR' | 'DECISION' | 'STUDIO' | 'QUALITY'; strategy: Strategy; confidence: number }
export interface ExpertHistory { expert: ExpertKind; successes: number; failures: number; usefulness: number; domains?: Readonly<Record<string, number>> }
export interface OrchestratorRequest extends Scope { prompt: string; context?: OrchestratorContext; goals?: Goals; budget: CreativeBudget; mode?: OperatingMode; signals?: readonly IntelligenceSignal[]; expertHistory?: readonly ExpertHistory[]; historicalConfidence?: number }

export interface ExecutionNode { id: string; kind: IntelligenceKind; durationMs: number; dependsOn: readonly string[]; parallelGroup: number; status: 'PLANNED' }
export interface ExecutionGraph { id: string; nodes: readonly ExecutionNode[] }
export interface ExecutivePlan { mode: OperatingMode; complexity: number; enabled: readonly IntelligenceKind[]; graph: ExecutionGraph }
export interface ExpertSelection { experts: readonly ExpertKind[]; reasons: readonly string[] }
export interface ReliabilityScore { expert: ExpertKind; score: number; domainConfidence: number }
export interface DebateRound { round: number; consensus: number; weights: readonly ReliabilityScore[]; action: 'STOP' | 'CONTINUE' }
export interface ConflictResolution { strategy: Strategy; authority: string; reason: string }
export interface ConfidenceResult { global: number; components: Readonly<Record<string, number>> }
export interface BudgetAssessment { spent: number; remaining: number; recommended: 'AI' | 'LOCAL'; aiWorthwhile: boolean; efficiency: number }
export interface GovernanceDecision { winner: 'DIRECTOR' | 'DECISION' | 'STUDIO'; reason: string }
export interface TimelineEvent { id: string; at: number; sequence: number; type: string; detail: string }
export interface ExplainabilityV6 { steps: readonly string[]; expectedQuality: number; expectedCost: number; expectedSatisfaction: number; globalConfidence: number }
export interface OrchestratorResult extends Scope { id: string; plan: ExecutivePlan; experts: ExpertSelection; debate: readonly DebateRound[]; conflict: ConflictResolution; confidence: ConfidenceResult; budget: BudgetAssessment; governance: GovernanceDecision; finalStrategy: Strategy; timeline: readonly TimelineEvent[]; explanation: ExplainabilityV6 }

export interface Dependencies { id: () => string; now: () => number }
export interface PolicyInput { mode: OperatingMode; complexity: number; budget: CreativeBudget }
export interface ExecutivePolicyModel { select(input: PolicyInput): readonly IntelligenceKind[] }
export interface ExpertSelectionModel { select(prompt: string, domain: string | undefined, complexity: number): ExpertSelection }
export interface ConflictResolutionModel { resolve(signals: readonly IntelligenceSignal[]): ConflictResolution }
export interface ConfidenceFusionModel { fuse(signals: readonly IntelligenceSignal[], historical: number): ConfidenceResult }
export interface BudgetOptimizationModel { assess(budget: CreativeBudget, complexity: number): BudgetAssessment }
export interface ExecutionSchedulingModel { schedule(id: string, enabled: readonly IntelligenceKind[], complexity: number): ExecutionGraph }
export interface GovernanceModel { govern(signals: readonly IntelligenceSignal[], complexity: number): GovernanceDecision }
export interface OrchestratorLearningModel { strategyKey(result: Pick<OrchestratorResult, 'finalStrategy' | 'plan'>): string }
