/** Typed provider runtime failure with retryability metadata. */
export class ProviderExecutionError extends Error {
  constructor(readonly providerId: string, message: string, readonly retryable = true, readonly cause?: unknown) { super(message); this.name = 'ProviderExecutionError'; }
}
export class ProviderUnavailableError extends ProviderExecutionError {
  constructor(providerId: string) { super(providerId, `Provider "${providerId}" is unavailable.`, false); this.name = 'ProviderUnavailableError'; }
}
