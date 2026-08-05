import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';

import { PostgresTransactionStore } from './postgresTransactionStore.ts';
import { RetryingPostgresTransactionRunner } from './retryingTransactionRunner.ts';
import { RecoveryService } from '../../application/recoveryService.ts';
import { TransactionService } from '../../application/transactionService.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest('serializes concurrent reservations without overspending', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();

  const results = await Promise.all([
    store.reserve(reservationInput('a', 80, now), now.toISOString()),
    store.reserve(reservationInput('b', 80, now), now.toISOString()),
  ]);
  assert.deepEqual(results.map(({ kind }) => kind).sort(), ['created', 'insufficient_credits']);

  const wallet = await admin.query(
    `SELECT balance, reserved, version FROM ${quoteIdentifier(schema)}.credit_wallets WHERE owner_id = $1`,
    ['owner-1'],
  );
  assert.deepEqual(
    { balance: Number(wallet.rows[0].balance), reserved: Number(wallet.rows[0].reserved), version: Number(wallet.rows[0].version) },
    { balance: 100, reserved: 80, version: 1 },
  );

  const reservations = await admin.query(
    `SELECT id FROM ${quoteIdentifier(schema)}.credit_reservations ORDER BY id`,
  );
  assert.equal(reservations.rowCount, 1);
  const journal = await store.journal(reservations.rows[0].id);
  assert.deepEqual(journal.map(({ sequence, event }) => ({ sequence, event })), [
    { sequence: 1, event: 'reservation_created' },
  ]);
});

integrationTest('applies concurrent commits exactly once and replays the duplicate', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();
  const reserved = await store.reserve(reservationInput('c', 40, now), now.toISOString());
  assert.equal(reserved.kind, 'created');
  await store.appendProviderFact(reserved.reservation.id, 'provider_dispatched', now.toISOString());
  await store.appendProviderFact(reserved.reservation.id, 'provider_succeeded', now.toISOString());

  const results = await Promise.all([
    store.commit(reserved.reservation.id, 'owner-1', now.toISOString(), 'transaction_service'),
    store.commit(reserved.reservation.id, 'owner-1', now.toISOString(), 'transaction_service'),
  ]);
  assert.deepEqual(results.map(({ kind }) => kind).sort(), ['applied', 'replayed']);
  assert.equal(results[0].journal.id, results[1].journal.id);

  assert.deepEqual(await walletState(admin, schema), {
    balance: 60, reserved: 0, lifetime_spent: 40, version: 2,
  });
  const journal = await store.journal(reserved.reservation.id);
  assert.deepEqual(journal.map(({ sequence, event }) => ({ sequence, event })), [
    { sequence: 1, event: 'reservation_created' },
    { sequence: 2, event: 'provider_dispatched' },
    { sequence: 3, event: 'provider_succeeded' },
    { sequence: 4, event: 'reservation_committed' },
  ]);
});

integrationTest('applies concurrent releases exactly once', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();
  const reserved = await store.reserve(reservationInput('d', 40, now), now.toISOString());
  assert.equal(reserved.kind, 'created');

  const results = await Promise.all([
    store.release(reserved.reservation.id, 'owner-1', now.toISOString(), 'cancelled', 'transaction_service'),
    store.release(reserved.reservation.id, 'owner-1', now.toISOString(), 'cancelled', 'transaction_service'),
  ]);
  assert.deepEqual(results.map(({ kind }) => kind).sort(), ['applied', 'replayed']);
  assert.equal(results[0].journal.id, results[1].journal.id);
  assert.deepEqual(await walletState(admin, schema), {
    balance: 100, reserved: 0, lifetime_spent: 0, version: 2,
  });
  const journal = await store.journal(reserved.reservation.id);
  assert.deepEqual(journal.map(({ sequence, event }) => ({ sequence, event })), [
    { sequence: 1, event: 'reservation_created' },
    { sequence: 2, event: 'reservation_released' },
  ]);
});

