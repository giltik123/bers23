import { deepFreeze, sameScope } from './immutable';
import { DependencyPlanner } from './DependencyPlanner';
import { FailureRecoveryPlanner } from './FailureRecoveryPlanner';
import { GoalPlanner } from './GoalPlanner';
import { HierarchicalPlanner } from './HierarchicalPlanner';
import { PlanOptimizer } from './PlanOptimizer';
import { PlanPatterns } from './PlanPatterns';
import { PlanningExplainability } from './PlanningExplainability';
import { PlanningMemory } from './PlanningMemory';
import { PlanningMetricsEngine } from './PlanningMetricsEngine';
import { PlanningSimulator } from './PlanningSimulator';
import { ResourcePlanner } from './ResourcePlanner';
import { VerificationPlanner } from './VerificationPlanner';
import type { CreativePlan, CreativePlanningSnapshot, FailureReport, PlanMemoryRecord, PlanRequest, PlanStrategy, PlanningDependencies, PlanningScope } from './types';

const strategies: readonly PlanStrategy[] = ['cheap', 'fast', 'luxury', 'creative', 'safe'];

export class CreativePlanner {
  readonly patterns = new PlanPatterns();
  readonly memory = new PlanningMemory();
  private readonly goals: GoalPlanner;
  private readonly hierarchy: HierarchicalPlanner;
  private readonly resources = new ResourcePlanner();
  private readonly optimizer = new PlanOptimizer();
  private readonly verifier: VerificationPlanner;
  private readonly recovery: FailureRecoveryPlanner;
  private readonly simulator = new PlanningSimulator();
  private readonly metricsEngine = new PlanningMetricsEngine();
  private readonly dependencyPlanner = new DependencyPlanner();
  private readonly explainability = new PlanningExplainability();
  private lastPlan?: CreativePlan;
  private lastSnapshot?: CreativePlanningSnapshot;

  constructor(private readonly injections: PlanningDependencies) {
    if (!injections?.id || !injections?.now || !injections?.random) throw new Error('CreativePlanner requires id, now and random dependencies');
    this.goals = new GoalPlanner(injections);
    this.hierarchy = new HierarchicalPlanner(injections);
    this.verifier = new VerificationPlanner(injections);
    this.recovery = new FailureRecoveryPlanner(injections);
  }

  plan(request: PlanRequest): CreativePlan {
    this.validateScope(request.scope);
    const goalTree = this.goals.decompose(request.goal);
    const graph = this.hierarchy.build(goalTree, request.scope).snapshot(request.scope);
    const allocation = this.resources.allocate(graph, request.budget);
    this.lastPlan = deepFreeze({
      id: this.injections.id(), scope: { ...request.scope }, name: request.goal.title,
      strategy: request.strategy ?? 'balanced', goalTree, graph, resources: allocation,
      createdAt: this.injections.now(), generation: 1, ready: allocation.feasible && this.meetsConstraints(graph.nodes, request),
    });
    return this.lastPlan;
  }

  optimize(plan: CreativePlan = this.requiredPlan(), strategy: PlanStrategy = plan.strategy) {
    return this.optimizer.optimize(this.assertAccessible(plan, plan.scope), strategy);
  }

  simulate(plan: CreativePlan = this.requiredPlan()) { return this.simulator.simulate(this.assertAccessible(plan, plan.scope)); }
  verify(plan: CreativePlan = this.requiredPlan()) { return this.verifier.plan(this.assertAccessible(plan, plan.scope).graph); }
  repair(failure: FailureReport, plan: CreativePlan = this.requiredPlan()) { this.lastPlan = this.recovery.repair(this.assertAccessible(plan, plan.scope), failure); return this.lastPlan; }

  alternatives(request: PlanRequest): readonly CreativePlan[] {
    return deepFreeze(strategies.map((strategy) => this.plan({ ...request, strategy })).sort((a, b) => strategies.indexOf(a.strategy) - strategies.indexOf(b.strategy)));
  }

  dependencies(plan: CreativePlan = this.requiredPlan()) { return this.dependencyPlanner.analyze(plan.graph); }
  metrics(plan: CreativePlan = this.requiredPlan()) { return this.metricsEngine.calculate(plan); }

  debug(plan: CreativePlan = this.requiredPlan()) {
    const alternatives: readonly CreativePlan[] = [];
    const verification = this.verify(plan);
    return deepFreeze({ plan, dependencies: this.dependencies(plan), optimization: this.optimize(plan), verification, simulation: this.simulate(plan), metrics: this.metrics(plan), explanation: this.explainability.explain(plan, alternatives, verification) });
  }

  snapshot(plan: CreativePlan = this.requiredPlan()): CreativePlanningSnapshot {
    const verification = this.verify(plan);
    const alternatives: readonly CreativePlan[] = [];
    this.lastSnapshot = deepFreeze({ id: this.injections.id(), scope: { ...plan.scope }, plan, alternatives, verification, simulation: this.simulate(plan), metrics: this.metrics(plan), explanation: this.explainability.explain(plan, alternatives, verification), history: this.memory.snapshot(plan.scope), createdAt: this.injections.now() });
    return this.lastSnapshot;
  }

  record(plan: CreativePlan, successful: boolean, errors: readonly string[] = []): PlanMemoryRecord {
    const record: PlanMemoryRecord = { id: this.injections.id(), scope: { ...plan.scope }, planId: plan.id, successful, errors: [...errors], structure: plan.graph.topologicalOrder, metrics: this.metrics(plan), createdAt: this.injections.now() };
    return this.memory.remember(record);
  }

  replay(snapshot: CreativePlanningSnapshot, scope: PlanningScope): CreativePlan {
    if (!sameScope(snapshot.scope, scope)) throw new Error('Scope isolation violation');
    this.lastPlan = deepFreeze({ ...snapshot.plan, id: this.injections.id(), createdAt: this.injections.now(), generation: snapshot.plan.generation + 1, parentPlanId: snapshot.plan.id });
    return this.lastPlan;
  }

  private meetsConstraints(nodes: CreativePlan['graph']['nodes'], request: PlanRequest): boolean {
    const constraints = request.constraints;
    if (!constraints) return true;
    const operations = nodes.filter((node) => node.type === 'operation');
    const cost = operations.reduce((sum, node) => sum + node.cost, 0);
    const latency = operations.reduce((sum, node) => sum + node.latency, 0);
    const risk = Math.max(0, ...operations.map((node) => node.risk));
    const quality = Math.min(1, ...operations.map((node) => node.quality));
    return (constraints.maxCost === undefined || cost <= constraints.maxCost)
      && (constraints.maxLatency === undefined || latency <= constraints.maxLatency)
      && (constraints.maxRisk === undefined || risk <= constraints.maxRisk)
      && (constraints.minimumQuality === undefined || quality >= constraints.minimumQuality);
  }

  private validateScope(scope: PlanningScope): void { if (!scope?.tenantId || !scope?.projectId || !scope?.userId) throw new Error('Complete planning scope is required'); }
  private assertAccessible(plan: CreativePlan, scope: PlanningScope): CreativePlan { if (!sameScope(plan.scope, scope)) throw new Error('Scope isolation violation'); return plan; }
  private requiredPlan(): CreativePlan { if (!this.lastPlan) throw new Error('No plan available'); return this.lastPlan; }
}
