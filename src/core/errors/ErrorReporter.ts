import type { AppError } from './AppError';

/** Provider-neutral destination for managed errors. */
export interface ErrorReportAdapter { report(error: AppError): void | Promise<void>; }
/** Dispatches errors to injected reporting adapters. */
export class ErrorReporter {
  constructor(private readonly adapters: readonly ErrorReportAdapter[] = []) {}
  /** Reports an error without imposing a remote provider. */
  async report(error: AppError): Promise<void> { await Promise.all(this.adapters.map((adapter) => adapter.report(error))); }
}
