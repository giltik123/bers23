import { ProviderExecutionError } from './ProviderError';
export class ProviderTimeoutError extends ProviderExecutionError {
  constructor(providerId: string, readonly timeoutMs: number) { super(providerId, `Provider "${providerId}" timed out after ${timeoutMs}ms.`, true); this.name = 'ProviderTimeoutError'; }
}
