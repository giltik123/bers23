import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { CreativePlanner, type PlanningDependencies, type PlanningScope } from '../src/platform/creative/planning';
import {
  CheckpointEngine, CreativeExecutionEngine, ExecutionCostEstimator, ExecutionExplainability,
  ExecutionGraph, ExecutionMemory, ExecutionMetrics, ExecutionOptimizer, ExecutionPatternLibrary,
  ExecutionPlanner, ExecutionReplay, ExecutionSimulator, OperationScheduler, ParallelizationEngine,
  ResourceAllocator, RetryPlanner, RollbackPlanner, VerificationEngine,
  type ExecutionDependencies, type ExecutionGraphSnapshot, type ExecutionNode,
} from '../src/platform/creative/execution';

const scope: PlanningScope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const foreignScope: PlanningScope = { tenantId: 'tenant-b', projectId: 'project-b', userId: 'user-b' };
const executionDependencies = (): ExecutionDependencies => { let id = 0; let now = 1000; return { id: () => `execution-${++id}`, now: () => ++now, random: () => 0.5 }; };
const planningDependencies = (): PlanningDependencies => { let id = 0; let now = 100; return { id: () => `planning-${++id}`, now: () => ++now, random: () => 0.5 }; };
const creativePlan = () => new CreativePlanner(planningDependencies()).plan({ scope, goal: { title: 'Product Campaign', subGoals: [{ title: 'Background', operations: ['background cleanup', 'generate background'] }, { title: 'Lighting', operations: ['exposure', 'white balance'] }, { title: 'Finish', operations: ['upscale', 'export'] }] }, budget: { credits: 100, ai: 10, local: 20, memory: 50, thinking: 50, runtime: 50 } });
const fixture = () => { const engine = new CreativeExecutionEngine(executionDependencies()); const plan = creativePlan(); const graph = engine.planExecution(plan); return { engine, plan, graph }; };
const node = (id: string, nodeScope = scope): ExecutionNode => ({ id, scope: nodeScope, planNodeId: `plan-${id}`, operation: id, mode: 'local', status: 'pending', dependencies: [], rollbackPoint: true, verificationRequired: true, credits: 0, latency: 2, gpuTime: 0, cpuTime: 2, memory: 4, aiCalls: 0, expectedRetries: 0.1, quality: 0.9, risk: 0.1, tags: [] });
const graphFixture = () => { const deps = executionDependencies(); const graph = new ExecutionGraph(deps); graph.addNode(node('load')); graph.addNode(node('lighting')); graph.addNode(node('analysis')); graph.addNode(node('export')); graph.addEdge({ source: 'load', target: 'lighting', relation: 'depends-on' }, scope); graph.addEdge({ source: 'load', target: 'analysis', relation: 'depends-on' }, scope); graph.addEdge({ source: 'lighting', target: 'export', relation: 'depends-on' }, scope); graph.addEdge({ source: 'analysis', target: 'export', relation: 'depends-on' }, scope); const stageGroups = graph.parallelGroups(scope); const stages = stageGroups.map((ids, index) => ({ id: `stage-${index + 1}`, order: index + 1, name: `Stage ${index + 1}`, groups: [{ id: `group-${index + 1}`, nodeIds: ids, parallel: ids.length > 1 }], barriers: [] })); return graph.snapshot(scope, 'creative-plan', stages); };

