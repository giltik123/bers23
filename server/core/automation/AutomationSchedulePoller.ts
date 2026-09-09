import type { AutomationScheduleRecoveryCursor } from './PostgresAutomationScheduleStore.ts';
import type { AutomationScheduleWorker, AutomationScheduleWorkerResult } from './AutomationScheduleWorker.ts';

type WorkerPort = Pick<AutomationScheduleWorker, 'runOnce' | 'recoverPage'>;
type WakePort = Readonly<{
  set(callback: () => void, delayMs: number): unknown;
  clear(handle: unknown): void;
}>;
type LogPort = Readonly<{ error(event: Readonly<{ event: string; code?: string; message: string }>): void }>;

export type AutomationSchedulePollerOptions = Readonly<{
  pollIntervalMs?: number;
  maxPerCycle?: number;
  recoveryLimit?: number;
  recoverySweepIntervalMs?: number;
  wake?: WakePort;
  log?: LogPort;
  now?: () => number;
}>;

const DEFAULT_POLL_MS = 1_000;
const DEFAULT_MAX_PER_CYCLE = 8;
const DEFAULT_RECOVERY_LIMIT = 50;
const DEFAULT_RECOVERY_SWEEP_MS = 60_000;

/**
 * Wake-up loop only. PostgreSQL schedule rows, leases and immutable occurrences remain
 * the complete recurring-trigger authority. Timers and recovery cursors never carry due state.
 */
export class AutomationSchedulePoller {
  private readonly pollIntervalMs: number;
  private readonly maxPerCycle: number;
  private readonly recoveryLimit: number;
  private readonly recoverySweepIntervalMs: number;
  private readonly wake: WakePort;
  private readonly log: LogPort;
  private readonly now: () => number;
  private started = false;
  private stopping = false;
  private timer: unknown;
  private inFlight?: Promise<void>;
  private recoveryCursor?: AutomationScheduleRecoveryCursor;
  private nextRecoverySweepAt = 0;

  constructor(private readonly worker: WorkerPort, options: AutomationSchedulePollerOptions = {}) {
    this.pollIntervalMs = boundedInteger(options.pollIntervalMs ?? DEFAULT_POLL_MS, 100, 60_000, 'pollIntervalMs');
    this.maxPerCycle = boundedInteger(options.maxPerCycle ?? DEFAULT_MAX_PER_CYCLE, 1, 64, 'maxPerCycle');
    this.recoveryLimit = boundedInteger(options.recoveryLimit ?? DEFAULT_RECOVERY_LIMIT, 1, 200, 'recoveryLimit');
    this.recoverySweepIntervalMs = boundedInteger(
      options.recoverySweepIntervalMs ?? DEFAULT_RECOVERY_SWEEP_MS,
      1_000,
      24 * 60 * 60_000,
      'recoverySweepIntervalMs',
    );
    this.wake = options.wake ?? Object.freeze({
      set: (callback: () => void, delayMs: number) => setTimeout(callback, delayMs),
      clear: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    this.log = options.log ?? Object.freeze({ error: (value: unknown) => console.error(value) });
    this.now = options.now ?? Date.now;
  }

  start(): void {
    if (this.started && !this.stopping) return;
    if (this.stopping) throw new Error('Automation schedule poller cannot restart while stopping');
    this.started = true;
    this.recoveryCursor = undefined;
    this.nextRecoverySweepAt = 0;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    if (!this.started) return;
    this.stopping = true;
    if (this.timer !== undefined) {
      this.wake.clear(this.timer);
      this.timer = undefined;
    }
    await this.inFlight;
    this.started = false;
    this.stopping = false;
    this.recoveryCursor = undefined;
  }

  private schedule(delayMs: number): void {
    if (!this.started || this.stopping || this.timer !== undefined) return;
    this.timer = this.wake.set(() => {
      this.timer = undefined;
      if (!this.started || this.stopping || this.inFlight) return;
      const cycle = this.cycle();
      this.inFlight = cycle.finally(() => {
        this.inFlight = undefined;
        if (this.started && !this.stopping) this.schedule(this.pollIntervalMs);
      });
    }, delayMs);
  }

  private async cycle(): Promise<void> {
    if (this.recoveryCursor !== undefined || this.now() >= this.nextRecoverySweepAt) {
      let recovery;
      try {
        recovery = await this.worker.recoverPage(this.recoveryLimit, this.recoveryCursor);
      } catch (error) {
        // Catalog/query failure is fail-closed for this cycle. Keep the same keyset cursor so the
        // next wake retries exactly the page whose authority could not be inspected.
        this.report('automation_schedule_recovery_cycle_failed', error);
        return;
      }
      if (recovery.failureCount > 0) this.reportRecoveryFailures(recovery);
      if (recovery.nextCursor) {
        this.recoveryCursor = recovery.nextCursor;
      } else {
        this.recoveryCursor = undefined;
        this.nextRecoverySweepAt = this.now() + this.recoverySweepIntervalMs;
      }
    }

    for (let count = 0; count < this.maxPerCycle && !this.stopping; count += 1) {
      let result: AutomationScheduleWorkerResult;
      try {
        result = await this.worker.runOnce();
      } catch (error) {
        this.report('automation_schedule_worker_cycle_failed', error);
        return;
      }
      if (result.status === 'NO_DUE') return;
      if (result.status === 'RECOVERY_REQUIRED') {
        // Preserve an in-progress keyset sweep. If the sweep just completed, zeroing the deadline
        // causes the next cycle to immediately start another sweep containing this failed EXECUTE.
        this.nextRecoverySweepAt = 0;
        return;
      }
    }
  }

  private reportRecoveryFailures(recovery: Awaited<ReturnType<WorkerPort['recoverPage']>>): void {
    const first = recovery.attempts.find(attempt => attempt.failureCode);
    this.log.error(Object.freeze({
      event: 'automation_schedule_recovery_incomplete',
      ...(first?.failureCode ? { code: first.failureCode } : {}),
      message: `${recovery.failureCount} Automation execution recovery attempt(s) failed; periodic sweep will retry`,
    }));
  }

  private report(event: string, error: unknown): void {
    const candidate = error && typeof error === 'object' ? error as { code?: unknown; message?: unknown } : undefined;
    const code = typeof candidate?.code === 'string' && candidate.code.length <= 160 ? candidate.code : undefined;
    const message = typeof candidate?.message === 'string' && candidate.message ? candidate.message.slice(0, 500) : 'Unknown Automation schedule poller failure';
    this.log.error(Object.freeze({ event, ...(code ? { code } : {}), message }));
  }
}

function boundedInteger(value: number, min: number, max: number, field: string): number {
  if (!Number.isSafeInteger(value) || value < min || value > max) throw new Error(`Automation schedule poller ${field} must be ${min}-${max}`);
  return value;
}
