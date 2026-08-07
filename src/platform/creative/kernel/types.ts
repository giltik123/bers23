export interface KernelScope { readonly tenantId: string; readonly projectId: string; readonly userId: string }
export interface KernelDependencies { readonly nextId: () => string; readonly now: () => number; readonly random: () => number }
export type IntelligenceState = 'IDLE' | 'OBSERVE' | 'UNDERSTAND' | 'EXPLORE' | 'REASON' | 'DEBATE' | 'OPTIMIZE' | 'REFLECT' | 'VALIDATE' | 'COMMIT' | 'LEARN' | 'COMPLETE';
export type ModuleKind = 'DECISION' | 'DIRECTOR' | 'STUDIO' | 'META' | 'EVOLUTION' | 'RESEARCH' | 'COMPOSITION' | 'LIGHTING' | 'BRAND' | 'MARKETING' | string;
export type Capability = 'VISION' | 'COMPOSITION' | 'BRAND' | 'STYLE' | 'RANKING' | 'OPTIMIZATION' | 'SIMULATION' | 'DEBATE' | 'CONSENSUS' | 'EXPERTS' | 'VALIDATION' | 'GOVERNANCE' | 'REFLECTION' | 'LEARNING' | 'RESEARCH' | string;
export type BlackboardChannel = 'DECISION' | 'DIRECTOR' | 'STUDIO' | 'META' | 'EVOLUTION' | 'RESEARCH' | 'REFLECTION';

export interface KernelMessage extends KernelScope { readonly id: string; readonly sessionId: string; readonly topic: string; readonly sender: string; readonly payload: Readonly<Record<string, unknown>>; readonly sequence: number; readonly createdAt: number }
export interface BlackboardEntry extends KernelScope { readonly id: string; readonly sessionId: string; readonly channel: BlackboardChannel; readonly author: string; readonly key: string; readonly value: unknown; readonly revision: number; readonly createdAt: number }
export interface BlackboardSnapshot { readonly sessionId: string; readonly revision: number; readonly entries: readonly BlackboardEntry[] }

export interface TimelineEvent extends KernelScope { readonly id: string; readonly sessionId: string; readonly type: 'GOAL_CREATED' | 'HYPOTHESIS_CREATED' | 'EVIDENCE_ADDED' | 'DEBATE' | 'CONFLICT' | 'SIMULATION' | 'REFLECTION' | 'DECISION' | 'REPLAY' | 'LEARNING' | 'STATE_CHANGED' | 'MESSAGE_PUBLISHED' | 'MODULE_LIFECYCLE'; readonly sequence: number; readonly createdAt: number; readonly parentIds: readonly string[]; readonly data: Readonly<Record<string, unknown>> }
export interface StateTransition { readonly from: IntelligenceState; readonly to: IntelligenceState; readonly reason: string; readonly trigger: string; readonly confidence: number; readonly createdAt: number }

export interface PluginContext extends KernelScope { readonly sessionId: string; readonly objective: string }
export interface PluginPublication { readonly topic: string; readonly payload: Readonly<Record<string, unknown>>; readonly blackboard?: { readonly channel: BlackboardChannel; readonly key: string; readonly value: unknown } }
export interface IntelligencePlugin {
  readonly id: string;
  readonly kind: ModuleKind;
  readonly capabilities: readonly Capability[];
  readonly dependencies: readonly string[];
  initialize(context: PluginContext): void;
  observe(context: PluginContext, messages: readonly KernelMessage[]): void;
  reason(context: PluginContext, budget: number): void;
  publish(context: PluginContext): readonly PluginPublication[];
  sleep(context: PluginContext): void;
  replay(context: PluginContext, events: readonly TimelineEvent[]): void;
  shutdown(context: PluginContext): void;
}
export interface PluginRegistration { readonly plugin: IntelligencePlugin; readonly status: 'ACTIVE' | 'SLEEPING' | 'DISABLED'; readonly registeredAt: number }
export interface DependencyNode { readonly pluginId: string; readonly dependencyIds: readonly string[] }
export interface ExecutionPlanItem { readonly pluginId: string; readonly kind: ModuleKind; readonly capabilities: readonly Capability[]; readonly order: number; readonly iterations: number; readonly budget: number; readonly reason: string }
export interface CognitiveBudgetAllocation { readonly total: number; readonly allocated: number; readonly remaining: number; readonly shares: Readonly<Record<string, number>> }
export interface IntelligenceMetrics { readonly reasoning: number; readonly memory: number; readonly planning: number; readonly debate: number; readonly learning: number; readonly reflection: number; readonly simulation: number; readonly director: number; readonly decision: number; readonly meta: number }
export interface IntelligenceHealth { readonly dimensions: IntelligenceMetrics; readonly overall: number; readonly status: 'HEALTHY' | 'WATCH' | 'CRITICAL' }

export interface CreativeSession extends KernelScope { readonly id: string; readonly objective: string; readonly workspace: Readonly<Record<string, unknown>>; readonly timeline: readonly TimelineEvent[]; readonly state: IntelligenceState; readonly metrics: IntelligenceMetrics; readonly budget: CognitiveBudgetAllocation; readonly createdAt: number; readonly updatedAt: number }
export interface KernelSnapshot extends KernelScope { readonly id: string; readonly sessionId: string; readonly sequence: number; readonly session: CreativeSession; readonly blackboard: BlackboardSnapshot; readonly messages: readonly KernelMessage[]; readonly stateTransitions: readonly StateTransition[]; readonly createdAt: number }
export interface ReplayFrame { readonly sequence: number; readonly message?: KernelMessage; readonly blackboard?: BlackboardEntry; readonly event?: TimelineEvent; readonly state?: StateTransition; readonly snapshotId?: string }
export interface KernelRunRequest extends KernelScope { readonly objective: string; readonly prompt: string; readonly workspace?: Readonly<Record<string, unknown>>; readonly reasoningPoints: number; readonly seed: string; readonly requestedCapabilities?: readonly Capability[] }
export interface KernelRunResult { readonly session: CreativeSession; readonly plan: readonly ExecutionPlanItem[]; readonly health: IntelligenceHealth; readonly snapshot: KernelSnapshot; readonly replay: readonly ReplayFrame[] }
