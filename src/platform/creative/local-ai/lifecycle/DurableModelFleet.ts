import type { FetchPort, ModelManifest } from '../types';
import type { ModelManifestVerifier } from '../trust/ModelTrust';

export const FLEET_SCHEMA_VERSION = 1;
export type FleetLifecycleStatus = 'AVAILABLE' | 'DOWNLOADING' | 'VERIFYING' | 'STAGED' | 'READY' | 'UPDATING' | 'ROLLING_BACK' | 'QUARANTINED' | 'FAILED' | 'REMOVING';
export type PartialDownload = Readonly<{ id: string; modelId: string; version: string; expectedSha256: string; manifestId: string; downloadUri: string; receivedBytes: number }>;
export type FleetVersion = Readonly<{
  modelId: string; version: string; manifest: ModelManifest; manifestId: string; manifestHash: string; expectedSha256: string;
  contentHash?: string; installedBytes: number; status: FleetLifecycleStatus; quarantineReason?: string; failureCount: number;
  lastFailureReason?: string; transactionId?: string; partial?: PartialDownload; createdAt: number; updatedAt: number; activatedAt?: number;
}>;
export type FleetModel = Readonly<{ modelId: string; activeVersion?: string; versions: Readonly<Record<string, FleetVersion>>; history: readonly string[] }>;
export type FleetState = Readonly<{ schemaVersion: 1; revision: number; models: Readonly<Record<string, FleetModel>> }>;

/** Atomic metadata port. Implementations must serialize update() across contexts. */
export interface FleetMetadataPort { read(): Promise<FleetState | undefined>; update(mutator: (current: FleetState) => FleetState): Promise<FleetState> }
/** Content-addressed bytes and separately-bound partial downloads. */
export interface FleetBlobPort {
  freeBytes(): Promise<number>; read(hash: string): Promise<Uint8Array | undefined>; put(hash: string, bytes: Uint8Array): Promise<void>; remove(hash: string): Promise<void>;
  readPartial(id: string): Promise<Uint8Array | undefined>; putPartial(id: string, bytes: Uint8Array): Promise<void>; removePartial(id: string): Promise<void>;
}
export type FleetPolicy = Readonly<{ safetyReserveBytes: number; maxHistory: number }>;
type Clock = () => number;

const empty = (): FleetState => ({ schemaVersion: FLEET_SCHEMA_VERSION, revision: 0, models: {} });
const clone = <T>(value: T): T => structuredClone(value);
const key = (manifest: ModelManifest) => `${manifest.modelId}@${manifest.version}:${manifest.sha256}`;
const manifestIdentity = (manifest: ModelManifest) => `${manifest.publisher}/${manifest.modelId}@${manifest.version}`;

/**
 * Restart-safe model lifecycle authority. Activation is a single metadata transaction;
 * immutable CAS blobs are written and revalidated before that transaction.
 */
