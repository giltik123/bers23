import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  CreativePlanner, DependencyPlanner, FailureRecoveryPlanner, GoalPlanner,
  PlanGraph, PlanOptimizer, PlanPatterns, PlanningExplainability, PlanningMemory,
  PlanningMetricsEngine, PlanningSimulator, ResourcePlanner, VerificationPlanner,
  type CreativePlan, type GoalDefinition, type PlanNode, type PlanningDependencies, type PlanningScope,
} from '../src/platform/creative/planning';

const scope: PlanningScope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const foreignScope: PlanningScope = { tenantId: 'tenant-b', projectId: 'project-b', userId: 'user-b' };
const dependencies = (): PlanningDependencies => { let id = 0; let now = 100; return { id: () => `plan-${++id}`, now: () => ++now, random: () => 0.5 }; };
const goal: GoalDefinition = { title: 'Luxury Campaign', priority: 0.9, tags: ['luxury'], subGoals: [{ title: 'Image', subGoals: [{ title: 'Lighting', operations: ['soft lighting', 'rim lighting'] }, { title: 'Color', operations: ['warm grading'] }] }, { title: 'Delivery', operations: ['final verification'] }] };
const request = (overrides = {}) => ({ scope, goal, strategy: 'balanced' as const, budget: { credits: 100, ai: 10, local: 20, memory: 50, thinking: 50, runtime: 50 }, ...overrides });
const fixture = () => { const planner = new CreativePlanner(dependencies()); const plan = planner.plan(request()); return { planner, plan }; };

test('planner requires ID, time and random DI', () => assert.throws(() => new CreativePlanner({} as never)));
test('planner rejects incomplete scope', () => assert.throws(() => new CreativePlanner(dependencies()).plan(request({ scope: { tenantId: '', projectId: 'p', userId: 'u' } }))));
test('plan receives injected ID', () => assert.match(fixture().plan.id, /^plan-/));
test('plan receives injected timestamp', () => assert.ok(fixture().plan.createdAt > 100));
test('plan preserves complete scope', () => assert.deepEqual(fixture().plan.scope, scope));
test('plan is deeply immutable', () => { const { plan } = fixture(); assert.ok(Object.isFrozen(plan)); assert.ok(Object.isFrozen(plan.graph.nodes)); assert.throws(() => (plan.goalTree as unknown[]).push({})); });
test('plan starts at generation one', () => assert.equal(fixture().plan.generation, 1));
test('feasible plan is execution ready', () => assert.equal(fixture().plan.ready, true));
test('constraint violation blocks readiness', () => assert.equal(new CreativePlanner(dependencies()).plan(request({ constraints: { maxLatency: 1 } })).ready, false));

test('goal planner creates main goal', () => assert.equal(new GoalPlanner(dependencies()).decompose(goal)[0].title, 'Luxury Campaign'));
test('goal planner creates micro-goals', () => assert.ok(new GoalPlanner(dependencies()).decompose(goal).some((item) => item.level === 2)));
test('goal planner attaches operations', () => assert.deepEqual(new GoalPlanner(dependencies()).decompose(goal).find((item) => item.title === 'Lighting')?.operations, ['rim lighting', 'soft lighting']));
test('goal planner links parents and children', () => { const tree = new GoalPlanner(dependencies()).decompose(goal); const root = tree[0]; assert.ok(root.childIds.length === 2); assert.ok(tree.filter((item) => item.parentId === root.id).length === 2); });
test('goal planner deduplicates operations', () => { const tree = new GoalPlanner(dependencies()).decompose({ title: 'A', operations: ['x', 'x'] }); assert.deepEqual(tree[0].operations, ['x']); });
test('goal planner clamps priority', () => assert.equal(new GoalPlanner(dependencies()).decompose({ title: 'A', priority: 10 })[0].priority, 1));

