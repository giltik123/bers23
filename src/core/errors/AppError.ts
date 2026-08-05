import type { ErrorCode } from './ErrorCodes';

/** Severity levels shared by all core application errors. */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';
/** Structured metadata attached to an application error. */
export type ErrorMetadata = Readonly<Record<string, unknown>>;
/** Options accepted by every application error. */
export interface AppErrorOptions { severity?: ErrorSeverity; metadata?: ErrorMetadata; cause?: unknown; source?: string; recoverable?: boolean; }

/** Base error carrying complete, stable diagnostics. */
export class AppError extends Error {
  readonly id: string = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
  readonly timestamp = new Date().toISOString();
  readonly severity: ErrorSeverity;
  readonly metadata?: ErrorMetadata;
  readonly source: string;
  readonly recoverable: boolean;
  declare readonly stack?: string;

  constructor(readonly code: ErrorCode, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.severity = options.severity ?? 'medium';
    this.metadata = options.metadata;
    this.source = options.source ?? 'core';
    this.recoverable = options.recoverable ?? false;
  }
}
