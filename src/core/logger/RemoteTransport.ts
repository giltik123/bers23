import type { LogEntry, LogTransport } from './types';
/** Inert future remote-analytics transport. */
export class RemoteTransport implements LogTransport { /** Accepts a record without sending it. */ write(_entry: LogEntry): void {} }
