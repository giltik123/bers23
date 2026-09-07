import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';

import { createFinancialAccountHttpAdapter, FINANCIAL_ACCOUNT_PATH } from '../server/core/http/financialAccountHttpAdapter.ts';
import { createFinancialAccountPolicyHttpAdapter, FINANCIAL_ACCOUNT_INITIALIZE_PATH } from '../server/core/http/financialAccountPolicyHttpAdapter.ts';
import { createFinancialTrialHttpAdapter, FINANCIAL_TRIAL_START_PATH } from '../server/core/http/financialTrialHttpAdapter.ts';
import { PostgresFinancialAccountStore } from '../server/transactions/infrastructure/postgres/postgresFinancialAccountStore.ts';
import { PostgresFinancialTrialPolicy } from '../server/transactions/infrastructure/postgres/postgresFinancialTrialPolicy.ts';
import { RetryingPostgresTransactionRunner } from '../server/transactions/infrastructure/postgres/retryingTransactionRunner.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for P0b.2 HTTP PostgreSQL acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 16, application_name: 'bers-financial-trial-http-postgres' });
const runner = new RetryingPostgresTransactionRunner(pool);
const accounts = new PostgresFinancialAccountStore(runner);
const trials = new PostgresFinancialTrialPolicy(runner);
const principal = Object.freeze({ tenantId: 'tenant-p0b2-http-pg', userId: 'user-p0b2-http-pg' });

function config() {
  return Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'financial-p0b2-http-postgres-secret',
    bodyLimitBytes: 4096,
  }) as any;
}

const auth = Object.freeze({
  verify: async (authorization: string | undefined) => {
    if (authorization !== 'Bearer financial.p0b2.pg.token') {
      throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
    }
    return principal as any;
  },
});

const readAdapter = createFinancialAccountHttpAdapter({
  account: Object.freeze({ snapshot: accounts.snapshot.bind(accounts) }), auth, config: config(),
});
const initializeAdapter = createFinancialAccountPolicyHttpAdapter({
  account: Object.freeze({ initializeFreeAccount: accounts.initializeFreeAccount.bind(accounts) }),
  auth, config: config(), accepting: () => true,
});
const trialAdapter = createFinancialTrialHttpAdapter({
  trials: Object.freeze({ startTrial: trials.startTrial.bind(trials) }),
  auth, config: config(), accepting: () => true,
});

