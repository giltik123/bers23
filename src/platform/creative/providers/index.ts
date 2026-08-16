/** Autonomous, transport-free provider platform. */
import type { ProviderArtifact, ProviderRequest, ProviderResult, ProviderRetryPolicy, ProviderScope } from '../provider-platform';
export type { ProviderRequest, ProviderResult } from '../provider-platform';
export type Artifact = ProviderArtifact;
export type Scope = ProviderScope;
export type RetryPolicy = ProviderRetryPolicy;
export type ProviderHealthStatus = 'ONLINE' | 'OFFLINE' | 'DEGRADED' | 'LIMITED';
export type ProviderStatus = 'ACTIVE' | 'DEPRECATED' | 'DISABLED';
export type ArtifactKind = 'image' | 'mask' | 'segmentation' | 'metadata' | 'preview';
export type OptimizationStrategy = 'CHEAPEST' | 'FASTEST' | 'HIGHEST_QUALITY' | 'BALANCED';

export interface ProviderDependencies { readonly now: () => number; readonly id: () => string; readonly random: () => number }
export const defaultProviderDependencies = (): ProviderDependencies => Object.freeze({
  now: () => Date.now(), id: () => crypto.randomUUID(), random: () => Math.random(),
});

export function deepFreeze<T>(value: T): Readonly<T> {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as object)) deepFreeze(child);
  }
  return value;
}
const immutable = <T>(value: T): Readonly<T> => deepFreeze(structuredClone(value));
const scopeKey = (scope: Scope) => {
  if (!scope?.tenantId || !scope.projectId || !scope.userId) throw new Error('tenantId, projectId and userId are required');
  return `${scope.tenantId}\u0000${scope.projectId}\u0000${scope.userId}`;
};

export interface CostEstimate { readonly credits: number; readonly latency: number; readonly quality: number; readonly memory: number; readonly expectedFilesize: number }
export interface ProviderDescriptor {
  readonly id: string; readonly version: string; readonly operations: readonly string[];
  readonly latency: number; readonly credits: number; readonly quality: number;
  readonly limits: Readonly<Record<string, number>>; readonly maxResolution: Readonly<{ width: number; height: number }>;
  readonly formats: readonly string[];
}
export interface CreativeProvider {
  readonly descriptor: ProviderDescriptor;
  initialize(): Promise<void> | void; capabilities(): readonly string[];
  estimate(request: ProviderRequest): Promise<CostEstimate> | CostEstimate;
  execute(request: ProviderRequest): Promise<ProviderResult>;
  validate(request: ProviderRequest): readonly string[]; cancel(executionId: string): Promise<boolean> | boolean;
  health(): ProviderHealthStatus; snapshot(scope: Scope): unknown; debug(scope: Scope): unknown;
}

export class CostEstimator {
  estimate(descriptor: ProviderDescriptor, scale = 1): Readonly<CostEstimate> {
    if (!Number.isFinite(scale) || scale < 0) throw new Error('scale must be a non-negative number');
    return immutable({ credits: descriptor.credits * scale, latency: descriptor.latency * scale, quality: descriptor.quality,
      memory: Math.ceil(descriptor.maxResolution.width * descriptor.maxResolution.height * 4 * scale),
      expectedFilesize: Math.ceil(descriptor.maxResolution.width * descriptor.maxResolution.height * 0.5 * scale) });
  }
}

