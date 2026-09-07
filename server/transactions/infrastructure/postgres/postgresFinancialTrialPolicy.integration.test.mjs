import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { Pool } from 'pg';

import { migrateTransactionSchema } from './transactionSchemaMigrator.ts';
import { PostgresFinancialAccountStore } from './postgresFinancialAccountStore.ts';
import { PostgresFinancialTrialPolicy } from './postgresFinancialTrialPolicy.ts';
import { RetryingPostgresTransactionRunner } from './retryingTransactionRunner.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for P0b.2 trial acceptance');

const pool = new Pool({ connectionString: databaseUrl, max: 32, application_name: 'bers-financial-trial-p0b2' });
const runner = new RetryingPostgresTransactionRunner(pool);
const noRetryRunner = new RetryingPostgresTransactionRunner(pool, undefined, {
  maxAttempts: 1,
  lockTimeoutMs: 5_000,
  statementTimeoutMs: 15_000,
});
const accounts = new PostgresFinancialAccountStore(runner);
const trials = new PostgresFinancialTrialPolicy(runner);
const noRetryAccounts = new PostgresFinancialAccountStore(noRetryRunner);
const noRetryTrials = new PostgresFinancialTrialPolicy(noRetryRunner);

async function reset() {
  await pool.query('TRUNCATE credit_grants,financial_entitlement_accounts,transaction_journal,reservation_journal_sequences,credit_reservations,credit_wallets RESTART IDENTITY CASCADE');
}

async function state(ownerId) {
  const [wallet, entitlement, grants] = await Promise.all([
    pool.query('SELECT total_credited,lifetime_spent,balance,reserved,version,updated_at FROM credit_wallets WHERE owner_id=$1', [ownerId]),
    pool.query(`SELECT owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,ends_at,
                       trial_consumed_at,provider_customer_ref,provider_subscription_ref,updated_at
                FROM financial_entitlement_accounts WHERE owner_id=$1`, [ownerId]),
    pool.query(`SELECT id,tenant_id,owner_id,idempotency_key,request_fingerprint,grant_kind,source,amount,provider_event_id,occurred_at
                FROM credit_grants WHERE owner_id=$1 ORDER BY id`, [ownerId]),
  ]);
  return Object.freeze({ wallet: wallet.rows, entitlement: entitlement.rows, grants: grants.rows });
}

function numeric(row, key) { return Number(row[key]); }
function millis(value) { return new Date(value).getTime(); }
function sha256(value) { return createHash('sha256').update(value, 'utf8').digest('hex'); }

async function initialize(identity, authority = accounts) {
  const result = await authority.initializeFreeAccount(identity);
  assert.equal(result.kind, 'initialized');
  return state(identity.userId);
}

function adjustment(identity, index) {
  const occurredAt = new Date(Date.now() + index).toISOString();
  return Object.freeze({
    id: `trial-lock-adjustment-${index}`,
    identity,
    idempotencyKey: `trial-lock-adjustment/${index}`,
    requestFingerprint: sha256(`trial-lock-adjustment|${index}`),
    kind: 'ADJUSTMENT',
    source: 'SERVER_POLICY',
    amount: 1,
    occurredAt,
    metadata: Object.freeze({ test: 'p0b2-lock-order', index }),
  });
}

test.before(async () => { await migrateTransactionSchema(pool); });
test.beforeEach(reset);
test.after(async () => { await reset().catch(() => undefined); await pool.end(); });

test('server policy starts only plus=7d, pro=14d and studio=14d while preserving wallet and grants', async () => {
  for (const [planId, days] of [['plus', 7], ['pro', 14], ['studio', 14]]) {
    const identity = Object.freeze({ tenantId: `tenant-trial-${planId}`, userId: `user-trial-${planId}` });
    await initialize(identity);
    const before = await state(identity.userId);

    const result = await trials.startTrial(identity, planId);
    assert.equal(result.kind, 'started');
    if (result.kind !== 'started') continue;
    assert.equal(result.snapshot.entitlement?.planId, planId);
    assert.equal(result.snapshot.entitlement?.state, 'TRIAL');
    assert.equal(result.snapshot.entitlement?.source, 'SERVER_POLICY');
    assert.equal(result.snapshot.entitlement?.revision, 2);
    assert.equal(result.snapshot.entitlement?.billingInterval, undefined);
    assert.equal(result.snapshot.entitlement?.startsAt, result.snapshot.entitlement?.trialConsumedAt);
    assert.equal(millis(result.snapshot.entitlement?.endsAt) - millis(result.snapshot.entitlement?.startsAt), days * 86_400_000);

    const after = await state(identity.userId);
    assert.deepEqual(after.wallet, before.wallet, 'trial start must not mutate canonical wallet');
    assert.deepEqual(after.grants, before.grants, 'trial start must not create any credit grant');
    assert.equal(after.grants.filter(row => row.grant_kind === 'TRIAL').length, 0);
    assert.equal(numeric(after.wallet[0], 'total_credited'), 500);
    assert.equal(numeric(after.wallet[0], 'balance'), 500);
    assert.equal(numeric(after.wallet[0], 'version'), 1);
    assert.equal(after.entitlement[0].plan_id, planId);
    assert.equal(after.entitlement[0].state, 'TRIAL');
    assert.equal(numeric(after.entitlement[0], 'entitlement_revision'), 2);
    assert.equal(millis(after.entitlement[0].trial_consumed_at), millis(after.entitlement[0].starts_at));
    assert.equal(millis(after.entitlement[0].ends_at) - millis(after.entitlement[0].starts_at), days * 86_400_000);
  }
});

