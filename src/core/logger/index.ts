/** Supported logger severity levels. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** Structured log record passed to logger sinks. */
export interface LogEntry {
  readonly level: LogLevel;
  readonly message: string;
  readonly timestamp: string;
  readonly context?: Readonly<Record<string, unknown>>;
}

/** Output adapter implemented by console, file, or remote transports. */
export interface LogSink {
  write(entry: LogEntry): void | Promise<void>;
}

/** Console-backed sink used by the foundation layer. */
export class ConsoleLogSink implements LogSink {
  write(entry: LogEntry): void {
    const method = entry.level === 'debug' ? 'debug' : entry.level;
    console[method](`[${entry.timestamp}] ${entry.message}`, entry.context ?? '');
  }
}

/** Fan-out logger that can accept additional sinks without changing callers. */
export class LoggerService {
  private readonly sinks = new Set<LogSink>();

  constructor(sinks: Iterable<LogSink> = [new ConsoleLogSink()]) {
    for (const sink of sinks) this.sinks.add(sink);
  }

  /** Registers an output sink and returns a disposer. */
  addSink(sink: LogSink): () => void {
    this.sinks.add(sink);
    return () => { this.sinks.delete(sink); };
  }

  /** Writes a debug diagnostic. */
  debug(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('debug', message, context); }
  /** Writes informational telemetry. */
  info(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('info', message, context); }
  /** Writes a recoverable warning. */
  warn(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('warn', message, context); }
  /** Writes an error diagnostic. */
  error(message: string, context?: Readonly<Record<string, unknown>>): void { this.write('error', message, context); }

  private write(level: LogLevel, message: string, context?: Readonly<Record<string, unknown>>): void {
    const entry: LogEntry = { level, message, timestamp: new Date().toISOString(), context };
    for (const sink of this.sinks) void sink.write(entry);
  }
}

/** Default core logger instance. */
export const logger = new LoggerService();

