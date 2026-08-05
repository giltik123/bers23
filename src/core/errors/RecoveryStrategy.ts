import type { AppError } from './AppError';

/** Strategy capable of recovering from a class of errors. */
export interface RecoveryStrategy { canRecover(error: AppError): boolean; recover(error: AppError): void | Promise<void>; }