export class DurableModelFleet {
  readonly #locks = new Map<string, Promise<void>>();
  readonly #policy: FleetPolicy;
  constructor(
    private readonly metadata: FleetMetadataPort, private readonly blobs: FleetBlobPort, private readonly fetcher: FetchPort,
    private readonly verifier: ModelManifestVerifier, private readonly clock: Clock = Date.now,
    policy: Partial<FleetPolicy> = {},
  ) { this.#policy = { safetyReserveBytes: policy.safetyReserveBytes ?? 64 * 1024 * 1024, maxHistory: policy.maxHistory ?? 2 }; }

  async state(): Promise<FleetState> { return clone((await this.metadata.read()) ?? empty()); }

  async reconcile(): Promise<FleetState> {
    return this.metadata.update((source) => {
      const state = clone(source); const now = this.clock();
      for (const model of Object.values(state.models)) for (const [version, record] of Object.entries(model.versions)) {
        if (record.status === 'REMOVING') { delete (model.versions as Record<string, FleetVersion>)[version]; if (model.activeVersion === version) delete (model as { activeVersion?: string }).activeVersion; continue; }
        if (record.status === 'VERIFYING' || record.status === 'STAGED') (model.versions as Record<string, FleetVersion>)[version] = { ...record, status: 'FAILED', lastFailureReason: 'interrupted before activation', updatedAt: now };
      }
      return { ...state, revision: state.revision + 1 };
    }).then(async (state) => {
      for (const model of Object.values(state.models)) {
        const active = model.activeVersion && model.versions[model.activeVersion];
        if (active?.status === 'READY' && !(await this.#valid(active))) await this.#quarantine(active.modelId, active.version, 'startup integrity revalidation failed');
      }
      return this.state();
    });
  }

  install(manifest: ModelManifest): Promise<FleetVersion> { return this.#exclusive(manifest.modelId, () => this.#install(manifest)); }
  resume(manifest: ModelManifest): Promise<FleetVersion> { return this.install(manifest); }

  async #install(manifest: ModelManifest): Promise<FleetVersion> {
    const preliminary = await this.verifier.verify(manifest); if (!preliminary.trusted) return this.#reject(manifest, preliminary.errors.join('; '));
    const before = await this.state(); const current = before.models[manifest.modelId]; const exact = current?.versions[manifest.version];
    if (exact?.status === 'READY' && exact.expectedSha256 === manifest.sha256 && await this.#valid(exact)) return exact;
    const partialId = key(manifest); const existingPartial = exact?.partial?.id === partialId ? await this.blobs.readPartial(partialId) : undefined;
    const remaining = Math.max(0, manifest.sizeBytes - (existingPartial?.byteLength ?? 0));
    if (await this.blobs.freeBytes() - this.#policy.safetyReserveBytes < remaining) throw new Error('Insufficient model storage including safety reserve and update coexistence');
    const now = this.clock(); const transactionId = `${partialId}:${now}`;
    await this.#writeVersion(manifest, {
      status: current?.activeVersion ? 'UPDATING' : 'DOWNLOADING', installedBytes: 0, failureCount: exact?.failureCount ?? 0, transactionId,
      partial: { id: partialId, modelId: manifest.modelId, version: manifest.version, expectedSha256: manifest.sha256, manifestId: manifestIdentity(manifest), downloadUri: manifest.downloadUri, receivedBytes: existingPartial?.byteLength ?? 0 }, createdAt: exact?.createdAt ?? now, updatedAt: now,
    });
    let bytes: Uint8Array;
    try {
      const tail = await this.fetcher.fetch(manifest.downloadUri, existingPartial?.byteLength ?? 0, new AbortController().signal);
      bytes = concat(existingPartial, tail); await this.blobs.putPartial(partialId, bytes);
    } catch (error) { throw error; }
    await this.#setStatus(manifest.modelId, manifest.version, 'VERIFYING', { installedBytes: bytes.byteLength });
    if (bytes.byteLength !== manifest.sizeBytes) throw new Error('Incomplete model download');
    const trust = await this.verifier.verify(manifest, bytes); if (!trust.trusted) return this.#reject(manifest, trust.errors.join('; '));
    await this.blobs.put(manifest.sha256, bytes);
    await this.#setStatus(manifest.modelId, manifest.version, 'STAGED', { contentHash: manifest.sha256, installedBytes: bytes.byteLength, partial: undefined });
    const activated = await this.metadata.update((source) => {
      const state = clone(source); const model = state.models[manifest.modelId]; const staged = model?.versions[manifest.version];
      if (!model || !staged || staged.status !== 'STAGED' || staged.expectedSha256 !== manifest.sha256) throw new Error('Staged activation binding changed');
      const prior = model.activeVersion; const history = prior && prior !== manifest.version ? [...model.history.filter((v) => v !== prior), prior].slice(-this.#policy.maxHistory) : model.history;
      (model as { activeVersion?: string }).activeVersion = manifest.version; (model as { history: readonly string[] }).history = history;
      (model.versions as Record<string, FleetVersion>)[manifest.version] = { ...staged, status: 'READY', activatedAt: this.clock(), updatedAt: this.clock(), transactionId: undefined };
      return { ...state, revision: state.revision + 1 };
    });
    await this.blobs.removePartial(partialId); return activated.models[manifest.modelId].versions[manifest.version];
  }

  rollback(modelId: string): Promise<FleetVersion> { return this.#exclusive(modelId, async () => {
    const state = await this.state(); const model = state.models[modelId]; const targetVersion = model?.history.at(-1); const target = targetVersion && model.versions[targetVersion];
    if (!model || !target || !(await this.#valid(target))) throw new Error('Rollback target is missing, corrupt, or untrusted');
    const updated = await this.metadata.update((source) => { const next = clone(source); const item = next.models[modelId]; const prior = item.activeVersion!;
      (item as { activeVersion?: string }).activeVersion = target.version; (item as { history: readonly string[] }).history = [...item.history.slice(0, -1), prior].slice(-this.#policy.maxHistory);
      (item.versions as Record<string, FleetVersion>)[target.version] = { ...item.versions[target.version], status: 'READY', activatedAt: this.clock(), updatedAt: this.clock() };
      return { ...next, revision: next.revision + 1 }; });
    return updated.models[modelId].versions[target.version];
  }); }

  remove(modelId: string, version?: string): Promise<void> { return this.#exclusive(modelId, async () => {
    const state = await this.state(); const model = state.models[modelId]; if (!model) return; const selected = version ?? model.activeVersion; if (!selected) return;
    await this.#setStatus(modelId, selected, 'REMOVING');
    const contentHash = model.versions[selected]?.contentHash;
    const updated = await this.metadata.update((source) => { const next = clone(source); const item = next.models[modelId]; if (!item) return next;
      delete (item.versions as Record<string, FleetVersion>)[selected]; (item as { history: readonly string[] }).history = item.history.filter((v) => v !== selected);
      if (item.activeVersion === selected) delete (item as { activeVersion?: string }).activeVersion; if (!Object.keys(item.versions).length) delete (next.models as Record<string, FleetModel>)[modelId];
      return { ...next, revision: next.revision + 1 }; });
    if (contentHash && !Object.values(updated.models).some((m) => Object.values(m.versions).some((v) => v.contentHash === contentHash))) await this.blobs.remove(contentHash);
  }); }

  reportFailure(modelId: string, reason: string, threshold = 3): Promise<FleetVersion> { return this.#exclusive(modelId, async () => {
    const state = await this.state(); const model = state.models[modelId]; const version = model?.activeVersion; if (!version) throw new Error(`Unknown active model: ${modelId}`);
    const count = model.versions[version].failureCount + 1; return this.#setStatus(modelId, version, count >= threshold ? 'QUARANTINED' : 'FAILED', { failureCount: count, lastFailureReason: reason, quarantineReason: count >= threshold ? reason : undefined });
  }); }
  restoreQuarantined(modelId: string, explicitlyAllowed: boolean): Promise<FleetVersion> { return this.#exclusive(modelId, async () => {
    if (!explicitlyAllowed) throw new Error('Explicit recovery policy is required'); const state = await this.state(); const model = state.models[modelId]; const version = model?.activeVersion; const record = version && model.versions[version];
    if (!record || record.status !== 'QUARANTINED' || !(await this.#valid(record))) throw new Error('Quarantined model failed revalidation');
    return this.#setStatus(modelId, version!, 'READY', { failureCount: 0, quarantineReason: undefined, lastFailureReason: undefined, activatedAt: this.clock() });
  }); }

  async #valid(record: FleetVersion): Promise<boolean> { if (!record.contentHash || record.contentHash !== record.expectedSha256 || record.manifestId !== manifestIdentity(record.manifest)) return false; const bytes = await this.blobs.read(record.contentHash); return Boolean(bytes && bytes.byteLength === record.installedBytes && (await this.verifier.verify(record.manifest, bytes)).trusted); }
  async #reject(manifest: ModelManifest, reason: string): Promise<never> { await this.#writeVersion(manifest, { status: 'QUARANTINED', installedBytes: 0, failureCount: 1, quarantineReason: reason, lastFailureReason: reason, createdAt: this.clock(), updatedAt: this.clock() }); throw new Error(reason); }
  async #quarantine(modelId: string, version: string, reason: string): Promise<FleetVersion> { return this.#setStatus(modelId, version, 'QUARANTINED', { quarantineReason: reason, lastFailureReason: reason }); }
  async #writeVersion(manifest: ModelManifest, values: Partial<FleetVersion>): Promise<FleetVersion> { const result = await this.metadata.update((source) => { const state = clone(source); const models = state.models as Record<string, FleetModel>; const model = models[manifest.modelId] ?? { modelId: manifest.modelId, versions: {}, history: [] }; const prior = model.versions[manifest.version];
    const record: FleetVersion = { modelId: manifest.modelId, version: manifest.version, manifest: clone(manifest), manifestId: manifestIdentity(manifest), manifestHash: manifest.sha256, expectedSha256: manifest.sha256, installedBytes: 0, status: 'AVAILABLE', failureCount: 0, createdAt: this.clock(), updatedAt: this.clock(), ...prior, ...values };
    (model.versions as Record<string, FleetVersion>)[manifest.version] = record; models[manifest.modelId] = model; return { ...state, revision: state.revision + 1 }; }); return result.models[manifest.modelId].versions[manifest.version]; }
  async #setStatus(modelId: string, version: string, status: FleetLifecycleStatus, values: Partial<FleetVersion> = {}): Promise<FleetVersion> { const state = await this.metadata.update((source) => { const next = clone(source); const record = next.models[modelId]?.versions[version]; if (!record) throw new Error(`Unknown model version: ${modelId}@${version}`); (next.models[modelId].versions as Record<string, FleetVersion>)[version] = { ...record, ...values, status, updatedAt: this.clock() }; return { ...next, revision: next.revision + 1 }; }); return state.models[modelId].versions[version]; }
  async #exclusive<T>(modelId: string, operation: () => Promise<T>): Promise<T> { const prior = this.#locks.get(modelId) ?? Promise.resolve(); let release!: () => void; const gate = new Promise<void>((resolve) => { release = resolve; }); const queued = prior.then(() => gate); this.#locks.set(modelId, queued); await prior; try { return await operation(); } finally { release(); if (this.#locks.get(modelId) === queued) this.#locks.delete(modelId); } }
}
function concat(first: Uint8Array | undefined, second: Uint8Array): Uint8Array { if (!first) return second; const value = new Uint8Array(first.length + second.length); value.set(first); value.set(second, first.length); return value; }
