import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { Pool } from 'pg';

import { PostgresTransactionStore } from './postgresTransactionStore.ts';
import { RetryingPostgresTransactionRunner } from './retryingTransactionRunner.ts';
import { RecoveryService } from '../../application/recoveryService.ts';
import {
  BillableOperationService,
  DefinitiveProviderFailure,
  ProviderOutcomePendingError,
} from '../../application/billableOperationService.ts';
import { ReservationGateway } from '../../application/reservationGateway.ts';
import { TransactionService } from '../../application/transactionService.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const integrationTest = databaseUrl ? test : test.skip;

integrationTest('matrix 1: reserve -> provider success -> commit', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();
  const reserved = await store.reserve(reservationInput('success', 35, now), now.toISOString());
  assert.equal(reserved.kind, 'created');
  await store.appendProviderFact(reserved.reservation.id, 'provider_dispatched', now.toISOString());
  await store.appendProviderFact(reserved.reservation.id, 'provider_succeeded', now.toISOString());
  assert.equal((await store.commit(reserved.reservation.id, 'owner-1', now.toISOString(), 'transaction_service')).kind, 'applied');
  assert.deepEqual(await walletState(admin, schema), { balance: 65, reserved: 0, lifetime_spent: 35, version: 2 });
});

integrationTest('matrix 2: definitive provider failure releases the reservation', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const { operations } = operationFixture(store, 25);
  await assert.rejects(
    operations.execute(trustedContext(25), operationCommand('failure'), {
      execute: async () => { throw new DefinitiveProviderFailure('provider_rejected'); },
    }),
    DefinitiveProviderFailure,
  );
  assert.deepEqual(await walletState(admin, schema), { balance: 100, reserved: 0, lifetime_spent: 0, version: 2 });
  assert.deepEqual(await reservationStates(admin, schema), [{ status: 'released', provider_state: 'failed', amount: 25 }]);
});

integrationTest('matrix 3/4: lost response remains UNKNOWN and duplicate request never charges twice', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const { operations } = operationFixture(store, 30);
  const contextValue = trustedContext(30);
  const command = operationCommand('lost-response');
  let providerCalls = 0;
  const provider = { execute: async () => { providerCalls += 1; throw new Error('response lost'); } };

  await assert.rejects(operations.execute(contextValue, command, provider), ProviderOutcomePendingError);
  const replay = await operations.execute(contextValue, command, provider);

  assert.equal(replay.kind, 'provider_outcome_pending');
  assert.equal(providerCalls, 1);
  assert.deepEqual(await walletState(admin, schema), { balance: 100, reserved: 30, lifetime_spent: 0, version: 1 });
  assert.deepEqual(await reservationStates(admin, schema), [{ status: 'reserved', provider_state: 'dispatched', amount: 30 }]);
  const rows = await admin.query(`SELECT event FROM ${quoteIdentifier(schema)}.transaction_journal ORDER BY sequence`);
  assert.deepEqual(rows.rows.map(({ event }) => event), ['reservation_created', 'provider_dispatched', 'recovery_deferred']);
});

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

integrationTest('matrix 6: expired authorization is recovered without a charge when never dispatched', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();
  const reserved = await store.reserve(reservationInput('expired', 20, now), now.toISOString());
  assert.equal(reserved.kind, 'created');
  await expireReservation(admin, schema, reserved.reservation.id);

  const recovery = new RecoveryService(
    store,
    { resolve: async () => 'not_dispatched' },
    new TransactionService(store, { now: () => new Date() }),
    { now: () => new Date() },
    'expiry-worker',
  );
  assert.deepEqual(await recovery.runBatch(10), { resolved: 1, deferred: 0 });
  assert.deepEqual(await walletState(admin, schema), { balance: 100, reserved: 0, lifetime_spent: 0, version: 2 });
  assert.deepEqual(await reservationStates(admin, schema), [{ status: 'released', provider_state: 'pending', amount: 20 }]);
});

integrationTest('matrix 7: hard budget rejection creates no financial facts', async (context) => {
  const { admin, schema, store } = await createFixture(context, 40);
  const result = await store.reserve(reservationInput('over-budget', 41, new Date()), new Date().toISOString());
  assert.equal(result.kind, 'insufficient_credits');
  assert.deepEqual(await walletState(admin, schema), { balance: 40, reserved: 0, lifetime_spent: 0, version: 0 });
  assert.deepEqual(await reservationStates(admin, schema), []);
});

integrationTest('matrix 8: partial replan reserves and commits only incremental cost', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();
  // 60 credits are preserved work; only the changed 20-credit node is new authority.
  const incremental = await store.reserve(reservationInput('incremental', 20, now), now.toISOString());
  assert.equal(incremental.kind, 'created');
  await store.appendProviderFact(incremental.reservation.id, 'provider_dispatched', now.toISOString());
  await store.appendProviderFact(incremental.reservation.id, 'provider_succeeded', now.toISOString());
  await store.commit(incremental.reservation.id, 'owner-1', now.toISOString(), 'transaction_service');
  assert.deepEqual(await walletState(admin, schema), { balance: 80, reserved: 0, lifetime_spent: 20, version: 2 });
  assert.deepEqual(await reservationStates(admin, schema), [{ status: 'committed', provider_state: 'success', amount: 20 }]);
});

