import assert from 'node:assert/strict';
import test from 'node:test';
import { createApplication } from '../src/application/createApplication';
import { ServiceContainer } from '../src/core/container';
import { ExecutionPlanner } from '../src/platform/execution';
import { createExecutionIntelligence } from '../src/platform/intelligence';
import { ContextBuilder, MemoryRetriever, MemoryStore } from '../src/platform/memory';
import { createOrchestrator, OrchestrationPolicyError } from '../src/platform/orchestrator';
import { ExecutionRuntime } from '../src/platform/runtime';
import { CapabilityRouter } from '../src/platform/router';
import { WorkerManager } from '../src/platform/workers';

async function createHarness(options: { slow?: boolean } = {}) {
  const platform = await createApplication(new ServiceContainer());
  const workers = new WorkerManager();
  workers.register({ id: 'mock-provider-worker', maxConcurrency: 3, capabilities: ['image-context', 'scene-memory', 'person-analysis', 'segmentation', 'hair-isolation', 'face-editing', 'identity-preservation', 'quality-validation', 'image-composition', 'background-edit', 'scene-consistency'], execute: async (request) => {
    if (options.slow) await new Promise((resolve) => setTimeout(resolve, 50));
    return Object.freeze({ success: true, output: { capability: request.capability }, cost: 1, duration: 1, usage: { tokens: 0, images: 1 }, retryCount: 0, metadata: { worker: 'mock-provider-worker' } });
  } });
  await workers.startAll();
  const runtime = new ExecutionRuntime({ execute: async (node, context) => { const result = await workers.execute({ capability: node.capability, input: { nodeId: node.id }, context: context.snapshot(), timeout: node.timeout ?? 1000, retryPolicy: node.retryPolicy ?? { attempts: 1, backoffMs: 0 } }); context.set(node.id, result.output); return result.output as Record<string, unknown>; } }, { retryDelayMs: 0 });
  const store = new MemoryStore();
  const memory = { store, builder: new ContextBuilder(new MemoryRetriever(store)) };
  const intelligence = createExecutionIntelligence();
  const orchestrator = createOrchestrator({ router: new CapabilityRouter(platform.context), planner: new ExecutionPlanner(), runtime, workers, memory, intelligence });
  return { orchestrator, runtime, workers, memory, intelligence };
}

test('complete execution coordinates router, planner, runtime, worker, provider, memory, and analytics', async () => {
  const { orchestrator, memory, intelligence } = await createHarness();
  const events: string[] = [];
  for (const name of ['orchestration.started', 'orchestration.planned', 'orchestration.runtime.started', 'orchestration.completed'] as const) orchestrator.events.on(name, (event) => { events.push(event.name); });

  const result = await orchestrator.execute({ request: 'Change hair color', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', budget: { plan: 'pro', credits: 100 } });

  assert.equal(result.session.state, 'COMPLETED');
  assert.equal(result.route.capabilities.includes('face-editing'), true);
  assert.equal(result.plan.executionOrder.includes('scene-analysis'), true);
  assert.equal(result.runtime.state, 'COMPLETED');
  assert.equal(orchestrator.history().successful().length, 1);
  assert.equal(memory.store.query({ categories: ['EXECUTION_PATTERN'] }, { tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' }).length, 1);
  assert.equal(intelligence.analytics.metrics.getRecent(1)[0].status, 'SUCCESS');
  assert.deepEqual(events, ['orchestration.started', 'orchestration.planned', 'orchestration.runtime.started', 'orchestration.completed']);
});

test('pause and resume update the active orchestration session while runtime continues safely', async () => {
  const { orchestrator } = await createHarness({ slow: true });
  let sessionId = '';
  orchestrator.events.on('orchestration.started', (event) => { sessionId = event.sessionId; });
  const running = orchestrator.execute({ request: 'Change hair color', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', budget: { plan: 'pro', credits: 100 } });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(orchestrator.pause(sessionId).state, 'PAUSED');
  assert.equal(orchestrator.resume(sessionId).state, 'RECOVERING');
  assert.equal((await running).session.state, 'COMPLETED');
});

test('cancel stops runtime execution and records a cancelled session', async () => {
  const { orchestrator } = await createHarness({ slow: true });
  let sessionId = '';
  orchestrator.events.on('orchestration.started', (event) => { sessionId = event.sessionId; });
  const running = orchestrator.execute({ request: 'Change hair color', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', budget: { plan: 'pro', credits: 100 } });
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(orchestrator.cancel(sessionId).state, 'CANCELLED');
  assert.equal((await running).session.state, 'CANCELLED');
  assert.equal(orchestrator.history().failed().length, 1);
});

test('policy rejection blocks execution before runtime starts', async () => {
  const { orchestrator, runtime } = await createHarness();
  await assert.rejects(() => orchestrator.execute({ request: 'Change hair color', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', budget: { plan: 'free', credits: 0 } }), OrchestrationPolicyError);
  assert.equal(runtime.inspect().executions.length, 0);
});

test('memory integration respects tenant isolation when building context', async () => {
  const { orchestrator, memory } = await createHarness();
  memory.store.save({ namespace: 'profile', category: 'USER_PREFERENCE', owner: { tenantId: 'tenant-a', userId: 'user-a' }, value: { style: 'cinematic' }, tags: ['cinematic'], confidence: 1 });

  const otherTenant = await orchestrator.plan({ request: 'cinematic hair color', tenantId: 'tenant-b', userId: 'user-b', budget: { plan: 'pro', credits: 100 } });
  assert.equal(otherTenant.context.memory?.preferences.length, 0);
});

test('multiple sessions can execute concurrently with isolated session ids', async () => {
  const { orchestrator } = await createHarness({ slow: true });
  const [first, second] = await Promise.all([
    orchestrator.execute({ request: 'Change hair color', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', budget: { plan: 'pro', credits: 100 } }),
    orchestrator.execute({ request: 'Replace background with beach but keep person', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-b', budget: { plan: 'pro', credits: 100 } }),
  ]);

  assert.notEqual(first.session.sessionId, second.session.sessionId);
  assert.equal(orchestrator.history().statistics().successful, 2);
});

test('debug inspection exposes sessions, runtime, graph, workers, providers, routing, and analytics summaries', async () => {
  const { orchestrator } = await createHarness();
  await orchestrator.execute({ request: 'Change hair color', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', budget: { plan: 'pro', credits: 100 } });

  const inspection = orchestrator.inspect();
  assert.equal(inspection.currentSessions, 1);
  assert.equal(Array.isArray(inspection.executionGraph), true);
  assert.equal(Array.isArray(inspection.workerStatus), true);
  assert.equal(Array.isArray(inspection.providerStatus), true);
  assert.equal(Array.isArray(inspection.routingSummary), true);
  assert.equal(Array.isArray(inspection.analyticsSummary), true);
});

test('orchestrator layer has no forbidden business or UI imports', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('rg', ['-n', "from ['\"](react|@base44|vite|.*src/lib|.*lib/|.*providers|.*Planner|.*Pipeline|.*Agent|.*UI)", 'src/platform/orchestrator'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
});
