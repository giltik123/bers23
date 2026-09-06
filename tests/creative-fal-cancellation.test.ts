import assert from 'node:assert/strict';
import test from 'node:test';
import { FalProvider, type ProviderRuntimeDependencies } from '../src/platform/creative/providers/fal/index.ts';
import { CreativeWorkflowEngine, WorkflowCompiler } from '../src/platform/creative/workflow-engine/index.ts';
import { createFalWorkflowRuntime, FalTemporaryInputMaterializer } from '../server/core/providers/falWorkflowRuntime.ts';

const scope = Object.freeze({ tenantId: 'tenant-cancel', projectId: 'project-cancel', userId: 'user-cancel' });
const cancelled = () => new DOMException('Creative execution cancelled', 'AbortError');
const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
};

function baseDependencies(overrides: Partial<ProviderRuntimeDependencies> = {}): ProviderRuntimeDependencies {
  let now = 1_000; let id = 0;
  return {
    transport: { send: async () => ({ status: 200, headers: {}, body: {} }) },
    artifactLoader: { load: async url => Object.freeze({ url, mimeType: 'image/png', size: 3, hash: 'abc' }) },
    clock: () => ++now,
    random: () => 0,
    id: () => `cancel-id-${++id}`,
    sleep: async () => {},
    api: { apiKey: 'secret', baseUrl: 'https://queue.test', timeoutMs: 60_000, maxRetries: 3, pollIntervalMs: 1 },
    ...overrides,
  };
}

test('active Fal POST observes caller signal and cancellation never retries', async () => {
  const entered = deferred(); let sends = 0;
  const provider = new FalProvider(baseDependencies({
    transport: {
      send: async (_request, signal) => {
        sends += 1; entered.resolve();
        return await new Promise((_, reject) => {
          const abort = () => reject(signal.reason instanceof Error ? signal.reason : cancelled());
          if (signal.aborted) abort(); else signal.addEventListener('abort', abort, { once: true });
        });
      },
    },
  }));
  const controller = new AbortController();
  const execution = provider.execute({ id: 'fal-active-cancel', scope, capability: 'image-edit', imageUrl: 'https://input.test/image.png' }, controller.signal);
  await entered.promise;
  controller.abort(cancelled());
  await assert.rejects(execution, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(sends, 1, 'user cancellation must not enter Fal retry');
});

test('queued Fal polling checks cancellation before issuing another provider request', async () => {
  const controller = new AbortController(); let sends = 0; let sleeps = 0;
  const provider = new FalProvider(baseDependencies({
    transport: {
      send: async () => {
        sends += 1;
        return { status: 200, headers: {}, body: { request_id: 'queued-job' } };
      },
    },
    sleep: async () => { sleeps += 1; controller.abort(cancelled()); },
  }));
  await assert.rejects(
    provider.execute({ id: 'fal-poll-cancel', scope, capability: 'image-edit', imageUrl: 'https://input.test/image.png' }, controller.signal),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(sleeps, 1);
  assert.equal(sends, 1, 'poll GET must not be issued after cancellation');
});

test('artifact fetch receives and obeys the exact owning execution signal', async () => {
  const loading = deferred(); let observedSignal: AbortSignal | undefined;
  const provider = new FalProvider(baseDependencies({
    transport: {
      send: async () => ({ status: 200, headers: {}, body: { images: [{ url: 'https://artifact.test/result.png' }] } }),
    },
    artifactLoader: {
      load: async (_url, _options, signal) => {
        observedSignal = signal; loading.resolve();
        return await new Promise((_, reject) => {
          const abort = () => reject(signal?.reason instanceof Error ? signal.reason : cancelled());
          if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
        });
      },
    },
  }));
  const controller = new AbortController();
  const execution = provider.execute({ id: 'fal-artifact-cancel', scope, capability: 'image-edit', imageUrl: 'https://input.test/image.png' }, controller.signal);
  await loading.promise;
  assert.equal(observedSignal, controller.signal);
  controller.abort(cancelled());
  await assert.rejects(execution, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(observedSignal?.aborted, true);
});

test('production Fal workflow runtime owns one active controller per workflow and exposes exact cancellation', async () => {
  const entered = deferred(); let activeSignal: AbortSignal | undefined;
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    activeSignal = init?.signal ?? undefined; entered.resolve();
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => reject(signal?.reason instanceof Error ? signal.reason : cancelled());
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    });
  }) as typeof fetch;
  const runtime = createFalWorkflowRuntime({
    apiKey: 'secret',
    baseUrl: 'https://queue.test',
    timeoutMs: 60_000,
    fetcher,
    artifacts: { resolve: () => ({ url: 'https://input.test/image.png' }) } as any,
  });
  const execution = runtime.execute({
    workflowId: 'creative-workflow-cancel',
    operation: { id: 'image-edit', type: 'image-edit', executionRoute: 'PROVIDER', providerId: 'fal' },
    artifacts: [{ id: 'original', kind: 'image', value: {}, producerStepId: 'user', scope }],
    scope,
  });
  await entered.promise;
  assert.equal(activeSignal?.aborted, false);
  assert.equal(runtime.cancel?.('creative-workflow-cancel'), true);
  await assert.rejects(execution, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(activeSignal?.aborted, true);
  assert.equal(runtime.cancel?.('creative-workflow-cancel'), false, 'completed/aborted runtime must not remain cancellable');
});

test('controlled provider input materialization receives and obeys the same cancellation signal', async () => {
  const entered = deferred();
  const fetcher = (async (_input: string | URL | Request, init?: RequestInit) => {
    entered.resolve();
    return await new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      const abort = () => reject(signal?.reason instanceof Error ? signal.reason : cancelled());
      if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
    });
  }) as typeof fetch;
  const materializer = new FalTemporaryInputMaterializer('secret', fetcher);
  const controller = new AbortController();
  const execution = materializer.materialize({ bytes: new Uint8Array([1, 2, 3]), mimeType: 'image/png', purpose: 'roi', scope }, controller.signal);
  await entered.promise;
  controller.abort(cancelled());
  await assert.rejects(execution, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
});

test('WorkflowEngine cancellation bypasses retry and fallback even with remaining retry budget', async () => {
  let runtimeCalls = 0; let fallbackCalls = 0;
  const engine = new CreativeWorkflowEngine({
    runtime: { execute: async () => { runtimeCalls += 1; throw cancelled(); } },
    providers: { isAvailable: () => true, fallback: () => { fallbackCalls += 1; return 'backup'; } },
  });
  const workflow = new WorkflowCompiler().compile({
    id: 'workflow-cancel-no-retry',
    prompt: 'edit',
    scope,
    sources: { executionGraph: { operations: [{ id: 'provider-step', type: 'image-edit', executionRoute: 'PROVIDER', providerId: 'fal', produces: ['image'] }] } },
    budget: { credits: 10, latencyMs: 60_000, ramMb: 1024, gpuMs: 60_000, aiCalls: 4, retries: 3 },
    compiledAt: 1,
  });
  await assert.rejects(engine.execute(workflow), (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(runtimeCalls, 1);
  assert.equal(fallbackCalls, 0);
});
