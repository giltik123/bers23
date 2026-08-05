import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionNode } from '../src/platform/execution/ExecutionNode';
import type { ExecutionPlan } from '../src/platform/execution/ExecutionPlan';
import { DEFAULT_PROVIDER_RETRY_POLICY, ProviderExecutor, ProviderRuntimeRegistry, ProviderTimeoutError } from '../src/platform/providers/runtime';
import { ExecutionRuntime } from '../src/platform/runtime';
import { WorkerManager } from '../src/platform/workers';

const request = (capability: string, timeout = 100, maxRetries = 0) => Object.freeze({ capability, input: { prompt: 'test' }, context: Object.freeze({}), timeout, retryPolicy: Object.freeze({ ...DEFAULT_PROVIDER_RETRY_POLICY, maxRetries, backoffMs: 0 }) });
function plan(capability: string): ExecutionPlan {
  const node: ExecutionNode = Object.freeze({ id: capability, name: capability, capability, module: 'provider-worker', provider: 'runtime', type: 'generation', status: 'pending', dependencies: Object.freeze([]) });
  return Object.freeze({ id: `plan-${capability}`, routeId: 'route-worker', version: '3.3', status: 'ready', nodes: Object.freeze([node]), edges: Object.freeze([]), steps: Object.freeze([node]), executionOrder: Object.freeze([node.id]), estimatedCost: 1, estimatedDuration: 1, riskLevel: 'low', createdAt: '2026-01-01T00:00:00.000Z' });
}

test('executes Runtime -> Worker -> Provider and records normalized metrics', async () => {
  const providers = new ProviderRuntimeRegistry();
  const executor = new ProviderExecutor('reve', ['image-edit'], { execute: async () => ({ output: { url: 'edited.png' }, cost: 4, usage: { images: 1 }, metadata: { model: 'reve' } }) });
  const manager = new WorkerManager(); manager.registerProvider(providers.bind(executor), 2);
  const runtime = new ExecutionRuntime({ execute: async (node, context) => { const result = await manager.execute(request(node.capability)); context.set(node.id, result.output); return { output: result.output, metadata: result.metadata }; } });

  const result = await runtime.execute(plan('image-edit'));
  assert.equal(result.state, 'COMPLETED');
  assert.deepEqual(result.context['image-edit'], { url: 'edited.png' });
  assert.equal(manager.metrics('reve').successRate, 1);
  assert.equal(manager.metrics('reve').averageCost, 4);
  assert.equal(manager.metrics('reve').images, 1);
});

test('falls back to a healthy provider when Reve is unavailable', async () => {
  const providers = new ProviderRuntimeRegistry();
  const manager = new WorkerManager();
  manager.registerProvider(providers.bind(new ProviderExecutor('reve', ['image-edit'], { execute: async () => { throw new Error('offline'); } })));
  manager.registerProvider(providers.bind(new ProviderExecutor('fallback-image', ['image-edit'], { execute: async () => ({ output: 'fallback-result', metadata: { provider: 'fallback-image' } }) })));
  manager.health.setStatus('reve', 'OFFLINE', 'Health check failed.');

  const result = await manager.execute(request('image-edit'));
  assert.equal(result.output, 'fallback-result');
  assert.equal(result.metadata.provider, 'fallback-image');
  assert.equal(manager.health.get('reve').status, 'OFFLINE');
});

test('timeout cancels each provider attempt and retries only within policy', async () => {
  let attempts = 0; let cancellations = 0;
  const executor = new ProviderExecutor('slow-provider', ['image-edit'], { execute: async (current) => {
    attempts += 1;
    return new Promise((_resolve, reject) => current.signal?.addEventListener('abort', () => { cancellations += 1; reject(new ProviderTimeoutError('slow-provider', current.timeout)); }, { once: true }));
  } });
  await assert.rejects(() => executor.execute(request('image-edit', 10, 1)), /timed out/i);
  assert.equal(attempts, 2);
  assert.equal(cancellations, 2);
});

test('three independent capabilities use three workers in parallel', async () => {
  const providers = new ProviderRuntimeRegistry(); const manager = new WorkerManager(); let active = 0; let peak = 0; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  for (const id of ['analysis-worker', 'mask-worker', 'edit-worker']) {
    manager.registerProvider(providers.bind(new ProviderExecutor(id, [id], { execute: async () => { active += 1; peak = Math.max(peak, active); await gate; active -= 1; return { output: id }; } })));
  }
  const executions = ['analysis-worker', 'mask-worker', 'edit-worker'].map((capability) => manager.execute(request(capability)));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(peak, 3);
  release();
  assert.deepEqual((await Promise.all(executions)).map((result) => result.output), ['analysis-worker', 'mask-worker', 'edit-worker']);
});

test('worker pool enforces per-worker concurrency', async () => {
  const providers = new ProviderRuntimeRegistry(); const manager = new WorkerManager(); let active = 0; let peak = 0;
  manager.registerProvider(providers.bind(new ProviderExecutor('limited', ['image-edit'], { execute: async () => { active += 1; peak = Math.max(peak, active); await new Promise((resolve) => setTimeout(resolve, 5)); active -= 1; return { output: true }; } })), 1);
  await Promise.all([manager.execute(request('image-edit')), manager.execute(request('image-edit')), manager.execute(request('image-edit'))]);
  assert.equal(peak, 1);
  assert.equal(manager.metrics('limited').executions, 3);
});
