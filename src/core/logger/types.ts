/** Supported logger severity levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
/** Structured log record passed to transports. */
export interface LogEntry { readonly level: LogLevel; readonly message: string; readonly timestamp: string; readonly scope?: string; readonly tags: readonly string[]; readonly context?: Readonly<Record<string, unknown>>; readonly durationMs?: number; readonly group?: string; }
/** Output adapter implemented by console, memory, or remote transports. */
export interface LogTransport { write(entry: LogEntry): void | Promise<void>; }
/** Foundation compatibility alias for logger transports. */
export type LogSink = LogTransport;
/** Filtering policy for log records. */
export interface LogFilter { accepts(entry: LogEntry): boolean; }