export interface HealthChange { readonly status: ProviderHealthStatus; readonly timestamp: number; readonly reason?: string }
export class ProviderHealth {
  #status: ProviderHealthStatus; #history: HealthChange[] = [];
  constructor(initial: ProviderHealthStatus, private readonly deps: ProviderDependencies) { this.#status = initial; this.#history.push(immutable({ status: initial, timestamp: deps.now() })); }
  get status() { return this.#status; }
  set(status: ProviderHealthStatus, reason?: string) { if (status !== this.#status) { this.#status = status; this.#history.push(immutable({ status, timestamp: this.deps.now(), ...(reason ? { reason } : {}) })); } return this.snapshot(); }
  snapshot() { return immutable({ status: this.#status, history: this.#history }); }
}

export interface RegistryEntry { readonly provider: CreativeProvider; readonly capabilities: readonly string[]; readonly priority: number; readonly health: ProviderHealthStatus; readonly version: string; readonly status: ProviderStatus; readonly costProfile: CostEstimate }
export class ProviderRegistry {
  #entries = new Map<string, RegistryEntry>(); #aliases = new Map<string, string>();
  register(provider: CreativeProvider, options: Partial<Omit<RegistryEntry, 'provider' | 'capabilities' | 'version'>> & { aliases?: readonly string[] } = {}) {
    const id = provider.descriptor.id; if (this.#entries.has(id) || this.#aliases.has(id)) throw new Error(`Provider already registered: ${id}`);
    const entry = deepFreeze({ provider, capabilities: [...provider.capabilities()], priority: options.priority ?? 0, health: options.health ?? provider.health(), version: provider.descriptor.version, status: options.status ?? 'ACTIVE', costProfile: options.costProfile ?? new CostEstimator().estimate(provider.descriptor) }) as RegistryEntry;
    this.#entries.set(id, entry); for (const alias of options.aliases ?? []) this.alias(alias, id); return entry;
  }
  unregister(id: string) { const canonical = this.resolveId(id); const deleted = this.#entries.delete(canonical); for (const [alias, target] of this.#aliases) if (target === canonical) this.#aliases.delete(alias); return deleted; }
  replace(id: string, provider: CreativeProvider, options: Parameters<ProviderRegistry['register']>[1] = {}) { if (!this.#entries.has(this.resolveId(id))) throw new Error(`Unknown provider: ${id}`); this.unregister(id); return this.register(provider, options); }
  alias(alias: string, providerId: string) { const id = this.resolveId(providerId); if (!this.#entries.has(id)) throw new Error(`Unknown provider: ${providerId}`); if (this.#entries.has(alias) || this.#aliases.has(alias)) throw new Error(`Name already registered: ${alias}`); this.#aliases.set(alias, id); return this; }
  resolveId(id: string) { return this.#aliases.get(id) ?? id; }
  get(id: string) { return this.#entries.get(this.resolveId(id)); }
  list(options: { includeDeprecated?: boolean } = {}) { return deepFreeze([...this.#entries.values()].filter(e => options.includeDeprecated || e.status !== 'DEPRECATED')); }
  lookup(capability: string, options: { includeUnavailable?: boolean; includeDeprecated?: boolean } = {}) { return deepFreeze([...this.list({ includeDeprecated: options.includeDeprecated })].filter(e => e.capabilities.includes(capability) && (options.includeUnavailable || e.health !== 'OFFLINE') && e.status !== 'DISABLED').sort((a, b) => b.priority - a.priority || a.provider.descriptor.id.localeCompare(b.provider.descriptor.id))); }
  snapshot() { return immutable({ providers: [...this.#entries.entries()].map(([id, entry]) => ({ id, descriptor:entry.provider.descriptor, capabilities:entry.capabilities, priority:entry.priority, health:entry.health, version:entry.version, status:entry.status, costProfile:entry.costProfile })), aliases: Object.fromEntries(this.#aliases) }); }
}

export class CapabilityResolver {
  constructor(private readonly registry: ProviderRegistry) {}
  resolve(capability: string) { const match = this.registry.lookup(capability)[0]; if (!match) throw new Error(`No available provider for capability: ${capability}`); return match.provider; }
  candidates(capability: string) { return this.registry.lookup(capability).map(e => e.provider); }
}

export class ProviderOptimizer {
  select(entries: readonly RegistryEntry[], strategy: OptimizationStrategy = 'BALANCED') {
    if (!entries.length) throw new Error('No provider candidates');
    const score = (e: RegistryEntry) => strategy === 'CHEAPEST' ? -e.costProfile.credits : strategy === 'FASTEST' ? -e.costProfile.latency : strategy === 'HIGHEST_QUALITY' ? e.costProfile.quality : e.costProfile.quality * 2 - e.costProfile.credits - e.costProfile.latency / 1000;
    return [...entries].sort((a, b) => score(b) - score(a) || b.priority - a.priority || a.provider.descriptor.id.localeCompare(b.provider.descriptor.id))[0].provider;
  }
}

export const createRetryPolicy = (policy: Partial<RetryPolicy> = {}): Readonly<RetryPolicy> => immutable({ retries: policy.retries ?? 2, backoffMs: policy.backoffMs ?? 100, timeoutMs: policy.timeoutMs ?? 30_000, circuitBreaker: policy.circuitBreaker ?? { failureThreshold: 5, resetAfterMs: 60_000 } });

export interface FallbackPlan { readonly capability: string; readonly providers: readonly string[]; readonly terminal: 'ABORT' }
export class FallbackPlanner {
  constructor(private readonly registry: ProviderRegistry) {}
  plan(capability: string): Readonly<FallbackPlan> { return immutable({ capability, providers: this.registry.lookup(capability).map(e => e.provider.descriptor.id), terminal: 'ABORT' }); }
}

export interface ProviderMetricSummary { readonly successRate: number; readonly averageLatency: number; readonly credits: number; readonly quality: number; readonly failureRate: number; readonly availability: number; readonly samples: number }
export class ProviderMetrics {
  #records = new Map<string, Array<{ success: boolean; latency: number; credits: number; quality: number; available: boolean }>>();
  record(scope: Scope, providerId: string, value: { success: boolean; latency: number; credits: number; quality: number; available?: boolean }) { const key = `${scopeKey(scope)}\u0000${providerId}`; this.#records.set(key, [...(this.#records.get(key) ?? []), immutable({ ...value, available: value.available ?? true })]); }
  summary(scope: Scope, providerId: string): Readonly<ProviderMetricSummary> { const rows = this.#records.get(`${scopeKey(scope)}\u0000${providerId}`) ?? [], n = rows.length; const avg = (field: 'latency'|'credits'|'quality') => n ? rows.reduce((s, r) => s + r[field], 0) / n : 0; const successes = rows.filter(r => r.success).length; return immutable({ successRate: n ? successes/n : 0, averageLatency: avg('latency'), credits: rows.reduce((s,r)=>s+r.credits,0), quality: avg('quality'), failureRate: n ? (n-successes)/n : 0, availability: n ? rows.filter(r=>r.available).length/n : 0, samples:n }); }
  snapshot(scope: Scope) { const prefix = `${scopeKey(scope)}\u0000`; return immutable([...this.#records.entries()].filter(([k])=>k.startsWith(prefix)).map(([k]) => ({ providerId:k.slice(prefix.length), summary:this.summary(scope,k.slice(prefix.length)) }))); }
}

export class ProviderMemory {
  #data = new Map<string, { bestProvider?: string; previousFailures: string[]; qualityHistory: number[]; latencyHistory: number[] }>();
  #get(scope: Scope) { const key=scopeKey(scope); if (!this.#data.has(key)) this.#data.set(key,{ previousFailures:[], qualityHistory:[], latencyHistory:[] }); return this.#data.get(key)!; }
  remember(scope: Scope, event: { bestProvider?: string; failure?: string; quality?: number; latency?: number }) { const current=this.#get(scope); this.#data.set(scopeKey(scope), { bestProvider:event.bestProvider ?? current.bestProvider, previousFailures:event.failure ? [...current.previousFailures,event.failure] : current.previousFailures, qualityHistory:event.quality === undefined ? current.qualityHistory : [...current.qualityHistory,event.quality], latencyHistory:event.latency === undefined ? current.latencyHistory : [...current.latencyHistory,event.latency] }); return this.snapshot(scope); }
  snapshot(scope: Scope) { return immutable(this.#get(scope)); }
  clear(scope: Scope) { return this.#data.delete(scopeKey(scope)); }
}

export class ProviderSandbox implements CreativeProvider {
  readonly descriptor: ProviderDescriptor; #initialized=false; #cancelled=new Set<string>();
  constructor(descriptor: ProviderDescriptor, private readonly deps: ProviderDependencies) { this.descriptor=immutable(descriptor) as ProviderDescriptor; }
  initialize(){ this.#initialized=true; } capabilities(){ return this.descriptor.operations; }
  estimate(_request?: ProviderRequest){ return new CostEstimator().estimate(this.descriptor); }
  validate(request: ProviderRequest){ const errors=[]; try { scopeKey(request.scope); } catch(e) { errors.push((e as Error).message); } if(!this.capabilities().includes(request.operation)) errors.push(`Unsupported operation: ${request.operation}`); return immutable(errors); }
  async execute(request: ProviderRequest): Promise<ProviderResult> { if(!this.#initialized) throw new Error('Provider is not initialized'); const errors=this.validate(request); if(errors.length) throw new Error(errors.join('; ')); const started=this.deps.now(), executionId=this.deps.id(); if(this.#cancelled.has(executionId)) return immutable({status:'CANCELLED',artifacts:[],metrics:{},credits:0,latency:0,quality:0,warnings:[]}); const estimate=this.estimate(request); return immutable({ status:'SUCCESS', artifacts:[{id:this.deps.id(),kind:'metadata',format:'application/json',data:{operation:request.operation,simulated:true},metadata:{executionId}}], metrics:{random:this.deps.random()}, credits:estimate.credits, latency:Math.max(0,this.deps.now()-started), quality:estimate.quality, warnings:['SANDBOX: no external request was made'] }); }
  cancel(id:string){ this.#cancelled.add(id); return true; } health():ProviderHealthStatus{return 'ONLINE';}
  snapshot(scope:Scope){ scopeKey(scope); return immutable({descriptor:this.descriptor,initialized:this.#initialized}); }
  debug(scope:Scope){ return this.snapshot(scope); }
}

export class ProviderSnapshot {
  constructor(private readonly registry:ProviderRegistry, private readonly metrics:ProviderMetrics, private readonly memory:ProviderMemory, private readonly fallback:FallbackPlanner, private readonly optimizer:ProviderOptimizer){}
  create(scope:Scope, capability?:string){ scopeKey(scope); const candidates=capability ? this.registry.lookup(capability):this.registry.list(); return immutable({scope,registry:this.registry.snapshot(),health:candidates.map(e=>({providerId:e.provider.descriptor.id,status:e.health})),cost:candidates.map(e=>({providerId:e.provider.descriptor.id,...e.costProfile})),metrics:this.metrics.snapshot(scope),memory:this.memory.snapshot(scope),fallback:capability?this.fallback.plan(capability):null,optimizer:{strategies:['CHEAPEST','FASTEST','HIGHEST_QUALITY','BALANCED']},capabilities:[...new Set(candidates.flatMap(e=>e.capabilities))].sort()}); }
}

export class ProviderDebugger {
  constructor(private readonly registry:ProviderRegistry, private readonly resolver:CapabilityResolver, private readonly fallback:FallbackPlanner, private readonly snapshots:ProviderSnapshot){}
  trace(scope:Scope, capability:string){ const candidates=this.registry.lookup(capability); const selected=this.resolver.resolve(capability); return immutable({capability,resolver:{candidateCount:candidates.length},registry:candidates.map(e=>e.provider.descriptor.id),selectedProvider:selected.descriptor.id,estimate:selected.estimate({operation:capability,scope}),fallback:this.fallback.plan(capability),metrics:null,snapshot:this.snapshots.create(scope,capability)}); }
}

export const createArtifact = (artifact: Artifact): Readonly<Artifact> => {
  if (!artifact.id || !artifact.kind || !artifact.format) throw new Error('Artifact id, kind and format are required');
  return immutable({ ...artifact, metadata: artifact.metadata ?? {} });
};
export const createProviderResult = (result: ProviderResult): Readonly<ProviderResult> => immutable(result);
