import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RetryingPostgresTransactionRunner,
  isRetryablePostgresError,
} from './retryingTransactionRunner.ts';

function client(id) {
  return {
    id,
    commands: [],
    released: false,
    discarded: false,
    async query(text, values) {
      this.commands.push({ text, values });
      return { rows: [], rowCount: 0 };
    },
    release(discard = false) {
      this.released = true;
      this.discarded = discard;
    },
  };
}

test('classifies retries by SQLSTATE only', () => {
  for (const code of ['40001', '40P01', '55P03', '08006']) {
    assert.equal(isRetryablePostgresError({ code, message: 'localized' }), true);
  }
  assert.equal(isRetryablePostgresError({ message: 'deadlock detected' }), false);
  assert.equal(isRetryablePostgresError({ code: '57014', message: 'statement timeout' }), false);
});

test('discards retryable client and checks out a different client', async () => {
  const clients = [];
  const pool = { async connect() { const value = client(clients.length + 1); clients.push(value); return value; } };
  const waits = [];
  const runner = new RetryingPostgresTransactionRunner(pool, { async wait(ms) { waits.push(ms); } });
  let calls = 0;
  const result = await runner.transaction('read committed', async () => {
    calls += 1;
    if (calls === 1) throw Object.assign(new Error('deadlock'), { code: '40P01' });
    return 'ok';
  });
  assert.equal(result, 'ok');
  assert.equal(clients.length, 2);
  assert.notEqual(clients[0], clients[1]);
  assert.equal(clients[0].discarded, true);
  assert.equal(clients[1].discarded, false);
  assert.deepEqual(waits, [25]);
});

test('retries SQLSTATE connection acquisition failure', async () => {
  let attempts = 0;
  const connected = client(2);
  const pool = { async connect() { attempts += 1; if (attempts === 1) throw Object.assign(new Error('connect'), { code: '08006' }); return connected; } };
  const runner = new RetryingPostgresTransactionRunner(pool, { async wait() {} });
  assert.equal(await runner.transaction('read committed', async () => 'ok'), 'ok');
  assert.equal(attempts, 2);
  assert.equal(connected.released, true);
});

test('bounds lock-timeout retries and discards every affected client', async () => {
  const clients = [];
  const pool = { async connect() { const value = client(clients.length + 1); clients.push(value); return value; } };
  const waits = [];
  const runner = new RetryingPostgresTransactionRunner(pool, { async wait(ms) { waits.push(ms); } }, { maxAttempts: 2 });
  await assert.rejects(
    runner.transaction('read committed', async () => { throw Object.assign(new Error('lock'), { code: '55P03' }); }),
    (error) => error.code === '55P03',
  );
  assert.equal(clients.length, 2);
  assert.equal(clients.every((value) => value.discarded), true);
  assert.deepEqual(waits, [25]);
});
