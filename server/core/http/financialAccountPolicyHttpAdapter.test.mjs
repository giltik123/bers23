import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createFinancialAccountPolicyHttpAdapter } from './financialAccountPolicyHttpAdapter.ts';

const principal = Object.freeze({ tenantId: 'tenant-policy-http', userId: 'user-policy-http' });

function config() {
  return Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'financial-policy-http-secret',
    bodyLimitBytes: 4096,
  });
}

function configuredSnapshot() {
  return Object.freeze({
    identity: principal,
    entitlement: Object.freeze({
      planId: 'free', state: 'FREE', source: 'SERVER_POLICY', revision: 1,
      startsAt: '2026-09-07T02:00:00.000Z', updatedAt: '2026-09-07T02:00:00.000Z',
    }),
    wallet: Object.freeze({
      totalCredited: 500, lifetimeSpent: 0, balance: 500, reserved: 0,
      available: 500, version: 1, updatedAt: '2026-09-07T02:00:00.000Z',
    }),
  });
}

function adapterFor(overrides = {}) {
  const calls = [];
  const adapter = createFinancialAccountPolicyHttpAdapter({
    account: Object.freeze({
      initializeFreeAccount: async identity => {
        calls.push(identity);
        return overrides.result ?? Object.freeze({ kind: 'initialized', snapshot: configuredSnapshot() });
      },
    }),
    auth: Object.freeze({
      verify: async authorization => {
        if (overrides.authError) throw overrides.authError;
        if (authorization !== 'Bearer financial.policy.token') {
          throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
        }
        return principal;
      },
    }),
    config: config(),
    accepting: () => overrides.accepting !== false,
  });
  return { adapter, calls };
}

async function withServer(handler, fn) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function headers(extra = {}) {
  return { authorization: 'Bearer financial.policy.token', origin: 'https://app.example.test', 'content-type': 'application/json', ...extra };
}

async function json(response) { return response.json(); }

test('POST {} exposes only canonical FREE result and derives scope from authenticated principal', async () => {
  const { adapter, calls } = adapterFor();
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/financial/account/initialize`, {
      method: 'POST', headers: headers(), body: '{}',
    });
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.replayed, false);
    assert.equal(body.accountState, 'CONFIGURED');
    assert.equal(body.entitlement.planId, 'free');
    assert.equal(body.entitlement.state, 'FREE');
    assert.equal(body.entitlement.source, 'SERVER_POLICY');
    assert.equal(body.wallet.totalCredited, 500);
    assert.equal(body.wallet.balance, 500);
    assert.equal('identity' in body, false);
  });
  assert.deepEqual(calls, [principal]);
});

test('exact replay is 200 and does not accept any financial field from the client', async () => {
  const replay = Object.freeze({ kind: 'replayed', snapshot: configuredSnapshot() });
  const { adapter, calls } = adapterFor({ result: replay });
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/financial/account/initialize`, {
      method: 'POST', headers: headers(), body: '{}',
    });
    assert.equal(response.status, 200);
    assert.equal((await json(response)).replayed, true);

    for (const body of [
      { amount: 500 }, { planId: 'free' }, { state: 'FREE' }, { tenantId: principal.tenantId },
      { userId: principal.userId }, { idempotencyKey: 'client-key' }, { trialDays: 30 },
    ]) {
      const denied = await fetch(`${base}/api/core/financial/account/initialize`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      assert.equal(denied.status, 400);
      assert.equal((await json(denied)).error, 'forbidden_client_authority');
    }
  });
  assert.equal(calls.length, 1, 'forbidden client financial fields must be rejected before the authority call');
});

test('query authority, wrong method, unsupported media and shutdown all fail closed', async () => {
  const { adapter, calls } = adapterFor();
  await withServer(adapter, async base => {
    let response = await fetch(`${base}/api/core/financial/account/initialize?amount=500`, { method: 'POST', headers: headers(), body: '{}' });
    assert.equal(response.status, 400);
    assert.equal((await json(response)).error, 'forbidden_client_authority');

    response = await fetch(`${base}/api/core/financial/account/initialize`, { headers: { authorization: 'Bearer financial.policy.token' } });
    assert.equal(response.status, 405);
    assert.equal(response.headers.get('allow'), 'POST, OPTIONS');

    response = await fetch(`${base}/api/core/financial/account/initialize`, { method: 'POST', headers: { authorization: 'Bearer financial.policy.token' }, body: '{}' });
    assert.equal(response.status, 415);
  });
  assert.equal(calls.length, 0);

  const stopped = adapterFor({ accepting: false });
  await withServer(stopped.adapter, async base => {
    const response = await fetch(`${base}/api/core/financial/account/initialize`, { method: 'POST', headers: headers(), body: '{}' });
    assert.equal(response.status, 503);
    assert.equal((await json(response)).error, 'shutting_down');
  });
  assert.equal(stopped.calls.length, 0);
});

test('authentication and browser-cookie CSRF boundary are enforced before initialization', async () => {
  const { adapter, calls } = adapterFor();
  await withServer(adapter, async base => {
    let response = await fetch(`${base}/api/core/financial/account/initialize`, {
      method: 'POST', headers: { origin: 'https://app.example.test', 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(response.status, 401);
    assert.equal((await json(response)).error, 'unauthenticated');

    response = await fetch(`${base}/api/core/financial/account/initialize`, {
      method: 'POST',
      headers: {
        origin: 'https://app.example.test',
        'content-type': 'application/json',
        cookie: 'bers_session_dev=aaa.bbb.ccc',
      },
      body: '{}',
    });
    assert.equal(response.status, 403);
    assert.equal((await json(response)).error, 'csrf_denied');
  });
  assert.equal(calls.length, 0);
});

test('policy conflict and policy drift are explicit 409 results with no authority widening', async () => {
  for (const [kind, code] of [
    ['policy_conflict', 'financial_account_policy_conflict'],
    ['policy_drift', 'financial_account_policy_drift'],
  ]) {
    const { adapter, calls } = adapterFor({ result: Object.freeze({ kind }) });
    await withServer(adapter, async base => {
      const response = await fetch(`${base}/api/core/financial/account/initialize`, { method: 'POST', headers: headers(), body: '{}' });
      assert.equal(response.status, 409);
      assert.equal((await json(response)).error, code);
    });
    assert.deepEqual(calls, [principal]);
  }
});
