import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../src/application/createApplication';
import { ServiceContainer } from '../src/core/container';
import { ExecutionDebugger, ExecutionGraph, ExecutionValidator, createExecutionRuntime } from '../src/platform/execution';
import { CapabilityRouter } from '../src/platform/router';

test('plans virtual try-on from SAM3 through garment preparation, FASHN, and quality validation', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Virtual try on');
  const runtime = createExecutionRuntime();
  const plan = runtime.planner.createPlan(decision);

  assert.deepEqual(plan.executionOrder, ['detect-person', 'prepare-garment', 'generate-mask', 'apply-try-on', 'quality-validator', 'compose-result']);
  assert.equal(plan.steps.find((step) => step.id === 'detect-person')?.provider, 'sam3');
  assert.equal(plan.steps.find((step) => step.id === 'apply-try-on')?.provider, 'fashn');
  assert.equal((await runtime.validator.validate(plan)).valid, true);
});

test('plans background replacement through Scene Memory, Editing Engine, and Composer', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Replace background with a beach');
  const plan = createExecutionRuntime().planner.createPlan(decision);

  assert.deepEqual(plan.executionOrder, ['restore-scene', 'replace-background', 'compose-result']);
  assert.deepEqual(plan.executionOrder.map((id) => plan.steps.find((step) => step.id === id)?.module), ['scene-memory', 'editing-engine', 'image-pipeline']);
});

test('rejects FASHN execution without person analysis', async () => {
  const plan = Object.freeze({
    id: 'exec-invalid', routeId: 'route-invalid', version: '2.4', estimatedCost: 20, estimatedDuration: 20,
    status: 'ready' as const, nodes: [], edges: [], riskLevel: 'medium' as const, createdAt: new Date().toISOString(), executionOrder: ['prepare-garment', 'apply-try-on'],
    steps: [
      { id: 'prepare-garment', name: 'Prepare Garment', capability: 'garment-processing', module: 'image-pipeline', provider: 'fashn', dependencies: [] },
      { id: 'apply-try-on', name: 'Apply Try-On', capability: 'virtual-try-on', module: 'editing-engine', provider: 'fashn', dependencies: ['prepare-garment'] },
    ],
  });
  const result = await new ExecutionValidator().validate(plan);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /person-analysis/);
});

test('builds an explainable hair-color graph in scene, segmentation, edit, validation order', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Change hair color, preserve face and keep it natural');
  const runtime = createExecutionRuntime();
  const plan = runtime.planner.createPlan(decision);
  const order = plan.executionOrder;

  assert.ok(order.indexOf('scene-analysis') < order.indexOf('generate-mask'));
  assert.ok(order.indexOf('generate-mask') < order.indexOf('apply-hair-color'));
  assert.ok(order.indexOf('apply-hair-color') < order.indexOf('identity-validation'));
  assert.equal(plan.nodes.find((node) => node.id === 'generate-mask')?.provider, 'sam3');
  assert.equal(plan.nodes.find((node) => node.id === 'apply-hair-color')?.provider, 'reve');
  assert.match(new ExecutionDebugger().inspect(plan).text, /Scene Memory/);
  assert.equal(runtime.history.getPlanEvents()[0]?.type, 'planCreated');
});

test('returns typed provider availability information', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Virtual try on');
  const plan = createExecutionRuntime().planner.createPlan(decision);
  const result = await new ExecutionValidator((provider) => provider !== 'fashn').validate(plan);
  assert.equal(result.fallbackRequired, true);
  assert.equal(result.issues[0]?.code, 'EXECUTION_PROVIDER_UNAVAILABLE');
});

test('rejects an Editing Engine plan when Image Pipeline is removed', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Change hair color');
  const original = createExecutionRuntime().planner.createPlan(decision);
  const steps = original.steps.filter((step) => step.module !== 'image-pipeline');
  const broken = Object.freeze({
    ...original,
    steps,
    nodes: original.nodes.filter((node) => node.module !== 'image-pipeline'),
    edges: original.edges.filter((edge) => steps.some((step) => step.id === edge.from) && steps.some((step) => step.id === edge.to)),
    executionOrder: original.executionOrder.filter((id) => steps.some((step) => step.id === id)),
  });
  const result = await new ExecutionValidator().validate(broken);
  assert.equal(result.valid, false);
  assert.equal(result.issues.some((issue) => issue.code === 'EXECUTION_DEPENDENCY_MISSING' && issue.metadata.dependencyId === 'image-pipeline'), true);
});

test('detects execution graph cycles', () => {
  const graph = new ExecutionGraph();
  graph.addStep({ id: 'a', name: 'A', capability: 'a', module: 'test', dependencies: [] });
  graph.addStep({ id: 'b', name: 'B', capability: 'b', module: 'test', dependencies: [] });
  graph.addDependency('a', 'b');
  graph.addDependency('b', 'a');
  assert.equal(graph.validate().valid, false);
  assert.throws(() => graph.getExecutionOrder(), /cycle detected/i);
});

test('marks an unavailable execution provider for fallback', async () => {
  const platform = await createApplication(new ServiceContainer());
  const decision = await new CapabilityRouter(platform.context).route('Virtual try on');
  const runtime = createExecutionRuntime((provider) => provider !== 'fashn');
  const result = await runtime.validator.validate(runtime.planner.createPlan(decision));
  assert.equal(result.fallbackRequired, true);
  assert.deepEqual(result.unavailableProviders, ['fashn']);
});