test('engine requires injected id, time and randomness', () => assert.throws(() => new CreativeExecutionEngine({} as never)));
test('engine rejects API calls before planning', () => assert.throws(() => new CreativeExecutionEngine(executionDependencies()).schedule()));
test('planExecution returns execution graph', () => assert.ok(fixture().graph.nodes.length > 0));
test('buildGraph is public alias', () => { const engine = new CreativeExecutionEngine(executionDependencies()); assert.equal(engine.buildGraph(creativePlan()).planId.startsWith('planning-'), true); });
test('graph uses injected ID', () => assert.match(fixture().graph.id, /^execution-/));
test('graph uses injected timestamp', () => assert.ok(fixture().graph.createdAt > 1000));
test('graph preserves scope', () => assert.deepEqual(fixture().graph.scope, scope));
test('graph references source plan', () => assert.equal(fixture().graph.planId, fixture().plan.id));
test('planner maps every operation', () => assert.equal(fixture().graph.nodes.length, 6));
test('planner distinguishes local and AI operations', () => { const nodes = fixture().graph.nodes; assert.ok(nodes.some((item) => item.mode === 'local')); assert.ok(nodes.some((item) => item.mode === 'ai')); });
test('planner adds rollback points', () => assert.ok(fixture().graph.nodes.every((item) => item.rollbackPoint)));
test('planner requires verification', () => assert.ok(fixture().graph.nodes.every((item) => item.verificationRequired)));

test('execution graph adds immutable nodes', () => { const graph = new ExecutionGraph(executionDependencies()); assert.ok(Object.isFrozen(graph.addNode(node('a')))); });
test('execution graph rejects duplicate nodes', () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('a')); assert.throws(() => graph.addNode(node('a'))); });
test('execution graph rejects broken edges', () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('a')); assert.throws(() => graph.addEdge({ source: 'a', target: 'b', relation: 'depends-on' }, scope)); });
test('execution graph rejects cross-scope edges', () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('a')); graph.addNode(node('b', foreignScope)); assert.throws(() => graph.addEdge({ source: 'a', target: 'b', relation: 'depends-on' }, scope)); });
test('execution graph rejects cycles', () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('a')); graph.addNode(node('b')); graph.addEdge({ source: 'a', target: 'b', relation: 'depends-on' }, scope); assert.throws(() => graph.addEdge({ source: 'b', target: 'a', relation: 'depends-on' }, scope)); });
test('execution graph rejects self cycles', () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('a')); assert.throws(() => graph.addEdge({ source: 'a', target: 'a', relation: 'depends-on' }, scope)); });
test('execution graph computes topological order', () => assert.deepEqual(graphFixture().topologicalOrder, ['load', 'analysis', 'lighting', 'export']));
test('execution graph finds parallel groups', () => assert.deepEqual(graphFixture().stages[1].groups[0].nodeIds, ['analysis', 'lighting']));
test('execution graph validates barriers', () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('a')); graph.addNode(node('b')); assert.throws(() => graph.addBarrier({ id: 'barrier', afterNodeIds: ['missing'], beforeNodeIds: ['b'], reason: 'sync' }, scope)); });
test('execution graph snapshot is deeply immutable', () => { const graph = graphFixture(); assert.ok(Object.isFrozen(graph.nodes)); assert.ok(Object.isFrozen(graph.scope)); });

test('parallelization discovers independent operations', () => assert.deepEqual(new ParallelizationEngine().find(graphFixture())[1], ['analysis', 'lighting']));
test('parallelization keeps dependencies ordered', () => { const groups = new ParallelizationEngine().find(graphFixture()); assert.equal(groups[0][0], 'load'); assert.equal(groups.at(-1)![0], 'export'); });
test('parallelization result is immutable', () => assert.ok(Object.isFrozen(new ParallelizationEngine().find(graphFixture())[0])));

test('scheduler creates ordered stages', () => assert.equal(new OperationScheduler().schedule(graphFixture()).stages.length, 3));
test('scheduler calculates critical path', () => assert.equal(new OperationScheduler().schedule(graphFixture()).criticalPath.length, 3));
test('scheduler accounts for parallel latency', () => assert.equal(new OperationScheduler().schedule(graphFixture()).totalLatency, 6));
test('scheduler reports parallelism', () => assert.ok(new OperationScheduler().schedule(graphFixture()).parallelism > 0));
test('schedule is immutable', () => assert.ok(Object.isFrozen(new OperationScheduler().schedule(graphFixture()))));

