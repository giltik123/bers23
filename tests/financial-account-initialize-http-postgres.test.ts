import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';

import { createFinancialAccountHttpAdapter, FINANCIAL_ACCOUNT_PATH } from '../server/core/http/financialAccountHttpAdapter.ts';
import { createFinancialAccountPolicyHttpAdapter, FINANCIAL_ACCOUNT_INITIALIZE_PATH } from '../server/core/http/financialAccountPolicyHttpAdapter.ts';
import { PostgresFinancialAccountStore } from '../server/transactions/infrastructure/postgres/postgresFinancialAccountStore.ts';
import { RetryingPostgresTransactionRunner } from '../server/transactions/infrastructure/postgres/retryingTransactionRunner.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for P0b.1 HTTP PostgreSQL acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 12, application_name: 'bers-financial-initialize-http-postgres' });
const runner = new RetryingPostgresTransactionRunner(pool);
const accounts = new PostgresFinancialAccountStore(runner);
const principal = Object.freeze({ tenantId: 'tenant-p0b1-http-pg', userId: 'user-p0b1-http-pg' });

function config() {
  return Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'financial-p0b1-http-postgres-secret',
    bodyLimitBytes: 4096,
  }) as any;
}

const auth = Object.freeze({
  verify: async (authorization: string | undefined) => {
    if (authorization !== 'Bearer financial.p0b1.pg.token') {
      throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
    }
    return principal as any;
  },
});

const readAdapter = createFinancialAccountHttpAdapter({
  account: Object.freeze({ snapshot: accounts.snapshot.bind(accounts) }), auth, config: config(),
});
const policyAdapter = createFinancialAccountPolicyHttpAdapter({
  account: Object.freeze({ initializeFreeAccount: accounts.initializeFreeAccount.bind(accounts) }),
  auth, config: config(), accepting: () => true,
});

async function withServer(fn: (base: string) => Promise<void>) {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? '/', 'http://core.invalid').pathname;
    if (path === FINANCIAL_ACCOUNT_INITIALIZE_PATH) { void policyAdapter(request, response); return; }
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
    authorization: 'Bearer financial.p0b1.pg.token',
    origin: 'https://app.example.test',
    ...(json ? { 'content-type': 'application/json' } : {}),
  };
}

async function persisted() {
  const [wallet, entitlement, grants] = await Promise.all([
    pool.query('SELECT total_credited,lifetime_spent,balance,reserved,version FROM credit_wallets WHERE owner_id=$1', [principal.userId]),
    pool.query('SELECT tenant_id,plan_id,state,source,entitlement_revision FROM financial_entitlement_accounts WHERE owner_id=$1', [principal.userId]),
    pool.query('SELECT grant_kind,source,amount,idempotency_key FROM credit_grants WHERE owner_id=$1', [principal.userId]),
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

test('GET remains mutation-free before initialize, POST bootstraps once, and later GET observes canonical state', async () => {
  await withServer(async base => {
    let response = await fetch(`${base}${FINANCIAL_ACCOUNT_PATH}`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { accountState: 'UNCONFIGURED', entitlement: null, wallet: null });
    assert.deepEqual(await persisted(), { wallet: [], entitlement: [], grants: [] });

    response = await fetch(`${base}${FINANCIAL_ACCOUNT_INITIALIZE_PATH}`, {
      method: 'POST', headers: headers(true), body: '{}',
    });
    assert.equal(response.status, 201);
    const initialized: any = await response.json();
    assert.equal(initialized.replayed, false);
    assert.equal(initialized.entitlement.planId, 'free');
    assert.equal(initialized.entitlement.state, 'FREE');
    assert.equal(initialized.wallet.totalCredited, 500);
    assert.equal(initialized.wallet.balance, 500);

    const firstState = await persisted();
    assert.equal(firstState.wallet.length, 1);
    assert.equal(Number(firstState.wallet[0].total_credited), 500);
    assert.equal(Number(firstState.wallet[0].balance), 500);
    assert.equal(Number(firstState.wallet[0].version), 1);
    assert.equal(firstState.entitlement.length, 1);
    assert.equal(firstState.entitlement[0].tenant_id, principal.tenantId);
    assert.equal(firstState.entitlement[0].plan_id, 'free');
    assert.equal(firstState.entitlement[0].state, 'FREE');
    assert.equal(firstState.grants.length, 1);
    assert.equal(firstState.grants[0].grant_kind, 'WELCOME');
    assert.equal(firstState.grants[0].source, 'SERVER_POLICY');
    assert.equal(Number(firstState.grants[0].amount), 500);

    response = await fetch(`${base}${FINANCIAL_ACCOUNT_INITIALIZE_PATH}`, {
      method: 'POST', headers: headers(true), body: '{}',
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json() as any).replayed, true);
    assert.deepEqual(await persisted(), firstState, 'replayed initialize must perform no financial mutation');

    response = await fetch(`${base}${FINANCIAL_ACCOUNT_PATH}`, { headers: headers() });
    assert.equal(response.status, 200);
    const observed: any = await response.json();
    assert.equal(observed.accountState, 'CONFIGURED');
    assert.equal(observed.entitlement.planId, 'free');
    assert.equal(observed.entitlement.state, 'FREE');
    assert.equal(observed.wallet.totalCredited, 500);
    assert.equal(observed.wallet.balance, 500);
    assert.deepEqual(await persisted(), firstState, 'GET after initialize must remain observation-only');
  });
});
