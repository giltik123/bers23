/** Transport-neutral provider platform contracts. Network I/O is implemented by provider-runtime. */
export interface ProviderScope { readonly tenantId: string; readonly projectId: string; readonly userId: string }
export interface ProviderArtifact { readonly id: string; readonly kind: 'image' | 'mask' | 'segmentation' | 'metadata' | 'preview'; readonly format: string; readonly uri?: string; readonly data?: unknown; readonly metadata: Readonly<Record<string, unknown>> }
export interface ProviderRequest { readonly operation: string; readonly scope: ProviderScope; readonly input?: unknown; readonly options?: Readonly<Record<string, unknown>> }
export interface ProviderResult { readonly status: 'SUCCESS' | 'FAILED' | 'CANCELLED'; readonly artifacts: readonly ProviderArtifact[]; readonly metrics: Readonly<Record<string, number>>; readonly credits: number; readonly latency: number; readonly quality: number; readonly warnings: readonly string[] }
export interface ProviderRetryPolicy { readonly retries: number; readonly backoffMs: number; readonly timeoutMs: number; readonly circuitBreaker: Readonly<{ failureThreshold: number; resetAfterMs: number }> }
export interface ProviderTransportRequest { readonly url: string; readonly method: 'GET' | 'POST'; readonly headers: Readonly<Record<string, string>>; readonly body?: string | Uint8Array; readonly timeoutMs: number }
export interface ProviderTransportResponse { readonly status: number; readonly headers: Readonly<Record<string, string>>; readonly body: unknown; readonly bytes?: Uint8Array }
export interface ProviderTransport {
  send(request: ProviderTransportRequest, signal: AbortSignal): Promise<ProviderTransportResponse>;
  cancel?(requestId: string): Promise<boolean> | boolean;
  health?(): Promise<'ONLINE' | 'OFFLINE' | 'DEGRADED'> | 'ONLINE' | 'OFFLINE' | 'DEGRADED';
}
export interface DownloadedProviderArtifact { readonly url: string; readonly mimeType: string; readonly size: number; readonly hash: string; readonly bytes?: Uint8Array }
export interface ProviderArtifactLoader { load(url: string, options: Readonly<{ maxBytes: number; allowedMimeTypes: readonly string[] }>, signal?: AbortSignal): Promise<DownloadedProviderArtifact> }

export interface RegisteredProviderAdapter<Request = unknown, Result = unknown> { readonly name: string; supports(capability: string): boolean; execute(request: Request): Promise<Result> }
export class ProviderAdapterRegistry {
  readonly #providers = new Map<string, RegisteredProviderAdapter>();
  registerProvider(provider: RegisteredProviderAdapter): void { if (this.#providers.has(provider.name)) throw new Error(`Provider already registered: ${provider.name}`); this.#providers.set(provider.name, provider); }
  provider(name: string): RegisteredProviderAdapter | undefined { return this.#providers.get(name); }
  resolve(capability: string): RegisteredProviderAdapter { const provider = [...this.#providers.values()].find(candidate => candidate.supports(capability)); if (!provider) throw new Error(`No provider supports ${capability}`); return provider; }
}
