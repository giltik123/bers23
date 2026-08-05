import type { ProviderRetryPolicy } from './ProviderRetryPolicy';

/** Provider-neutral request created by workers for one capability invocation. */
export interface ProviderExecutionContext<Input = unknown> {
  readonly capability: string;
  readonly input: Input;
  readonly context: Readonly<Record<string, unknown>>;
  readonly timeout: number;
  readonly retryPolicy: ProviderRetryPolicy;
  readonly signal?: AbortSignal;
}
