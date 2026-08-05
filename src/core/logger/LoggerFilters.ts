import type { LogEntry, LogFilter, LogLevel } from './types';
const rank: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };
/** Common filters for logger pipelines. */
export class LoggerFilters {
  /** Accepts records at or above the requested level. */
  static minimumLevel(level: LogLevel): LogFilter { return { accepts: (entry: LogEntry) => rank[entry.level] >= rank[level] }; }
  /** Accepts records containing a requested tag. */
  static tag(tag: string): LogFilter { return { accepts: (entry: LogEntry) => entry.tags.includes(tag) }; }
}
