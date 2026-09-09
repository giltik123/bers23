import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { Pool } from 'pg';
import sharp from 'sharp';
import { PostgresAutomationDefinitionStore } from '../server/core/automation/PostgresAutomationDefinitionStore.ts';
import { PostgresAutomationInvocationStore } from '../server/core/automation/PostgresAutomationInvocationStore.ts';
import { PostgresAutomationScheduleStore } from '../server/core/automation/PostgresAutomationScheduleStore.ts';
import { checkAutomationScheduleSchema } from '../server/core/automation/automationScheduleSchema.ts';
import { PostgresProjectStore } from '../server/core/projects/postgresProjectStore.ts';

const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL is required for C3d Automation schedule acceptance');
const pool = new Pool({ connectionString: databaseUrl, max: 12, application_name: 'bers-c3d-automation-schedule' });
const LIMITS = Object.freeze({ maxDimension: 16384, maxPixels: 268435456 });

async function png(width = 3, height = 2) {
  return new Uint8Array(await sharp({
    create: { width, height, channels: 4, background: { r: 15, g: 25, b: 35, alpha: 1 } },
  }).png().toBuffer());
}

async function fixture(label: string, nowMs = Date.parse('2026-09-09T05:30:00.000Z')) {
  const scope = Object.freeze({ tenantId: `tenant-c3d-${label}-${randomUUID()}`, userId: `user-c3d-${label}-${randomUUID()}` });
  const projects = new PostgresProjectStore(pool);
  const project = await projects.create(scope, `C3d ${label}`, await png(), LIMITS);
  const definitions = new PostgresAutomationDefinitionStore(pool, LIMITS);
  const definition = await definitions.create(scope, Object.freeze({
    name: `C3d ${label}`,
    trigger: 'MANUAL',
    plan: Object.freeze({
      kind: 'BOUNDED_DETERMINISTIC_IMAGE_V1',
      orthogonalMode: 'ROTATE_90_CW',
      targetWidth: 5,
      targetHeight: 7,
    }),
  }));
  let now = nowMs;
  const store = new PostgresAutomationScheduleStore(pool, randomUUID, randomUUID, () => now, 60_000);
  const schedule = await store.create(scope, Object.freeze({
    automationId: definition.id,
    definitionRevision: definition.revision,
    projectId: String(project.project_id),
    intervalSeconds: 60,
  }));
  return {
    scope,
    project,
    definition,
    definitions,
    store,
    schedule,
    now: () => now,
    setNow: (value: number) => { now = value; },
  };
}

async function forceDue(scheduleId: string, when: string) {
  await pool.query(`UPDATE canonical_automation_schedules
    SET next_fire_at=$2,lease_token=NULL,lease_expires_at=NULL
    WHERE schedule_id=$1`, [scheduleId, when]);
}

async function expectCode(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: any) => error?.code === code);
}

test('042 schema is exact and rejects permissive drift, hidden authority columns and disabled immutability', async () => {
  await checkAutomationScheduleSchema(pool);

  const constraintClient = await pool.connect();
  try {
    await constraintClient.query('BEGIN');
    await constraintClient.query('ALTER TABLE canonical_automation_schedules DROP CONSTRAINT canonical_automation_schedules_status_check');
    await constraintClient.query(`ALTER TABLE canonical_automation_schedules
      ADD CONSTRAINT canonical_automation_schedules_status_check
      CHECK (status IN ('ACTIVE','PAUSED','ARCHIVED') OR TRUE)`);
    await assert.rejects(checkAutomationScheduleSchema(constraintClient), /incomplete or permissive/);
    await constraintClient.query('ROLLBACK');
  } catch (error) {
    await constraintClient.query('ROLLBACK');
    throw error;
  } finally { constraintClient.release(); }

  const columnClient = await pool.connect();
  try {
    await columnClient.query('BEGIN');
    await columnClient.query('ALTER TABLE canonical_automation_schedules ADD COLUMN provider text');
    await assert.rejects(checkAutomationScheduleSchema(columnClient), /incomplete or permissive/);
    await columnClient.query('ROLLBACK');
  } catch (error) {
    await columnClient.query('ROLLBACK');
    throw error;
  } finally { columnClient.release(); }

  const triggerClient = await pool.connect();
  try {
    await triggerClient.query('BEGIN');
    await triggerClient.query('ALTER TABLE canonical_automation_trigger_occurrences DISABLE TRIGGER canonical_automation_trigger_occurrences_immutable_guard');
    await assert.rejects(checkAutomationScheduleSchema(triggerClient), /incomplete or permissive/);
    await triggerClient.query('ROLLBACK');
  } catch (error) {
    await triggerClient.query('ROLLBACK');
    throw error;
  } finally { triggerClient.release(); }
});