test('free, enterprise, unknown and non-canonical plan ids are not trial eligible and mutate nothing', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-ineligible', userId: 'user-trial-ineligible' });
  await initialize(identity);
  const before = await state(identity.userId);
  for (const planId of ['free', 'enterprise', 'unknown', ' Plus ', 'PLUS']) {
    assert.deepEqual(await trials.startTrial(identity, planId), { kind: 'plan_not_eligible' });
    assert.deepEqual(await state(identity.userId), before);
  }
});

test('unconfigured trial start does not manufacture a wallet, entitlement or welcome grant', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-unconfigured', userId: 'user-trial-unconfigured' });
  assert.deepEqual(await trials.startTrial(identity, 'plus'), { kind: 'account_not_found' });
  assert.deepEqual(await state(identity.userId), { wallet: [], entitlement: [], grants: [] });
});

test('12 concurrent same-plan starts have one transition and eleven exact replays without retry masking', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-concurrent', userId: 'user-trial-concurrent' });
  await initialize(identity, noRetryAccounts);
  const before = await state(identity.userId);
  const results = await Promise.all(Array.from({ length: 12 }, () => noRetryTrials.startTrial(identity, 'pro')));
  assert.equal(results.filter(result => result.kind === 'started').length, 1);
  assert.equal(results.filter(result => result.kind === 'replayed').length, 11);
  const after = await state(identity.userId);
  assert.deepEqual(after.wallet, before.wallet);
  assert.deepEqual(after.grants, before.grants);
  assert.equal(after.entitlement[0].plan_id, 'pro');
  assert.equal(after.entitlement[0].state, 'TRIAL');
  assert.equal(numeric(after.entitlement[0], 'entitlement_revision'), 2);
  for (const result of results) {
    if (result.kind !== 'started' && result.kind !== 'replayed') continue;
    assert.equal(result.snapshot.entitlement?.planId, 'pro');
    assert.equal(result.snapshot.entitlement?.revision, 2);
    assert.equal(result.snapshot.wallet?.balance, 500);
    assert.equal(result.snapshot.wallet?.version, 1);
  }
});

test('concurrent different-plan starts select exactly one plan and never switch an active trial', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-race', userId: 'user-trial-race' });
  await initialize(identity, noRetryAccounts);
  const before = await state(identity.userId);
  const results = await Promise.all([
    noRetryTrials.startTrial(identity, 'plus'),
    noRetryTrials.startTrial(identity, 'studio'),
  ]);
  assert.equal(results.filter(result => result.kind === 'started').length, 1);
  assert.equal(results.filter(result => result.kind === 'trial_conflict').length, 1);
  const accepted = results.find(result => result.kind === 'started');
  const after = await state(identity.userId);
  assert.equal(after.entitlement[0].plan_id, accepted.snapshot.entitlement.planId);
  assert.deepEqual(after.wallet, before.wallet);
  assert.deepEqual(after.grants, before.grants);
});

test('exact active same-plan trial replays without changing timestamps, wallet, grants or revision', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-replay', userId: 'user-trial-replay' });
  await initialize(identity);
  assert.equal((await trials.startTrial(identity, 'plus')).kind, 'started');
  const before = await state(identity.userId);
  const result = await trials.startTrial(identity, 'plus');
  assert.equal(result.kind, 'replayed');
  assert.deepEqual(await state(identity.userId), before);
});

test('exact expired trial is consumed and cannot be restarted or switched', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-expired', userId: 'user-trial-expired' });
  await initialize(identity);
  assert.equal((await trials.startTrial(identity, 'plus')).kind, 'started');
  const startsAt = '2026-08-01T00:00:00.000Z';
  const endsAt = '2026-08-08T00:00:00.000Z';
  await pool.query(
    `UPDATE financial_entitlement_accounts
     SET starts_at=$2,trial_consumed_at=$2,ends_at=$3,updated_at=$2
     WHERE owner_id=$1`,
    [identity.userId, startsAt, endsAt],
  );
  const before = await state(identity.userId);
  assert.deepEqual(await trials.startTrial(identity, 'plus'), { kind: 'trial_consumed' });
  assert.deepEqual(await trials.startTrial(identity, 'pro'), { kind: 'trial_consumed' });
  assert.deepEqual(await state(identity.userId), before);
});

