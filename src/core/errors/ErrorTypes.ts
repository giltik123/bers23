import { AppError, type AppErrorOptions } from './AppError';
import { ErrorCodes } from './ErrorCodes';

/** Creates a concrete application error class with a stable code. */
function typedError(code: string) {
  return class extends AppError { constructor(message: string, options?: AppErrorOptions) { super(code, message, options); } };
}
/** External-provider failure. */
export class ProviderError extends typedError(ErrorCodes.PROVIDER) {}
/** Editing or image pipeline failure. */
export class PipelineError extends typedError(ErrorCodes.PIPELINE) {}
/** AI planner failure. */
export class PlannerError extends typedError(ErrorCodes.PLANNER) {}
/** Invalid input failure. */
export class ValidationError extends typedError(ErrorCodes.VALIDATION) {}
/** Persistence failure. */
export class StorageError extends typedError(ErrorCodes.STORAGE) {}
/** User-interface failure. */
export class UIError extends typedError(ErrorCodes.UI) {}
/** Invalid configuration failure. */
export class ConfigurationError extends typedError(ErrorCodes.CONFIGURATION) {}
/** Authentication failure. */
export class AuthenticationError extends typedError(ErrorCodes.AUTHENTICATION) {}
/** Network transport failure retained for Foundation compatibility. */
export class NetworkError extends typedError(ErrorCodes.NETWORK) {}
