import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { migrateTransactionSchema } from './transactionSchemaMigrator.ts';
import { PostgresFinancialAccountStore } from './postgresFinancialAccountStore.ts';
import { RetryingPostgresTransactionRunner } from './retryingTransactionRunner.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for P0b.1 financial policy acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 24, application_name: 'bers-financial-policy-p0b1' });
const runner = new RetryingPostgresTransactionRunner(pool);
const accounts = new PostgresFinancialAccountStore(runner);
const noRetryAccounts = new PostgresFinancialAccountStore(new RetryingPostgresTransactionRunner(
  pool,
  { wait: async () => undefined },
  { maxAttempts: 1, lockTimeoutMs: 5_000, statementTimeoutMs: 15_000 },
));

async function reset() {
  await pool.query('TRUNCATE credit_grants,financial_entitlement_accounts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
}

async function state(ownerId) {
  const [wallet, entitlement, grants] = await Promise.all([
    pool.query('SELECT total_credited,lifetime_spent,balance,reserved,version FROM credit_wallets WHERE owner_id=$1', [ownerId]),
    pool.query('SELECT owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,ends_at,trial_consumed_at,provider_customer_ref,provider_subscription_ref FROM financial_entitlement_accounts WHERE owner_id=$1', [ownerId]),
    pool.query('SELECT id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at FROM credit_grants WHERE owner_id=$1 ORDER BY id', [ownerId]),
  ]);
  return Object.freeze({ wallet: wallet.rows, entitlement: entitlement.rows, grants: grants.rows });
}

function numeric(row, key) { return Number(row[key]); }

test.before(async () => { await migrateTransactionSchema(pool); });
test.beforeEach(reset);
test.after(async () => { await reset().catch(() => undefined); await pool.end(); });

test('12 concurrent FREE initializations create one account, one WELCOME grant and one +500 wallet increment', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-concurrent', userId: 'user-p0b1-concurrent' });
  const results = await Promise.all(Array.from({ length: 12 }, () => accounts.initializeFreeAccount(identity)));
  assert.equal(results.filter(result => result.kind === 'initialized').length, 1);
  assert.equal(results.filter(result => result.kind === 'replayed').length, 11);

  const persisted = await state(identity.userId);
  assert.equal(persisted.wallet.length, 1);
  assert.equal(numeric(persisted.wallet[0], 'total_credited'), 500);
  assert.equal(numeric(persisted.wallet[0], 'lifetime_spent'), 0);
  assert.equal(numeric(persisted.wallet[0], 'balance'), 500);
  assert.equal(numeric(persisted.wallet[0], 'reserved'), 0);
  assert.equal(numeric(persisted.wallet[0], 'version'), 1);
  assert.equal(persisted.entitlement.length, 1);
  assert.equal(persisted.entitlement[0].tenant_id, identity.tenantId);
  assert.equal(persisted.entitlement[0].plan_id, 'free');
  assert.equal(persisted.entitlement[0].state, 'FREE');
  assert.equal(persisted.entitlement[0].source, 'SERVER_POLICY');
  assert.equal(numeric(persisted.entitlement[0], 'entitlement_revision'), 1);
  assert.equal(persisted.entitlement[0].billing_interval, null);
  assert.equal(persisted.grants.length, 1);
  assert.equal(persisted.grants[0].grant_kind, 'WELCOME');
  assert.equal(persisted.grants[0].source, 'SERVER_POLICY');
  assert.equal(numeric(persisted.grants[0], 'amount'), 500);
  assert.equal(persisted.grants[0].provider_event_id, null);
  assert.equal(persisted.grants[0].idempotency_key, 'server-policy/free-account/welcome/v1');
  assert.match(persisted.grants[0].request_fingerprint, /^[a-f0-9]{64}$/);
  assert.equal(new Date(persisted.entitlement[0].starts_at).toISOString(), new Date(persisted.grants[0].occurred_at).toISOString());

  for (const result of results) {
    if (result.kind !== 'initialized' && result.kind !== 'replayed') continue;
    assert.equal(result.snapshot.entitlement?.planId, 'free');
    assert.equal(result.snapshot.entitlement?.state, 'FREE');
    assert.equal(result.snapshot.wallet?.totalCredited, 500);
    assert.equal(result.snapshot.wallet?.balance, 500);
  }
});

test('replayed initialize and ordinary grants share wallet-first locking without deadlock retries', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-lock-order', userId: 'user-p0b1-lock-order' });
  assert.equal((await noRetryAccounts.initializeFreeAccount(identity)).kind, 'initialized');

  const replays = Array.from({ length: 8 }, () => noRetryAccounts.initializeFreeAccount(identity));
  const grants = Array.from({ length: 8 }, (_, index) => noRetryAccounts.grant(Object.freeze({
    id: `lock-order-grant-${index}`,
    identity,
    idempotencyKey: `lock-order-grant/${index}`,
    requestFingerprint: index.toString(16).padStart(64, '0'),
    kind: 'ADJUSTMENT',
    source: 'MANUAL_RESOLUTION',
    amount: 3,
    occurredAt: new Date(1_788_746_400_000 + index).toISOString(),
  })));

  const [replayResults, grantResults] = await Promise.all([Promise.all(replays), Promise.all(grants)]);
  assert.ok(replayResults.every(result => result.kind === 'replayed'));
  assert.ok(grantResults.every(result => result.kind === 'applied'));

  const persisted = await state(identity.userId);
  assert.equal(persisted.entitlement.length, 1);
  assert.equal(persisted.grants.length, 9);
  assert.equal(numeric(persisted.wallet[0], 'total_credited'), 524);
  assert.equal(numeric(persisted.wallet[0], 'lifetime_spent'), 0);
  assert.equal(numeric(persisted.wallet[0], 'balance'), 524);
  assert.equal(numeric(persisted.wallet[0], 'version'), 9);
});

