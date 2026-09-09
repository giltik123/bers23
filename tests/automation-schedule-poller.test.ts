import assert from 'node:assert/strict';
import test from 'node:test';
import { AutomationSchedulePoller } from '../server/core/automation/AutomationSchedulePoller.ts';

class FakeWake {
  readonly pending = new Map<number, { callback: () => void; delayMs: number }>();
  private nextId = 1;
  set(callback: () => void, delayMs: number) {
    const id = this.nextId++;
    this.pending.set(id, { callback, delayMs });
    return id;
  }
  clear(handle: unknown) { this.pending.delete(Number(handle)); }
  fireOne() {
    const first = this.pending.entries().next().value as [number, { callback: () => void; delayMs: number }] | undefined;
    if (!first) throw new Error('no pending wake');
    this.pending.delete(first[0]);
    first[1].callback();
  }
}

const noDue = Object.freeze({ status: 'NO_DUE' as const });
const delegated = Object.freeze({ status: 'DELEGATED' as const, occurrence: {} as any, execution: {} as any });
const recoveryRequired = Object.freeze({ status: 'RECOVERY_REQUIRED' as const, occurrence: {} as any, failureCode: 'lost' });
const emptyRecovery = Object.freeze({ attempts: Object.freeze([]), failureCount: 0 });

async function settle() {
  await Promise.resolve();
  await new Promise(resolve => setImmediate(resolve));
}

test('poller performs a recovery page before due work and keeps exactly one scheduled wake', async () => {
  const wake = new FakeWake();
  const calls: string[] = [];
  const poller = new AutomationSchedulePoller({
    recoverPage: async (limit: number, cursor: unknown) => {
      assert.equal(cursor, undefined);
      calls.push(`recover:${limit}`);
      return emptyRecovery;
    },
    runOnce: async () => { calls.push('run'); return noDue; },
  } as any, { wake, recoveryLimit: 7, pollIntervalMs: 100 });

  poller.start();
  poller.start();
  assert.equal(wake.pending.size, 1, 'start must be idempotent');
  wake.fireOne();
  await settle();
  assert.deepEqual(calls, ['recover:7', 'run']);
  assert.equal(wake.pending.size, 1, 'completed cycle schedules exactly one next wake');
  await poller.stop();
  assert.equal(wake.pending.size, 0);
});

test('one cycle drains only the configured bounded number of due occurrences', async () => {
  const wake = new FakeWake();
  let runs = 0;
  const poller = new AutomationSchedulePoller({
    recoverPage: async () => emptyRecovery,
    runOnce: async () => { runs += 1; return delegated; },
  } as any, { wake, maxPerCycle: 3, pollIntervalMs: 100 });
  poller.start();
  wake.fireOne();
  await settle();
  assert.equal(runs, 3);
  assert.equal(wake.pending.size, 1);
  await poller.stop();
});

test('keyset recovery sweep advances across cycles without starving due polling', async () => {
  const wake = new FakeWake();
  const cursor = Object.freeze({ scheduledFor: '2026-09-09T05:00:00.000Z', occurrenceId: '11111111-1111-4111-8111-111111111111' });
  const calls: string[] = [];
  let recoveryPage = 0;
  const poller = new AutomationSchedulePoller({
    recoverPage: async (_limit: number, received: unknown) => {
      recoveryPage += 1;
      calls.push(`recover:${recoveryPage}`);
      if (recoveryPage === 1) {
        assert.equal(received, undefined);
        return Object.freeze({ ...emptyRecovery, nextCursor: cursor });
      }
      assert.equal(received, cursor);
      return emptyRecovery;
    },
    runOnce: async () => { calls.push('run'); return noDue; },
  } as any, { wake, pollIntervalMs: 100 });
  poller.start();
  wake.fireOne();
  await settle();
  assert.deepEqual(calls, ['recover:1', 'run']);
  wake.fireOne();
  await settle();
  assert.deepEqual(calls, ['recover:1', 'run', 'recover:2', 'run']);
  await poller.stop();
});

test('RECOVERY_REQUIRED forces an immediate new sweep after the current page chain completes', async () => {
  const wake = new FakeWake();
  const calls: string[] = [];
  let runCount = 0;
  let now = 10_000;
  const poller = new AutomationSchedulePoller({
    recoverPage: async () => { calls.push('recover'); return emptyRecovery; },
    runOnce: async () => {
      runCount += 1;
      calls.push(`run:${runCount}`);
      return runCount === 1 ? recoveryRequired : noDue;
    },
  } as any, { wake, pollIntervalMs: 100, recoverySweepIntervalMs: 60_000, now: () => now });
  poller.start();
  wake.fireOne();
  await settle();
  assert.deepEqual(calls, ['recover', 'run:1']);
  now += 100;
  wake.fireOne();
  await settle();
  assert.deepEqual(calls, ['recover', 'run:1', 'recover', 'run:2']);
  await poller.stop();
});