integrationTest('matrix 9: interrupted reservation recovery is idempotent across competing workers', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();
  const reserved = await store.reserve(reservationInput('interrupted', 45, now), now.toISOString());
  assert.equal(reserved.kind, 'created');
  await store.appendProviderFact(reserved.reservation.id, 'provider_dispatched', now.toISOString());
  await expireReservation(admin, schema, reserved.reservation.id);
  let resolutions = 0;
  const createRecovery = (worker) => new RecoveryService(
    store,
    { resolve: async () => { resolutions += 1; return 'succeeded'; } },
    new TransactionService(store, { now: () => new Date() }),
    { now: () => new Date() },
    worker,
  );

  const results = await Promise.all([createRecovery('worker-a').runBatch(10), createRecovery('worker-b').runBatch(10)]);
  assert.equal(results.reduce((sum, result) => sum + result.resolved, 0), 1);
  assert.equal(resolutions, 1);
  assert.deepEqual(await walletState(admin, schema), { balance: 55, reserved: 0, lifetime_spent: 45, version: 2 });
});

integrationTest('matrix 10: reconciliation classifies matched, missing, inconsistent and unknown PostgreSQL facts', async (context) => {
  const { admin, schema, store } = await createFixture(context, 100);
  const now = new Date();
  const matched = await store.reserve(reservationInput('matched', 10, now), now.toISOString());
  assert.equal(matched.kind, 'created');
  await store.appendProviderFact(matched.reservation.id, 'provider_dispatched', now.toISOString());
  await store.appendProviderFact(matched.reservation.id, 'provider_succeeded', now.toISOString());
  await store.commit(matched.reservation.id, 'owner-1', now.toISOString(), 'transaction_service');

  const unknown = await store.reserve(reservationInput('unknown', 5, now), now.toISOString());
  assert.equal(unknown.kind, 'created');
  await store.appendProviderFact(unknown.reservation.id, 'provider_dispatched', now.toISOString());
  await store.appendRecoveryDeferred(unknown.reservation.id, now.toISOString());

  assert.equal(await reconcileReservation(admin, schema, matched.reservation.id), 'matched');
  assert.equal(await reconcileReservation(admin, schema, 'absent-reservation'), 'missing');
  assert.equal(await reconcileReservation(admin, schema, unknown.reservation.id), 'unknown');

  // Simulate externally detected ledger drift in an isolated verification schema.
  await admin.query(`DELETE FROM ${quoteIdentifier(schema)}.transaction_journal WHERE reservation_id = $1 AND event = 'reservation_committed'`, [matched.reservation.id]);
  assert.equal(await reconcileReservation(admin, schema, matched.reservation.id), 'inconsistent');
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
    request_fingerprint: createHash('sha256').update(suffix).digest('hex'),
    owner_id: 'owner-1',
    project_id: 'project-1',
    operation_id: 'image-edit',
    operation_version: 1,
    provider: 'test-provider',
    amount,
    expires_at: new Date(now.getTime() + 60_000).toISOString(),
  };
}

function operationFixture(store, amount) {
  const clock = { now: () => new Date() };
  const transactions = new TransactionService(store, clock);
  const reservations = new ReservationGateway(transactions, { next: () => `correlation-operation-${amount}` });
  return { operations: new BillableOperationService(reservations, store, transactions, clock) };
}

function trustedContext(amount) {
  return {
    user: { id: 'owner-1' },
    project: { id: 'project-1', created_by_id: 'owner-1' },
    operation: { operation_id: 'image-edit', version: 1, provider: 'test-provider', credit_cost: amount },
  };
}

function operationCommand(suffix) {
  return { idempotency_key: `operation-${suffix}-request`, payload: { prompt: suffix } };
}

async function expireReservation(admin, schema, id) {
  await admin.query(
    `UPDATE ${quoteIdentifier(schema)}.credit_reservations
     SET created_at = CURRENT_TIMESTAMP - interval '2 seconds', expires_at = CURRENT_TIMESTAMP - interval '1 second'
     WHERE id = $1`,
    [id],
  );
}

async function reservationStates(admin, schema) {
  const result = await admin.query(
    `SELECT status, provider_state, amount FROM ${quoteIdentifier(schema)}.credit_reservations ORDER BY id`,
  );
  return result.rows.map((row) => ({ ...row, amount: Number(row.amount) }));
}

async function reconcileReservation(admin, schema, id) {
  const result = await admin.query(
    `SELECT reservation.status, reservation.provider_state,
            count(journal.id)::integer AS journal_count,
            count(journal.id) FILTER (WHERE journal.event = 'reservation_committed')::integer AS commit_count
     FROM ${quoteIdentifier(schema)}.credit_reservations AS reservation
     LEFT JOIN ${quoteIdentifier(schema)}.transaction_journal AS journal ON journal.reservation_id = reservation.id
     WHERE reservation.id = $1
     GROUP BY reservation.id`,
    [id],
  );
  if (!result.rowCount) return 'missing';
  const row = result.rows[0];
  if (row.status === 'reserved' && row.provider_state === 'dispatched') return 'unknown';
  if (row.status === 'committed' && row.provider_state === 'success' && row.commit_count === 1 && row.journal_count >= 4) return 'matched';
  return 'inconsistent';
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
