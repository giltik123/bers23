import type { LogEntry } from './types';
/** Formats log records for text transports. */
export class LoggerFormatter { /** Produces a stable one-line representation. */ format(entry: LogEntry): string { return `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.scope ? ` [${entry.scope}]` : ''} ${entry.message}`; } }
