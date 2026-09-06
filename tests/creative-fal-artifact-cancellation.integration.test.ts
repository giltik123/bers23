import assert from 'node:assert/strict';
import test from 'node:test';
import { createFalWorkflowRuntime } from '../server/core/providers/falWorkflowRuntime.ts';

const scope = Object.freeze({ tenantId: 'tenant-artifact-cancel', projectId: 'project-artifact-cancel', userId: 'user-artifact-cancel' });
const cancelled = () => new DOMException('Creative execution cancelled', 'AbortError');

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('production Fal artifact egress uses the owning workflow AbortSignal end-to-end', async () => {
  const artifactStarted = deferred();
  let artifactSignal: AbortSignal | undefined;
  let queueCalls = 0;
  let artifactCalls = 0;

  const fetcher = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith('https://queue.test/')) {
      queueCalls += 1;
      return new Response(JSON.stringify({ images: [{ url: 'https://fal.media/result.png' }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (url === 'https://fal.media/result.png') {
      artifactCalls += 1;
      artifactSignal = init?.signal ?? undefined;
      artifactStarted.resolve();
      return await new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        const abort = () => reject(signal?.reason instanceof Error ? signal.reason : cancelled());
        if (signal?.aborted) abort(); else signal?.addEventListener('abort', abort, { once: true });
      });
    }
    throw new Error(`Unexpected fetch: ${url}`);
  }) as typeof fetch;

  const runtime = createFalWorkflowRuntime({
    apiKey: 'secret',
    baseUrl: 'https://queue.test',
    timeoutMs: 60_000,
    fetcher,
    artifacts: { resolve: () => ({ url: 'https://input.test/original.png' }) } as any,
  });

  const execution = runtime.execute({
    workflowId: 'creative-artifact-egress-cancel',
    operation: { id: 'image-edit', type: 'image-edit', executionRoute: 'PROVIDER', providerId: 'fal' },
    artifacts: [{ id: 'original', kind: 'image', value: {}, producerStepId: 'user', scope }],
    scope,
  });

  await artifactStarted.promise;
  assert.equal(queueCalls, 1);
  assert.equal(artifactCalls, 1);
  assert.equal(artifactSignal?.aborted, false);
  assert.equal(runtime.cancel?.('creative-artifact-egress-cancel'), true);
  await assert.rejects(execution, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
  assert.equal(artifactSignal?.aborted, true);
  assert.equal(runtime.cancel?.('creative-artifact-egress-cancel'), false);
});
