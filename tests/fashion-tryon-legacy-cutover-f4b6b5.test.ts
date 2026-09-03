import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFashionTryOnLegacyPrepareTombstoneHttpAdapter } from '../server/core/http/fashionTryOnLegacyPrepareTombstoneHttpAdapter.ts';

async function withServer(run: (base: string) => Promise<void>) {
  const tombstone = createFashionTryOnLegacyPrepareTombstoneHttpAdapter();
  const server = createServer((request, response) => {
    void tombstone(request, response).then(handled => {
      if (handled || response.writableEnded) return;
      response.statusCode = 404;
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test server address unavailable');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('F4b.6b.5 legacy Fashion prepare routes are explicit 410 tombstones', async () => {
  await withServer(async base => {
    for (const path of [
      '/api/core/local-execution/garment-mesh-warp/prepare',
      '/api/core/local-execution/garment-texture-composite/prepare',
    ]) {
      const response = await fetch(`${base}${path}`, { method: 'POST' });
      assert.equal(response.status, 410);
      assert.deepEqual(await response.json(), {
        error: 'fashion_tryon_orchestration_required',
        message: 'Use the Fashion Try-On orchestration API',
      });
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
  });
});

test('F4b.6b.5 tombstone does not preserve any rich low-level Fashion execution route', async () => {
  await withServer(async base => {
    for (const path of [
      '/api/core/local-execution/garment-mesh-warp/44444444-4444-4444-8444-444444444444/inputs',
      '/api/core/local-execution/garment-mesh-warp/prepare/extra',
      '/api/core/local-execution/garment-texture-composite/55555555-5555-4555-8555-555555555555/inputs',
      '/api/core/local-execution/garment-texture-composite/prepare/extra',
    ]) {
      assert.equal((await fetch(`${base}${path}`)).status, 404, path);
    }
  });
});
