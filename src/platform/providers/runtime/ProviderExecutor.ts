import type { ProviderExecutionContext } from './ProviderExecutionContext';
import type { ProviderExecutionResult, ProviderUsage } from './ProviderExecutionResult';
import { ProviderExecutionError } from './ProviderError';
import { ProviderTimeoutError } from './ProviderTimeout';

/** Adapter implemented by a concrete provider integration outside Platform. */
export interface ProviderAdapter { execute<Input, Output>(request: ProviderExecutionContext<Input>): Promise<{ readonly output: Output; readonly cost?: number; readonly metadata?: Readonly<Record<string, unknown>>; readonly usage?: ProviderUsage }>; }

/** Adds timeout, cancellation, retry, timing, and normalization around an adapter. */
export class ProviderExecutor {
  constructor(readonly id: string, readonly capabilities: readonly string[], private readonly adapter: ProviderAdapter) {}
  async execute<Input = unknown, Output = unknown>(request: ProviderExecutionContext<Input>): Promise<ProviderExecutionResult<Output>> {
    const started = performance.now(); let lastError: unknown;
    for (let retryCount = 0; retryCount <= request.retryPolicy.maxRetries; retryCount += 1) {
      try {
        const attemptController = new AbortController();
        const cancelAttempt = () => attemptController.abort();
        request.signal?.addEventListener('abort', cancelAttempt, { once: true });
        const operation = this.adapter.execute<Input, Output>({ ...request, signal: attemptController.signal });
        const response = await withTimeout(operation, request.timeout, request.signal, this.id, cancelAttempt).finally(() => request.signal?.removeEventListener('abort', cancelAttempt));
        return Object.freeze({ success: true, output: response.output, cost: response.cost ?? 0, duration: performance.now() - started, metadata: Object.freeze({ ...(response.metadata ?? {}) }), usage: Object.freeze({ ...(response.usage ?? {}) }), retryCount });
      } catch (error) {
        lastError = error;
        const retryable = error instanceof ProviderExecutionError ? error.retryable : true;
        const timeoutAllowed = !(error instanceof ProviderTimeoutError) || request.retryPolicy.retryTimeouts;
        if (retryCount >= request.retryPolicy.maxRetries || !retryable || !timeoutAllowed || request.signal?.aborted) break;
        await delay(request.retryPolicy.backoffMs * (retryCount + 1), request.signal);
      }
    }
    if (lastError instanceof ProviderExecutionError) throw lastError;
    throw new ProviderExecutionError(this.id, lastError instanceof Error ? lastError.message : String(lastError), true, lastError);
  }
}

async function withTimeout<T>(operation: Promise<T>, timeoutMs: number, signal: AbortSignal | undefined, providerId: string, cancelOperation: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined; let abort = () => undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => { cancelOperation(); reject(new ProviderTimeoutError(providerId, timeoutMs)); }, timeoutMs); });
  const cancelled = new Promise<never>((_, reject) => { if (!signal) return; const listener = () => reject(new ProviderExecutionError(providerId, 'Provider execution cancelled.', false)); abort = () => signal.removeEventListener('abort', listener); signal.addEventListener('abort', listener, { once: true }); if (signal.aborted) listener(); });
  try { return await Promise.race([operation, timeout, cancelled]); } finally { if (timer) clearTimeout(timer); abort(); void operation.catch(() => undefined); }
}
async function delay(ms: number, signal?: AbortSignal): Promise<void> { await new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener('abort', () => { clearTimeout(timer); reject(new Error('Retry cancelled.')); }, { once: true }); }); }