test('an existing canonical wallet is preserved and receives exactly the one welcome increment', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-existing-wallet', userId: 'user-p0b1-existing-wallet' });
  await pool.query(
    `INSERT INTO credit_wallets(owner_id,total_credited,lifetime_spent,balance,reserved,version,created_at,updated_at)
     VALUES ($1,100,20,80,5,4,$2,$2)`,
    [identity.userId, '2026-09-07T00:00:00.000Z'],
  );

  const result = await accounts.initializeFreeAccount(identity);
  assert.equal(result.kind, 'initialized');
  if (result.kind !== 'initialized') return;
  assert.equal(result.snapshot.wallet?.totalCredited, 600);
  assert.equal(result.snapshot.wallet?.lifetimeSpent, 20);
  assert.equal(result.snapshot.wallet?.balance, 580);
  assert.equal(result.snapshot.wallet?.reserved, 5);
  assert.equal(result.snapshot.wallet?.available, 575);
  assert.equal(result.snapshot.wallet?.version, 5);

  const persisted = await state(identity.userId);
  assert.equal(persisted.grants.length, 1);
  assert.equal(numeric(persisted.grants[0], 'amount'), 500);
});

test('existing non-FREE entitlement is never downgraded or granted welcome credits', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-active', userId: 'user-p0b1-active' });
  await pool.query('INSERT INTO credit_wallets(owner_id,total_credited,balance,version) VALUES ($1,900,900,2)', [identity.userId]);
  await pool.query(
    `INSERT INTO financial_entitlement_accounts
      (owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,provider_customer_ref,provider_subscription_ref)
     VALUES ($1,$2,'pro','ACTIVE','MONTHLY','VERIFIED_PROVIDER',3,$3,'cust-1','sub-1')`,
    [identity.userId, identity.tenantId, '2026-09-01T00:00:00.000Z'],
  );
  const before = await state(identity.userId);
  assert.deepEqual(await accounts.initializeFreeAccount(identity), { kind: 'policy_conflict' });
  assert.deepEqual(await state(identity.userId), before);
});

test('same canonical wallet owner cannot be rebound to another tenant', async () => {
  const ownerId = 'user-p0b1-tenant-bound';
  const first = Object.freeze({ tenantId: 'tenant-p0b1-a', userId: ownerId });
  const otherTenant = Object.freeze({ tenantId: 'tenant-p0b1-b', userId: ownerId });
  assert.equal((await accounts.initializeFreeAccount(first)).kind, 'initialized');
  const before = await state(ownerId);
  assert.deepEqual(await accounts.initializeFreeAccount(otherTenant), { kind: 'policy_conflict' });
  assert.deepEqual(await state(ownerId), before);
  const hidden = await accounts.snapshot(otherTenant);
  assert.equal(hidden.entitlement, undefined);
  assert.equal(hidden.wallet, undefined);
});

test('exact FREE policy account missing its welcome journal fails closed without manufacturing money', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-missing-grant', userId: 'user-p0b1-missing-grant' });
  await pool.query('INSERT INTO credit_wallets(owner_id) VALUES ($1)', [identity.userId]);
  await pool.query(
    `INSERT INTO financial_entitlement_accounts(owner_id,tenant_id,plan_id,state,source,entitlement_revision,starts_at)
     VALUES ($1,$2,'free','FREE','SERVER_POLICY',1,$3)`,
    [identity.userId, identity.tenantId, '2026-09-07T00:00:00.000Z'],
  );
  const before = await state(identity.userId);
  assert.deepEqual(await accounts.initializeFreeAccount(identity), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), before);
});

test('policy welcome journal without its entitlement fails closed and is not repaired', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-orphan-grant', userId: 'user-p0b1-orphan-grant' });
  assert.equal((await accounts.initializeFreeAccount(identity)).kind, 'initialized');
  await pool.query('DELETE FROM financial_entitlement_accounts WHERE owner_id=$1', [identity.userId]);
  const before = await state(identity.userId);
  assert.equal(before.entitlement.length, 0);
  assert.equal(before.grants.length, 1);
  assert.deepEqual(await accounts.initializeFreeAccount(identity), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), before);
});

test('changed welcome grant binding is detected as policy drift with no second increment', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-grant-drift', userId: 'user-p0b1-grant-drift' });
  assert.equal((await accounts.initializeFreeAccount(identity)).kind, 'initialized');
  await pool.query('UPDATE credit_grants SET amount=499 WHERE owner_id=$1', [identity.userId]);
  const before = await state(identity.userId);
  assert.deepEqual(await accounts.initializeFreeAccount(identity), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), before);
  assert.equal(numeric(before.wallet[0], 'total_credited'), 500);
  assert.equal(numeric(before.wallet[0], 'balance'), 500);
});

test('changed FREE entitlement start timestamp is detected as policy drift without financial mutation', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-p0b1-time-drift', userId: 'user-p0b1-time-drift' });
  assert.equal((await accounts.initializeFreeAccount(identity)).kind, 'initialized');
  await pool.query(`UPDATE financial_entitlement_accounts SET starts_at=starts_at + INTERVAL '1 second' WHERE owner_id=$1`, [identity.userId]);
  const before = await state(identity.userId);
  assert.deepEqual(await accounts.initializeFreeAccount(identity), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), before);
  assert.equal(numeric(before.wallet[0], 'total_credited'), 500);
  assert.equal(numeric(before.wallet[0], 'balance'), 500);
});
