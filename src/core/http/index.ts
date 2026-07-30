/** HTTP methods supported by HttpClient. */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/** Request options shared by all HTTP methods. */
export interface HttpRequestOptions {
  headers?: HeadersInit;
  timeoutMs?: number;
  retries?: number;
  retryDelayMs?: number;
  signal?: AbortSignal;
}

/** Complete request passed through request interceptors. */
export interface HttpRequest extends HttpRequestOptions {
  url: string;
  method: HttpMethod;
  body?: unknown;
}

/** Normalized HTTP result. */
export interface HttpResponse<T> {
  readonly data: T;
  readonly status: number;
  readonly headers: Headers;
  readonly request: HttpRequest;
}

/** Request interceptor contract. */
export type RequestInterceptor = (request: HttpRequest) => HttpRequest | Promise<HttpRequest>;

/** Response interceptor contract. */
export type ResponseInterceptor = <T>(response: HttpResponse<T>) => HttpResponse<T> | Promise<HttpResponse<T>>;

/** Error raised for non-successful HTTP responses. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly response: HttpResponse<unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/** Fetch-based HTTP client with timeout, cancellation, retry, and interceptors. */
export class HttpClient {
  private readonly requestInterceptors = new Set<RequestInterceptor>();
  private readonly responseInterceptors = new Set<ResponseInterceptor>();

  constructor(private readonly baseUrl = '', private readonly defaults: HttpRequestOptions = {}) {}

  /** Registers a request interceptor and returns its disposer. */
  addRequestInterceptor(interceptor: RequestInterceptor): () => void {
    this.requestInterceptors.add(interceptor);
    return () => { this.requestInterceptors.delete(interceptor); };
  }

  /** Registers a response interceptor and returns its disposer. */
  addResponseInterceptor(interceptor: ResponseInterceptor): () => void {
    this.responseInterceptors.add(interceptor);
    return () => { this.responseInterceptors.delete(interceptor); };
  }

  /** Performs a GET request. */
  get<T>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'GET' });
  }

  /** Performs a POST request. */
  post<T>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'POST', body });
  }

  /** Performs a PUT request. */
  put<T>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'PUT', body });
  }

  /** Performs a PATCH request. */
  patch<T>(url: string, body?: unknown, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'PATCH', body });
  }

  /** Performs a DELETE request. */
  delete<T>(url: string, options?: HttpRequestOptions): Promise<HttpResponse<T>> {
    return this.request<T>({ ...options, url, method: 'DELETE' });
  }

  /** Performs an HTTP request after applying registered interceptors. */
  async request<T>(initialRequest: HttpRequest): Promise<HttpResponse<T>> {
    let request = this.mergeDefaults(initialRequest);
    for (const interceptor of this.requestInterceptors) request = await interceptor(request);

    const retries = Math.max(0, request.retries ?? 0);
    for (let attempt = 0; ; attempt += 1) {
      try {
        let response = await this.execute<T>(request);
        for (const interceptor of this.responseInterceptors) response = await interceptor(response);
        return response;
      } catch (error) {
        if (attempt >= retries || !this.isRetryable(error) || request.signal?.aborted) throw error;
        await new Promise((resolve) => setTimeout(resolve, (request.retryDelayMs ?? 250) * 2 ** attempt));
      }
    }
  }

  private mergeDefaults(request: HttpRequest): HttpRequest {
    return {
      ...this.defaults,
      ...request,
      url: this.baseUrl ? new URL(request.url, this.baseUrl).toString() : request.url,
      headers: { ...this.headersToRecord(this.defaults.headers), ...this.headersToRecord(request.headers) },
    };
  }

  private async execute<T>(request: HttpRequest): Promise<HttpResponse<T>> {
    const controller = new AbortController();
    const abort = () => controller.abort(request.signal?.reason);
    request.signal?.addEventListener('abort', abort, { once: true });
    const timeout = setTimeout(() => controller.abort(new DOMException('Request timed out', 'TimeoutError')), request.timeoutMs ?? 30_000);
    try {
      const headers = new Headers(request.headers);
      const body = this.serializeBody(request.body, headers);
      const raw = await fetch(request.url, { method: request.method, headers, body, signal: controller.signal });
      const data = await this.parseBody(raw) as T;
      const response: HttpResponse<T> = { data, status: raw.status, headers: raw.headers, request };
      if (!raw.ok) throw new HttpError(`HTTP request failed with status ${raw.status}`, raw.status, response as HttpResponse<unknown>);
      return response;
    } finally {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', abort);
    }
  }

  private serializeBody(body: unknown, headers: Headers): BodyInit | undefined {
    if (body === undefined || body === null) return undefined;
    if (typeof body === 'string' || body instanceof Blob || body instanceof FormData || body instanceof URLSearchParams || body instanceof ArrayBuffer) return body;
    if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
    return JSON.stringify(body);
  }

  private async parseBody(response: Response): Promise<unknown> {
    if (response.status === 204) return null;
    return response.headers.get('Content-Type')?.includes('application/json') ? response.json() : response.text();
  }

  private isRetryable(error: unknown): boolean {
    return !(error instanceof HttpError) || error.status === 429 || error.status >= 500;
  }

  private headersToRecord(headers?: HeadersInit): Record<string, string> {
    const record: Record<string, string> = {};
    new Headers(headers).forEach((value, key) => { record[key] = value; });
    return record;
  }
}
