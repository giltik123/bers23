import type { LogEntry, LogTransport } from './types';
/** In-memory transport useful for diagnostics and tests. */
export class MemoryTransport implements LogTransport {
  private readonly records: LogEntry[] = [];
  constructor(private readonly capacity = 1_000) {}
  /** Retains a bounded log record. */
  write(entry: LogEntry): void { this.records.push(entry); if (this.records.length > this.capacity) this.records.shift(); }
  /** Returns a snapshot of retained records. */
  entries(): readonly LogEntry[] { return [...this.records]; }
  /** Removes all retained records. */
  clear(): void { this.records.length = 0; }
}