test('schedule creation is exact-schema, tenant/user isolated and user mutation is revision-safe', async () => {
  const f = await fixture('scope');
  assert.equal(f.schedule.status, 'ACTIVE');
  assert.equal(f.schedule.revision, 1);
  assert.equal(f.schedule.overlapPolicy, 'SKIP_WHILE_ACTIVE');
  assert.equal(f.schedule.missedRunPolicy, 'ONE_CATCH_UP');
  assert.equal(f.schedule.nextFireAt, new Date(f.now() + 60_000).toISOString());

  const otherUser = Object.freeze({ tenantId: f.scope.tenantId, userId: `other-${randomUUID()}` });
  const otherTenant = Object.freeze({ tenantId: `other-${randomUUID()}`, userId: f.scope.userId });
  assert.equal(await f.store.get(otherUser, f.schedule.scheduleId), undefined);
  assert.equal(await f.store.get(otherTenant, f.schedule.scheduleId), undefined);
  await expectCode(f.store.pause(otherUser, f.schedule.scheduleId, 1), 'automation_schedule_not_found');

  const updated = await f.store.update(f.scope, f.schedule.scheduleId, 1, { intervalSeconds: 120 });
  assert.equal(updated.revision, 2);
  assert.equal(updated.intervalSeconds, 120);
  assert.equal(updated.nextFireAt, new Date(f.now() + 120_000).toISOString());
  await expectCode(f.store.update(f.scope, f.schedule.scheduleId, 1, { intervalSeconds: 180 }), 'automation_schedule_revision_conflict');

  const paused = await f.store.pause(f.scope, f.schedule.scheduleId, 2);
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.revision, 3);
  const resumed = await f.store.resume(f.scope, f.schedule.scheduleId, 3);
  assert.equal(resumed.status, 'ACTIVE');
  assert.equal(resumed.revision, 4);
  assert.equal(resumed.nextFireAt, new Date(f.now() + 120_000).toISOString());
  const archived = await f.store.archive(f.scope, f.schedule.scheduleId, 4);
  assert.equal(archived.status, 'ARCHIVED');
  await expectCode(f.store.resume(f.scope, f.schedule.scheduleId, 5), 'automation_schedule_archived');

  for (const hostile of [
    { automationId: f.definition.id, definitionRevision: 1, projectId: f.project.project_id, intervalSeconds: 60, provider: 'fal' },
    { automationId: f.definition.id, definitionRevision: 1, projectId: f.project.project_id, intervalSeconds: 59 },
    { automationId: f.definition.id, definitionRevision: 1, projectId: f.project.project_id, intervalSeconds: 2_592_001 },
  ]) await assert.rejects(() => f.store.create(f.scope, hostile));
  await expectCode(f.store.create(f.scope, {
    automationId: f.definition.id,
    definitionRevision: 999,
    projectId: f.project.project_id,
    intervalSeconds: 60,
  }), 'automation_revision_conflict');
});

