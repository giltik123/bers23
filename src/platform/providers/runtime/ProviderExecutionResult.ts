/** Normalized usage signals used by billing and optimization. */
export interface ProviderUsage { readonly tokens?: number; readonly images?: number; }
/** Successful provider-neutral execution result. Failures are typed exceptions. */
export interface ProviderExecutionResult<Output = unknown> {
  readonly success: true; readonly output: Output; readonly cost: number; readonly duration: number;
  readonly metadata: Readonly<Record<string, unknown>>; readonly usage: ProviderUsage; readonly retryCount: number;
}
