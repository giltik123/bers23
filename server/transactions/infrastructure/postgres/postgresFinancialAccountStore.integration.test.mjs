import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

import { checkTransactionSchema, migrateTransactionSchema } from './transactionSchemaMigrator.ts';
import { PostgresFinancialAccountStore } from './postgresFinancialAccountStore.ts';
import { RetryingPostgresTransactionRunner } from './retryingTransactionRunner.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;

function schemaName() {
  return `financial_p0a_${process.pid}_${Date.now()}_${Math.random().toString(16).slice(2)}`.replace(/[^a-z0-9_]/g, '');
}

function grant(identity, overrides = {}) {
  return Object.freeze({
    id: 'grant-welcome-1',
    identity,
    idempotencyKey: 'welcome:v1',
    requestFingerprint: 'a'.repeat(64),
    kind: 'WELCOME',
    source: 'SERVER_POLICY',
    amount: 25,
    occurredAt: '2026-09-07T01:00:00.000Z',
    metadata: Object.freeze({ policyVersion: '1' }),
    ...overrides,
  });
}

const integration = databaseUrl ? test : test.skip;

integration('financial account foundation preserves migration order and applies grants exactly once', async () => {
  const admin = new Pool({ connectionString: databaseUrl, max: 2, application_name: 'bers-p0a-financial-admin' });
  const schema = schemaName();
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 12,
    application_name: 'bers-p0a-financial-account',
    options: `-c search_path=${schema}`,
  });

  try {
    const migration = await migrateTransactionSchema(pool);
    assert.equal(migration.version, '038_financial_account_foundation');
    assert.equal(migration.status, 'applied');
    await checkTransactionSchema(pool);

    const recorded = await pool.query('SELECT version,checksum FROM transaction_schema_migrations ORDER BY version');
    assert.deepEqual(recorded.rows.map(row => row.version), ['001_transaction_store', '038_financial_account_foundation']);
    assert.ok(recorded.rows.every(row => /^[a-f0-9]{64}$/.test(row.checksum)));

    const originalChecksums = new Map(recorded.rows.map(row => [row.version, row.checksum]));
    await pool.query('DELETE FROM transaction_schema_migrations WHERE version=$1', ['001_transaction_store']);
    await assert.rejects(() => checkTransactionSchema(pool), /out of order|sequence is incomplete/);
    await assert.rejects(() => migrateTransactionSchema(pool), /out of order/);
    await pool.query(
      'INSERT INTO transaction_schema_migrations(version,checksum) VALUES ($1,$2)',
      ['001_transaction_store', originalChecksums.get('001_transaction_store')],
    );
    await checkTransactionSchema(pool);

    await pool.query('UPDATE transaction_schema_migrations SET checksum=$2 WHERE version=$1', ['038_financial_account_foundation', '0'.repeat(64)]);
    await assert.rejects(() => checkTransactionSchema(pool), /checksum does not match source/);
    await assert.rejects(() => migrateTransactionSchema(pool), /checksum does not match source/);
    await pool.query('UPDATE transaction_schema_migrations SET checksum=$2 WHERE version=$1', ['038_financial_account_foundation', originalChecksums.get('038_financial_account_foundation')]);
    await checkTransactionSchema(pool);

    const runner = new RetryingPostgresTransactionRunner(pool, undefined, { maxAttempts: 3, lockTimeoutMs: 2_000, statementTimeoutMs: 15_000 });
    const firstStore = new PostgresFinancialAccountStore(runner);
    const secondStore = new PostgresFinancialAccountStore(runner);
    const identity = Object.freeze({ tenantId: 'tenant-financial-a', userId: 'user-financial-a' });

    await pool.query(
      'INSERT INTO credit_wallets(owner_id,total_credited,balance) VALUES ($1,$2,$2)',
      [identity.userId, 100],
    );
    await pool.query(
      `INSERT INTO financial_entitlement_accounts(owner_id,tenant_id,plan_id,state,source,starts_at)
       VALUES ($1,$2,'free','FREE','SERVER_POLICY',$3)`,
      [identity.userId, identity.tenantId, '2026-09-01T00:00:00.000Z'],
    );

    const candidate = grant(identity);
    const concurrent = await Promise.all(Array.from({ length: 8 }, (_, index) => (index % 2 ? firstStore : secondStore).grant(candidate)));
    assert.equal(concurrent.filter(result => result.kind === 'applied').length, 1);
    assert.equal(concurrent.filter(result => result.kind === 'replayed').length, 7);
    assert.equal(new Set(concurrent.filter(result => 'grant' in result).map(result => result.grant.id)).size, 1);

    const afterWelcome = await firstStore.snapshot(identity);
    assert.equal(afterWelcome.entitlement?.planId, 'free');
    assert.equal(afterWelcome.entitlement?.state, 'FREE');
    assert.equal(afterWelcome.wallet?.totalCredited, 125);
    assert.equal(afterWelcome.wallet?.balance, 125);
    assert.equal(afterWelcome.wallet?.reserved, 0);
    assert.equal(afterWelcome.wallet?.available, 125);
    assert.equal(afterWelcome.wallet?.version, 1);
    assert.equal((await pool.query('SELECT count(*)::int AS count FROM credit_grants WHERE owner_id=$1', [identity.userId])).rows[0].count, 1);

    const conflicting = await secondStore.grant(grant(identity, {
      id: 'grant-welcome-conflict',
      requestFingerprint: 'b'.repeat(64),
      amount: 30,
    }));
    assert.equal(conflicting.kind, 'conflict');
    assert.equal((await secondStore.snapshot(identity)).wallet?.balance, 125);

    const secondGrant = await firstStore.grant(grant(identity, {
      id: 'grant-adjustment-2',
      idempotencyKey: 'adjustment:v1',
      requestFingerprint: 'c'.repeat(64),
      kind: 'ADJUSTMENT',
      source: 'MANUAL_RESOLUTION',
      amount: 10,
      occurredAt: '2026-09-07T01:01:00.000Z',
    }));
    assert.equal(secondGrant.kind, 'applied');
    assert.equal(secondGrant.wallet.balance, 135);
    assert.equal(secondGrant.wallet.version, 2);

    const providerGrant = await firstStore.grant(grant(identity, {
      id: 'grant-provider-1',
      idempotencyKey: 'provider:event-1',
      requestFingerprint: 'd'.repeat(64),
      kind: 'PURCHASE',
      source: 'VERIFIED_PROVIDER',
      providerEventId: 'provider-event-1',
      amount: 40,
      occurredAt: '2026-09-07T01:02:00.000Z',
    }));
    assert.equal(providerGrant.kind, 'applied');
    assert.equal(providerGrant.wallet.balance, 175);

    const identityB = Object.freeze({ tenantId: 'tenant-financial-b', userId: 'user-financial-b' });
    await pool.query('INSERT INTO credit_wallets(owner_id,total_credited,balance) VALUES ($1,0,0)', [identityB.userId]);
    await pool.query(
      `INSERT INTO financial_entitlement_accounts(owner_id,tenant_id,plan_id,state,source,starts_at)
       VALUES ($1,$2,'free','FREE','SERVER_POLICY',$3)`,
      [identityB.userId, identityB.tenantId, '2026-09-01T00:00:00.000Z'],
    );
    const providerCollision = await secondStore.grant(grant(identityB, {
      id: 'grant-provider-collision',
      idempotencyKey: 'provider:other-request',
      requestFingerprint: 'e'.repeat(64),
      kind: 'PURCHASE',
      source: 'VERIFIED_PROVIDER',
      providerEventId: 'provider-event-1',
      amount: 40,
      occurredAt: '2026-09-07T01:03:00.000Z',
    }));
    assert.equal(providerCollision.kind, 'conflict');
    assert.equal((await secondStore.snapshot(identityB)).wallet?.balance, 0);

    const wrongTenant = await firstStore.grant(grant({ ...identity, tenantId: 'tenant-other' }, {
      id: 'grant-cross-tenant',
      idempotencyKey: 'cross-tenant:v1',
      requestFingerprint: 'f'.repeat(64),
    }));
    assert.equal(wrongTenant.kind, 'account_not_found');
    assert.equal((await firstStore.snapshot(identity)).wallet?.balance, 175);

    const missing = await firstStore.snapshot({ tenantId: 'tenant-missing', userId: 'user-missing' });
    assert.deepEqual(missing, { identity: { tenantId: 'tenant-missing', userId: 'user-missing' } });

    await assert.rejects(
      () => firstStore.grant(grant(identity, { source: 'VERIFIED_PROVIDER', providerEventId: undefined })),
      /requires providerEventId/,
    );
    await assert.rejects(
      () => firstStore.grant(grant(identity, { providerEventId: 'browser-event-forbidden' })),
      /reserved for verified-provider grants/,
    );
  } finally {
    await pool.end().catch(() => undefined);
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => undefined);
    await admin.end();
  }
});