test('FOR UPDATE SKIP LOCKED gives one worker the due schedule and user pause invalidates its stale lease', async () => {
  const f = await fixture('claim');
  const dueAt = new Date(f.now() - 1_000).toISOString();
  await forceDue(f.schedule.scheduleId, dueAt);
  const secondStore = new PostgresAutomationScheduleStore(pool, randomUUID, randomUUID, f.now, 60_000);

  const claims = await Promise.all([f.store.claimDue(), secondStore.claimDue()]);
  const claimed = claims.filter(Boolean);
  assert.equal(claimed.length, 1, 'exactly one worker may own one due schedule lease');
  const claim = claimed[0]!;
  assert.equal(claim.scheduledFor, dueAt);

  const paused = await f.store.pause(f.scope, f.schedule.scheduleId, 1);
  assert.equal(paused.status, 'PAUSED');
  assert.equal(paused.revision, 2);
  await expectCode(f.store.commitOccurrence(claim, 'SKIPPED_CONFIGURATION'), 'automation_schedule_claim_stale');
  const count = await pool.query('SELECT count(*)::int AS count FROM canonical_automation_trigger_occurrences WHERE schedule_id=$1', [f.schedule.scheduleId]);
  assert.equal(count.rows[0]?.count, 0);
});

test('ONE_CATCH_UP advances beyond downtime without backlog burst; occurrence is immutable and replay-stable', async () => {
  const f = await fixture('catchup');
  const scheduledFor = new Date(f.now() - 5 * 60_000).toISOString();
  await forceDue(f.schedule.scheduleId, scheduledFor);
  const claim = await f.store.claimDue();
  assert.ok(claim);
  const occurrence = await f.store.commitOccurrence(claim!, 'SKIPPED_CONFIGURATION');
  assert.equal(occurrence.scheduledFor, scheduledFor);

  const current = await f.store.get(f.scope, f.schedule.scheduleId);
  assert.ok(current);
  assert.ok(Date.parse(current!.nextFireAt) > f.now(), 'catch-up must advance beyond current time');
  assert.ok(Date.parse(current!.nextFireAt) <= f.now() + 60_000, 'catch-up must not enqueue every missed interval');

  const replay = await f.store.commitOccurrence(claim!, 'SKIPPED_CONFIGURATION');
  assert.deepEqual(replay, occurrence);
  await expectCode(f.store.commitOccurrence(claim!, 'SKIPPED_ACTIVE'), 'automation_schedule_occurrence_replay_conflict');

  await assert.rejects(
    pool.query('UPDATE canonical_automation_trigger_occurrences SET decision=decision WHERE occurrence_id=$1', [occurrence.occurrenceId]),
    (error: any) => error?.code === '55000',
  );
  await assert.rejects(
    pool.query('DELETE FROM canonical_automation_trigger_occurrences WHERE occurrence_id=$1', [occurrence.occurrenceId]),
    (error: any) => error?.code === '55000',
  );
});

test('lease expiry after immutable C3b bind replays the same binding and persists one EXECUTE occurrence', async () => {
  const f = await fixture('lost-after-bind');
  const invocations = new PostgresAutomationInvocationStore(pool);
  const scheduledFor = new Date(f.now() - 1_000).toISOString();
  await forceDue(f.schedule.scheduleId, scheduledFor);
  const firstClaim = await f.store.claimDue();
  assert.ok(firstClaim);

  const command = Object.freeze({
    automationId: f.definition.id,
    definitionRevision: f.definition.revision,
    projectId: String(f.project.project_id),
    clientRequestId: firstClaim!.clientRequestId,
  });
  const firstBinding = await invocations.bind(f.scope, command);

  f.setNow(f.now() + 61_000);
  const secondStore = new PostgresAutomationScheduleStore(pool, randomUUID, randomUUID, f.now, 60_000);
  const replayClaim = await secondStore.claimDue();
  assert.ok(replayClaim);
  assert.equal(replayClaim!.scheduledFor, firstClaim!.scheduledFor);
  assert.equal(replayClaim!.clientRequestId, firstClaim!.clientRequestId);
  const replayBinding = await invocations.bind(f.scope, command);
  assert.deepEqual(replayBinding, firstBinding);

  const occurrence = await secondStore.commitOccurrence(replayClaim!, 'EXECUTE', replayBinding.invocationId);
  assert.equal(occurrence.invocationId, firstBinding.invocationId);
  const bindings = await pool.query(`SELECT count(*)::int AS count FROM canonical_automation_invocation_bindings
    WHERE tenant_id=$1 AND user_id=$2 AND client_request_id=$3`, [f.scope.tenantId, f.scope.userId, command.clientRequestId]);
  assert.equal(bindings.rows[0]?.count, 1);
  const occurrences = await pool.query(`SELECT count(*)::int AS count FROM canonical_automation_trigger_occurrences
    WHERE schedule_id=$1 AND schedule_revision=$2 AND scheduled_for=$3`, [f.schedule.scheduleId, firstClaim!.scheduleRevision, firstClaim!.scheduledFor]);
  assert.equal(occurrences.rows[0]?.count, 1);
});

