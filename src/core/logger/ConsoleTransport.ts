import type { LogEntry, LogTransport } from './types';
/** Console-backed logger transport. */
export class ConsoleTransport implements LogTransport {
  /** Writes one record to its matching console method. */
  write(entry: LogEntry): void { console[entry.level](`[${entry.timestamp}]${entry.scope ? ` [${entry.scope}]` : ''} ${entry.message}`, entry.context ?? ''); }
}
/** Foundation compatibility alias. */
export { ConsoleTransport as ConsoleLogSink };
