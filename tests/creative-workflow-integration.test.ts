import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import { ExecutionGraph, type ExecutionDependencies, type ExecutionNode, type ExecutionScope } from '../src/platform/creative/execution';
import {
  CreativeWorkflowIntegration, ExecutionEventLog, ExecutionWorkflowTranslator, IntegrationDebugger,
  OperationRegistry, ProgressModel, ReplanningBridge, RollbackBridge, RuntimeBridge,
  StatusSynchronizer, UnifiedTimeline, VerificationBridge,
  type IntegrationDependencies, type WorkflowExecutionPlan, type WorkflowExecutor,
  type WorkflowResult, type WorkflowStatus,
} from '../src/platform/creative/integration';

const scope: ExecutionScope = { tenantId: 'tenant-a', projectId: 'project-a', userId: 'user-a' };
const foreignScope: ExecutionScope = { tenantId: 'tenant-b', projectId: 'project-b', userId: 'user-b' };
const dependencies = (): IntegrationDependencies => { let id = 0; let now = 1000; return { id: () => `integration-${++id}`, now: () => ++now }; };
const executionDependencies = (): ExecutionDependencies => { let id = 0; let now = 100; return { id: () => `execution-${++id}`, now: () => ++now, random: () => 0.5 }; };
const node = (id: string, operation: string): ExecutionNode => ({ id, scope, planNodeId: `plan-${id}`, operation, mode: 'local', status: 'pending', dependencies: [], rollbackPoint: true, verificationRequired: true, credits: 0, latency: 2, gpuTime: 0, cpuTime: 2, memory: 4, aiCalls: 0, expectedRetries: 0.1, quality: 0.9, risk: 0.1, tags: [] });
const executionGraph = () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('segment', 'segmentation')); graph.addNode(node('light', 'lighting')); graph.addNode(node('balance', 'white balance')); graph.addNode(node('upscale', 'upscale')); graph.addNode(node('export', 'export')); graph.addEdge({ source: 'segment', target: 'light', relation: 'depends-on' }, scope); graph.addEdge({ source: 'segment', target: 'balance', relation: 'depends-on' }, scope); graph.addEdge({ source: 'light', target: 'upscale', relation: 'depends-on' }, scope); graph.addEdge({ source: 'balance', target: 'upscale', relation: 'depends-on' }, scope); graph.addEdge({ source: 'upscale', target: 'export', relation: 'depends-on' }, scope); const groups = graph.parallelGroups(scope); const stages = groups.map((ids, index) => ({ id: `execution-stage-${index}`, order: index + 1, name: `Stage ${index + 1}`, groups: [{ id: `group-${index}`, nodeIds: ids, parallel: ids.length > 1 }], barriers: [] })); return graph.snapshot(scope, 'creative-plan', stages); };

class FakeExecutor implements WorkflowExecutor {
  calls: string[] = [];
  current: WorkflowStatus = 'pending';
  execute(plan: WorkflowExecutionPlan): WorkflowResult { this.calls.push(`execute:${plan.id}`); this.current = 'completed'; return { workflowId: plan.id, status: 'completed', operations: plan.steps.map((step) => ({ stepId: step.id, status: 'completed', outputs: { artifact: step.id }, metrics: { quality: 0.95 } })), startedAt: 1, completedAt: 2 }; }
  cancel(id: string): void { this.calls.push(`cancel:${id}`); this.current = 'cancelled'; }
  pause(id: string): void { this.calls.push(`pause:${id}`); this.current = 'paused'; }
  resume(id: string): void { this.calls.push(`resume:${id}`); this.current = 'running'; }
  status(id: string): WorkflowStatus { this.calls.push(`status:${id}`); return this.current; }
}

const fixture = () => { const executor = new FakeExecutor(); const integration = new CreativeWorkflowIntegration(dependencies(), executor); const graph = executionGraph(); const workflow = integration.translate(graph); return { executor, integration, graph, workflow }; };
const successfulResult = (workflow: WorkflowExecutionPlan): WorkflowResult => ({ workflowId: workflow.id, status: 'completed', operations: workflow.steps.map((step) => ({ stepId: step.id, status: 'completed', outputs: {}, metrics: { quality: 0.95 } })) });

