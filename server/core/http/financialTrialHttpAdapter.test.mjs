import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

import { createFinancialTrialHttpAdapter } from './financialTrialHttpAdapter.ts';

const principal = Object.freeze({ tenantId: 'tenant-trial-http', userId: 'user-trial-http' });

function config() {
  return Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'financial-trial-http-secret',
    bodyLimitBytes: 4096,
  });
}

function configuredSnapshot(planId = 'plus') {
  return Object.freeze({
    identity: principal,
    entitlement: Object.freeze({
      planId,
      state: 'TRIAL',
      source: 'SERVER_POLICY',
      revision: 2,
      startsAt: '2026-09-07T03:00:00.000Z',
      endsAt: planId === 'plus' ? '2026-09-14T03:00:00.000Z' : '2026-09-21T03:00:00.000Z',
      trialConsumedAt: '2026-09-07T03:00:00.000Z',
      updatedAt: '2026-09-07T03:00:00.000Z',
    }),
    wallet: Object.freeze({
      totalCredited: 500,
      lifetimeSpent: 0,
      balance: 500,
      reserved: 0,
      available: 500,
      version: 1,
      updatedAt: '2026-09-07T02:00:00.000Z',
    }),
  });
}

function adapterFor(overrides = {}) {
  const calls = [];
  const adapter = createFinancialTrialHttpAdapter({
    trials: Object.freeze({
      startTrial: async (identity, planId) => {
        calls.push({ identity, planId });
        return overrides.result ?? Object.freeze({ kind: 'started', snapshot: configuredSnapshot(planId) });
      },
    }),
    auth: Object.freeze({
      verify: async authorization => {
        if (overrides.authError) throw overrides.authError;
        if (authorization !== 'Bearer financial.trial.token') {
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
  return {
    authorization: 'Bearer financial.trial.token',
    origin: 'https://app.example.test',
    'content-type': 'application/json',
    ...extra,
  };
}

async function json(response) { return response.json(); }

test('POST planId derives identity from auth and exposes canonical trial without inventing credits', async () => {
  const { adapter, calls } = adapterFor();
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ planId: 'plus' }),
    });
    assert.equal(response.status, 201);
    const body = await json(response);
    assert.equal(body.replayed, false);
    assert.equal(body.accountState, 'CONFIGURED');
    assert.equal(body.entitlement.planId, 'plus');
    assert.equal(body.entitlement.state, 'TRIAL');
    assert.equal(body.entitlement.source, 'SERVER_POLICY');
    assert.equal(body.entitlement.revision, 2);
    assert.equal(body.wallet.totalCredited, 500);
    assert.equal(body.wallet.balance, 500);
    assert.equal(body.wallet.version, 1);
    assert.equal('identity' in body, false);
    assert.equal('trialCredits' in body, false);
  });
  assert.deepEqual(calls, [{ identity: principal, planId: 'plus' }]);
});

test('exact replay is 200 and uses the same narrow plan intent', async () => {
  const { adapter, calls } = adapterFor({ result: Object.freeze({ kind: 'replayed', snapshot: configuredSnapshot('pro') }) });
  await withServer(adapter, async base => {
    const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ planId: 'pro' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await json(response)).replayed, true);
  });
  assert.deepEqual(calls, [{ identity: principal, planId: 'pro' }]);
});

test('client cannot submit trial duration, money, state, identity, timestamps or evidence', async () => {
  const { adapter, calls } = adapterFor();
  await withServer(adapter, async base => {
    const forbidden = [
      { planId: 'plus', trialDays: 365 },
      { planId: 'plus', amount: 1500 },
      { planId: 'plus', state: 'ACTIVE' },
      { planId: 'plus', tenantId: principal.tenantId },
      { planId: 'plus', userId: principal.userId },
      { planId: 'plus', startsAt: '2020-01-01T00:00:00.000Z' },
      { planId: 'plus', endsAt: '2099-01-01T00:00:00.000Z' },
      { planId: 'plus', trialConsumedAt: null },
      { planId: 'plus', providerEventId: 'fake-event' },
      { planId: 'plus', idempotencyKey: 'client-key' },
    ];
    for (const body of forbidden) {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
      assert.equal((await json(response)).error, 'forbidden_client_authority');
    }
  });
  assert.equal(calls.length, 0);
});

