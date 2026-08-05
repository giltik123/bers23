import assert from 'node:assert/strict';
import test from 'node:test';
import { ExecutionRuntime } from '../src/platform/execution/runtime';
import type { ExecutionPlan } from '../src/platform/execution/ExecutionPlan';
import type { ExecutionStep } from '../src/platform/execution/ExecutionStep';

function plan(steps: readonly ExecutionStep[], order = steps.map((step) => step.id)): ExecutionPlan {
  const nodes = steps.map((step) => Object.freeze({ ...step, dependencies: Object.freeze([...step.dependencies]), type: 'processing' as const, status: 'pending' as const }));
  return Object.freeze({
    id: `plan-${steps.map((step) => step.id).join('-')}`, routeId: 'route-test', version: '2.4',
    status: 'ready', nodes: Object.freeze(nodes), edges: Object.freeze(nodes.flatMap((node) => node.dependencies.map((dependency) => Object.freeze({ from: dependency, to: node.id, condition: 'success' as const })))),
    steps: Object.freeze(nodes),
    executionOrder: Object.freeze([...order]), estimatedCost: 0, estimatedDuration: 1, riskLevel: 'low', createdAt: '2026-01-01T00:00:00.000Z',
  });
}
const step = (id: string, dependencies: readonly string[] = [], timeout?: number): ExecutionStep => ({ id, name: id, capability: id, module: 'test-module', dependencies, timeout });

test('executes a successful multi-step plan in dependency order', async () => {
  const calls: string[] = [];
  const runtime = new ExecutionRuntime({ execute: async (current, context) => { calls.push(current.id); context.set(current.id, `${current.id}-output`); return { output: current.id }; } });
  const result = await runtime.execute(plan([step('prepare'), step('apply', ['prepare']), step('quality', ['apply'])]));

  assert.equal(result.status, 'completed');
  assert.deepEqual(calls, ['prepare', 'apply', 'quality']);
  assert.deepEqual(result.steps.map((state) => state.status), ['completed', 'completed', 'completed']);
  assert.deepEqual(result.context, { prepare: 'prepare-output', apply: 'apply-output', quality: 'quality-output' });
  assert.deepEqual(runtime.inspect().completedExecutions, [result.executionId]);
});

test('propagates a failed step and skips its dependants', async () => {
  const runtime = new ExecutionRuntime({ execute: async (current) => { if (current.id === 'apply') throw new Error('provider failed'); return {}; } });
  const result = await runtime.execute(plan([step('prepare'), step('apply', ['prepare']), step('compose', ['apply'])]));

  assert.equal(result.status, 'failed');
  assert.equal(result.steps.find((state) => state.stepId === 'apply')?.status, 'failed');
  assert.equal(result.steps.find((state) => state.stepId === 'compose')?.status, 'skipped');
  assert.match(result.error ?? '', /provider failed/);
  assert.equal(runtime.inspect().failures.length, 1);
});

test('cancels an active execution and pending steps', async () => {
  let release!: () => void;
  const waiting = new Promise<void>((resolve) => { release = resolve; });
  const runtime = new ExecutionRuntime({ execute: async () => { await waiting; return {}; } });
  let executionId = '';
  runtime.events.once('execution.started', (event) => { executionId = event.executionId; });
  const running = runtime.execute(plan([step('slow'), step('after', ['slow'])]));
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(runtime.inspect().activeSteps[0]?.stepId, 'slow');
  assert.equal(runtime.cancel(executionId), true);
  const result = await running;
  release();

  assert.equal(result.status, 'cancelled');
  assert.deepEqual(result.steps.map((state) => state.status), ['cancelled', 'cancelled']);
});

test('fails and skips dependants when a step times out', async () => {
  const runtime = new ExecutionRuntime({ execute: async () => new Promise(() => undefined) });
  const result = await runtime.execute(plan([step('slow', [], 10), step('after', ['slow'])]));

  assert.equal(result.status, 'failed');
  assert.match(result.error ?? '', /timed out after 10ms/);
  assert.equal(result.steps[1].status, 'skipped');
});

test('publishes lifecycle events and immutable result snapshots without mutating the plan', async () => {
  const sourcePlan = plan([step('one')]);
  const before = JSON.stringify(sourcePlan);
  const events: string[] = [];
  const runtime = new ExecutionRuntime({ execute: async (_current, context) => { context.set('answer', 42); return { metadata: { adapter: 'test' } }; } });
  runtime.events.on('execution.started', () => { events.push('execution.started'); });
  runtime.events.on('execution.step.started', () => { events.push('execution.step.started'); });
  runtime.events.on('execution.step.completed', () => { events.push('execution.step.completed'); });
  runtime.events.on('execution.completed', () => { events.push('execution.completed'); });
  const result = await runtime.execute(sourcePlan);

  assert.deepEqual(events, ['execution.started', 'execution.step.started', 'execution.step.completed', 'execution.completed']);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.context), true);
  assert.equal(Object.isFrozen(result.steps), true);
  assert.equal(JSON.stringify(sourcePlan), before);
});
