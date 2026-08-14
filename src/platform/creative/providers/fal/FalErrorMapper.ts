import type { ProviderErrorCategory } from './types';

export class FalProviderError extends Error { constructor(readonly category: ProviderErrorCategory, message: string, readonly retryable: boolean, readonly status?: number) { super(message); this.name = 'FalProviderError'; } }
export class FalErrorMapper {
  category(status?: number, cause?: unknown): ProviderErrorCategory {
    if (cause instanceof FalProviderError) return cause.category;
    if (cause instanceof DOMException && cause.name === 'AbortError') return 'timeout';
    if (status === 401 || status === 403) return 'authentication'; if (status === 400 || status === 404 || status === 422) return 'validation';
    if (status === 408 || status === 504) return 'timeout'; if (status === 429) return 'rate limit'; if (status === 502 || status === 503) return 'provider unavailable'; if (status && status >= 500) return 'internal provider error'; return 'unknown';
  }
  map(status?: number, body?: unknown, cause?: unknown): FalProviderError {
    const category = this.category(status, cause); const raw = body && typeof body === 'object' ? (body as Record<string, unknown>).detail ?? (body as Record<string, unknown>).message : undefined;
    const message = typeof raw === 'string' && raw ? raw : `Fal request failed (${category})`;
    return new FalProviderError(category, message, ['timeout', 'rate limit', 'provider unavailable', 'internal provider error'].includes(category), status);
  }
}
