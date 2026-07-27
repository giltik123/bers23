/** Severity levels shared by all core application errors. */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/** Structured metadata attached to an application error. */
export type ErrorMetadata = Readonly<Record<string, unknown>>;

/** Options accepted by every application error. */
export interface AppErrorOptions {
  severity?: ErrorSeverity;
  metadata?: ErrorMetadata;
  cause?: unknown;
}

/** Base error carrying stable machine-readable diagnostics. */
export class AppError extends Error {
  readonly code: string;
  readonly severity: ErrorSeverity;
  readonly timestamp: string;
  readonly metadata?: ErrorMetadata;

  constructor(code: string, message: string, options: AppErrorOptions = {}) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.severity = options.severity ?? 'medium';
    this.timestamp = new Date().toISOString();
    this.metadata = options.metadata;
  }
}

/** Signals invalid user or application input. */
export class ValidationError extends AppError {
  constructor(message: string, options?: AppErrorOptions) { super('VALIDATION_ERROR', message, options); }
}

/** Signals a failure returned by an external AI provider. */
export class ProviderError extends AppError {
  constructor(message: string, options?: AppErrorOptions) { super('PROVIDER_ERROR', message, options); }
}

/** Signals persistence read or write failures. */
export class StorageError extends AppError {
  constructor(message: string, options?: AppErrorOptions) { super('STORAGE_ERROR', message, options); }
}

/** Signals transport and connectivity failures. */
export class NetworkError extends AppError {
  constructor(message: string, options?: AppErrorOptions) { super('NETWORK_ERROR', message, options); }
}

/** Signals missing or invalid authentication. */
export class AuthenticationError extends AppError {
  constructor(message: string, options?: AppErrorOptions) { super('AUTHENTICATION_ERROR', message, options); }
}

/** Signals invalid or incomplete application configuration. */
export class ConfigurationError extends AppError {
  constructor(message: string, options?: AppErrorOptions) { super('CONFIGURATION_ERROR', message, options); }
}