test('recovery keyset pages cover every schedule once and collapse older EXECUTE history for the same schedule', async () => {
  const currentHistory = await pool.query('SELECT max(scheduled_for) AS latest FROM canonical_automation_trigger_occurrences WHERE decision=$1', ['EXECUTE']);
  const latestMs = currentHistory.rows[0]?.latest
    ? new Date(currentHistory.rows[0].latest).getTime()
    : Date.parse('2026-09-09T05:30:00.000Z');
  const nowMs = latestMs + 30_000;
  const primary = await fixture('recovery-primary', nowMs);
  const primaryIds: string[] = [];
  for (const millisecondsAgo of [5_000, 4_000, 3_000]) {
    const scheduledFor = new Date(nowMs - millisecondsAgo).toISOString();
    await forceDue(primary.schedule.scheduleId, scheduledFor);
    const claim = await primary.store.claimDue();
    assert.ok(claim);
    primaryIds.push((await primary.store.commitOccurrence(claim!, 'EXECUTE', randomUUID())).occurrenceId);
  }

  const second = await fixture('recovery-second', nowMs);
  await forceDue(second.schedule.scheduleId, new Date(nowMs - 2_000).toISOString());
  const secondClaim = await second.store.claimDue();
  assert.ok(secondClaim);
  const secondOccurrence = await second.store.commitOccurrence(secondClaim!, 'EXECUTE', randomUUID());

  const third = await fixture('recovery-third', nowMs);
  await forceDue(third.schedule.scheduleId, new Date(nowMs - 1_000).toISOString());
  const thirdClaim = await third.store.claimDue();
  assert.ok(thirdClaim);
  const thirdOccurrence = await third.store.commitOccurrence(thirdClaim!, 'EXECUTE', randomUUID());

  const seen: any[] = [];
  let cursor: any = undefined;
  for (let pageNumber = 0; pageNumber < 100; pageNumber += 1) {
    const page = await primary.store.listLatestExecuteOccurrences(2, cursor);
    seen.push(...page.occurrences);
    if (!page.nextCursor) break;
    assert.notDeepEqual(page.nextCursor, cursor, 'keyset cursor must make forward progress');
    cursor = page.nextCursor;
    if (pageNumber === 99) throw new Error('recovery pagination did not terminate');
  }

  assert.equal(new Set(seen.map(occurrence => occurrence.scheduleId)).size, seen.length, 'recovery sweep returns at most one EXECUTE per schedule');
  assert.equal(seen[0]?.occurrenceId, thirdOccurrence.occurrenceId);
  assert.equal(seen[1]?.occurrenceId, secondOccurrence.occurrenceId);
  assert.equal(seen[2]?.occurrenceId, primaryIds.at(-1));
  assert.equal(seen.filter(occurrence => occurrence.scheduleId === primary.schedule.scheduleId).length, 1, 'older EXECUTE history of one schedule is terminal by overlap policy and must be collapsed');
  assert.ok(seen.some(occurrence => occurrence.scheduleId === second.schedule.scheduleId));
  assert.ok(seen.some(occurrence => occurrence.scheduleId === third.schedule.scheduleId));
});

test.after(async () => { await pool.end(); });
