/** Bounded retry configuration applied by ProviderExecutor. */
export interface ProviderRetryPolicy { readonly maxRetries: number; readonly backoffMs: number; readonly retryTimeouts: boolean; }
export const DEFAULT_PROVIDER_RETRY_POLICY: ProviderRetryPolicy = Object.freeze({ maxRetries: 2, backoffMs: 250, retryTimeouts: true });
