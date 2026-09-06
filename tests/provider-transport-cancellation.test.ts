import assert from 'node:assert/strict';
import test from 'node:test';
import { HttpProviderTransport } from '../src/platform/creative/provider-runtime/index.ts';
import { ProviderArtifactEgressTransport } from '../src/platform/creative/provider-runtime/ProviderArtifactEgressTransport.ts';

const cancelled = () => new DOMException('Creative execution cancelled', 'AbortError');

function abortedSignal(): AbortSignal {
  const controller = new AbortController();
  controller.abort(cancelled());
  return controller.signal;
}

test('HttpProviderTransport rejects a pre-aborted owning signal before fetch begins', async () => {
  let fetchCalls = 0;
  const transport = new HttpProviderTransport(async () => {
    fetchCalls += 1;
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  });
  await assert.rejects(
    transport.send({ url: 'https://queue.test/model', method: 'POST', headers: {}, body: '{}', timeoutMs: 1_000 }, abortedSignal()),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(fetchCalls, 0);
});

test('ProviderArtifactEgressTransport rejects a pre-aborted owning signal before artifact fetch begins', async () => {
  let fetchCalls = 0;
  const transport = new ProviderArtifactEgressTransport(async () => {
    fetchCalls += 1;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/png' } });
  }, { allowedHosts: ['fal.media'] });
  await assert.rejects(
    transport.send({ url: 'https://fal.media/result.png', method: 'GET', headers: {}, timeoutMs: 1_000 }, abortedSignal()),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(fetchCalls, 0);
});