const graphFixture = () => { const graph = new PlanGraph(); const node = (id: string, nodeScope = scope): PlanNode => ({ id, scope: nodeScope, type: 'operation', title: id, goalId: 'goal', operation: id, dependencies: [], status: 'planned', quality: 0.8, cost: 1, latency: 1, risk: 0.1, local: true, ai: false, tags: [] }); graph.addNode(node('a')); graph.addNode(node('b')); graph.addNode(node('c')); graph.addEdge({ source: 'a', target: 'c', relation: 'depends-on' }, scope); graph.addEdge({ source: 'b', target: 'c', relation: 'depends-on' }, scope); return graph; };
test('plan graph adds immutable nodes', () => assert.ok(Object.isFrozen(graphFixture().nodes(scope)[0])));
test('plan graph rejects duplicate nodes', () => { const graph = graphFixture(); assert.throws(() => graph.addNode(graph.nodes(scope)[0])); });
test('plan graph rejects broken edges', () => assert.throws(() => graphFixture().addEdge({ source: 'a', target: 'missing', relation: 'depends-on' }, scope)));
test('plan graph rejects cross-scope edges', () => { const graph = graphFixture(); graph.addNode({ ...graph.nodes(scope)[0], id: 'foreign', scope: foreignScope }); assert.throws(() => graph.addEdge({ source: 'a', target: 'foreign', relation: 'depends-on' }, scope)); });
test('plan graph prevents cycles', () => assert.throws(() => graphFixture().addEdge({ source: 'c', target: 'a', relation: 'depends-on' }, scope)));
test('plan graph returns dependencies', () => assert.deepEqual(graphFixture().dependencies('c', scope).map((item) => item.id), ['a', 'b']));
test('plan graph returns dependents', () => assert.deepEqual(graphFixture().dependents('a', scope).map((item) => item.id), ['c']));
test('plan graph computes topological order', () => assert.deepEqual(graphFixture().topologicalOrder(scope), ['a', 'b', 'c']));
test('plan graph identifies parallel work', () => assert.deepEqual(graphFixture().parallelGroups(scope)[0], ['a', 'b']));
test('plan graph snapshot is immutable', () => assert.ok(Object.isFrozen(graphFixture().snapshot(scope).parallelGroups[0])));

test('hierarchical planner creates goal nodes', () => assert.ok(fixture().plan.graph.nodes.some((item) => item.type === 'goal')));
test('hierarchical planner creates operation nodes', () => assert.equal(fixture().plan.graph.nodes.filter((item) => item.type === 'operation').length, 4));
test('hierarchical planner links hierarchy', () => assert.ok(fixture().plan.graph.edges.some((item) => item.relation === 'decomposes-to')));

test('resource planner counts credits', () => assert.equal(new ResourcePlanner().allocate(fixture().plan.graph).credits, 0));
test('resource planner counts local operations', () => assert.equal(new ResourcePlanner().allocate(fixture().plan.graph).local, 4));
test('resource planner detects shortages', () => { const result = new ResourcePlanner().allocate(fixture().plan.graph, { local: 0 }); assert.equal(result.feasible, false); assert.ok(result.shortages.includes('local')); });
test('resource allocation is immutable', () => assert.ok(Object.isFrozen(new ResourcePlanner().allocate(fixture().plan.graph))));

for (const strategy of ['balanced', 'cheap', 'fast', 'luxury', 'creative', 'safe'] as const) {
  test(`optimizer supports ${strategy} strategy`, () => { const result = new PlanOptimizer().optimize(fixture().plan, strategy); assert.ok(result.score >= 0 && result.score <= 1); assert.equal(result.weights.quality + result.weights.cost + result.weights.latency + result.weights.risk + result.weights.dependencies + result.weights.parallelism, 1); });
}
test('optimizer explains applied changes', () => assert.match(new PlanOptimizer().optimize(fixture().plan, 'cheap').changes[0], /cheap/));
test('facade optimize uses current plan', () => assert.ok(fixture().planner.optimize().score > 0));

