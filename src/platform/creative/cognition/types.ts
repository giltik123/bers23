export interface CognitiveScope { readonly tenantId: string; readonly projectId: string; readonly userId: string }
export interface CognitiveDependencies { readonly nextId: () => string; readonly now: () => number; readonly random: () => number }

export type ThoughtType = 'GOAL' | 'OBSERVATION' | 'IDEA' | 'RISK' | 'ASSUMPTION' | 'QUESTION' | 'DECISION' | 'REFLECTION' | 'INSIGHT';
export type ThoughtRelationType = 'SUPPORTS' | 'CONTRADICTS' | 'REQUIRES' | 'DERIVES' | 'ALTERNATIVE_TO' | 'RESOLVES';
export interface SaliencySignals { readonly novelty: number; readonly importance: number; readonly risk: number; readonly goalImpact: number; readonly confidence: number; readonly urgency: number }
export interface Thought { readonly id: string; readonly type: ThoughtType; readonly content: string; readonly createdAt: number; readonly saliency: number; readonly signals: SaliencySignals; readonly tags: readonly string[] }
export interface ThoughtRelation { readonly id: string; readonly from: string; readonly to: string; readonly type: ThoughtRelationType; readonly weight: number }
export interface ThoughtGraphSnapshot { readonly thoughts: readonly Thought[]; readonly relations: readonly ThoughtRelation[] }

export interface Goal { readonly id: string; readonly title: string; readonly priority: number; readonly weight: number; readonly deadline?: number; readonly completion: number; readonly blockingGoalIds: readonly string[] }
export interface Evidence { readonly id: string; readonly claim: string; readonly source: string; readonly strength: number; readonly reliability: number; readonly createdAt: number }
export interface CreativeHypothesis { readonly id: string; readonly statement: string; readonly confidence: number; readonly evidenceIds: readonly string[]; readonly counterEvidenceIds: readonly string[]; readonly expectedGain: number; readonly verification: 'UNVERIFIED' | 'TESTING' | 'SUPPORTED' | 'REJECTED' }
export interface Assumption { readonly id: string; readonly statement: string; readonly confidence: number; readonly status: 'ACTIVE' | 'VALIDATED' | 'INVALIDATED'; readonly createdAt: number }
export interface Contradiction { readonly id: string; readonly leftThoughtId: string; readonly rightThoughtId: string; readonly severity: number; readonly resolution: 'EVIDENCE' | 'GOAL_PRIORITY' | 'CONFIDENCE' | 'DEFER'; readonly winnerId?: string }
export interface Alternative { readonly id: string; readonly description: string; readonly novelty: number; readonly expectedValue: number }
export interface Surprise { readonly id: string; readonly expected: number; readonly actual: number; readonly difference: number; readonly significant: boolean }
export interface Insight { readonly id: string; readonly pattern: string; readonly support: number; readonly sourceOutcomeIds: readonly string[] }

export type AttentionDimension = 'QUALITY' | 'BRAND' | 'COMPOSITION' | 'COST' | 'RISK' | 'CREATIVITY' | 'EMOTION' | 'STORY' | 'IDENTITY' | 'CONSISTENCY';
export type AttentionDistribution = Readonly<Record<AttentionDimension, number>>;
export interface WorkingMemorySnapshot { readonly activeThoughts: readonly Thought[]; readonly attention: AttentionDistribution; readonly hypothesisId?: string; readonly goalId?: string; readonly strategy?: ComposedStrategy; readonly debate: readonly string[]; readonly capacity: number }

