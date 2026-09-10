import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';
import { PostgresBoundedAgentCompatibilityAdmissionLock } from './PostgresBoundedAgentCompatibilityAdmissionLock.ts';

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const scope = Object.freeze({ tenantId: 'tenant-ae4c2-lock', userId: 'user-ae4c2-lock', projectId: PROJECT_ID });

if (!DATABASE_URL) {
  test('PostgreSQL admission-lock tests require TEST_DATABASE_URL or DATABASE_URL', { skip: true }, () => {});
} else {
  test('same clientRequestId is serialized and no second admission enters the critical section early', async () => {
    const pool = await fixturePool();
    try {
      const admission = new PostgresBoundedAgentCompatibilityAdmissionLock(pool);
      let releaseFirst;
      const firstCanFinish = new Promise(resolve => { releaseFirst = resolve; });
      let firstEnteredResolve;
      const firstEntered = new Promise(resolve => { firstEnteredResolve = resolve; });
      let secondEntered = false;

      const first = admission.withClientRequestLock(scope, 'same-request', async () => {
        firstEnteredResolve();
        await firstCanFinish;
        return 'first';
      });
      await firstEntered;
      const second = admission.withClientRequestLock(scope, 'same-request', async () => {
        secondEntered = true;
        return 'second';
      });
      await delay(80);
      assert.equal(secondEntered, false, 'same request entered before the first transaction released its advisory lock');
      releaseFirst();
      assert.equal(await first, 'first');
      assert.equal(await second, 'second');
      assert.equal(secondEntered, true);
    } finally {
      await pool.end();
    }
  });

  test('different clientRequestIds may share one Project admission barrier concurrently', async () => {
    const pool = await fixturePool();
    try {
      const admission = new PostgresBoundedAgentCompatibilityAdmissionLock(pool);
      let releaseFirst;
      const firstCanFinish = new Promise(resolve => { releaseFirst = resolve; });
      let firstEnteredResolve;
      const firstEntered = new Promise(resolve => { firstEnteredResolve = resolve; });
      let secondEnteredResolve;
      const secondEntered = new Promise(resolve => { secondEnteredResolve = resolve; });

      const first = admission.withClientRequestLock(scope, 'request-one', async () => {
        firstEnteredResolve();
        await firstCanFinish;
        return 'one';
      });
      await firstEntered;
      const second = admission.withClientRequestLock(scope, 'request-two', async () => {
        secondEnteredResolve();
        return 'two';
      });
      assert.equal(await Promise.race([secondEntered.then(() => 'entered'), delay(1_000).then(() => 'timeout')]), 'entered');
      assert.equal(await second, 'two');
      releaseFirst();
      assert.equal(await first, 'one');
    } finally {
      await pool.end();
    }
  });

  test('Project mutation cannot pass the FOR SHARE barrier while first admission is open', async () => {
    const pool = await fixturePool();
    try {
      const admission = new PostgresBoundedAgentCompatibilityAdmissionLock(pool);
      let releaseAdmission;
      const canFinish = new Promise(resolve => { releaseAdmission = resolve; });
      let enteredResolve;
      const entered = new Promise(resolve => { enteredResolve = resolve; });
      const held = admission.withClientRequestLock(scope, 'mutation-barrier', async () => {
        enteredResolve();
        await canFinish;
      });
      await entered;

      const mutation = await pool.connect();
      try {
        await mutation.query("SET lock_timeout = '100ms'");
        await assert.rejects(
          () => mutation.query('UPDATE canonical_projects SET deleted_at=CURRENT_TIMESTAMP WHERE project_id=$1', [PROJECT_ID]),
          error => error?.code === '55P03',
        );
      } finally {
        mutation.release();
      }

      releaseAdmission();
      await held;
      const updated = await pool.query('UPDATE canonical_projects SET deleted_at=CURRENT_TIMESTAMP WHERE project_id=$1 RETURNING project_id', [PROJECT_ID]);
      assert.equal(updated.rowCount, 1);
    } finally {
      await pool.end();
    }
  });

  test('scope mismatch fails closed before the caller critical section runs', async () => {
    const pool = await fixturePool();
    try {
      const admission = new PostgresBoundedAgentCompatibilityAdmissionLock(pool);
      let ran = false;
      await assert.rejects(
        () => admission.withClientRequestLock({ ...scope, userId: 'other-user' }, 'request-scope', async () => { ran = true; }),
        error => error?.code === 'project_not_found' && error?.status === 404,
      );
      assert.equal(ran, false);
    } finally {
      await pool.end();
    }
  });
}

async function fixturePool(): Promise<Pool> {
  const pool = new Pool({ connectionString: DATABASE_URL, max: 6 });
  await pool.query('DROP TABLE IF EXISTS canonical_projects');
  await pool.query(`CREATE TABLE canonical_projects (
    project_id uuid PRIMARY KEY,
    tenant_id text NOT NULL,
    user_id text NOT NULL,
    deleted_at timestamptz
  )`);
  await pool.query('INSERT INTO canonical_projects(project_id,tenant_id,user_id) VALUES($1,$2,$3)', [PROJECT_ID, scope.tenantId, scope.userId]);
  return pool;
}

function delay(ms: number): Promise<void> { return new Promise(resolve => setTimeout(resolve, ms)); }
