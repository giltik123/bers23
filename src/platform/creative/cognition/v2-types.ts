import type { AttentionDistribution, CognitiveDependencies, CognitiveScope, CreativeHypothesis, Evidence, Insight, Thought } from './types';

export interface WorkspaceHypothesis extends CreativeHypothesis { readonly support: number; readonly contradictions: number; readonly predictedValue: number; readonly survivalScore: number }
export interface CognitiveExperiment { readonly id: string; readonly variable: string; readonly change: string; readonly expectedQuality: number; readonly expectedCost: number; readonly expectedSatisfaction: number; readonly status: 'PLANNED' | 'SIMULATED' }
export interface DecisionCandidate { readonly id: string; readonly strategy: string; readonly confidence: number; readonly rationale: readonly string[] }
export interface CognitivePlan { readonly id: string; readonly steps: readonly string[]; readonly confidence: number }
export interface WorkspaceData { readonly goals: readonly string[]; readonly intentSpace: readonly string[]; readonly thoughts: readonly Thought[]; readonly evidence: readonly Evidence[]; readonly hypotheses: readonly WorkspaceHypothesis[]; readonly attention: AttentionDistribution; readonly workingThoughtIds: readonly string[]; readonly openQuestions: readonly string[]; readonly unknowns: readonly string[]; readonly contradictionIds: readonly string[]; readonly experiments: readonly CognitiveExperiment[]; readonly insights: readonly Insight[]; readonly plans: readonly CognitivePlan[]; readonly decisionCandidates: readonly DecisionCandidate[] }
export interface WorkspaceSnapshot extends CognitiveScope { readonly id: string; readonly revision: number; readonly createdAt: number; readonly data: WorkspaceData }
export interface WorkspaceDiff { readonly fromRevision: number; readonly toRevision: number; readonly changed: readonly (keyof WorkspaceData)[] }

export type ReasoningAction = 'OBSERVE' | 'ANALYZE' | 'COMPARE' | 'HYPOTHESIZE' | 'CHALLENGE' | 'REFINE' | 'REFLECT' | 'DECIDE';
export type ReasoningLoopState = 'OBSERVE' | 'ORIENT' | 'REASON' | 'DEBATE' | 'CRITIQUE' | 'SIMULATE' | 'EVALUATE' | 'REFLECT' | 'LEARN' | 'FINALIZE';
export interface ReasoningCycle { readonly id: string; readonly action: ReasoningAction; readonly inputRevision: number; readonly outputRevision: number; readonly summary: string; readonly confidence: number; readonly at: number }
export interface ReasoningTransition { readonly id: string; readonly from: ReasoningLoopState; readonly to: ReasoningLoopState; readonly reason: string; readonly confidence: number; readonly trigger: string; readonly at: number }

export type ProgramModule = 'EXPLORATION' | 'VERIFICATION' | 'OPTIMIZATION' | 'CREATIVITY' | 'COST' | 'BRAND' | 'EMOTION' | 'COMPOSITION' | 'SAFETY' | 'LEARNING' | 'REFLECTION';
export interface AdaptiveThinkingProgram { readonly id: string; readonly modules: readonly ProgramModule[]; readonly rationale: readonly string[] }
export type EvidenceRelationType = 'SUPPORTS' | 'CONTRADICTS' | 'REQUIRES' | 'DERIVED_FROM';
export interface EvidenceRelation { readonly id: string; readonly from: string; readonly to: string; readonly type: EvidenceRelationType; readonly strength: number }
export interface EvidenceNetworkSnapshot { readonly evidence: readonly Evidence[]; readonly relations: readonly EvidenceRelation[] }
export interface MentalScenario { readonly id: string; readonly strategy: 'LOCAL' | 'HYBRID' | 'AI' | 'HYBRID_AI' | 'NO_AI'; readonly quality: number; readonly cost: number; readonly satisfaction: number; readonly risk: number }
export interface CognitiveReflection { readonly id: string; readonly useful: readonly string[]; readonly unnecessary: readonly string[]; readonly eliminatedHypotheses: readonly string[]; readonly newHypotheses: readonly string[]; readonly verifyLater: readonly string[]; readonly at: number }
export interface SelfMonitoringMetrics { readonly thinkingDepth: number; readonly reasoningWidth: number; readonly attentionEntropy: number; readonly contradictionRate: number; readonly confidenceDrift: number; readonly hypothesisCollapse: number; readonly cognitiveFatigue: number }
export interface ReasoningMacro { readonly id: string; readonly pattern: string; readonly template: readonly string[]; readonly sourceThoughtIds: readonly string[] }
export interface KnowledgeGaps { readonly known: readonly string[]; readonly assumed: readonly string[]; readonly unknown: readonly string[] }
export interface DiscoveryScore { readonly novelty: number; readonly unexpectedness: number; readonly originality: number; readonly riskReward: number; readonly creativePotential: number }
export interface EmergentStrategy { readonly id: string; readonly name: string; readonly principles: readonly string[]; readonly sourceHypothesisIds: readonly string[]; readonly novelty: number }
export interface CognitivePerformance { readonly thinkingEfficiency: number; readonly reasoningEfficiency: number; readonly planningEfficiency: number; readonly learningEfficiency: number; readonly creativityEfficiency: number; readonly resourceEfficiency: number }
export interface TimelineV2Event { readonly id: string; readonly sequence: number; readonly at: number; readonly kind: 'THOUGHT' | 'HYPOTHESIS' | 'EVIDENCE' | 'DEBATE' | 'SIMULATION' | 'EXPERIMENT' | 'REFLECTION' | 'LEARNING' | 'DECISION'; readonly referenceId?: string }
export interface ReplayCursor { readonly sessionId: string; readonly position: number; readonly events: readonly TimelineV2Event[] }

export interface Encoder<T> { encode(value: T): readonly number[] }
export interface ReasoningEncoder extends Encoder<readonly ReasoningCycle[]> {}
export interface WorkspaceEncoder extends Encoder<WorkspaceSnapshot> {}
export interface ThoughtEncoder extends Encoder<Thought> {}
export interface HypothesisEncoder extends Encoder<WorkspaceHypothesis> {}
export interface EvidenceEncoder extends Encoder<Evidence> {}
export interface ReflectionEncoder extends Encoder<CognitiveReflection> {}
export interface PlanningEncoder extends Encoder<CognitivePlan> {}
export interface SimulationEncoder extends Encoder<MentalScenario> {}
export interface AttentionEncoder extends Encoder<AttentionDistribution> {}
export interface MemoryEncoder extends Encoder<ReasoningMacro> {}
export interface V2Dependencies extends CognitiveDependencies {}
