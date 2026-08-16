import assert from 'node:assert/strict';
import test from 'node:test';
import { createExecutionIntelligence } from '../src/platform/intelligence';
import { ContextBuilder, MemoryRetriever, MemoryStore } from '../src/platform/memory';
import { createAgent } from '../src/platform/agent';
import type { AgentRequest } from '../src/platform/agent';
import type { AIOrchestrator } from '../src/platform/orchestrator';

interface FakeCall { readonly request: string; readonly tenantId: string; readonly userId: string; readonly projectId?: string; readonly metadata?: Readonly<Record<string, unknown>>; }
function fakeOrchestrator(options: { failFirst?: boolean; delayMs?: number } = {}) {
  const calls: FakeCall[] = []; let attempts = 0; const cancelled: string[] = [];
  const orchestrator = {
    async execute(request: FakeCall) { calls.push(Object.freeze({ ...request, metadata: Object.freeze({ ...(request.metadata ?? {}) }) })); attempts += 1; if (options.delayMs) await new Promise((resolve) => setTimeout(resolve, options.delayMs)); if (options.failFirst && attempts === 1) throw new Error('temporary orchestrator failure'); return Object.freeze({ session: Object.freeze({ state: 'COMPLETED', sessionId: `orch-${attempts}` }), route: Object.freeze({ providers: ['reve'], capabilities: ['image-edit'] }), plan: Object.freeze({ id: `plan-${attempts}` }), runtime: Object.freeze({ state: 'COMPLETED', executionId: `runtime-${attempts}` }) }); },
    cancel(sessionId: string) { cancelled.push(sessionId); return Object.freeze({ sessionId, state: 'CANCELLED' }); },
    inspect() { return Object.freeze({ calls: calls.length, cancelled: Object.freeze([...cancelled]) }); },
  } as unknown as AIOrchestrator;
  return { orchestrator, calls, cancelled };
}
function createHarness(options: { failFirst?: boolean; delayMs?: number } = {}) {
  const fake = fakeOrchestrator(options); const store = new MemoryStore(); const intelligence = createExecutionIntelligence();
  const agent = createAgent(fake.orchestrator, { store, builder: new ContextBuilder(new MemoryRetriever(store)), intelligence, maxRetries: 1 });
  return { agent, store, intelligence, ...fake };
}
const request = (overrides: Partial<AgentRequest> = {}): AgentRequest => ({ request: 'Change hair color', tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a', budget: { plan: 'pro', credits: 100 }, ...overrides });

test('simple natural-language request creates one orchestrator execution', async () => {
  const { agent, calls } = createHarness();
  const response = await agent.execute(request());

  assert.equal(response.session.state, 'COMPLETED');
  assert.equal(response.goal.intent, 'portrait-editing');
  assert.equal(response.tasks.length, 1);
  assert.equal(calls.length, 1);
  assert.equal(agent.history().successful().length, 1);
});

test('complex request is decomposed into sequential dependent executions', async () => {
  const { agent, calls } = createHarness();
  const response = await agent.execute(request({ request: 'Change hair color then replace background then validate identity' }));

  assert.deepEqual(response.tasks.map((task) => task.id), ['task-1', 'task-2', 'task-3']);
  assert.deepEqual(response.tasks[1].dependencies, ['task-1']);
  assert.deepEqual(calls.map((call) => call.request), ['Change hair color', 'replace background', 'validate identity']);
});

test('agent cancellation prevents dependent tasks from continuing', async () => {
  const { agent } = createHarness({ delayMs: 20 });
  let sessionId = '';
  agent.events.on('agent.started', (event) => { sessionId = event.sessionId; });
  const running = agent.execute(request({ request: 'first edit then second edit' }));
  await new Promise((resolve) => setTimeout(resolve, 5));

  assert.equal(agent.cancel(sessionId).state, 'CANCELLED');
  await assert.rejects(() => running, /cancelled/i);
  assert.equal(agent.history().failed().length, 1);
});

test('supervisor retries after a transient orchestrator failure', async () => {
  const { agent, calls } = createHarness({ failFirst: true });
  const response = await agent.execute(request());

  assert.equal(response.session.state, 'COMPLETED');
  assert.equal(calls.length, 2);
  assert.equal(response.results.length, 1);
});

test('agent memory bridge stores successful workflow memory', async () => {
  const { agent, store } = createHarness();
  await agent.execute(request());

  const records = store.query({ namespace: 'agent', categories: ['WORKFLOW_MEMORY'] }, { tenantId: 'tenant-a', userId: 'user-a', projectId: 'project-a' });
  assert.equal(records.length, 1);
  assert.equal(records[0].tags.includes('completed'), true);
});

test('agent context uses intelligence performance signals', async () => {
  const { agent, intelligence } = createHarness();
  intelligence.analytics.record({ executionId: 'exec-1', routeId: 'route-1', capability: 'image-edit', provider: 'reve', worker: 'reve', duration: 4, cost: 1, status: 'SUCCESS', retryCount: 0, timestamp: new Date().toISOString(), metadata: {} });
  const response = await agent.execute(request());

  assert.equal(Array.isArray(response.context.intelligence.performance), true);
  assert.equal((response.context.intelligence.performance as readonly unknown[]).length, 1);
});

test('concurrent agent sessions remain isolated', async () => {
  const { agent } = createHarness({ delayMs: 5 });
  const [first, second] = await Promise.all([agent.execute(request({ projectId: 'project-a' })), agent.execute(request({ projectId: 'project-b' }))]);

  assert.notEqual(first.session.sessionId, second.session.sessionId);
  assert.equal(agent.history().statistics().completed, 2);
});

test('tenant memory isolation is preserved during context enrichment', async () => {
  const { agent, store } = createHarness();
  store.save({ namespace: 'agent', category: 'USER_PREFERENCE', owner: { tenantId: 'tenant-a', userId: 'user-a' }, value: { style: 'cinematic' }, tags: ['cinematic'], confidence: 1 });
  const response = await agent.execute(request({ request: 'cinematic edit', tenantId: 'tenant-b', userId: 'user-b', projectId: 'project-b' }));

  assert.equal(response.context.memory.length, 0);
});

test('agent event ordering is observable', async () => {
  const { agent } = createHarness(); const events: string[] = [];
  for (const name of ['agent.started', 'agent.goal.resolved', 'agent.tasks.planned', 'agent.task.started', 'agent.task.completed', 'agent.completed'] as const) agent.events.on(name, (event) => { events.push(event.name); });

  await agent.execute(request());
  assert.deepEqual(events, ['agent.started', 'agent.goal.resolved', 'agent.tasks.planned', 'agent.task.started', 'agent.task.completed', 'agent.completed']);
});

test('agent layer has no forbidden business or UI imports', async () => {
  const { spawnSync } = await import('node:child_process');
  const result = spawnSync('rg', ['-n', "from ['\"](react|@retired-runtime|vite|.*src/lib|.*lib/|.*providers/|.*adapters/ai|.*UI)", 'src/platform/agent'], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
});
