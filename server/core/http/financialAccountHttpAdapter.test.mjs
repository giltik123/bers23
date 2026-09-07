import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { createFinancialAccountHttpAdapter } from './financialAccountHttpAdapter.ts';

const identity = Object.freeze({ tenantId: 'tenant-financial-http', userId: 'user-financial-http' });
const snapshot = Object.freeze({
  identity,
  entitlement: Object.freeze({
    planId: 'free',
    state: 'FREE',
    source: 'SERVER_POLICY',
    revision: 2,
    startsAt: '2026-09-01T00:00:00.000Z',
    updatedAt: '2026-09-07T01:00:00.000Z',
  }),
  wallet: Object.freeze({
    totalCredited: 100,
    lifetimeSpent: 25,
    balance: 75,
    reserved: 10,
    available: 65,
    version: 4,
    updatedAt: '2026-09-07T01:00:00.000Z',
  }),
});

function harness({ principal = identity, value = snapshot } = {}) {
  const calls = [];
  const account = Object.freeze({
    snapshot: async candidate => { calls.push(candidate); return value; },
  });
  const auth = Object.freeze({
    verify: async authorization => {
      if (authorization !== 'Bearer financial.test.token') throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
      return principal;
    },
  });
  const config = Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'financial-http-test-secret',
  });
  return Object.freeze({ adapter: createFinancialAccountHttpAdapter({ account, auth, config }), calls });
}

async function withServer(handler, fn) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  try { return await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function headers(extra = {}) {
  return { authorization: 'Bearer financial.test.token', origin: 'https://app.example.test', ...extra };
}

async function body(response) { return response.json(); }

test('financial account GET is principal-scoped and returns only public read model', async () => {
  const { adapter, calls } = harness();
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/financial/account`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://app.example.test');
    const result = await body(response);
    assert.equal(result.accountState, 'CONFIGURED');
    assert.equal(result.entitlement.planId, 'free');
    assert.equal(result.entitlement.state, 'FREE');
    assert.equal(result.wallet.balance, 75);
    assert.equal(result.wallet.available, 65);
    assert.equal('identity' in result, false);
    assert.equal('providerCustomerRef' in result.entitlement, false);
    assert.equal('providerSubscriptionRef' in result.entitlement, false);
    assert.equal('providerEventId' in result, false);
  });
  assert.deepEqual(calls, [identity]);
});

test('unconfigured account is explicit and GET cannot bootstrap financial state', async () => {
  const value = Object.freeze({ identity });
  const { adapter, calls } = harness({ value });
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/financial/account`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.deepEqual(await body(response), { accountState: 'UNCONFIGURED', entitlement: null, wallet: null });
  });
  assert.deepEqual(calls, [identity]);
});

test('financial account transport exposes no mutation or caller-selected identity authority', async () => {
  const { adapter, calls } = harness();
  await withServer(adapter, async base => {
    for (const method of ['POST', 'PATCH', 'DELETE']) {
      const response = await fetch(`${base}/api/core/financial/account`, { method, headers: headers() });
      assert.equal(response.status, 405, method);
      assert.equal((await body(response)).error, 'method_not_allowed');
    }
    const query = await fetch(`${base}/api/core/financial/account?userId=other&tenantId=other`, { headers: headers() });
    assert.equal(query.status, 400);
    assert.equal((await body(query)).error, 'unexpected_query_parameter');
  });
  assert.equal(calls.length, 0);
});

test('authentication, origin policy and OPTIONS remain fail closed', async () => {
  const { adapter, calls } = harness();
  await withServer(adapter, async base => {
    const unauthenticated = await fetch(`${base}/api/core/financial/account`);
    assert.equal(unauthenticated.status, 401);
    assert.equal((await body(unauthenticated)).error, 'unauthenticated');

    const deniedOrigin = await fetch(`${base}/api/core/financial/account`, { headers: { authorization: 'Bearer financial.test.token', origin: 'https://evil.example' } });
    assert.equal(deniedOrigin.status, 403);
    assert.equal((await body(deniedOrigin)).error, 'origin_denied');

    const options = await fetch(`${base}/api/core/financial/account`, { method: 'OPTIONS', headers: { origin: 'https://app.example.test' } });
    assert.equal(options.status, 204);
    assert.equal(options.headers.get('access-control-allow-methods'), 'GET, OPTIONS');
  });
  assert.equal(calls.length, 0);
});
