import { FalErrorMapper, FalProviderError } from './FalErrorMapper';
import { FalJobTracker } from './FalJobTracker';
import { FalRequestMapper } from './FalRequestMapper';
import { FalResponseMapper } from './FalResponseMapper';
import { falDeepFreeze, sameFalScope, sanitized } from './immutable';
import type { CreativeProvider, FalSnapshot, FalTimelineEvent, ProviderRequest, ProviderResult, ProviderRuntimeDependencies, ProviderScope } from './types';

export class FalProvider implements CreativeProvider {
  readonly name = 'fal';
  private readonly requests = new FalRequestMapper(); private readonly responses = new FalResponseMapper(); private readonly errors = new FalErrorMapper();
  private snapshots: readonly FalSnapshot[] = []; private successes = 0; private failures = 0; private lastFailure?: number;
  constructor(private readonly dependencies: ProviderRuntimeDependencies) {
    if (!dependencies?.transport || !dependencies.artifactLoader || !dependencies.clock || !dependencies.random || !dependencies.id || !dependencies.sleep || !dependencies.api?.apiKey || !dependencies.api.baseUrl) throw new Error('FalProvider requires transport, artifactLoader, clock, random, id, sleep and API configuration');
  }
  supports(capability: string): boolean { return this.requests.capability(capability) !== undefined; }
  async execute(request: ProviderRequest, signal: AbortSignal = new AbortController().signal): Promise<ProviderResult> {
    throwIfCancelled(signal);
    this.validate(request); const started = this.dependencies.clock(); const requestId = request.id ?? this.dependencies.id(); const timeline: FalTimelineEvent[] = [];
    const event = (stage: FalTimelineEvent['stage'], detail: Record<string, unknown>): void => { timeline.push(falDeepFreeze({ at: this.dependencies.clock(), stage, detail: sanitized(detail) })); };
    const safeRequest = falDeepFreeze(sanitized({ ...request, id: requestId, scope: { ...request.scope }, inputs: { ...(request.inputs ?? {}) }, metadata: { ...(request.metadata ?? {}) } }));
    event('Request', safeRequest as unknown as Record<string, unknown>); const falRequest = this.requests.map(request); event('Fal Request', falRequest as Record<string, unknown>);
    const model = this.requests.model(request.capability, this.dependencies.api); const base = this.dependencies.api.baseUrl.replace(/\/$/, ''); const url = `${base}/${model}`;
    const deadline = started + (request.timeoutMs ?? this.dependencies.api.timeoutMs ?? 60_000); let retries = 0; let polls = 0;
    try {
      event('HTTP', { method: 'POST', url }); let raw = await this.post(url, falRequest, deadline, () => { retries += 1; }, signal); throwIfCancelled(signal); event('Fal Response', { response: raw });
      const job = this.responses.job(raw); if (job) { const tracked = await new FalJobTracker(this.dependencies, this.errors).wait(job, deadline, (response) => event('HTTP', { method: 'GET', response }), signal); raw = tracked.response; polls = tracked.polls; retries += tracked.retries; throwIfCancelled(signal); event('Fal Response', { response: raw }); }
      const artifactUrls = this.responses.urls(raw); throwIfCancelled(signal);
      const artifacts = await Promise.all(artifactUrls.map((artifactUrl) => this.dependencies.artifactLoader.load(artifactUrl, { maxBytes: this.dependencies.api.maxArtifactBytes ?? 25_000_000, allowedMimeTypes: this.dependencies.api.allowedMimeTypes ?? ['image/png', 'image/jpeg', 'image/webp'] }, signal)));
      throwIfCancelled(signal);
      event('Artifacts', { count: artifacts.length, artifacts: artifacts.map(({ url: artifactUrl, mimeType, size, hash }) => ({ url: artifactUrl, mimeType, size, hash })) });
      const actualCost = this.responses.cost(raw); const result = falDeepFreeze({ id: this.dependencies.id(), provider: 'fal', requestId, scope: { ...request.scope }, status: 'succeeded', artifacts, data: this.responses.data(raw), metrics: { latencyMs: Math.max(0, this.dependencies.clock() - started), cost: actualCost ?? this.estimate(request.capability), costSource: actualCost === undefined ? 'estimate' : 'provider', retries, pollCount: polls }, createdAt: this.dependencies.clock() }) as ProviderResult;
      event('Provider Result', { result }); this.successes += 1; this.store(safeRequest, falRequest, raw, result, timeline); return result;
    } catch (cause) { if (signal.aborted) throw cancellationReason(signal); this.failures += 1; this.lastFailure = this.dependencies.clock(); throw cause instanceof FalProviderError ? cause : this.errors.map(undefined, undefined, cause); }
  }
  health(): Readonly<{ provider: 'fal'; status: 'healthy' | 'degraded' | 'unknown'; successes: number; failures: number; lastFailure?: number }> { return falDeepFreeze({ provider: 'fal', status: this.successes + this.failures === 0 ? 'unknown' : this.failures > this.successes ? 'degraded' : 'healthy', successes: this.successes, failures: this.failures, lastFailure: this.lastFailure }); }
  history(scope: ProviderScope): readonly FalSnapshot[] { return falDeepFreeze(this.snapshots.filter((item) => sameFalScope(item.scope, scope))); }
  snapshot(scope: ProviderScope, id?: string): FalSnapshot | undefined { return this.snapshots.find((item) => sameFalScope(item.scope, scope) && (!id || item.id === id)); }
  replay(snapshot: FalSnapshot, scope: ProviderScope): ProviderResult { if (!sameFalScope(snapshot.scope, scope)) throw new Error('Scope isolation violation'); return falDeepFreeze({ ...snapshot.result, scope: { ...snapshot.result.scope } }) as ProviderResult; }
  debug(snapshot: FalSnapshot, scope: ProviderScope): readonly FalTimelineEvent[] { if (!sameFalScope(snapshot.scope, scope)) throw new Error('Scope isolation violation'); return falDeepFreeze(snapshot.timeline.map((item) => sanitized(item))); }
  private store(request: ProviderRequest, falRequest: Readonly<Record<string, unknown>>, response: unknown, result: ProviderResult, timeline: readonly FalTimelineEvent[]): void { this.snapshots = falDeepFreeze([...this.snapshots, falDeepFreeze({ id: this.dependencies.id(), scope: { ...request.scope }, request, falRequest, response: sanitized(response), result, timeline: [...timeline], createdAt: this.dependencies.clock() }) as FalSnapshot]); }
  private validate(request: ProviderRequest): void { if (!request?.scope?.tenantId || !request.scope.projectId || !request.scope.userId) throw this.errors.map(422, { message: 'Complete provider scope is required' }); if (!this.supports(request.capability)) throw this.errors.map(422, { message: `Unsupported Fal capability: ${request.capability}` }); }
  private estimate(capability: string): number { return { 'image-edit': 0.05, 'background-remove': 0.01, segmentation: 0.01, upscale: 0.03, inpaint: 0.05, outpaint: 0.05, 'try-on': 0.08 }[this.requests.capability(capability)!]; }
  private async post(url: string, body: Readonly<Record<string, unknown>>, deadline: number, retried: () => void, signal: AbortSignal): Promise<unknown> {
    const max = this.dependencies.api.maxRetries ?? 2;
    for (let attempt = 0; ; attempt += 1) try {
      throwIfCancelled(signal);
      if (this.dependencies.clock() >= deadline) throw this.errors.map(408); const response = await this.dependencies.transport.send({ url, method: 'POST', headers: { Authorization: `Key ${this.dependencies.api.apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body), timeoutMs: Math.max(1, deadline - this.dependencies.clock()) }, signal); throwIfCancelled(signal); const payload = response.body; if (response.status >= 200 && response.status < 300) return payload;
      const error = this.errors.map(response.status, payload); if (!error.retryable || attempt >= max) throw error; retried(); await this.dependencies.sleep(Math.min(1000, 100 * 2 ** attempt) + Math.floor(this.dependencies.random() * 10)); throwIfCancelled(signal);
    } catch (cause) { if (signal.aborted) throw cancellationReason(signal); const error = cause instanceof FalProviderError ? cause : this.errors.map(undefined, undefined, cause); if (!error.retryable || attempt >= max) throw error; retried(); await this.dependencies.sleep(Math.min(1000, 100 * 2 ** attempt)); throwIfCancelled(signal); }
  }
}

function throwIfCancelled(signal: AbortSignal): void { if (signal.aborted) throw cancellationReason(signal); }
function cancellationReason(signal: AbortSignal): Error { return signal.reason instanceof Error ? signal.reason : new DOMException('Creative execution cancelled', 'AbortError'); }