test('alternatives returns five named strategies', () => assert.deepEqual(fixture().planner.alternatives(request()).map((item) => item.strategy), ['cheap', 'fast', 'luxury', 'creative', 'safe']));
test('alternative plans have unique IDs', () => { const plans = fixture().planner.alternatives(request()); assert.equal(new Set(plans.map((item) => item.id)).size, 5); });
test('alternative plans remain scope isolated', () => assert.ok(fixture().planner.alternatives(request()).every((item) => item.scope.tenantId === scope.tenantId)));

test('dependency planner reports before and after', () => { const result = new DependencyPlanner().analyze(fixture().plan.graph); assert.ok(result.before.length > 0); assert.equal(result.after.length, fixture().plan.graph.nodes.length); });
test('dependency planner exposes parallel groups', () => assert.ok(new DependencyPlanner().analyze(fixture().plan.graph).parallel.length > 0));
test('facade dependency result is immutable', () => assert.ok(Object.isFrozen(fixture().planner.dependencies())));

test('verification planner creates checks for operations', () => assert.equal(fixture().planner.verify().length, 4));
test('verification describes what to check', () => assert.match(fixture().planner.verify()[0].check, /quality/));
test('verification describes how to check', () => assert.ok(fixture().planner.verify()[0].method.length > 0));
test('verification describes when to check', () => assert.equal(fixture().planner.verify()[0].when, 'after'));
test('verification uses injected IDs', () => assert.match(fixture().planner.verify()[0].id, /^plan-/));

test('recovery creates a new plan instead of retry', () => { const { planner, plan } = fixture(); const failed = plan.graph.nodes.find((item) => item.type === 'operation')!; const repaired = planner.repair({ planId: plan.id, nodeId: failed.id, reason: 'quality', severity: 0.8 }); assert.notEqual(repaired.id, plan.id); assert.equal(repaired.parentPlanId, plan.id); });
test('recovery increments generation', () => { const { planner, plan } = fixture(); const node = plan.graph.nodes.find((item) => item.type === 'operation')!; assert.equal(planner.repair({ planId: plan.id, nodeId: node.id, reason: 'risk', severity: 1 }).generation, 2); });
test('recovery replaces failed node', () => { const { planner, plan } = fixture(); const node = plan.graph.nodes.find((item) => item.type === 'operation')!; assert.ok(planner.repair({ planId: plan.id, nodeId: node.id, reason: 'risk', severity: 1 }).graph.nodes.some((item) => item.title.startsWith('Recovery:'))); });
test('recovery rejects unknown failures', () => { const { planner, plan } = fixture(); assert.throws(() => planner.repair({ planId: plan.id, nodeId: 'missing', reason: 'risk', severity: 1 })); });

test('simulation calculates cost', () => assert.equal(fixture().planner.simulate().cost, 0));
test('simulation calculates quality', () => assert.ok(fixture().planner.simulate().quality >= 0.8));
test('simulation calculates probability of success', () => assert.ok(fixture().planner.simulate().successProbability > 0));
test('simulation calculates parallel time', () => assert.ok(fixture().planner.simulate().time > 0));
test('simulation result is immutable', () => assert.ok(Object.isFrozen(new PlanningSimulator().simulate(fixture().plan))));

test('memory stores successful plans', () => { const { planner, plan } = fixture(); planner.record(plan, true); assert.equal(planner.memory.successful(scope).length, 1); });
test('memory stores failed plans', () => { const { planner, plan } = fixture(); planner.record(plan, false, ['quality']); assert.equal(planner.memory.failed(scope).length, 1); });
test('memory counts frequent errors', () => { const { planner, plan } = fixture(); planner.record(plan, false, ['quality']); planner.record(plan, false, ['quality']); assert.deepEqual(planner.memory.frequentErrors(scope), [{ error: 'quality', count: 2 }]); });
test('memory ranks best structures', () => { const { planner, plan } = fixture(); planner.record(plan, true); assert.equal(planner.memory.bestStructures(scope).length, 1); });
test('memory isolates tenants projects and users', () => { const memory = new PlanningMemory(); const { planner, plan } = fixture(); const record = planner.record(plan, true); memory.remember(record); memory.remember({ ...record, id: 'foreign', scope: foreignScope }); assert.equal(memory.snapshot(scope).length, 1); });

