import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import { AutomationScheduleWorker } from '../server/core/automation/AutomationScheduleWorker.ts';
import { PostgresAutomationScheduleStore } from '../server/core/automation/PostgresAutomationScheduleStore.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for C3d lease fairness acceptance');
const pool = new Pool({ connectionString: databaseUrl, max: 6, application_name: 'bers-c3d-lease-fairness' });
const LEASE_MS = 2_000;

async function insertDueSchedule(scheduleId: string, nextFireAt: string, label: string) {
  await pool.query(`INSERT INTO canonical_automation_schedules (
    schedule_id,tenant_id,user_id,automation_id,definition_revision,project_id,interval_seconds,next_fire_at
  ) VALUES ($1,$2,$3,$4,1,$5,60,$6)`, [
    scheduleId,
    `tenant-c3d-fairness-${label}-${randomUUID()}`,
    `user-c3d-fairness-${label}-${randomUUID()}`,
    randomUUID(),
    randomUUID(),
    nextFireAt,
  ]);
}

test('unexpected pre-occurrence failure keeps its lease so later due schedules progress, then retries after expiry', async () => {
  const existing = await pool.query(`SELECT min(next_fire_at) AS earliest
    FROM canonical_automation_schedules WHERE status='ACTIVE'`);
  const wallNow = Date.now();
  const existingMs = existing.rows[0]?.earliest ? new Date(existing.rows[0].earliest).getTime() : undefined;
  const firstDueMs = existingMs == null
    ? wallNow - 120_000
    : Math.min(wallNow - 120_000, existingMs - 10_000);
  const firstId = randomUUID();
  const secondId = randomUUID();
  const firstDue = new Date(firstDueMs).toISOString();
  const secondDue = new Date(firstDueMs + 1_000).toISOString();
  let nowMs = wallNow;

  await insertDueSchedule(firstId, firstDue, 'first');
  await insertDueSchedule(secondId, secondDue, 'second');

  try {
    const firstStore = new PostgresAutomationScheduleStore(pool, randomUUID, randomUUID, () => nowMs, LEASE_MS);
    const worker = new AutomationScheduleWorker({
      schedules: firstStore,
      invocations: {
        bind: async () => { throw Object.assign(new Error('simulated durable dependency outage'), { code: 'ECONNRESET' }); },
      } as any,
      execution: { resume: async () => { throw new Error('execution must not start'); } } as any,
    });

    await assert.rejects(() => worker.runOnce(), /simulated durable dependency outage/);

    const firstLease = await pool.query(`SELECT lease_token::text,lease_expires_at
      FROM canonical_automation_schedules WHERE schedule_id=$1`, [firstId]);
    assert.ok(firstLease.rows[0]?.lease_token, 'failed earliest schedule must retain its crash-equivalent lease');
    assert.equal(new Date(firstLease.rows[0].lease_expires_at).toISOString(), new Date(wallNow + LEASE_MS).toISOString());

    const secondStore = new PostgresAutomationScheduleStore(pool, randomUUID, randomUUID, () => nowMs, LEASE_MS);
    const secondClaim = await secondStore.claimDue();
    assert.ok(secondClaim, 'a later due schedule must remain claimable while the failed schedule lease is live');
    assert.equal(secondClaim!.schedule.scheduleId, secondId, 'live failed lease must prevent earliest-due starvation');

    nowMs = wallNow + LEASE_MS + 1;
    const retryStore = new PostgresAutomationScheduleStore(pool, randomUUID, randomUUID, () => nowMs, LEASE_MS);
    const retryClaim = await retryStore.claimDue();
    assert.ok(retryClaim, 'failed schedule must become retryable after lease expiry');
    assert.equal(retryClaim!.schedule.scheduleId, firstId, 'expired lease must restore the original deterministic due ordering');
    assert.equal(retryClaim!.scheduledFor, firstDue, 'retry must preserve the original due identity');
  } finally {
    await pool.query('DELETE FROM canonical_automation_schedules WHERE schedule_id = ANY($1::uuid[])', [[firstId, secondId]]);
  }
});

test.after(async () => { await pool.end(); });
