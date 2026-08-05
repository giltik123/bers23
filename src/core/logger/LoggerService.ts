import type { LogEntry, LogFilter, LogLevel, LogTransport } from './types';

/** Options inherited by child loggers. */
export interface LoggerOptions { scope?: string; tags?: readonly string[]; group?: string; }
/** Performance timer returned by a logger. */
export interface PerformanceTimer { end(message?: string, context?: Readonly<Record<string, unknown>>): number; }

/** Scoped structured logger with injectable transports and filtering. */
export class LoggerService {
  constructor(private readonly transports: readonly LogTransport[], private readonly filters: readonly LogFilter[] = [], private readonly options: LoggerOptions = {}) {}
  /** Writes a debug diagnostic. */ debug(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('debug', message, context); }
  /** Writes informational telemetry. */ info(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('info', message, context); }
  /** Writes a recoverable warning. */ warn(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('warn', message, context); }
  /** Writes an error diagnostic. */ error(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('error', message, context); }
  /** Measures and logs execution time for an asynchronous operation. */
  async time<T>(label: string, operation: () => Promise<T>): Promise<T> { const timer = this.startTimer(label); try { return await operation(); } finally { timer.end(); } }
  /** Starts a manually completed performance timer. */
  startTimer(label: string): PerformanceTimer { const start = performance.now(); return { end: (message = label, context) => { const durationMs = performance.now() - start; this.write('info', message, context, durationMs); return durationMs; } }; }
  /** Creates a child logger inheriting transports and filters. */
  child(options: LoggerOptions): LoggerService { return new LoggerService(this.transports, this.filters, { scope: options.scope ?? this.options.scope, tags: [...(this.options.tags ?? []), ...(options.tags ?? [])], group: options.group ?? this.options.group }); }
  /** Creates a child logger assigned to a named group. */
  group(name: string): LoggerService { return this.child({ group: name }); }
  private write(level: LogLevel, message: string, context?: Readonly<Record<string, unknown>>, durationMs?: number): void {
    const entry: LogEntry = { level, message, context, durationMs, timestamp: new Date().toISOString(), scope: this.options.scope, tags: this.options.tags ?? [], group: this.options.group };
    if (this.filters.every((filter) => filter.accepts(entry))) for (const transport of this.transports) void transport.write(entry);
  }
}
