import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { requiredProductionFrontendHeaders } from '../config/frontendSecurityPolicy.mjs';
import { createProductionFrontendServer } from '../scripts/serve-production-frontend.mjs';

async function withFrontend(coreApiUrl, run) {
  const rootDir = await mkdtemp(join(tmpdir(), 'bers-v1-frontend-'));
  await mkdir(join(rootDir, 'assets'), { recursive: true });
  await writeFile(join(rootDir, 'index.html'), '<!doctype html><html><body>BERS v1</body></html>');
  await writeFile(join(rootDir, 'assets', 'app.js'), 'console.log("BERS");');

  const server = createProductionFrontendServer({ rootDir, coreApiUrl });
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });

  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolvePromise, rejectPromise) => server.close(error => error ? rejectPromise(error) : resolvePromise()));
  }
}

test('production frontend server emits the shared exact response security contract', async () => {
  const coreApiUrl = 'https://core.example.test/api/core';
  await withFrontend(coreApiUrl, async baseUrl => {
    const response = await fetch(`${baseUrl}/`, { redirect: 'manual' });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /^text\/html/u);
    for (const [name, value] of Object.entries(requiredProductionFrontendHeaders(coreApiUrl))) {
      assert.equal(response.headers.get(name), value);
    }
    assert.equal(response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
  });
});

test('production frontend server preserves assets and SPA fallback under the same headers', async () => {
  await withFrontend('/api/core', async baseUrl => {
    const asset = await fetch(`${baseUrl}/assets/app.js`);
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('content-type') ?? '', /^text\/javascript/u);
    assert.equal(await asset.text(), 'console.log("BERS");');

    const fallback = await fetch(`${baseUrl}/projects/example`);
    assert.equal(fallback.status, 200);
    assert.match(fallback.headers.get('content-type') ?? '', /^text\/html/u);
    assert.match(await fallback.text(), /BERS v1/u);
  });
});
