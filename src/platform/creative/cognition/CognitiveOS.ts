import { CreativeBlackboard } from './CreativeBlackboard';
import { AttentionManager, CognitiveMetricsCalculator, CognitiveScheduler, ExecutiveStateMachine, StrategyComposer, ThinkingProgramRegistry } from './executive';
import { immutable } from './immutable';
import { CuriosityEngine, InsightGenerator, SaliencyEngine } from './managers';
import { WorkingMemory } from './WorkingMemory';
import type { BlackboardState, CognitiveDependencies, CognitiveRequest, CognitiveResult, CognitiveScope, Goal, ReplayStep, Thought, UnifiedCognitiveGraph } from './types';

export class CreativeCognitiveOS {
  private readonly blackboard = new CreativeBlackboard();
  private readonly attention = new AttentionManager();
  private readonly saliency = new SaliencyEngine();
  private readonly curiosity = new CuriosityEngine();
  private readonly programs = new ThinkingProgramRegistry();
  private readonly strategies = new StrategyComposer();
  private readonly scheduler = new CognitiveScheduler();
  private readonly states = new ExecutiveStateMachine();
  private readonly metrics = new CognitiveMetricsCalculator();
  private readonly insights = new InsightGenerator();
  private readonly results = new Map<string, CognitiveResult>();

  constructor(private readonly dependencies: CognitiveDependencies) {}

  think(request: CognitiveRequest): CognitiveResult {
    this.validate(request);
    const input = immutable(structuredClone(request));
    const id = this.dependencies.nextId();
    const at = this.dependencies.now();
    const scope = this.scope(input);
    const goals = input.goals.map((title, index) => this.goal(title, index, at));
    const thoughts = goals.map((goal, index) => this.thought(goal, index, at));
    let state = this.blackboard.create(scope);
    state = this.blackboard.write(state, scope, { goals, constraints: input.constraints ?? [], experts: input.experts ?? [], worldState: input.worldState ?? {}, thoughts });
    const alternatives = this.curiosity.explore(state);
    state = this.blackboard.write(state, scope, { alternatives });
    const attention = this.attention.distribute(state);
    const strategy = this.strategies.compose(state, this.programs.all());
    const memory = new WorkingMemory(input.memoryCapacity ?? 20).update({ thoughts: state.thoughtGraph.thoughts, attention, goalId: goals[0]?.id, strategy });
    const schedule = this.scheduler.decide(state, memory);
    const generatedInsights = this.insights.generate([]);
    const metrics = this.metrics.calculate(state, memory, generatedInsights.length);
    const replay = this.buildReplay(at, thoughts);
    const graph = this.buildUnifiedGraph(goals, thoughts, strategy.id, generatedInsights.map((item) => item.id));
    const result = immutable({ id, ...scope, blackboard: state, workingMemory: memory, strategy, schedule, metrics, replay, graph, finalState: 'FINALIZE' as const });
    this.results.set(id, result);
    return result;
  }

  replay(id: string, scope: CognitiveScope): readonly ReplayStep[] {
    const result = this.results.get(id);
    if (!result) throw new Error(`Unknown cognitive process ${id}`);
    this.assertScope(result, scope);
    return immutable(structuredClone(result.replay));
  }

  inspect(id: string, scope: CognitiveScope): CognitiveResult {
    const result = this.results.get(id);
    if (!result) throw new Error(`Unknown cognitive process ${id}`);
    this.assertScope(result, scope);
    return immutable(structuredClone(result));
  }

  private goal(title: string, index: number, at: number): Goal {
    return immutable({ id: this.dependencies.nextId(), title, priority: Math.max(1, 100 - index * 10), weight: Number(Math.max(.1, 1 - index * .1).toFixed(2)), deadline: at + (index + 1) * 60_000, completion: 0, blockingGoalIds: index ? [] : [] });
  }

  private thought(goal: Goal, index: number, at: number): Thought {
    const signals = immutable({ novelty: this.dependencies.random(), importance: goal.weight, risk: 0, goalImpact: 1, confidence: .7, urgency: Number((1 / (index + 1)).toFixed(4)) });
    return immutable({ id: this.dependencies.nextId(), type: 'GOAL', content: goal.title, createdAt: at, saliency: this.saliency.score(signals), signals, tags: ['goal'] });
  }

  private buildReplay(at: number, thoughts: readonly Thought[]): readonly ReplayStep[] {
    return immutable(this.states.run().map((state, sequence) => ({ sequence, state, at, event: state === 'HYPOTHESIS' ? 'Form working hypothesis' : `${state.toLowerCase()} cognitive state`, thoughtId: thoughts[sequence % Math.max(1, thoughts.length)]?.id })));
  }

  private buildUnifiedGraph(goals: readonly Goal[], thoughts: readonly Thought[], strategyId: string, insightIds: readonly string[]): UnifiedCognitiveGraph {
    const chain = ['Goal', 'Thought', 'Hypothesis', 'Evidence', 'Experts', 'Debate', 'Consensus', 'Strategy', 'Decision', 'Reflection', 'Learning', 'Insight'];
    const nodes = chain.map((kind, index) => ({ id: index === 0 ? goals[0]?.id ?? `graph:goal` : index === 1 ? thoughts[0]?.id ?? `graph:thought` : kind === 'Strategy' ? strategyId : kind === 'Insight' ? insightIds[0] ?? 'graph:insight' : `graph:${kind.toLowerCase()}`, kind, label: kind }));
    const edges = nodes.slice(1).map((node, index) => ({ from: nodes[index].id, to: node.id, relation: 'COGNITIVE_FLOW' }));
    return immutable({ nodes, edges });
  }

  private scope(value: CognitiveScope): CognitiveScope { return { tenantId: value.tenantId, projectId: value.projectId, userId: value.userId }; }
  private validate(input: CognitiveRequest): void { if (!input.tenantId || !input.projectId || !input.userId) throw new Error('Complete cognitive scope is required'); if (!input.prompt.trim()) throw new Error('Prompt is required'); if (!input.goals.length) throw new Error('At least one goal is required'); }
  private assertScope(result: CognitiveScope, scope: CognitiveScope): void { if (result.tenantId !== scope.tenantId || result.projectId !== scope.projectId || result.userId !== scope.userId) throw new Error('Cognitive scope violation'); }
}
