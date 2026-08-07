export type KnowledgeState = 'KNOWN' | 'PARTIALLY_KNOWN' | 'UNKNOWN' | 'IMPOSSIBLE';
export type CognitiveMode = 'FAST' | 'BALANCED' | 'PROFESSIONAL' | 'SCIENTIFIC' | 'EXPERIMENTAL' | 'RESEARCH' | 'MAXIMUM_QUALITY' | 'MINIMUM_COST';
export type Strategy = 'LOCAL' | 'AI' | 'HYBRID' | 'DEFER';
export interface Scope { tenantId: string; projectId: string; userId: string }
export interface MetaDependencies { id(): string; now(): number }
export interface IntelligenceObservation { source: 'DECISION' | 'DIRECTOR' | 'STUDIO' | 'ORCHESTRATOR'; strategy: Strategy; confidence: number; reasons: readonly string[]; operations?: readonly string[]; dependencies?: readonly string[] }
export interface MetaInput extends Scope { prompt: string; intent?: string; goals: readonly string[]; domain?: string; difficulty?: number; risk?: number; budget: number; preferences?: Readonly<Record<string, number>>; observations: readonly IntelligenceObservation[]; knownDependencies?: readonly string[]; requestedMode?: CognitiveMode }
export interface ThinkingBudget { depth: number; iterations: number; debateRounds: number; simulations: number; planningDepth: number; shouldContinue: boolean }
export interface ResourceShare { resource: string; share: number }
export interface QualityMetrics { thinking: number; reasoning: number; planning: number; conflict: number; consensus: number; prediction: number; learning: number }
export interface HallucinationFinding { code: 'UNSUPPORTED_CONCLUSION' | 'EXTRA_OPERATION' | 'UNKNOWN_DEPENDENCY' | 'BOLD_ASSUMPTION' | 'OVERCONFIDENCE'; severity: number; source: string }
export interface StabilityResult { score: number; stable: boolean; variants: number }
export interface CoverageResult { score: number; state: KnowledgeState; matchedDomains: readonly string[] }
export interface MetaConfidence { value: number; confidenceOfConfidence: number; dispersion: number; evidence: number }
export interface AuditEvent { id: string; at: number; sequence: number; actor: string; action: string; reason: string; rule?: string; expert?: string; strategy?: Strategy }
export interface Reflection { correct: readonly string[]; unnecessary: readonly string[]; faster: readonly string[]; unhelpfulExperts: readonly string[]; nextTime: readonly string[] }
export interface HealthReport { dimensions: Readonly<Record<string, number>>; overall: number; status: 'HEALTHY' | 'WATCH' | 'CRITICAL' }
export interface IntelligenceScore { dimensions: Readonly<Record<string, number>>; overall: number; version: 3 }
export interface CognitiveTimelineEvent { id: string; at: number; sequence: number; stage: string; detail: string }
export interface MetaResult extends Scope { id: string; mode: CognitiveMode; trustedSource: IntelligenceObservation['source'] | 'NONE'; shouldStop: boolean; thinkingBudget: ThinkingBudget; allocation: readonly ResourceShare[]; monitoring: QualityMetrics; hallucinations: readonly HallucinationFinding[]; stability: StabilityResult; coverage: CoverageResult; explainable: boolean; metaConfidence: MetaConfidence; audit: readonly AuditEvent[]; reflection: Reflection; health: HealthReport; score: IntelligenceScore; timeline: readonly CognitiveTimelineEvent[]; finalStrategy: Strategy; debugSnapshot: string }

export interface MetaReasoningModel { chooseTrust(observations: readonly IntelligenceObservation[], coverage: CoverageResult): IntelligenceObservation['source'] | 'NONE' }
export interface ThinkingPolicyModel { allocate(input: Pick<MetaInput, 'budget' | 'risk' | 'difficulty' | 'goals'>, confidence: number): ThinkingBudget }
export interface HallucinationModel { detect(input: MetaInput): readonly HallucinationFinding[] }
export interface GovernanceModel { select(input: MetaInput, coverage: CoverageResult): CognitiveMode }
export interface ReflectionModel { reflect(input: MetaInput, metrics: QualityMetrics, allocation: readonly ResourceShare[]): Reflection }
export interface KnowledgeCoverageModel { analyze(domain: string | undefined, prompt: string): CoverageResult }
export interface StabilityModel { analyze(input: MetaInput): StabilityResult }
export interface MetaLearningModel { key(result: Pick<MetaResult, 'mode' | 'trustedSource' | 'finalStrategy'>): string }
