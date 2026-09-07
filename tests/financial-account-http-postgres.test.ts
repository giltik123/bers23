import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';
import { Pool } from 'pg';

import { createFinancialAccountHttpAdapter } from '../server/core/http/financialAccountHttpAdapter.ts';
import { PostgresFinancialAccountStore } from '../server/transactions/infrastructure/postgres/postgresFinancialAccountStore.ts';
import { RetryingPostgresTransactionRunner } from '../server/transactions/infrastructure/postgres/retryingTransactionRunner.ts';
import { migrateTransactionSchema } from '../server/transactions/infrastructure/postgres/transactionSchemaMigrator.ts';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required for financial-account HTTP PostgreSQL acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-financial-account-http-postgres' });
const runner = new RetryingPostgresTransactionRunner(pool);
const accounts = new PostgresFinancialAccountStore(runner);
const owner = Object.freeze({ tenantId: 'tenant-financial-http-pg', userId: 'user-financial-http-pg' });
const other = Object.freeze({ tenantId: owner.tenantId, userId: 'other-financial-http-pg' });

function config() {
  return Object.freeze({
    nodeEnv: 'test',
    allowApiBearerAuth: true,
    allowedWebOrigins: Object.freeze(['https://app.example.test']),
    authPublicOrigin: 'http://localhost',
    authChallengeSecret: 'financial-http-postgres-secret',
  }) as any;
}

function adapterFor(principal: typeof owner | typeof other) {
  return createFinancialAccountHttpAdapter({
    account: Object.freeze({ snapshot: accounts.snapshot.bind(accounts) }),
    auth: Object.freeze({
      verify: async (authorization: string | undefined) => {
        if (authorization !== 'Bearer financial.pg.token') throw Object.assign(new Error('Authentication token is invalid'), { status: 401, code: 'unauthenticated' });
        return principal as any;
      },
    }),
    config: config(),
  });
}

async function withServer(handler: ReturnType<typeof createFinancialAccountHttpAdapter>, fn: (base: string) => Promise<void>) {
  const server = createServer((request, response) => { void handler(request, response); });
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected TCP server address');
  try { await fn(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function headers() { return { authorization: 'Bearer financial.pg.token', origin: 'https://app.example.test' }; }
async function json(response: Response): Promise<any> { return response.json(); }

async function databaseState(userId: string) {
  const [wallet, entitlement, grants] = await Promise.all([
    pool.query('SELECT total_credited,lifetime_spent,balance,reserved,version,updated_at FROM credit_wallets WHERE owner_id=$1', [userId]),
    pool.query('SELECT tenant_id,plan_id,state,source,entitlement_revision,starts_at,updated_at FROM financial_entitlement_accounts WHERE owner_id=$1', [userId]),
    pool.query('SELECT id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at,metadata FROM credit_grants WHERE owner_id=$1 ORDER BY id', [userId]),
  ]);
  return Object.freeze({ wallet: wallet.rows, entitlement: entitlement.rows, grants: grants.rows });
}

test.before(async () => {
  await migrateTransactionSchema(pool);
  await pool.query('TRUNCATE credit_grants,financial_entitlement_accounts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
  await pool.query(
    'INSERT INTO credit_wallets(owner_id,total_credited,lifetime_spent,balance,reserved,version,updated_at) VALUES ($1,100,20,80,5,4,$2)',
    [owner.userId, '2026-09-07T01:10:00.000Z'],
  );
  await pool.query(
    `INSERT INTO financial_entitlement_accounts(owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,updated_at)
     VALUES ($1,$2,'free','FREE',NULL,'SERVER_POLICY',2,$3,$4)`,
    [owner.userId, owner.tenantId, '2026-09-01T00:00:00.000Z', '2026-09-07T01:10:00.000Z'],
  );
});

test.after(async () => {
  await pool.query('TRUNCATE credit_grants,financial_entitlement_accounts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE').catch(() => undefined);
  await pool.end();
});

test('authenticated PostgreSQL financial GET returns exact owner snapshot and performs no writes', async () => {
  const before = await databaseState(owner.userId);
  await withServer(adapterFor(owner), async base => {
    const response = await fetch(`${base}/api/core/financial/account`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await json(response);
    assert.equal(body.accountState, 'CONFIGURED');
    assert.equal(body.entitlement.planId, 'free');
    assert.equal(body.entitlement.state, 'FREE');
    assert.equal(body.entitlement.revision, 2);
    assert.deepEqual(body.wallet, {
      totalCredited: 100,
      lifetimeSpent: 20,
      balance: 80,
      reserved: 5,
      available: 75,
      version: 4,
      updatedAt: '2026-09-07T01:10:00.000Z',
    });
    assert.equal('identity' in body, false);
  });
  const after = await databaseState(owner.userId);
  assert.deepEqual(after, before, 'GET financial observation must not mutate canonical financial tables');
});

test('another authenticated user cannot observe the existing owner financial account', async () => {
  const before = await databaseState(owner.userId);
  await withServer(adapterFor(other), async base => {
    const response = await fetch(`${base}/api/core/financial/account`, { headers: headers() });
    assert.equal(response.status, 200);
    assert.deepEqual(await json(response), { accountState: 'UNCONFIGURED', entitlement: null, wallet: null });
  });
  const after = await databaseState(owner.userId);
  assert.deepEqual(after, before);
});

test('same wallet owner under a different tenant never exposes entitlement state', async () => {
  const wrongTenant = Object.freeze({ tenantId: 'tenant-financial-http-other', userId: owner.userId });
  await withServer(adapterFor(wrongTenant as any), async base => {
    const response = await fetch(`${base}/api/core/financial/account`, { headers: headers() });
    assert.equal(response.status, 200);
    const body = await json(response);
    // Existing credit_wallets are historically user-owned. A tenant mismatch must
    // never make that wallet observable without the exact tenant-bound account.
    assert.deepEqual(body, { accountState: 'UNCONFIGURED', entitlement: null, wallet: null });
  });
});