export interface BlackboardState extends CognitiveScope { readonly version: number; readonly goals: readonly Goal[]; readonly constraints: readonly string[]; readonly evidence: readonly Evidence[]; readonly experts: readonly string[]; readonly conflicts: readonly Contradiction[]; readonly assumptions: readonly Assumption[]; readonly risks: readonly string[]; readonly unknowns: readonly string[]; readonly alternatives: readonly Alternative[]; readonly worldState: Readonly<Record<string, unknown>>; readonly thoughtGraph: ThoughtGraphSnapshot }
export interface BlackboardPatch { readonly goals?: readonly Goal[]; readonly constraints?: readonly string[]; readonly evidence?: readonly Evidence[]; readonly experts?: readonly string[]; readonly conflicts?: readonly Contradiction[]; readonly assumptions?: readonly Assumption[]; readonly risks?: readonly string[]; readonly unknowns?: readonly string[]; readonly alternatives?: readonly Alternative[]; readonly worldState?: Readonly<Record<string, unknown>>; readonly thoughts?: readonly Thought[]; readonly relations?: readonly ThoughtRelation[] }

export interface ThinkingProgram { readonly id: string; readonly name: 'LUXURY_OPTIMIZATION' | 'PORTRAIT_OPTIMIZATION' | 'CATALOG_OPTIMIZATION' | 'AI_SAVING' | 'BRAND_PRESERVATION'; readonly steps: readonly string[]; readonly dimensions: readonly AttentionDimension[] }
export interface ComposedStrategy { readonly id: string; readonly traits: readonly string[]; readonly programs: readonly ThinkingProgram['name'][]; readonly rationale: readonly string[] }
export type ThinkingState = 'IDLE' | 'OBSERVE' | 'ANALYZE' | 'HYPOTHESIS' | 'DEBATE' | 'EVALUATE' | 'REFLECT' | 'LEARN' | 'FINALIZE';
export interface ScheduleDecision { readonly nextExpert?: string; readonly excludedExperts: readonly string[]; readonly action: 'THINK' | 'STOP' | 'REPLAY' | 'REFLECT'; readonly reason: string }
export interface CognitiveMetrics { readonly thinkingDepth: number; readonly reasoningWidth: number; readonly evidenceDensity: number; readonly conflictDensity: number; readonly goalCompletion: number; readonly novelty: number; readonly insightRate: number; readonly learningVelocity: number; readonly stability: number; readonly explorationRatio: number; readonly exploitationRatio: number; readonly cognitiveLoad: number; readonly workingMemoryUsage: number; readonly attentionDistribution: AttentionDistribution }
export interface ReplayStep { readonly sequence: number; readonly state: ThinkingState; readonly at: number; readonly event: string; readonly thoughtId?: string }
export interface UnifiedCognitiveGraph { readonly nodes: readonly { readonly id: string; readonly kind: string; readonly label: string }[]; readonly edges: readonly { readonly from: string; readonly to: string; readonly relation: string }[] }
export interface CognitiveRequest extends CognitiveScope { readonly prompt: string; readonly goals: readonly string[]; readonly constraints?: readonly string[]; readonly experts?: readonly string[]; readonly worldState?: Readonly<Record<string, unknown>>; readonly memoryCapacity?: number }
export interface CognitiveResult extends CognitiveScope { readonly id: string; readonly blackboard: BlackboardState; readonly workingMemory: WorkingMemorySnapshot; readonly strategy: ComposedStrategy; readonly schedule: ScheduleDecision; readonly metrics: CognitiveMetrics; readonly replay: readonly ReplayStep[]; readonly graph: UnifiedCognitiveGraph; readonly finalState: ThinkingState }

export interface SaliencyModel { score(signals: SaliencySignals): number }
export interface AttentionPolicy { distribute(state: BlackboardState): AttentionDistribution }
export interface SchedulingPolicy { decide(state: BlackboardState, memory: WorkingMemorySnapshot): ScheduleDecision }
export interface CuriosityPolicy { explore(state: BlackboardState): readonly Alternative[] }
export interface StrategyPolicy { compose(state: BlackboardState, programs: readonly ThinkingProgram[]): ComposedStrategy }
export interface LearningPolicy { insights(outcomes: readonly { readonly id: string; readonly tags: readonly string[]; readonly success: number }[]): readonly Insight[] }
