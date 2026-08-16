/** Configuration shared by external provider transports. */
export interface ProviderConfig {
  readonly enabled: boolean;
  readonly timeoutMs: number;
  readonly retryCount: number;
}

/** Safe provider defaults. Secrets and legacy platform configuration do not belong here. */
export const providerConfig: Readonly<Record<string, ProviderConfig>> = Object.freeze({
  default: Object.freeze({ enabled: true, timeoutMs: 30_000, retryCount: 2 }),
});

