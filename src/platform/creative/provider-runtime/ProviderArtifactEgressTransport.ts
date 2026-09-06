import type { ProviderTransport, ProviderTransportRequest, ProviderTransportResponse } from '../provider-platform/contracts';

export type ProviderArtifactEgressPolicy = Readonly<{
  allowedHosts: readonly string[];
  maxRedirects?: number;
}>;

type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * GET-only egress transport for provider-generated artifact URLs.
 * Every destination, including every redirect hop, is admitted before a request is sent.
 */
export class ProviderArtifactEgressTransport implements ProviderTransport {
  readonly #allowedHosts: ReadonlySet<string>;
  readonly #maxRedirects: number;

  constructor(private readonly fetcher: FetchLike, policy: ProviderArtifactEgressPolicy) {
    const hosts = policy.allowedHosts.map(host => host.trim().toLowerCase());
    if (!hosts.length || hosts.some(host => !validPolicyHost(host))) throw new Error('Provider artifact egress policy requires valid exact hosts');
    if (new Set(hosts).size !== hosts.length) throw new Error('Provider artifact egress policy contains duplicate hosts');
    const maxRedirects = policy.maxRedirects ?? 4;
    if (!Number.isInteger(maxRedirects) || maxRedirects < 0 || maxRedirects > 10) throw new Error('Provider artifact redirect limit is invalid');
    this.#allowedHosts = new Set(hosts);
    this.#maxRedirects = maxRedirects;
  }

  async send(request: ProviderTransportRequest, signal: AbortSignal): Promise<ProviderTransportResponse> {
    if (request.method !== 'GET') throw new Error('Provider artifact egress transport is GET-only');
    if (!Number.isFinite(request.timeoutMs) || request.timeoutMs <= 0) throw new Error('Provider artifact timeout is invalid');
    if (signal.aborted) throw abortReason(signal);
    let current = this.#admit(request.url);
    const visited = new Set<string>();
    const deadline = Date.now() + request.timeoutMs;

    for (let redirects = 0; ; redirects += 1) {
      if (visited.has(current.href)) throw new Error('Provider artifact redirect loop blocked');
      visited.add(current.href);
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) throw new DOMException('Provider artifact download timed out', 'TimeoutError');
      const response = await this.#request(current, request.headers, remainingMs, signal);
      if (!REDIRECT_STATUSES.has(response.status)) return response;
      if (redirects >= this.#maxRedirects) throw new Error('Provider artifact redirect limit exceeded');
      const location = response.headers.location;
      if (!location) throw new Error('Provider artifact redirect location is missing');
      let next: URL;
      try { next = new URL(location, current); } catch { throw new Error('Provider artifact redirect location is invalid'); }
      current = this.#admit(next.href);
    }
  }

  #admit(value: string): URL {
    let url: URL;
    try { url = new URL(value); } catch { throw new Error('Provider artifact URL is invalid'); }
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !this.#allowedHosts.has(hostname)) throw new Error('Provider artifact destination is not allowed');
    return url;
  }

  async #request(url: URL, headersInput: Readonly<Record<string, string>>, timeoutMs: number, parentSignal: AbortSignal): Promise<ProviderTransportResponse> {
    if (parentSignal.aborted) throw abortReason(parentSignal);
    const controller = new AbortController();
    const relay = () => controller.abort(parentSignal.reason);
    parentSignal.addEventListener('abort', relay, { once: true });
    const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeoutMs);
    try {
      const response = await this.fetcher(url.href, { method: 'GET', headers: { ...headersInput }, signal: controller.signal, redirect: 'manual' });
      const headers: Record<string, string> = {};
      response.headers.forEach((headerValue, key) => { headers[key] = headerValue; });
      if (REDIRECT_STATUSES.has(response.status)) return Object.freeze({ status: response.status, headers: Object.freeze(headers), body: Object.freeze({}) });
      const bytes = new Uint8Array(await response.arrayBuffer());
      return Object.freeze({ status: response.status, headers: Object.freeze(headers), body: Object.freeze({}), bytes });
    } finally {
      clearTimeout(timer);
      parentSignal.removeEventListener('abort', relay);
    }
  }
}

function abortReason(signal: AbortSignal): Error { return signal.reason instanceof Error ? signal.reason : new DOMException('Provider artifact request cancelled', 'AbortError'); }
function validPolicyHost(host: string): boolean {
  if (!host || host === 'localhost' || host.includes(':') || /^\d+(?:\.\d+){3}$/.test(host)) return false;
  return /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(host);
}
