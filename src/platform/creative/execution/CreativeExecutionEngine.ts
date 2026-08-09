import type { CreativePlan } from '../planning';
import { CheckpointEngine } from './CheckpointEngine';
import { ExecutionCostEstimator } from './ExecutionCostEstimator';
import { ExecutionExplainability } from './ExecutionExplainability';
import { ExecutionMemory } from './ExecutionMemory';
import { ExecutionMetrics } from './ExecutionMetrics';
import { ExecutionOptimizer } from './ExecutionOptimizer';
import { ExecutionPatternLibrary } from './ExecutionPatternLibrary';
import { ExecutionPlanner } from './ExecutionPlanner';
import { ExecutionReplay } from './ExecutionReplay';
import { ExecutionSimulator } from './ExecutionSimulator';
import { deepFreeze, sameScope } from './immutable';
import { OperationScheduler } from './OperationScheduler';
import { ResourceAllocator } from './ResourceAllocator';
import { RetryPlanner } from './RetryPlanner';
import { RollbackPlanner } from './RollbackPlanner';
import { VerificationEngine } from './VerificationEngine';
import type {
  ExecutionCheckpoint, ExecutionDependencies, ExecutionGraphSnapshot, ExecutionMemoryRecord,
  ExecutionResourceBudget, ExecutionScope, ExecutionSnapshot, RetryAction,
} from './types';

export class CreativeExecutionEngine {
  readonly memory = new ExecutionMemory();
  readonly patterns = new ExecutionPatternLibrary();
  readonly retries = new RetryPlanner();
  private readonly planner: ExecutionPlanner;
  private readonly scheduler = new OperationScheduler();
  private readonly optimizer = new ExecutionOptimizer();
  private readonly simulator = new ExecutionSimulator();
  private readonly verifier: VerificationEngine;
  private readonly costs = new ExecutionCostEstimator();
  private readonly resources = new ResourceAllocator();
  private readonly checkpoints: CheckpointEngine;
  private readonly rollbacks = new RollbackPlanner();
  private readonly replayEngine = new ExecutionReplay();
  private readonly explainability = new ExecutionExplainability();
  private readonly metricEngine = new ExecutionMetrics();
  private graph?: ExecutionGraphSnapshot;
  private plan?: CreativePlan;
  private checkpointStore: readonly ExecutionCheckpoint[] = [];

  constructor(private readonly dependencies: ExecutionDependencies) {
    if (!dependencies?.id || !dependencies?.now || !dependencies?.random) throw new Error('CreativeExecutionEngine requires id, now and random dependencies');
    this.planner = new ExecutionPlanner(dependencies);
    this.verifier = new VerificationEngine(dependencies);
    this.checkpoints = new CheckpointEngine(dependencies);
  }

  planExecution(plan: CreativePlan): ExecutionGraphSnapshot {
    this.plan = plan;
    this.graph = this.planner.build(plan);
    this.checkpointStore = deepFreeze([]);
    return this.graph;
  }

  buildGraph(plan: CreativePlan = this.requiredPlan()): ExecutionGraphSnapshot { return this.planExecution(plan); }
  schedule(graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.scheduler.schedule(graph); }
  optimize(graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.optimizer.optimize(graph); }
  simulate(graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.simulator.simulate(graph, this.schedule(graph)); }
  verify(graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.verifier.build(graph); }
  estimateCost(graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.costs.estimate(graph); }
  allocateResources(budget: Partial<ExecutionResourceBudget> = {}, graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.resources.allocate(graph, budget); }

  checkpoint(stageId: string, graph: ExecutionGraphSnapshot = this.requiredGraph()): ExecutionCheckpoint {
    const value = this.checkpoints.create(graph, stageId, this.verify(graph));
    this.checkpointStore = deepFreeze([...this.checkpointStore, value]);
    return value;
  }

  rollback(checkpoint: ExecutionCheckpoint, graph: ExecutionGraphSnapshot = this.requiredGraph()) {
    this.checkpoints.assertScope(checkpoint, graph.scope);
    return this.rollbacks.plan(graph, checkpoint);
  }

  retry(failedNodeId: string, action?: RetryAction, graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.retries.plan(graph, failedNodeId, action); }
  replay(checkpoint: ExecutionCheckpoint, scope: ExecutionScope, graph: ExecutionGraphSnapshot = this.requiredGraph()) { return this.replayEngine.replay(graph, checkpoint, scope); }

  snapshot(graph: ExecutionGraphSnapshot = this.requiredGraph()): ExecutionSnapshot {
    const plan = this.requiredPlan();
    if (!sameScope(plan.scope, graph.scope)) throw new Error('Scope isolation violation');
    const schedule = this.schedule(graph);
    const verification = this.verify(graph);
    const simulation = this.simulator.simulate(graph, schedule);
    const resources = this.allocateResources({}, graph);
    return deepFreeze({ id: this.dependencies.id(), scope: { ...graph.scope }, plan, graph, schedule, cost: this.costs.estimate(graph), resources, verification, simulation, metrics: this.metricEngine.calculate(graph, simulation, resources, verification), checkpoints: this.checkpointStore.filter((item) => item.graphId === graph.id), createdAt: this.dependencies.now() });
  }

  debug(graph: ExecutionGraphSnapshot = this.requiredGraph()) {
    return deepFreeze({ graph, schedule: this.schedule(graph), optimization: this.optimize(graph), cost: this.estimateCost(graph), resources: this.allocateResources({}, graph), verification: this.verify(graph), simulation: this.simulate(graph), explanation: this.explainability.explain(graph), checkpoints: this.checkpointStore });
  }

  record(successful: boolean, errors: readonly string[] = [], graph: ExecutionGraphSnapshot = this.requiredGraph()): ExecutionMemoryRecord {
    const simulation = this.simulate(graph);
    return this.memory.remember({ id: this.dependencies.id(), scope: { ...graph.scope }, graphId: graph.id, successful, time: simulation.latency, cost: simulation.credits, errors: [...errors], verification: this.verify(graph).map((item) => item.check), createdAt: this.dependencies.now() });
  }

  private requiredGraph(): ExecutionGraphSnapshot { if (!this.graph) throw new Error('No execution graph available'); return this.graph; }
  private requiredPlan(): CreativePlan { if (!this.plan) throw new Error('No creative plan available'); return this.plan; }
}
