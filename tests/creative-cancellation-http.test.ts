import assert from 'node:assert/strict';
import test from 'node:test';
import { createCreativeLifecycleHandlers } from '../server/core/http/creativeLifecycleHandlers.ts';

const auth = Object.freeze({ tenantId: 'tenant-http-cancel', userId: 'user-http-cancel' });

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

test('authenticated lifecycle cancel returns 202 only after owning cancellation reconciliation settles', async () => {
  const gate = deferred();
  const events: string[] = [];
  let cancelAuth: unknown;
  let statusAuth: unknown;
  const service = {
    cancel: async (_executionId: string, receivedAuth: unknown) => {
      cancelAuth = receivedAuth;
      events.push('cancel:start');
      await gate.promise;
      events.push('cancel:done');
    },
    status: (_executionId: string, receivedAuth: unknown) => {
      statusAuth = receivedAuth;
      events.push('status');
      return 'SKIPPED' as const;
    },
    result: () => undefined,
    deliveryUrl: () => undefined,
  } as any;
  const handlers = createCreativeLifecycleHandlers(service);

  let settled = false;
  const responsePromise = handlers.cancel({ auth, correlationId: 'cancel-correlation' }, 'creative-http-cancel').then((response) => {
    settled = true;
    return response;
  });
  await Promise.resolve();
  assert.equal(settled, false, 'HTTP 202 must not be produced before owning reconciliation completes');
  assert.deepEqual(events, ['cancel:start']);

  gate.resolve();
  const response = await responsePromise;
  assert.deepEqual(events, ['cancel:start', 'cancel:done', 'status']);
  assert.equal(response.status, 202);
  assert.deepEqual(response.body, { executionId: 'creative-http-cancel', status: 'SKIPPED' });
  assert.equal(cancelAuth, auth);
  assert.equal(statusAuth, auth);
});

test('unauthenticated lifecycle cancel is denied before service cancellation authority is reached', async () => {
  let cancelCalls = 0;
  const service = {
    cancel: async () => { cancelCalls += 1; },
    status: () => 'SKIPPED' as const,
    result: () => undefined,
    deliveryUrl: () => undefined,
  } as any;
  const response = await createCreativeLifecycleHandlers(service).cancel({ correlationId: 'anonymous-cancel' }, 'creative-anonymous-cancel');
  assert.equal(response.status, 401);
  assert.equal((response.body as any).code, 'unauthenticated');
  assert.equal(cancelCalls, 0);
});
