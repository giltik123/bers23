import type { ProviderArtifactLoader, ProviderTransport } from '../../provider-platform';

export type FalCapability = 'image-edit' | 'background-remove' | 'segmentation' | 'upscale' | 'inpaint' | 'outpaint' | 'try-on';

export interface ProviderScope { readonly tenantId: string; readonly projectId: string; readonly userId: string }
export interface ProviderRequest { readonly id?: string; readonly scope: ProviderScope; readonly capability: FalCapability | string; readonly prompt?: string; readonly inputs?: Readonly<Record<string, unknown>>; readonly imageUrl?: string; readonly maskUrl?: string; readonly timeoutMs?: number; readonly metadata?: Readonly<Record<string, unknown>> }
export interface ProviderArtifact { readonly url: string; readonly mimeType: string; readonly size: number; readonly hash: string; readonly bytes?: Uint8Array }
export interface ProviderMetrics { readonly latencyMs: number; readonly cost: number; readonly costSource: 'provider' | 'estimate'; readonly retries: number; readonly pollCount: number }
export interface ProviderResult { readonly id: string; readonly provider: 'fal'; readonly requestId: string; readonly scope: ProviderScope; readonly status: 'succeeded'; readonly artifacts: readonly ProviderArtifact[]; readonly data: Readonly<Record<string, unknown>>; readonly metrics: ProviderMetrics; readonly createdAt: number }
export type ProviderErrorCategory = 'authentication' | 'validation' | 'timeout' | 'provider unavailable' | 'rate limit' | 'internal provider error' | 'unknown';
export interface FalApiConfiguration { readonly apiKey: string; readonly baseUrl?: string; readonly models?: Partial<Record<FalCapability, string>>; readonly pollIntervalMs?: number; readonly timeoutMs?: number; readonly maxRetries?: number; readonly maxArtifactBytes?: number; readonly allowedMimeTypes?: readonly string[] }
export type ArtifactLoader = ProviderArtifactLoader;
export interface ProviderRuntimeDependencies { readonly transport: ProviderTransport; readonly clock: () => number; readonly random: () => number; readonly id: () => string; readonly sleep: (milliseconds: number) => Promise<void>; readonly api: FalApiConfiguration; readonly artifactLoader: ArtifactLoader }
export interface CreativeProvider { readonly name: string; supports(capability: string): boolean; execute(request: ProviderRequest): Promise<ProviderResult> }
export interface FalTimelineEvent { readonly at: number; readonly stage: 'Request' | 'Fal Request' | 'HTTP' | 'Fal Response' | 'Artifacts' | 'Provider Result'; readonly detail: Readonly<Record<string, unknown>> }
export interface FalSnapshot { readonly id: string; readonly scope: ProviderScope; readonly request: ProviderRequest; readonly falRequest: Readonly<Record<string, unknown>>; readonly response: unknown; readonly result: ProviderResult; readonly timeline: readonly FalTimelineEvent[]; readonly createdAt: number }