test('optimizer returns bounded score', () => { const score = new ExecutionOptimizer().optimize(graphFixture()).score; assert.ok(score >= 0 && score <= 1); });
test('optimizer calculates parallel latency savings', () => assert.equal(new ExecutionOptimizer().optimize(graphFixture()).savings.latency, 2));
test('optimizer minimizes pipeline switches', () => assert.ok(new ExecutionOptimizer().optimize(graphFixture()).savings.pipelineSwitches >= 0));
test('optimizer explains changes', () => assert.ok(new ExecutionOptimizer().optimize(graphFixture()).changes.length >= 2));
test('engine optimize uses current graph', () => assert.ok(fixture().engine.optimize().score >= 0));

test('cost estimator sums credits', () => assert.equal(new ExecutionCostEstimator().estimate(fixture().graph).credits, 10));
test('cost estimator sums latency', () => assert.ok(new ExecutionCostEstimator().estimate(fixture().graph).latency > 0));
test('cost estimator estimates GPU time', () => assert.ok(new ExecutionCostEstimator().estimate(fixture().graph).gpuTime > 0));
test('cost estimator estimates CPU time', () => assert.ok(new ExecutionCostEstimator().estimate(fixture().graph).cpuTime > 0));
test('cost estimator estimates peak memory', () => assert.ok(new ExecutionCostEstimator().estimate(fixture().graph).memory > 0));
test('cost estimator counts AI calls', () => assert.equal(new ExecutionCostEstimator().estimate(fixture().graph).expectedAiCalls, 1));
test('cost estimator predicts retries', () => assert.ok(new ExecutionCostEstimator().estimate(fixture().graph).expectedRetries > 0));

test('resource allocator creates per-node allocations', () => assert.equal(new ResourceAllocator().allocate(graphFixture()).nodeAllocations.length, 4));
test('resource allocator handles CPU', () => assert.ok(new ResourceAllocator().allocate(graphFixture()).cpu > 0));
test('resource allocator handles local processing', () => assert.equal(new ResourceAllocator().allocate(graphFixture()).local, 4));
test('resource allocator detects shortage', () => { const result = new ResourceAllocator().allocate(graphFixture(), { cpu: 0 }); assert.equal(result.feasible, false); assert.ok(result.shortages.includes('cpu')); });
test('resource allocations are immutable', () => assert.ok(Object.isFrozen(new ResourceAllocator().allocate(graphFixture()).nodeAllocations)));

test('verification creates one check per stage', () => { const deps = executionDependencies(); assert.equal(new VerificationEngine(deps).build(graphFixture()).length, 3); });
test('verification records quality check', () => assert.match(new VerificationEngine(executionDependencies()).build(graphFixture())[0].check, /quality/));
test('verification records method', () => assert.ok(new VerificationEngine(executionDependencies()).build(graphFixture())[0].method.length > 0));
test('verification uses injected IDs', () => assert.match(new VerificationEngine(executionDependencies()).build(graphFixture())[0].id, /^execution-/));
test('verification result is immutable', () => assert.ok(Object.isFrozen(new VerificationEngine(executionDependencies()).build(graphFixture()))));

const checkpointFixture = () => { const graph = graphFixture(); const deps = executionDependencies(); const verification = new VerificationEngine(deps).build(graph); const checkpoint = new CheckpointEngine(deps).create(graph, graph.stages[1].id, verification); return { graph, checkpoint, verification }; };
test('checkpoint stores execution state', () => assert.equal(checkpointFixture().checkpoint.state['lighting'], 'completed'));
test('checkpoint stores inputs and outputs', () => { const value = checkpointFixture().checkpoint; assert.ok(value.inputs.includes('load')); assert.ok(value.outputs.includes('lighting')); });
test('checkpoint stores metrics', () => assert.equal(checkpointFixture().checkpoint.metrics.total, 4));
test('checkpoint stores verification', () => assert.equal(checkpointFixture().checkpoint.verification.length, 1));
test('checkpoint stores dependencies', () => assert.ok(checkpointFixture().checkpoint.dependencies.includes('load')));
test('checkpoint rejects unknown stage', () => assert.throws(() => new CheckpointEngine(executionDependencies()).create(graphFixture(), 'missing', [])));
test('checkpoint is deeply immutable', () => assert.ok(Object.isFrozen(checkpointFixture().checkpoint.state)));

