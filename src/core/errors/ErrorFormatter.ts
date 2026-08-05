import type { AppError } from './AppError';

/** Converts structured application errors to safe serializable records. */
export class ErrorFormatter {
  /** Formats an error for logging or reporting. */
  format(error: AppError): Readonly<Record<string, unknown>> {
    return { id: error.id, code: error.code, message: error.message, severity: error.severity, timestamp: error.timestamp,
      source: error.source, stack: error.stack, metadata: error.metadata, recoverable: error.recoverable };
  }
}