integrationTest('rolls back partial writes and remains usable afterward', async (context) => {
  const { admin, runner, schema, store } = await createFixture(context, 100);
  await assert.rejects(
    runner.transaction('read committed', async (transaction) => {
      await transaction.query('UPDATE credit_wallets SET reserved = 25, version = version + 1 WHERE owner_id = $1', ['owner-1']);
      throw new Error('simulated failure');
    }),
    /simulated failure/,
  );
  assert.deepEqual(await walletState(admin, schema), {
    balance: 100, reserved: 0, lifetime_spent: 0, version: 0,
  });

  const now = new Date();
  const result = await store.reserve(reservationInput('e', 25, now), now.toISOString());
  assert.equal(result.kind, 'created');
  assert.deepEqual(await walletState(admin, schema), {
    balance: 100, reserved: 25, lifetime_spent: 0, version: 1,
  });
});

integrationTest('recovers a pending provider success and commits the reservation', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const clock = { now: () => new Date() };
  const transactions = new TransactionService(store, clock);
  const now = clock.now();
  const reserved = await store.reserve(reservationInput('f', 30, now), now.toISOString());
  assert.equal(reserved.kind, 'created');
  await store.appendProviderFact(reserved.reservation.id, 'provider_dispatched', now.toISOString());
  await store.appendRecoveryDeferred(reserved.reservation.id, now.toISOString());
  await admin.query(
    `UPDATE ${quoteIdentifier(schema)}.credit_reservations
     SET created_at = CURRENT_TIMESTAMP - interval '2 seconds',
         expires_at = CURRENT_TIMESTAMP - interval '1 second'
     WHERE id = $1`,
    [reserved.reservation.id],
  );

  const recovery = new RecoveryService(
    store,
    { resolve: async () => 'succeeded' },
    transactions,
    clock,
    'integration-worker',
  );
  assert.deepEqual(await recovery.runBatch(10), { resolved: 1, deferred: 0 });
  assert.deepEqual(await walletState(admin, schema), {
    balance: 70, reserved: 0, lifetime_spent: 30, version: 2,
  });
  const journal = await store.journal(reserved.reservation.id);
  assert.deepEqual(journal.map(({ sequence, event }) => ({ sequence, event })), [
    { sequence: 1, event: 'reservation_created' },
    { sequence: 2, event: 'provider_dispatched' },
    { sequence: 3, event: 'recovery_deferred' },
    { sequence: 4, event: 'provider_succeeded' },
    { sequence: 5, event: 'reservation_committed' },
  ]);
});

let fixtureNumber = 0;

async function createFixture(context, balance) {
  const schema = `transaction_test_${process.pid}_${Date.now()}_${++fixtureNumber}`;
  const admin = new Pool({ connectionString: databaseUrl, max: 1 });
  const pool = new Pool({ connectionString: databaseUrl, max: 4, options: `-c search_path=${schema}` });
  context.after(async () => {
    await pool.end();
    await admin.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`);
    await admin.end();
  });

  const migration = await readFile(new URL('./migrations/001_transaction_store.sql', import.meta.url), 'utf8');
  await withClient(admin, async (client) => {
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}`);
    await client.query(migration);
  });
  await admin.query(
    `INSERT INTO ${quoteIdentifier(schema)}.credit_wallets
      (owner_id, total_credited, balance) VALUES ($1, $2, $2)`,
    ['owner-1', balance],
  );

  let nextId = 0;
  const runner = new RetryingPostgresTransactionRunner(pool);
  const store = new PostgresTransactionStore(runner, { next: () => `${schema}-id-${++nextId}` });
  return { admin, runner, schema, store };
}

function reservationInput(suffix, amount, now) {
  return {
    correlation_id: `correlation-${suffix}`,
    idempotency_key: `key-${suffix}`,
    request_fingerprint: suffix.repeat(64),
    owner_id: 'owner-1',
    project_id: 'project-1',
    operation_id: 'image-edit',
    operation_version: 1,
    provider: 'test-provider',
    amount,
    expires_at: new Date(now.getTime() + 60_000).toISOString(),
  };
}

async function walletState(admin, schema) {
  const result = await admin.query(
    `SELECT balance, reserved, lifetime_spent, version
     FROM ${quoteIdentifier(schema)}.credit_wallets WHERE owner_id = $1`,
    ['owner-1'],
  );
  const row = result.rows[0];
  return {
    balance: Number(row.balance),
    reserved: Number(row.reserved),
    lifetime_spent: Number(row.lifetime_spent),
    version: Number(row.version),
  };
}

async function withClient(pool, work) {
  const client = await pool.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

function quoteIdentifier(value) {
  return `"${value.replaceAll('"', '""')}"`;
}
