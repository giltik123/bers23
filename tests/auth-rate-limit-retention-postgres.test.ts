import assert from 'node:assert/strict';
import { Pool } from 'pg';

import { migrateAuthSchema } from '../server/core/auth/authSchema.ts';
import { AUTH_RATE_LIMIT_RETENTION_MS, PostgresAuthSecurityStore } from '../server/core/auth/postgresAuthSecurityStore.ts';

const databaseUrl = process.env.DATABASE_URL;

export async function proveAuthRateLimitRetention() {
  assert.ok(databaseUrl, 'DATABASE_URL is required for the real PostgreSQL retention proof');
  const pool = new Pool({ connectionString: databaseUrl, max: 12, application_name: 'bers-rate-limit-retention-proof' });
  try {
    await migrateAuthSchema(pool);
    const nowMs = Date.now();
    const now = new Date(nowMs);
    const cutoffMs = nowMs - AUTH_RATE_LIMIT_RETENTION_MS;
    const staleAt = new Date(cutoffMs - 60_000);
    const recentAt = new Date(nowMs - 60_000);

    await pool.query('TRUNCATE canonical_auth_rate_limits');
    const security = new PostgresAuthSecurityStore(pool);
    const ordinaryPolicy = { windowMs: 60_000, maxAttempts: 3, blockMs: 30_000 };
    await assert.rejects(
      () => security.consumeRateLimit('retention-too-long-window', digest(1), nowMs, { ...ordinaryPolicy, windowMs: AUTH_RATE_LIMIT_RETENTION_MS + 1 }),
      /Invalid auth rate-limit policy/,
    );
    await assert.rejects(
      () => security.consumeRateLimit('retention-too-long-block', digest(2), nowMs, { ...ordinaryPolicy, blockMs: AUTH_RATE_LIMIT_RETENTION_MS + 1 }),
      /Invalid auth rate-limit policy/,
    );

    await pool.query('TRUNCATE canonical_auth_rate_limits');
    await insertRateLimit(pool, 'retention-stale', digest(3), staleAt, staleAt, null);
    await insertRateLimit(pool, 'retention-recent', digest(4), recentAt, recentAt, null);
    await insertRateLimit(pool, 'retention-live-block', digest(5), staleAt, staleAt, new Date(nowMs + 60_000));
    assert.equal(await security.pruneRateLimits(nowMs), 1);
    assert.deepEqual(await scopes(pool), ['retention-live-block', 'retention-recent']);

    await pool.query('TRUNCATE canonical_auth_rate_limits');
    for (let index = 0; index < 5; index += 1) {
      await insertRateLimit(pool, `retention-batch-${index}`, digest(10 + index), staleAt, staleAt, null);
    }
    assert.equal(await security.pruneRateLimits(nowMs, 2), 2);
    assert.equal(await countRateLimits(pool), 3);
    assert.equal(await security.pruneRateLimits(nowMs, 2), 2);
    assert.equal(await countRateLimits(pool), 1);

    await pool.query('TRUNCATE canonical_auth_rate_limits');
    for (let index = 0; index < 20; index += 1) {
      await insertRateLimit(pool, `retention-concurrent-${index}`, digest(30 + index), staleAt, staleAt, null);
    }
    const secondPool = new Pool({ connectionString: databaseUrl, max: 4, application_name: 'bers-rate-limit-retention-second-instance' });
    try {
      const instanceA = new PostgresAuthSecurityStore(pool);
      const instanceB = new PostgresAuthSecurityStore(secondPool);
      const deleted = await Promise.all([
        instanceA.pruneRateLimits(nowMs, 10),
        instanceB.pruneRateLimits(nowMs, 10),
      ]);
      assert.equal(deleted[0] + deleted[1], 20);
      assert.equal(await countRateLimits(pool), 0);
    } finally {
      await secondPool.end();
    }

    await pool.query('TRUNCATE canonical_auth_rate_limits');
    await insertRateLimit(pool, 'retention-opportunistic-stale', digest(60), staleAt, staleAt, null);
    const opportunistic = new PostgresAuthSecurityStore(pool);
    assert.deepEqual(
      await opportunistic.consumeRateLimit('retention-current', digest(61), nowMs, ordinaryPolicy),
      { allowed: true, retryAfterMs: 0 },
    );
    assert.deepEqual(await scopes(pool), ['retention-current']);

    await proveClientHeldThroughPrune(nowMs, ordinaryPolicy);

    await pool.query('TRUNCATE canonical_auth_rate_limits');
    await insertRateLimit(pool, 'retention-single-connection-stale', digest(70), staleAt, staleAt, null);
    const singlePool = new Pool({ connectionString: databaseUrl, max: 1, application_name: 'bers-rate-limit-retention-single-connection' });
    let poolQueryCalls = 0;
    const guardedPool = new Proxy(singlePool, {
      get(target, property, receiver) {
        if (property === 'query') {
          return () => {
            poolQueryCalls += 1;
            throw new Error('opportunistic retention attempted a second pool checkout');
          };
        }
        const value = Reflect.get(target, property, receiver);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }) as Pool;
    try {
      const singleConnectionStore = new PostgresAuthSecurityStore(guardedPool);
      assert.deepEqual(
        await singleConnectionStore.consumeRateLimit('retention-single-connection-current', digest(71), nowMs + 1, ordinaryPolicy),
        { allowed: true, retryAfterMs: 0 },
      );
      assert.equal(poolQueryCalls, 0, 'opportunistic cleanup must reuse the already committed PoolClient');
      assert.deepEqual(await scopes(pool), ['retention-single-connection-current']);
    } finally {
      await singlePool.end();
    }

    await assert.rejects(() => security.pruneRateLimits(Number.NaN), /Invalid auth rate-limit prune request/);
    await assert.rejects(() => security.pruneRateLimits(nowMs, 0), /Invalid auth rate-limit prune request/);
    await assert.rejects(() => security.pruneRateLimits(nowMs, 1001), /Invalid auth rate-limit prune request/);
    assert.equal(now.getTime(), nowMs);
  } finally {
    await pool.query('TRUNCATE canonical_auth_rate_limits').catch(() => undefined);
    await pool.end();
  }
}

async function proveClientHeldThroughPrune(nowMs: number, policy: { windowMs: number; maxAttempts: number; blockMs: number }) {
  let released = false;
  let pruneStarted = false;
  let pruneFinished = false;
  const fakeClient = {
    async query(sql: string) {
      if (sql.startsWith('SELECT window_started_at')) {
        return { rows: [{ window_started_at: new Date(nowMs), attempt_count: 0, blocked_until: null }], rowCount: 1 };
      }
      if (sql.startsWith('WITH stale AS')) {
        pruneStarted = true;
        return await new Promise<{ rows: readonly unknown[]; rowCount: number }>((resolve, reject) => {
          setImmediate(() => {
            try {
              assert.equal(released, false, 'PoolClient must remain checked out until opportunistic prune finishes');
              pruneFinished = true;
              resolve({ rows: [], rowCount: 0 });
            } catch (error) {
              reject(error);
            }
          });
        });
      }
      return { rows: [], rowCount: 1 };
    },
    release() { released = true; },
  };
  const fakePool = {
    async connect() { return fakeClient; },
    async query() { throw new Error('opportunistic cleanup must not query through the pool'); },
  } as unknown as Pool;
  const store = new PostgresAuthSecurityStore(fakePool);
  assert.deepEqual(
    await store.consumeRateLimit('retention-client-lifetime', digest(90), nowMs, policy),
    { allowed: true, retryAfterMs: 0 },
  );
  assert.equal(pruneStarted, true);
  assert.equal(pruneFinished, true);
  assert.equal(released, true);
}

async function insertRateLimit(
  pool: Pool,
  scope: string,
  subjectDigest: Buffer,
  windowStartedAt: Date,
  updatedAt: Date,
  blockedUntil: Date | null,
) {
  await pool.query(
    `INSERT INTO canonical_auth_rate_limits(scope,subject_digest,window_started_at,attempt_count,blocked_until,updated_at)
     VALUES($1,$2,$3,1,$4,$5)`,
    [scope, subjectDigest, windowStartedAt, blockedUntil, updatedAt],
  );
}

async function countRateLimits(pool: Pool) {
  const result = await pool.query<{ count: string }>('SELECT COUNT(*)::text AS count FROM canonical_auth_rate_limits');
  return Number(result.rows[0]?.count ?? 0);
}

async function scopes(pool: Pool) {
  const result = await pool.query<{ scope: string }>('SELECT scope FROM canonical_auth_rate_limits ORDER BY scope');
  return result.rows.map(row => row.scope);
}

function digest(seed: number) {
  const value = ((seed % 255) + 255) % 255 || 1;
  return Buffer.alloc(32, value);
}