test('rollback targets previous stage', () => { const { graph, checkpoint } = checkpointFixture(); assert.equal(new RollbackPlanner().plan(graph, checkpoint).rollbackToStageId, graph.stages[0].id); });
test('rollback calculates preserved nodes', () => assert.deepEqual(new RollbackPlanner().plan(checkpointFixture().graph, checkpointFixture().checkpoint).preserve, ['load']));
test('rollback calculates recalculation subtree', () => assert.ok(new RollbackPlanner().plan(checkpointFixture().graph, checkpointFixture().checkpoint).recalculate.includes('export')));
test('rollback rejects foreign checkpoint graph', () => { const { graph, checkpoint } = checkpointFixture(); assert.throws(() => new RollbackPlanner().plan({ ...graph, id: 'other' }, checkpoint)); });

test('retry rebuilds partial graph', () => { const graph = graphFixture(); assert.equal(new RetryPlanner().plan(graph, 'lighting').action, 'rebuild-partial-graph'); });
test('retry can skip node', () => assert.equal(new RetryPlanner().plan(graphFixture(), 'lighting', 'skip-node').action, 'skip-node'));
test('retry can replace operation', () => assert.match(new RetryPlanner().plan(graphFixture(), 'lighting', 'replace-operation').replacement!, /alternative/));
test('retry can fallback to local', () => assert.match(new RetryPlanner().plan(graphFixture(), 'lighting', 'fallback-local').replacement!, /local/));
test('retry can fallback to AI', () => assert.match(new RetryPlanner().plan(graphFixture(), 'lighting', 'fallback-ai').replacement!, /AI/));
test('retry can cancel subtree', () => assert.ok(new RetryPlanner().plan(graphFixture(), 'lighting', 'cancel-subtree').affectedNodeIds.includes('export')));
test('retry rejects missing node', () => assert.throws(() => new RetryPlanner().plan(graphFixture(), 'missing')));

test('simulation predicts quality', () => { const graph = graphFixture(); assert.ok(new ExecutionSimulator().simulate(graph, new OperationScheduler().schedule(graph)).quality > 0); });
test('simulation predicts latency', () => { const graph = graphFixture(); assert.equal(new ExecutionSimulator().simulate(graph, new OperationScheduler().schedule(graph)).latency, 6); });
test('simulation predicts success probability', () => { const graph = graphFixture(); assert.ok(new ExecutionSimulator().simulate(graph, new OperationScheduler().schedule(graph)).successProbability > 0); });
test('simulation is immutable', () => assert.ok(Object.isFrozen(fixture().engine.simulate())));

test('explainability explains operation placement', () => assert.match(new ExecutionExplainability().explain(graphFixture()).operations[0].whyHere, /plan node/));
test('explainability explains ordering', () => assert.ok(new ExecutionExplainability().explain(graphFixture()).operations.find((item) => item.nodeId === 'export')!.whyAfter.length > 0));
test('explainability explains parallelism', () => assert.match(new ExecutionExplainability().explain(graphFixture()).operations.find((item) => item.nodeId === 'lighting')!.whyParallel, /No dependency/));
test('explainability explains local mode', () => assert.match(new ExecutionExplainability().explain(graphFixture()).operations[0].whyMode, /locally/));

