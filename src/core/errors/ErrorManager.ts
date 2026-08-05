import { AppError } from './AppError';
import type { ErrorReporter } from './ErrorReporter';
import type { RecoveryStrategy } from './RecoveryStrategy';

/** Coordinates normalization, reporting, and optional error recovery. */
export class ErrorManager {
  constructor(private readonly reporter: ErrorReporter, private readonly strategies: readonly RecoveryStrategy[] = []) {}
  /** Normalizes, reports, and attempts recovery for an unknown failure. */
  async handle(error: unknown, source = 'core'): Promise<AppError> {
    const managed = error instanceof AppError ? error : new AppError('UNEXPECTED_ERROR', error instanceof Error ? error.message : String(error), { cause: error, source });
    await this.reporter.report(managed);
    if (managed.recoverable) {
      const strategy = this.strategies.find((candidate) => candidate.canRecover(managed));
      if (strategy) await strategy.recover(managed);
    }
    return managed;
  }
}