test('cross-tenant owner, provider entitlement and malformed server policy fail closed without mutation', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-owner', userId: 'user-trial-owner' });
  await initialize(identity);
  const otherTenant = Object.freeze({ tenantId: 'tenant-trial-other', userId: identity.userId });
  const beforeCrossTenant = await state(identity.userId);
  assert.deepEqual(await trials.startTrial(otherTenant, 'plus'), { kind: 'policy_conflict' });
  assert.deepEqual(await state(identity.userId), beforeCrossTenant);

  await reset();
  await pool.query('INSERT INTO credit_wallets(owner_id,total_credited,balance,version) VALUES ($1,900,900,2)', [identity.userId]);
  await pool.query(
    `INSERT INTO financial_entitlement_accounts
      (owner_id,tenant_id,plan_id,state,billing_interval,source,entitlement_revision,starts_at,provider_customer_ref,provider_subscription_ref)
     VALUES ($1,$2,'pro','ACTIVE','MONTHLY','VERIFIED_PROVIDER',3,$3,'cust-trial','sub-trial')`,
    [identity.userId, identity.tenantId, '2026-09-01T00:00:00.000Z'],
  );
  const beforeProvider = await state(identity.userId);
  assert.deepEqual(await trials.startTrial(identity, 'plus'), { kind: 'policy_drift' }, 'missing accepted welcome binding fails before provider conflict');
  assert.deepEqual(await state(identity.userId), beforeProvider);

  await reset();
  await initialize(identity);
  await pool.query('UPDATE financial_entitlement_accounts SET entitlement_revision=9 WHERE owner_id=$1', [identity.userId]);
  const beforeDrift = await state(identity.userId);
  assert.deepEqual(await trials.startTrial(identity, 'plus'), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), beforeDrift);
});

test('missing welcome grant or changed FREE/WELCOME temporal binding is policy drift and is not repaired', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-welcome-drift', userId: 'user-trial-welcome-drift' });
  await initialize(identity);
  await pool.query('DELETE FROM credit_grants WHERE owner_id=$1', [identity.userId]);
  let before = await state(identity.userId);
  assert.deepEqual(await trials.startTrial(identity, 'plus'), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), before);

  await reset();
  await initialize(identity);
  await pool.query("UPDATE financial_entitlement_accounts SET starts_at=starts_at + interval '1 second' WHERE owner_id=$1", [identity.userId]);
  before = await state(identity.userId);
  assert.deepEqual(await trials.startTrial(identity, 'plus'), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), before);
});

test('malformed active TRIAL duration is policy drift, never replayed or switched', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-duration-drift', userId: 'user-trial-duration-drift' });
  await initialize(identity);
  assert.equal((await trials.startTrial(identity, 'pro')).kind, 'started');
  await pool.query("UPDATE financial_entitlement_accounts SET ends_at=ends_at + interval '1 second' WHERE owner_id=$1", [identity.userId]);
  const before = await state(identity.userId);
  assert.deepEqual(await trials.startTrial(identity, 'pro'), { kind: 'policy_drift' });
  assert.deepEqual(await trials.startTrial(identity, 'plus'), { kind: 'policy_drift' });
  assert.deepEqual(await state(identity.userId), before);
});

test('trial and generic grants share wallet-first lock order without retry masking', async () => {
  const identity = Object.freeze({ tenantId: 'tenant-trial-lock-order', userId: 'user-trial-lock-order' });
  await initialize(identity, noRetryAccounts);
  assert.equal((await noRetryTrials.startTrial(identity, 'studio')).kind, 'started');
  const work = [];
  for (let i = 0; i < 8; i += 1) {
    work.push(noRetryTrials.startTrial(identity, 'studio'));
    work.push(noRetryAccounts.grant(adjustment(identity, i)));
  }
  const results = await Promise.all(work);
  const replayResults = results.filter(result => result.kind === 'replayed' && 'snapshot' in result);
  const grantResults = results.filter(result => result.kind === 'applied');
  assert.equal(replayResults.length, 8);
  assert.equal(grantResults.length, 8);
  const persisted = await state(identity.userId);
  assert.equal(persisted.entitlement[0].plan_id, 'studio');
  assert.equal(numeric(persisted.entitlement[0], 'entitlement_revision'), 2);
  assert.equal(numeric(persisted.wallet[0], 'total_credited'), 508);
  assert.equal(numeric(persisted.wallet[0], 'balance'), 508);
  assert.equal(numeric(persisted.wallet[0], 'version'), 9);
  assert.equal(persisted.grants.filter(row => row.grant_kind === 'TRIAL').length, 0);
  assert.equal(persisted.grants.filter(row => row.grant_kind === 'WELCOME').length, 1);
  assert.equal(persisted.grants.filter(row => row.grant_kind === 'ADJUSTMENT').length, 8);
});