/** Cross-cutting technical limits for core infrastructure. */
export interface LimitsConfig {
  readonly httpTimeoutMs: number;
  readonly httpRetryCount: number;
  readonly storageKeyLength: number;
}

/** Conservative defaults that may be overridden by future application adapters. */
export const limitsConfig: LimitsConfig = Object.freeze({
  httpTimeoutMs: 30_000,
  httpRetryCount: 2,
  storageKeyLength: 256,
});