test('integration requires injected dependencies', () => assert.throws(() => new CreativeWorkflowIntegration({} as never, new FakeExecutor())));
test('integration does not require a concrete workflow implementation', () => assert.ok(new CreativeWorkflowIntegration(dependencies(), new FakeExecutor())));
test('translation produces workflow plan', () => assert.equal(fixture().workflow.executionGraphId, fixture().graph.id));
test('translation uses injected ID', () => assert.match(fixture().workflow.id, /^integration-/));
test('translation uses injected timestamp', () => assert.ok(fixture().workflow.createdAt > 1000));
test('translation preserves scope', () => assert.deepEqual(fixture().workflow.scope, scope));
test('translation maps every execution node', () => assert.equal(fixture().workflow.steps.length, 5));
test('translation maps dependencies to workflow step IDs', () => { const { workflow } = fixture(); const upscale = workflow.steps.find((step) => step.executionNodeId === 'upscale')!; assert.equal(upscale.dependencies.length, 2); assert.ok(upscale.dependencies.every((id) => workflow.steps.some((step) => step.id === id))); });
test('translation maps execution stages', () => assert.equal(fixture().workflow.stages.length, 4));
test('translation is deeply immutable', () => { const { workflow } = fixture(); assert.ok(Object.isFrozen(workflow.steps)); assert.ok(Object.isFrozen(workflow.scope)); assert.throws(() => (workflow.steps as unknown[]).push({})); });
test('translator rejects unsupported operations', () => { const graph = new ExecutionGraph(executionDependencies()); graph.addNode(node('unknown', 'unknown creative magic')); assert.throws(() => new ExecutionWorkflowTranslator(dependencies(), new OperationRegistry()).translate(graph.snapshot(scope, 'p'))); });

test('registry maps background removal', () => assert.equal(new OperationRegistry().workflowStep('background removal'), 'pipeline.background.remove'));
test('registry maps upscale', () => assert.equal(new OperationRegistry().workflowStep('upscale'), 'pipeline.upscale.real_esrgan'));
test('registry maps lighting capability', () => assert.equal(new OperationRegistry().capability('lighting'), 'lighting.adjustment'));
test('registry resolves aliases', () => assert.equal(new OperationRegistry().workflowStep('soft lighting'), 'lighting.normalize'));
test('registry resolves compound operation names', () => assert.equal(new OperationRegistry().workflowStep('apply soft lighting now'), 'lighting.normalize'));
test('registry returns undefined unknown capability', () => assert.equal(new OperationRegistry().capability('unknown'), undefined));
test('registry rejects duplicate mappings', () => { const registry = new OperationRegistry([]); const mapping = { operation: 'x', capability: 'x', workflowStep: 'x', aliases: [], parameters: {} }; registry.register(mapping); assert.throws(() => registry.register(mapping)); });
test('registry mappings are immutable', () => assert.ok(Object.isFrozen(new OperationRegistry().all()[0].aliases)));
test('registry is provider independent', () => { const serialized = JSON.stringify(new OperationRegistry().all()).toLowerCase(); for (const provider of ['openai', 'fal', 'reve', 'sam', 'realesrgan']) assert.equal(serialized.includes(provider), false); });

for (const pair of [
  ['pending', 'pending'], ['ready', 'pending'], ['blocked', 'paused'], ['completed', 'completed'], ['failed', 'failed'], ['skipped', 'cancelled'],
] as const) test(`status maps execution ${pair[0]} to workflow ${pair[1]}`, () => assert.equal(new StatusSynchronizer().toWorkflow(pair[0]), pair[1]));
for (const pair of [
  ['pending', 'pending'], ['running', 'ready'], ['paused', 'blocked'], ['retrying', 'ready'], ['completed', 'completed'], ['cancelled', 'skipped'], ['failed', 'failed'],
] as const) test(`status maps workflow ${pair[0]} to execution ${pair[1]}`, () => assert.equal(new StatusSynchronizer().toExecution(pair[0]), pair[1]));
test('status synchronization result is immutable', () => assert.ok(Object.isFrozen(new StatusSynchronizer().synchronize('running'))));

test('runtime bridge executes through contract', async () => { const { integration, executor } = fixture(); await integration.execute(); assert.ok(executor.calls[0].startsWith('execute:')); });
test('runtime bridge returns workflow result', async () => assert.equal((await fixture().integration.execute()).status, 'completed'));
test('runtime bridge supports cancel', async () => { const { integration, executor } = fixture(); await integration.cancel(); assert.equal(executor.current, 'cancelled'); });
test('runtime bridge supports pause', async () => { const { integration, executor } = fixture(); await integration.pause(); assert.equal(executor.current, 'paused'); });
test('runtime bridge supports resume', async () => { const { integration, executor } = fixture(); await integration.resume(); assert.equal(executor.current, 'running'); });
test('runtime bridge synchronizes status', async () => { const { integration, executor } = fixture(); executor.current = 'paused'; assert.equal(await integration.status(), 'paused'); });