test('replay resumes nodes after checkpoint', () => { const { graph, checkpoint } = checkpointFixture(); assert.deepEqual(new ExecutionReplay().replay(graph, checkpoint, scope).replayOrder, ['export']); });
test('replay is deterministic', () => { const { graph, checkpoint } = checkpointFixture(); const replay = new ExecutionReplay(); assert.deepEqual(replay.replay(graph, checkpoint, scope), replay.replay(graph, checkpoint, scope)); });
test('replay enforces tenant project user scope', () => { const { graph, checkpoint } = checkpointFixture(); assert.throws(() => new ExecutionReplay().replay(graph, checkpoint, foreignScope)); });

test('memory stores successful graphs', () => { const { engine } = fixture(); engine.record(true); assert.equal(engine.memory.successful(scope).length, 1); });
test('memory stores failed graphs and errors', () => { const { engine } = fixture(); engine.record(false, ['mask']); assert.deepEqual(engine.memory.failed(scope)[0].errors, ['mask']); });
test('memory isolates scope', () => { const memory = new ExecutionMemory(); const record = { id: 'a', scope, graphId: 'g', successful: true, time: 1, cost: 1, errors: [], verification: [], createdAt: 1 }; memory.remember(record); memory.remember({ ...record, id: 'b', scope: foreignScope }); assert.equal(memory.snapshot(scope).length, 1); });
test('memory snapshots are immutable', () => assert.ok(Object.isFrozen(fixture().engine.memory.snapshot(scope))));

for (const pattern of ['luxury-portrait', 'catalog', 'fashion', 'restoration', 'repair', 'background', 'studio', 'try-on', 'product', 'marketing']) {
  test(`pattern library contains ${pattern}`, () => assert.ok(new ExecutionPatternLibrary().get(pattern).length > 0));
}
test('pattern names are deterministic', () => assert.deepEqual(new ExecutionPatternLibrary().names(), new ExecutionPatternLibrary().names()));
test('pattern data is deeply immutable', () => assert.ok(Object.isFrozen(new ExecutionPatternLibrary().all().catalog)));

test('metrics calculate execution IQ', () => { const { engine, graph } = fixture(); assert.ok(engine.snapshot(graph).metrics.executionIq > 0); });
test('metrics calculate all seven signals', () => { const { engine } = fixture(); assert.equal(Object.keys(engine.snapshot().metrics).length, 7); });
test('snapshot includes full execution state', () => { const { engine } = fixture(); const value = engine.snapshot(); assert.ok(value.graph && value.schedule && value.cost && value.resources && value.verification && value.simulation && value.metrics); });
test('snapshot includes checkpoints', () => { const { engine, graph } = fixture(); engine.checkpoint(graph.stages[0].id); assert.equal(engine.snapshot().checkpoints.length, 1); });
test('snapshot is deeply immutable', () => { const value = fixture().engine.snapshot(); assert.throws(() => (value.graph.nodes as unknown[]).push({})); assert.ok(Object.isFrozen(value.scope)); });
test('debug includes explanation and optimization', () => { const value = fixture().engine.debug(); assert.ok(value.explanation && value.optimization); });
test('same dependencies and input reproduce graph', () => assert.deepEqual(new ExecutionPlanner(executionDependencies()).build(creativePlan()), new ExecutionPlanner(executionDependencies()).build(creativePlan())));
test('random source is injected but unused by heuristics', () => { let calls = 0; const engine = new CreativeExecutionEngine({ ...executionDependencies(), random: () => { calls += 1; return 0.1; } }); engine.planExecution(creativePlan()); assert.equal(calls, 0); });
test('execution layer has no forbidden imports', () => { const directory = 'src/platform/creative/execution'; const forbidden = ['workflow', 'runtime', 'provider', 'billing', 'application', 'ui', 'infrastructure', 'react', 'base44']; for (const file of readdirSync(directory)) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(`${directory}/${file}`, 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n').toLowerCase(); for (const term of forbidden) assert.equal(imports.includes(term), false, `${file} imports ${term}`); } });
