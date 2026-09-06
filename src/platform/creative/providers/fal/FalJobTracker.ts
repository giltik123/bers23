import { FalErrorMapper } from './FalErrorMapper';
import type { ProviderRuntimeDependencies } from './types';

export class FalJobTracker {
  constructor(private readonly dependencies: ProviderRuntimeDependencies, private readonly errors = new FalErrorMapper()) {}
  async wait(job: { requestId: string; statusUrl?: string; responseUrl?: string }, deadline: number, onPoll?: (response: unknown) => void, signal: AbortSignal = new AbortController().signal): Promise<{ response: unknown; polls: number; retries: number }> {
    const base = this.dependencies.api.baseUrl!; let polls = 0; let retries = 0;
    const statusUrl = job.statusUrl ?? `${base}/requests/${encodeURIComponent(job.requestId)}/status`; const responseUrl = job.responseUrl ?? `${base}/requests/${encodeURIComponent(job.requestId)}`;
    while (this.dependencies.clock() < deadline) {
      throwIfCancelled(signal);
      await this.dependencies.sleep(this.dependencies.api.pollIntervalMs ?? 500);
      throwIfCancelled(signal);
      polls += 1;
      const status = await this.request(statusUrl, deadline, () => { retries += 1; }, signal); onPoll?.(status);
      const state = String((status as Record<string, unknown>)?.status ?? '').toUpperCase();
      if (['COMPLETED', 'SUCCEEDED', 'OK'].includes(state)) return { response: await this.request(responseUrl, deadline, () => { retries += 1; }, signal), polls, retries };
      if (['FAILED', 'ERROR', 'CANCELLED'].includes(state)) throw this.errors.map(undefined, status);
    }
    throw this.errors.map(408);
  }
  private async request(url: string, deadline: number, retried: () => void, signal: AbortSignal): Promise<unknown> {
    const max = this.dependencies.api.maxRetries ?? 2;
    for (let attempt = 0; ; attempt += 1) try {
      throwIfCancelled(signal);
      if (this.dependencies.clock() >= deadline) throw this.errors.map(408);
      const response = await this.dependencies.transport.send({ url, method: 'GET', headers: { Authorization: `Key ${this.dependencies.api.apiKey}` }, timeoutMs: Math.max(1, deadline - this.dependencies.clock()) }, signal);
      throwIfCancelled(signal);
      const body = response.body; if (response.status >= 200 && response.status < 300) return body;
      const error = this.errors.map(response.status, body); if (!error.retryable || attempt >= max) throw error;
      retried(); await this.dependencies.sleep(Math.min(1000, 100 * 2 ** attempt) + Math.floor(this.dependencies.random() * 10)); throwIfCancelled(signal);
    } catch (cause) {
      if (signal.aborted) throw cancellationReason(signal);
      const error = cause instanceof Error && 'category' in cause ? cause as ReturnType<FalErrorMapper['map']> : this.errors.map(undefined, undefined, cause); if (!error.retryable || attempt >= max) throw error; retried(); await this.dependencies.sleep(Math.min(1000, 100 * 2 ** attempt)); throwIfCancelled(signal);
    }
  }
}

function throwIfCancelled(signal: AbortSignal): void { if (signal.aborted) throw cancellationReason(signal); }
function cancellationReason(signal: AbortSignal): Error { return signal.reason instanceof Error ? signal.reason : new DOMException('Creative execution cancelled', 'AbortError'); }