test('body and query contract fail closed before trial authority', async () => {
  const { adapter, calls } = adapterFor();
  await withServer(adapter, async base => {
    for (const body of [{}, [], null, { planId: ' Plus ' }, { planId: 'PLUS' }, { planId: 7 }]) {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
        method: 'POST', headers: headers(), body: JSON.stringify(body),
      });
      assert.equal(response.status, 400);
    }
    const query = await fetch(`${base}/api/core/financial/account/trial/start?trialDays=7`, {
      method: 'POST', headers: headers(), body: JSON.stringify({ planId: 'plus' }),
    });
    assert.equal(query.status, 400);
    assert.equal((await json(query)).error, 'forbidden_client_authority');
  });
  assert.equal(calls.length, 0);
});

test('server trial result failures have stable fail-closed HTTP mappings', async () => {
  const cases = [
    ['account_not_found', 409, 'financial_account_unconfigured'],
    ['plan_not_eligible', 400, 'trial_plan_not_eligible'],
    ['trial_conflict', 409, 'trial_already_active'],
    ['trial_consumed', 409, 'trial_already_consumed'],
    ['policy_conflict', 409, 'financial_account_policy_conflict'],
    ['policy_drift', 409, 'financial_account_policy_drift'],
  ];
  for (const [kind, status, code] of cases) {
    const { adapter } = adapterFor({ result: Object.freeze({ kind }) });
    await withServer(adapter, async base => {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ planId: 'plus' }),
      });
      assert.equal(response.status, status, kind);
      assert.equal((await json(response)).error, code, kind);
    });
  }
});

test('method, media type, origin, auth and shutdown gates fail before mutation', async () => {
  {
    const { adapter, calls } = adapterFor();
    await withServer(adapter, async base => {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, { method: 'GET', headers: headers() });
      assert.equal(response.status, 405);
      assert.match(response.headers.get('allow') ?? '', /POST/);
    });
    assert.equal(calls.length, 0);
  }
  {
    const { adapter, calls } = adapterFor();
    await withServer(adapter, async base => {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
        method: 'POST', headers: { ...headers(), 'content-type': 'text/plain' }, body: '{"planId":"plus"}',
      });
      assert.equal(response.status, 415);
    });
    assert.equal(calls.length, 0);
  }
  {
    const { adapter, calls } = adapterFor();
    await withServer(adapter, async base => {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
        method: 'POST', headers: headers({ origin: 'https://evil.example' }), body: JSON.stringify({ planId: 'plus' }),
      });
      assert.equal(response.status, 403);
    });
    assert.equal(calls.length, 0);
  }
  {
    const { adapter, calls } = adapterFor();
    await withServer(adapter, async base => {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
        method: 'POST', headers: headers({ authorization: 'Bearer wrong' }), body: JSON.stringify({ planId: 'plus' }),
      });
      assert.equal(response.status, 401);
    });
    assert.equal(calls.length, 0);
  }
  {
    const { adapter, calls } = adapterFor({ accepting: false });
    await withServer(adapter, async base => {
      const response = await fetch(`${base}/api/core/financial/account/trial/start`, {
        method: 'POST', headers: headers(), body: JSON.stringify({ planId: 'plus' }),
      });
      assert.equal(response.status, 503);
    });
    assert.equal(calls.length, 0);
  }
});

test('OPTIONS is bounded CORS preflight and unrelated paths are not claimed', async () => {
  const { adapter, calls } = adapterFor();
  await withServer(adapter, async base => {
    const preflight = await fetch(`${base}/api/core/financial/account/trial/start`, {
      method: 'OPTIONS', headers: { origin: 'https://app.example.test' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://app.example.test');
    assert.match(preflight.headers.get('access-control-allow-methods') ?? '', /POST/);

    const unrelated = await fetch(`${base}/api/core/financial/account/not-trial`, { method: 'POST' });
    assert.equal(unrelated.status, 200, 'test server remains unclaimed when adapter returns false');
  });
  assert.equal(calls.length, 0);
});