for (const pattern of ['luxury-portrait', 'catalog', 'fashion', 'marketing', 'background-removal', 'try-on', 'studio-portrait']) {
  test(`pattern library contains ${pattern}`, () => assert.ok(new PlanPatterns().get(pattern)?.title));
}
test('pattern names are deterministic', () => assert.deepEqual(new PlanPatterns().names(), new PlanPatterns().names()));
test('pattern library is deeply immutable', () => assert.ok(Object.isFrozen(new PlanPatterns().all()['catalog'].subGoals)));

test('metrics include quality', () => assert.ok(new PlanningMetricsEngine().calculate(fixture().plan).quality > 0));
test('metrics include complexity', () => assert.ok(new PlanningMetricsEngine().calculate(fixture().plan).complexity > 0));
test('metrics include efficiency', () => assert.ok(new PlanningMetricsEngine().calculate(fixture().plan).efficiency > 0));
test('metrics include robustness', () => assert.ok(new PlanningMetricsEngine().calculate(fixture().plan).robustness > 0));
test('metrics include flexibility', () => assert.ok(new PlanningMetricsEngine().calculate(fixture().plan).flexibility > 0));
test('metrics include explainability', () => assert.equal(new PlanningMetricsEngine().calculate(fixture().plan).explainability, 1));

test('explanation follows all planning stages', () => { const { planner, plan } = fixture(); const result = new PlanningExplainability().explain(plan, [], planner.verify()); for (const stage of ['Goal:', 'Plan:', 'Dependencies:', 'Optimization:', 'Alternatives:', 'Verification:', 'Execution Readiness:']) assert.match(result.narrative, new RegExp(stage)); });
test('debug returns complete planning trace', () => { const result = fixture().planner.debug(); assert.ok(result.dependencies); assert.ok(result.optimization); assert.ok(result.verification); assert.ok(result.simulation); });
test('snapshot contains plan simulation metrics and explanation', () => { const result = fixture().planner.snapshot(); assert.ok(result.plan); assert.ok(result.simulation); assert.ok(result.metrics); assert.ok(result.explanation); });
test('snapshot is deeply immutable', () => { const result = fixture().planner.snapshot(); assert.throws(() => (result.verification as unknown[]).push({})); assert.ok(Object.isFrozen(result.scope)); });
test('replay increments plan generation', () => { const { planner } = fixture(); const snapshot = planner.snapshot(); assert.equal(planner.replay(snapshot, scope).generation, 2); });
test('replay keeps causal parent', () => { const { planner } = fixture(); const snapshot = planner.snapshot(); assert.equal(planner.replay(snapshot, scope).parentPlanId, snapshot.plan.id); });
test('replay rejects cross-tenant access', () => { const { planner } = fixture(); assert.throws(() => planner.replay(planner.snapshot(), foreignScope)); });
test('same DI stream and input produce identical plans', () => assert.deepEqual(new CreativePlanner(dependencies()).plan(request()), new CreativePlanner(dependencies()).plan(request())));
test('randomness is injected but not required by deterministic heuristics', () => { let calls = 0; const planner = new CreativePlanner({ ...dependencies(), random: () => { calls += 1; return 0.1; } }); planner.plan(request()); assert.equal(calls, 0); });
test('planning has no forbidden imports', () => { const directory = 'src/platform/creative/planning'; const forbidden = ['workflow', 'provider', 'billing', 'application', 'ui', 'react', 'retired-runtime']; for (const file of readdirSync(directory)) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(`${directory}/${file}`, 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n').toLowerCase(); for (const term of forbidden) assert.equal(imports.includes(term), false, `${file} imports ${term}`); } });
