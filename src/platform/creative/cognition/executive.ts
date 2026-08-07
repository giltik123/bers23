import { immutable, rounded } from './immutable';
import { HeuristicAttentionPolicy, HeuristicSchedulingPolicy, HeuristicStrategyPolicy } from './models';
import type { AttentionPolicy, BlackboardState, CognitiveMetrics, ComposedStrategy, ScheduleDecision, SchedulingPolicy, StrategyPolicy, ThinkingProgram, ThinkingState, WorkingMemorySnapshot } from './types';

export class AttentionManager { constructor(private readonly policy: AttentionPolicy = new HeuristicAttentionPolicy()) {} distribute(state: BlackboardState) { return this.policy.distribute(state); } }
export class CognitiveScheduler { constructor(private readonly policy: SchedulingPolicy = new HeuristicSchedulingPolicy()) {} decide(state: BlackboardState, memory: WorkingMemorySnapshot): ScheduleDecision { return this.policy.decide(state, memory); } }
export class StrategyComposer { constructor(private readonly policy: StrategyPolicy = new HeuristicStrategyPolicy()) {} compose(state: BlackboardState, programs: readonly ThinkingProgram[]): ComposedStrategy { return this.policy.compose(state, programs); } }
export class ThinkingProgramRegistry {
  all(): readonly ThinkingProgram[] { return immutable([
    { id: 'program:luxury', name: 'LUXURY_OPTIMIZATION', steps: ['protect identity', 'shape soft light', 'verify premium cues'], dimensions: ['BRAND', 'QUALITY', 'IDENTITY'] },
    { id: 'program:portrait', name: 'PORTRAIT_OPTIMIZATION', steps: ['protect face', 'balance light', 'check composition'], dimensions: ['QUALITY', 'COMPOSITION', 'IDENTITY'] },
    { id: 'program:catalog', name: 'CATALOG_OPTIMIZATION', steps: ['normalize composition', 'preserve product', 'check consistency'], dimensions: ['COMPOSITION', 'CONSISTENCY'] },
    { id: 'program:ai-saving', name: 'AI_SAVING', steps: ['try local', 'estimate gain', 'escalate only if needed'], dimensions: ['COST', 'RISK'] },
    { id: 'program:brand', name: 'BRAND_PRESERVATION', steps: ['capture identity', 'check cues', 'reject drift'], dimensions: ['BRAND', 'IDENTITY', 'CONSISTENCY'] },
  ]); }
}
export class ExecutiveStateMachine {
  private static readonly order: readonly ThinkingState[] = ['IDLE', 'OBSERVE', 'ANALYZE', 'HYPOTHESIS', 'DEBATE', 'EVALUATE', 'REFLECT', 'LEARN', 'FINALIZE'];
  next(current: ThinkingState): ThinkingState { const index = ExecutiveStateMachine.order.indexOf(current); if (index < 0) throw new Error(`Unknown thinking state ${current}`); return ExecutiveStateMachine.order[Math.min(index + 1, ExecutiveStateMachine.order.length - 1)]; }
  run(): readonly ThinkingState[] { return immutable([...ExecutiveStateMachine.order]); }
}
export class CognitiveMetricsCalculator {
  calculate(state: BlackboardState, memory: WorkingMemorySnapshot, insights: number): CognitiveMetrics {
    const thoughts = state.thoughtGraph.thoughts.length; const relations = state.thoughtGraph.relations.length; const completed = state.goals.reduce((sum, goal) => sum + goal.completion, 0) / Math.max(1, state.goals.length); const alternatives = state.alternatives.length;
    return immutable({ thinkingDepth: Math.min(1, relations / Math.max(1, thoughts)), reasoningWidth: Math.min(1, thoughts / 20), evidenceDensity: rounded(state.evidence.length / Math.max(1, thoughts)), conflictDensity: rounded(state.conflicts.length / Math.max(1, thoughts)), goalCompletion: rounded(completed), novelty: rounded(state.alternatives.reduce((sum, item) => sum + item.novelty, 0) / Math.max(1, alternatives)), insightRate: rounded(insights / Math.max(1, thoughts)), learningVelocity: rounded(insights / Math.max(1, state.version)), stability: rounded(1 - state.conflicts.length / Math.max(1, thoughts)), explorationRatio: rounded(alternatives / Math.max(1, alternatives + thoughts)), exploitationRatio: rounded(thoughts / Math.max(1, alternatives + thoughts)), cognitiveLoad: rounded((thoughts + state.conflicts.length * 2 + state.unknowns.length) / 30), workingMemoryUsage: rounded(memory.activeThoughts.length / memory.capacity), attentionDistribution: memory.attention });
  }
}