async function withServer(fn: (base: string) => Promise<void>) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://core.invalid').pathname;
    if (path === FINANCIAL_TRIAL_START_PATH) { void trialAdapter(request, response); return; }
    if (path === FINANCIAL_ACCOUNT_INITIALIZE_PATH) { void initializeAdapter(request, response); return; }
    if (path === FINANCIAL_ACCOUNT_PATH) { void readAdapter(request, response); return; }
    response.statusCode = 404; response.end();
  });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function headers(json = false) {
  return {
    authorization: 'Bearer financial.p0b2.pg.token',
    origin: 'https://app.example.test',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

async function persisted() {
  const [wallet, entitlement, grants] = await Promise.all([
    pool.query('SELECT total_credited,lifetime_spent,balance,reserved,version,updated_at FROM credit_wallets WHERE owner_id=$1', [principal.userId]),
    pool.query(`SELECT tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,ends_at,
                       trial_consumed_at,provider_customer_ref,provider_subscription_ref,updated_at
                FROM financial_entitlement_accounts WHERE owner_id=$1`, [principal.userId]),
    pool.query(`SELECT id,grant_kind,source,amount,idempotency_key,request_fingerprint,provider_event_id,occurred_at
                FROM credit_grants WHERE owner_id=$1 ORDER BY id`, [principal.userId]),
  ]);
  return Object.freeze({ wallet: wallet.rows, entitlement: entitlement.rows, grants: grants.rows });
}

test.before(async () => {
  await migrateTransactionSchema(pool);
  await pool.query('TRUNCATE credit_grants,financial_entitlement_accounts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
});

test.after(async () => {
  await pool.query('TRUNCATE credit_grants,financial_entitlement_accounts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE').catch(() => undefined);
  await pool.end();
});

test('unconfigured -> FREE initialize -> Plus trial -> replay -> GET stays canonical and trial creates no money', async () => {
  await withServer(async base => {
    let response = await fetch(`${base}${FINANCIAL_ACCOUNT_PATH}`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accountState: 'UNCONFIGURED', entitlement: null, wallet: null });

    response = await fetch(`${base}${FINANCIAL_TRIAL_START_PATH}`, {
      method: 'POST', headers: headers(true), body: JSON.stringify({ planId: 'plus' }),
    });
    assert.equal(response.status, 409);
    assert.equal((await response.json() as any).error, 'financial_account_unconfigured');
    assert.deepEqual(await persisted(), { wallet: [], entitlement: [], grants: [] });

    response = await fetch(`${base}${FINANCIAL_ACCOUNT_INITIALIZE_PATH}`, {
      method: 'POST', headers: headers(true), body: '{}',
    });
    assert.equal(response.status, 201);
    const free: any = await response.json();
    assert.equal(free.entitlement.planId, 'free');
    assert.equal(free.entitlement.state, 'FREE');
    assert.equal(free.wallet.totalCredited, 500);
    assert.equal(free.wallet.balance, 500);

    const beforeTrial = await persisted();
    assert.equal(beforeTrial.grants.length, 1);
    assert.equal(beforeTrial.grants[0].grant_kind, 'WELCOME');
    assert.equal(Number(beforeTrial.wallet[0].total_credited), 500);
    assert.equal(Number(beforeTrial.wallet[0].balance), 500);
    assert.equal(Number(beforeTrial.wallet[0].version), 1);

    response = await fetch(`${base}${FINANCIAL_TRIAL_START_PATH}`, {
      method: 'POST', headers: headers(true), body: JSON.stringify({ planId: 'plus' }),
    });
    assert.equal(response.status, 201);
    const started: any = await response.json();
    assert.equal(started.replayed, false);
    assert.equal(started.entitlement.planId, 'plus');
    assert.equal(started.entitlement.state, 'TRIAL');
    assert.equal(started.entitlement.source, 'SERVER_POLICY');
    assert.equal(started.entitlement.revision, 2);
    assert.equal(started.entitlement.startsAt, started.entitlement.trialConsumedAt);
    assert.equal(new Date(started.entitlement.endsAt).getTime() - new Date(started.entitlement.startsAt).getTime(), 7 * 86_400_000);
    assert.equal(started.wallet.totalCredited, 500);
    assert.equal(started.wallet.balance, 500);
    assert.equal(started.wallet.version, 1);

    const afterTrial = await persisted();
    assert.deepEqual(afterTrial.wallet, beforeTrial.wallet, 'trial transition must not touch wallet values or timestamps');
    assert.deepEqual(afterTrial.grants, beforeTrial.grants, 'trial transition must not create or alter grants');
    assert.equal(afterTrial.entitlement[0].plan_id, 'plus');
    assert.equal(afterTrial.entitlement[0].state, 'TRIAL');
    assert.equal(Number(afterTrial.entitlement[0].entitlement_revision), 2);
    assert.equal(new Date(afterTrial.entitlement[0].trial_consumed_at).getTime(), new Date(afterTrial.entitlement[0].starts_at).getTime());

    response = await fetch(`${base}${FINANCIAL_TRIAL_START_PATH}`, {
      method: 'POST', headers: headers(true), body: JSON.stringify({ planId: 'plus' }),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).replayed, true);
    assert.deepEqual(await persisted(), afterTrial, 'trial replay must perform no mutation');

    response = await fetch(`${base}${FINANCIAL_ACCOUNT_PATH}`, { headers: headers() });
    assert.equal(response.status, 200);
    const observed: any = await response.json();
    assert.equal(observed.entitlement.planId, 'plus');
    assert.equal(observed.entitlement.state, 'TRIAL');
    assert.equal(observed.entitlement.revision, 2);
    assert.equal(observed.wallet.balance, 500);
    assert.deepEqual(await persisted(), afterTrial, 'GET after trial remains observation-only');
  });
});

test('ineligible plan and forbidden financial fields cannot mutate an initialized FREE account', async () => {
  await pool.query('TRUNCATE credit_grants,financial_entitlement_accounts,credit_wallets RESTART IDENTITY CASCADE');
  assert.equal((await accounts.initializeFreeAccount(principal)).kind, 'initialized');
  const before = await persisted();

  await withServer(async base => {
    let response = await fetch(`${base}${FINANCIAL_TRIAL_START_PATH}`, {
      method: 'POST', headers: headers(true), body: JSON.stringify({ planId: 'enterprise' }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as any).error, 'trial_plan_not_eligible');

    response = await fetch(`${base}${FINANCIAL_TRIAL_START_PATH}`, {
      method: 'POST', headers: headers(true), body: JSON.stringify({ planId: 'pro', amount: 5000 }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json() as any).error, 'forbidden_client_authority');
  });
  assert.deepEqual(await persisted(), before);
});