test('failed recovery query is fail-closed and retries the same page before due work', async () => {
  const wake = new FakeWake();
  const errors: unknown[] = [];
  let recoveries = 0;
  let runs = 0;
  const poller = new AutomationSchedulePoller({
    recoverPage: async () => {
      recoveries += 1;
      if (recoveries === 1) throw Object.assign(new Error('database unavailable'), { code: 'ECONNRESET' });
      return emptyRecovery;
    },
    runOnce: async () => { runs += 1; return noDue; },
  } as any, {
    wake,
    pollIntervalMs: 100,
    log: { error: value => errors.push(value) },
  });
  poller.start();
  wake.fireOne();
  await settle();
  assert.equal(runs, 0);
  assert.equal(errors.length, 1);
  wake.fireOne();
  await settle();
  assert.equal(recoveries, 2);
  assert.equal(runs, 1);
  await poller.stop();
});

test('individual recovery failure is observable and retried by the periodic sweep without blocking due work', async () => {
  const wake = new FakeWake();
  const errors: any[] = [];
  let now = 50_000;
  let recoveries = 0;
  let runs = 0;
  const poller = new AutomationSchedulePoller({
    recoverPage: async () => {
      recoveries += 1;
      return Object.freeze({
        attempts: Object.freeze([{ occurrenceId: 'o', invocationId: 'i', failureCode: 'temporary_failure' }]),
        failureCount: 1,
      });
    },
    runOnce: async () => { runs += 1; return noDue; },
  } as any, {
    wake,
    pollIntervalMs: 100,
    recoverySweepIntervalMs: 1_000,
    now: () => now,
    log: { error: value => errors.push(value) },
  });
  poller.start();
  wake.fireOne();
  await settle();
  assert.equal(recoveries, 1);
  assert.equal(runs, 1);
  assert.equal(errors[0]?.event, 'automation_schedule_recovery_incomplete');
  assert.equal(errors[0]?.code, 'temporary_failure');

  now += 999;
  wake.fireOne();
  await settle();
  assert.equal(recoveries, 1, 'periodic recovery must not run before its bounded interval');
  assert.equal(runs, 2);

  now += 1;
  wake.fireOne();
  await settle();
  assert.equal(recoveries, 2, 'failed recovery is retried on the next periodic sweep');
  assert.equal(runs, 3);
  await poller.stop();
});

test('poller never overlaps cycles and stop waits for the in-flight worker before returning', async () => {
  const wake = new FakeWake();
  let release!: () => void;
  const blocked = new Promise<void>(resolve => { release = resolve; });
  let active = 0;
  let maxActive = 0;
  let runs = 0;
  const poller = new AutomationSchedulePoller({
    recoverPage: async () => emptyRecovery,
    runOnce: async () => {
      runs += 1;
      active += 1;
      maxActive = Math.max(maxActive, active);
      await blocked;
      active -= 1;
      return noDue;
    },
  } as any, { wake, pollIntervalMs: 100 });

  poller.start();
  wake.fireOne();
  await Promise.resolve();
  assert.equal(runs, 1);
  assert.equal(wake.pending.size, 0, 'no next timer exists while the cycle is in flight');
  let stopped = false;
  const stopping = poller.stop().then(() => { stopped = true; });
  await Promise.resolve();
  assert.equal(stopped, false, 'stop must await the in-flight cycle');
  release();
  await stopping;
  assert.equal(maxActive, 1);
  assert.equal(wake.pending.size, 0);
});

test('invalid poller bounds fail fast instead of silently widening scheduler work', () => {
  const worker = { recoverPage: async () => emptyRecovery, runOnce: async () => noDue } as any;
  assert.throws(() => new AutomationSchedulePoller(worker, { pollIntervalMs: 99 }), /pollIntervalMs/);
  assert.throws(() => new AutomationSchedulePoller(worker, { maxPerCycle: 65 }), /maxPerCycle/);
  assert.throws(() => new AutomationSchedulePoller(worker, { recoveryLimit: 201 }), /recoveryLimit/);
  assert.throws(() => new AutomationSchedulePoller(worker, { recoverySweepIntervalMs: 999 }), /recoverySweepIntervalMs/);
});
