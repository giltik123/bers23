import { RecoveryService } from './recoveryService.ts';
import { NOOP_TRANSACTION_TELEMETRY, type TransactionTelemetry } from './telemetry.ts';

export type RecoveryWorkerOptions = Readonly<{
  intervalMs?: number;
  batchSize?: number;
}>;

/** Single-process scheduler; database recovery leases provide cross-worker exclusion. */
export class RecoveryWorker {
  private readonly recovery: RecoveryService;
  private readonly telemetry: TransactionTelemetry;
  private readonly intervalMs: number;
  private readonly batchSize: number;
  private timer?: ReturnType<typeof setTimeout>;
  private active?: Promise<void>;
  private stopped = true;

  constructor(
    recovery: RecoveryService,
    telemetry: TransactionTelemetry = NOOP_TRANSACTION_TELEMETRY,
    options: RecoveryWorkerOptions = {},
  ) {
    this.recovery = recovery;
    this.telemetry = telemetry;
    this.intervalMs = options.intervalMs ?? 30_000;
    this.batchSize = options.batchSize ?? 25;
    requireInteger('intervalMs', this.intervalMs, 1_000, 300_000);
    requireInteger('batchSize', this.batchSize, 1, 100);
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.schedule(0);
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    await this.active;
  }

  async runOnce(): Promise<void> {
    if (this.active) return this.active;
    const started = Date.now();
    this.active = this.recovery.runBatch(this.batchSize).then((result) => {
      this.record({ outcome: 'completed', count: result.resolved + result.deferred,
        resolved: result.resolved, deferred: result.deferred, duration_ms: Date.now() - started });
    }).catch((error: unknown) => {
      this.record({ outcome: 'failed', duration_ms: Date.now() - started });
      throw error;
    }).finally(() => { this.active = undefined; });
    return this.active;
  }

  private schedule(delay: number): void {
    this.timer = setTimeout(() => {
      void this.runOnce().catch(() => {}).finally(() => {
        if (!this.stopped) this.schedule(this.intervalMs);
      });
    }, delay);
  }

  private record(fields: { outcome: string; count?: number; resolved?: number; deferred?: number; duration_ms: number }): void {
    try {
      this.telemetry.record({ name: 'recovery_batch', occurred_at: new Date().toISOString(), ...fields });
    } catch {
      // Recovery correctness cannot depend on the telemetry backend.
    }
  }
}

function requireInteger(name: string, value: number, minimum: number, maximum: number): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${name} must be between ${minimum} and ${maximum}`);
  }
}
