import assert from 'node:assert/strict';
import test from 'node:test';
import type { ExecutionNode } from '../src/platform/execution/ExecutionNode';
import type { ExecutionPlan } from '../src/platform/execution/ExecutionPlan';
import { ExecutionRuntime, ExecutionStateMachine } from '../src/platform/runtime';

const node = (id: string, dependencies: readonly string[] = [], attempts?: number): ExecutionNode => Object.freeze({
  id, name: id, capability: id, module: 'test-worker', type: 'processing', status: 'pending', dependencies: Object.freeze([...dependencies]),
  retryPolicy: attempts ? Object.freeze({ attempts, backoffMs: 0 }) : undefined,
});
function plan(nodes: readonly ExecutionNode[]): ExecutionPlan {
  const edges = nodes.flatMap((current) => current.dependencies.map((dependency) => Object.freeze({ from: dependency, to: current.id, condition: 'success' as const })));
  return Object.freeze({ id: `plan-${nodes.map((item) => item.id).join('-')}`, routeId: 'route-runtime', version: '3.3', status: 'ready', nodes: Object.freeze([...nodes]), edges: Object.freeze(edges), steps: Object.freeze([...nodes]), executionOrder: Object.freeze([...nodes.map((item) => item.id)]), estimatedCost: 0, estimatedDuration: 1, riskLevel: 'low', createdAt: '2026-01-01T00:00:00.000Z' });
}

test('state machine enforces the managed execution lifecycle', () => {
  const machine = new ExecutionStateMachine();
  for (const state of ['VALIDATING', 'READY', 'RUNNING', 'PAUSED', 'RUNNING', 'COMPLETED'] as const) machine.transition(state);
  assert.equal(machine.current, 'COMPLETED');
  assert.throws(() => machine.transition('RUNNING'), /Invalid execution transition/);
});

test('scheduler executes independent nodes in parallel before their dependant', async () => {
  const started: string[] = []; let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const runtime = new ExecutionRuntime({ execute: async (current) => { started.push(current.id); if (current.id !== 'compose') await gate; return {}; } });
  const running = runtime.execute(plan([node('scene-analysis'), node('object-detection'), node('compose', ['scene-analysis', 'object-detection'])]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(new Set(started), new Set(['scene-analysis', 'object-detection']));
  assert.equal(runtime.inspect().executions[0].activeSteps.length, 2);
  release();
  const result = await running;
  assert.equal(result.state, 'COMPLETED');
  assert.deepEqual(started, ['scene-analysis', 'object-detection', 'compose']);
});

test('worker retries a bounded number of times and checkpoints successful steps', async () => {
  let attempts = 0;
  const runtime = new ExecutionRuntime({ execute: async (_current, context) => { attempts += 1; if (attempts < 3) throw new Error('temporary'); context.set('output', 'ready'); return {}; } }, { retryDelayMs: 0 });
  const result = await runtime.execute(plan([node('reve-edit', [], 3)]));
  assert.equal(result.state, 'COMPLETED');
  assert.equal(result.attempts['reve-edit'], 3);
  assert.equal(result.context.output, 'ready');
  assert.equal((await runtime.getCheckpoints(result.executionId)).length, 1);
});

test('cancellation stops active work and prevents new nodes', async () => {
  const runtime = new ExecutionRuntime({ execute: async () => new Promise(() => undefined) });
  let executionId = '';
  runtime.events.on('execution.started', (event) => { executionId = event.executionId; });
  const running = runtime.execute(plan([node('slow'), node('never', ['slow'])]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runtime.cancel(executionId), true);
  const result = await running;
  assert.equal(result.state, 'CANCELLED');
  assert.equal(result.steps.slow, 'cancelled');
  assert.equal(result.steps.never, 'cancelled');
});

test('recovery resumes from the last checkpoint instead of repeating completed nodes', async () => {
  const calls: Record<string, number> = {}; let fail = true;
  const runtime = new ExecutionRuntime({ execute: async (current, context) => { calls[current.id] = (calls[current.id] ?? 0) + 1; if (current.id === 'edit' && fail) throw new Error('offline'); context.set(current.id, true); return {}; } }, { maxRetries: 0 });
  const executionPlan = plan([node('analysis'), node('edit', ['analysis'])]);
  const failed = await runtime.execute(executionPlan);
  assert.equal(failed.state, 'FAILED');
  fail = false;
  const recovered = await runtime.recover(executionPlan, failed.executionId);
  assert.equal(recovered.state, 'COMPLETED');
  assert.equal(calls.analysis, 1);
  assert.equal(calls.edit, 2);
});

test('priority queue and lifecycle events are observable', async () => {
  const events: string[] = [];
  const runtime = new ExecutionRuntime({ execute: async () => ({}) });
  runtime.events.on('execution.started', () => { events.push('started'); });
  runtime.events.on('execution.step.completed', () => { events.push('step.completed'); });
  runtime.events.on('execution.completed', () => { events.push('completed'); });
  const low = runtime.enqueue(plan([node('low')]), 1);
  const high = runtime.enqueue(plan([node('high')]), 10);
  assert.deepEqual(runtime.inspect().queued, [high, low]);
  const result = await runtime.runNext();
  assert.equal(result?.steps.high, 'completed');
  assert.deepEqual(events, ['started', 'step.completed', 'completed']);
});