test('execution events record operation started', async () => { const { integration } = fixture(); await integration.execute(); assert.ok(integration.snapshot().events.some((event) => event.type === 'OperationStarted')); });
test('execution events record operation completed', async () => { const { integration } = fixture(); await integration.execute(); assert.ok(integration.snapshot().events.some((event) => event.type === 'OperationCompleted')); });
test('event log supports all recovery event types', () => { const log = new ExecutionEventLog(dependencies()); for (const type of ['OperationFailed', 'OperationSkipped', 'RetryScheduled', 'RollbackStarted', 'RollbackFinished'] as const) log.append(scope, 'w', type, type); assert.equal(log.list(scope).length, 5); });
test('event log is scope isolated', () => { const log = new ExecutionEventLog(dependencies()); log.append(scope, 'w', 'OperationStarted', 'a'); log.append(foreignScope, 'w', 'OperationStarted', 'b'); assert.equal(log.list(scope).length, 1); });
test('events are deeply immutable', () => { const log = new ExecutionEventLog(dependencies()); assert.ok(Object.isFrozen(log.append(scope, 'w', 'OperationStarted', 'a').scope)); });

test('progress starts at zero', () => { const { graph, workflow } = fixture(); assert.equal(new ProgressModel().calculate(graph, workflow).overall, 0); });
test('progress reaches 100 percent', () => { const { graph, workflow } = fixture(); assert.equal(new ProgressModel().calculate(graph, workflow, successfulResult(workflow)).overall, 100); });
test('progress identifies current stage', () => { const { graph, workflow } = fixture(); assert.equal(new ProgressModel().calculate(graph, workflow).currentStage, workflow.stages[0].id); });
test('progress estimates remaining time', () => { const { graph, workflow } = fixture(); assert.equal(new ProgressModel().calculate(graph, workflow).estimatedRemainingTime, 10); });
test('progress reports completed and remaining nodes', () => { const { graph, workflow } = fixture(); const progress = new ProgressModel().calculate(graph, workflow, successfulResult(workflow)); assert.equal(progress.completedNodes.length, 5); assert.equal(progress.remainingNodes.length, 0); });

test('verification compares expected and actual quality', () => { const { workflow } = fixture(); const result = new VerificationBridge().compare({ expected: [], actual: successfulResult(workflow), workflow }); assert.ok(result.every((item) => item.passed)); });
test('verification detects low quality', () => { const { workflow } = fixture(); const actual = { ...successfulResult(workflow), operations: workflow.steps.map((step) => ({ stepId: step.id, status: 'completed' as const, outputs: {}, metrics: { quality: 0.2 } })) }; assert.ok(new VerificationBridge().compare({ expected: [], actual, workflow }).every((item) => !item.passed)); });
test('verification detects missing result', () => { const { workflow } = fixture(); assert.ok(new VerificationBridge().compare({ expected: [], actual: { workflowId: workflow.id, status: 'failed', operations: [] }, workflow }).every((item) => !item.passed)); });
test('verification result is immutable', () => { const { workflow } = fixture(); assert.ok(Object.isFrozen(new VerificationBridge().compare({ expected: [], actual: successfulResult(workflow), workflow }))); });

test('rollback bridge returns none after success', () => { const { graph, workflow } = fixture(); const result = successfulResult(workflow); const verification = new VerificationBridge().compare({ expected: [], actual: result, workflow }); assert.equal(new RollbackBridge().decide(graph, workflow, result, verification)[0].action, 'none'); });
test('rollback bridge chooses rollback on workflow failure', () => { const { graph, workflow } = fixture(); const failed = { workflowId: workflow.id, status: 'failed' as const, operations: [{ stepId: workflow.steps[1].id, status: 'failed' as const, outputs: {}, metrics: {}, error: 'failed' }] }; const verification = new VerificationBridge().compare({ expected: [], actual: failed, workflow }); assert.equal(new RollbackBridge().decide(graph, workflow, failed, verification)[0].action, 'rollback'); });
test('rollback bridge chooses replan for major verification gap', () => { const { graph, workflow } = fixture(); const actual = { workflowId: workflow.id, status: 'completed' as const, operations: workflow.steps.map((step) => ({ stepId: step.id, status: 'completed' as const, outputs: {}, metrics: { quality: 0.1 } })) }; const verification = new VerificationBridge().compare({ expected: [], actual, workflow }); assert.ok(new RollbackBridge().decide(graph, workflow, actual, verification).some((item) => item.action === 'replan')); });
test('recovery directive preserves successful nodes', () => { const { graph, workflow } = fixture(); const failed = { workflowId: workflow.id, status: 'failed' as const, operations: [{ stepId: workflow.steps.at(-1)!.id, status: 'failed' as const, outputs: {}, metrics: {} }] }; const verification = new VerificationBridge().compare({ expected: [], actual: failed, workflow }); assert.ok(new RollbackBridge().decide(graph, workflow, failed, verification)[0].preserveNodeIds.length > 0); });

