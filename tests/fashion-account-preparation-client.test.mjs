import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';

test('account preparation sends an explicit empty cookie/CSRF command with no browser grant authority', async () => {
  const result = await build({ entryPoints: ['src/api/coreClient.js'], bundle: true, write: false, platform: 'node', format: 'esm', alias: { '@': path.resolve('src') }, define: { 'import.meta.env': '{}' } });
  const { coreClient } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString('base64')}`);
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return Response.json({}, { headers: { 'X-Bers-CSRF-Token': 'server-issued-session-proof' } });
  };
  try {
    await coreClient.auth.me();
    await coreClient.financialAccount.initialize({ userId: 'other', amount: 999, plan: 'paid' });
    assert.equal(calls.length, 2);
    const { url, init } = calls[1];
    assert.equal(url, '/api/core/financial/account/initialize');
    assert.equal(init.method, 'POST');
    assert.deepEqual(JSON.parse(init.body), {});
    assert.equal(init.credentials, 'include');
    assert.equal(init.headers.get('X-Bers-CSRF-Token'), 'server-issued-session-proof');
    assert.equal(init.headers.has('Authorization'), false);
  } finally { globalThis.fetch = originalFetch; }
});