test('replanning replaces only failed nodes', () => { const graph = executionGraph(); const result = new ReplanningBridge(dependencies()).replan(graph, ['light'], 'quality'); assert.deepEqual(result.replacedNodeIds, ['light']); assert.equal(result.preservedNodeIds.length, 4); });
test('replanning preserves completed graph structure', () => { const graph = executionGraph(); const result = new ReplanningBridge(dependencies()).replan(graph, ['light'], 'quality'); assert.equal(result.graph.nodes.length, graph.nodes.length); assert.equal(result.graph.edges.length, graph.edges.length); });
test('replanning switches AI failure to local', () => { const graph = executionGraph(); const aiGraph = { ...graph, nodes: graph.nodes.map((item) => item.id === 'light' ? { ...item, mode: 'ai' as const } : item) }; assert.equal(new ReplanningBridge(dependencies()).replan(aiGraph, ['light'], 'failure').graph.nodes.find((item) => item.operation.startsWith('fallback'))?.mode, 'local'); });
test('replanning output is immutable', () => assert.ok(Object.isFrozen(new ReplanningBridge(dependencies()).replan(executionGraph(), ['light'], 'quality').graph.nodes)));

test('unified timeline orders architecture layers', () => { const timeline = new UnifiedTimeline(dependencies()); for (const layer of ['decision', 'planning', 'execution', 'workflow', 'verification', 'recovery'] as const) timeline.append(scope, layer, layer, 'done', layer); assert.deepEqual(timeline.list(scope).map((item) => item.layer), ['decision', 'planning', 'execution', 'workflow', 'verification', 'recovery']); });
test('unified timeline isolates scope', () => { const timeline = new UnifiedTimeline(dependencies()); timeline.append(scope, 'execution', 'a', 'done', 'a'); timeline.append(foreignScope, 'execution', 'b', 'done', 'b'); assert.equal(timeline.list(scope).length, 1); });

test('snapshot combines execution workflow and status', () => { const value = fixture().integration.snapshot(); assert.ok(value.execution && value.workflow); assert.equal(value.status, 'pending'); });
test('snapshot combines verification metrics events and timeline', async () => { const { integration } = fixture(); await integration.execute(); const value = integration.snapshot(); assert.ok(value.metrics && value.events.length && value.timeline.length); });
test('synchronization creates verification and recovery state', () => { const { integration, workflow } = fixture(); const value = integration.synchronize(successfulResult(workflow)); assert.ok(value.verification.length > 0); assert.equal(value.recovery[0].action, 'none'); });
test('synchronization rejects foreign workflow result', () => { const { integration } = fixture(); assert.throws(() => integration.synchronize({ workflowId: 'other', status: 'failed', operations: [] })); });
test('snapshot is deeply immutable', () => { const value = fixture().integration.snapshot(); assert.ok(Object.isFrozen(value.scope)); assert.throws(() => (value.events as unknown[]).push({})); });
test('debugger exposes complete integration chain', () => { const { integration } = fixture(); const value = integration.debug('Luxury campaign', 'plan'); assert.equal(value.goal, 'Luxury campaign'); assert.ok(value.executionGraphId && value.workflowGraphId); });
test('debugger reports completion', async () => { const { integration } = fixture(); await integration.execute(); assert.equal(integration.debug('goal', 'plan').completion, 100); });
test('integration scope assertion rejects foreign scope', () => assert.throws(() => fixture().integration.assertScope(foreignScope)));
test('same dependencies and graph produce deterministic workflow plans', () => assert.deepEqual(new ExecutionWorkflowTranslator(dependencies(), new OperationRegistry()).translate(executionGraph()), new ExecutionWorkflowTranslator(dependencies(), new OperationRegistry()).translate(executionGraph())));
test('integration layer has no provider-specific imports', () => { const directory = 'src/platform/creative/integration'; const forbidden = ['providers/', 'workflow/', 'runtime/', 'billing/', 'application/', 'ui/', 'infrastructure/', 'react', 'base44']; for (const file of readdirSync(directory)) { if (!file.endsWith('.ts')) continue; const imports = readFileSync(`${directory}/${file}`, 'utf8').split('\n').filter((line) => /^import|^export .* from/.test(line)).join('\n').toLowerCase(); for (const term of forbidden) assert.equal(imports.includes(term), false, `${file} imports ${term}`); } });
