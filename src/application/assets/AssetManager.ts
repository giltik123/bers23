import { type AIAsset, type AssetAccessContext, type AssetLineageRecord, type AssetVersionRecord, assertAssetAccess, createAssetId, createVersionId, immutable, type CreateAssetInput } from './AIAsset';
import { InMemoryStorageAdapter, type StorageAdapter, type StorageObject } from './StorageAdapter';

export interface AssetManagerSnapshot { readonly assets: readonly AIAsset[]; readonly lineage: readonly AssetLineageRecord[]; readonly storage: readonly StorageObject[]; }
export interface AssetDebugSnapshot {
  readonly asset: AIAsset;
  readonly versions: readonly AssetVersionRecord[];
  readonly operations: readonly string[];
  readonly workflow: readonly string[];
  readonly execution: readonly string[];
  readonly storageMetadata: unknown;
}

export class AssetManager {
  private readonly assets = new Map<string, AIAsset>();
  private readonly lineage = new Map<string, AssetLineageRecord>();
  private readonly storageKeys = new Map<string, string>();
  private readonly storage: StorageAdapter;

  constructor(options: { readonly storage?: StorageAdapter; readonly snapshot?: AssetManagerSnapshot } = {}) {
    this.storage = options.storage ?? new InMemoryStorageAdapter();
    for (const asset of options.snapshot?.assets ?? []) this.assets.set(asset.id, immutable(asset));
    for (const entry of options.snapshot?.lineage ?? []) this.lineage.set(entry.assetId, immutable(entry));
    for (const object of options.snapshot?.storage ?? []) {
      void this.storage.save(object);
      this.storageKeys.set(object.key, object.key);
    }
  }

  async create(input: CreateAssetInput & { readonly data?: unknown; readonly storageKey?: string }): Promise<AIAsset> {
    const now = new Date().toISOString();
    const asset: AIAsset = immutable({
      id: input.id ?? createAssetId(),
      tenantId: input.tenantId,
      ownerId: input.ownerId,
      projectId: input.projectId,
      sessionId: input.sessionId,
      type: input.type,
      status: input.status ?? 'UPLOADED',
      source: input.source,
      metadata: input.metadata ?? {},
      versions: [],
      createdAt: now,
      updatedAt: now,
    });
    this.assets.set(asset.id, asset);
    if (input.data !== undefined || input.storageKey) await this.register(asset.id, { key: input.storageKey ?? asset.id, data: input.data ?? input.source, metadata: { assetId: asset.id, type: asset.type } }, this.contextFor(asset));
    return this.get(asset.id, this.contextFor(asset));
  }

  async register(assetId: string, object: StorageObject, context: AssetAccessContext): Promise<AIAsset> {
    const asset = this.get(assetId, context);
    const stored = await Promise.resolve(this.storage.save(object));
    this.storageKeys.set(assetId, stored.key);
    return this.replace(asset.id, { ...asset, status: 'READY', source: { storageKey: stored.key }, updatedAt: new Date().toISOString() });
  }

  get(assetId: string, context: AssetAccessContext): AIAsset {
    const asset = this.assets.get(assetId);
    if (!asset) throw new Error(`AI asset not found: ${assetId}`);
    assertAssetAccess(asset, context);
    return immutable(asset);
  }

  list(context: AssetAccessContext): readonly AIAsset[] {
    return immutable([...this.assets.values()].filter((asset) => asset.tenantId === context.tenantId && asset.projectId === context.projectId && asset.ownerId === context.userId && asset.status !== 'DELETED'));
  }

  updateMetadata(assetId: string, metadata: Record<string, unknown>, context: AssetAccessContext): AIAsset {
    const asset = this.get(assetId, context);
    return this.replace(asset.id, { ...asset, metadata: { ...asset.metadata, ...metadata }, updatedAt: new Date().toISOString() });
  }

  archive(assetId: string, context: AssetAccessContext): AIAsset {
    const asset = this.get(assetId, context);
    return this.replace(asset.id, { ...asset, status: 'ARCHIVED', updatedAt: new Date().toISOString() });
  }

  async delete(assetId: string, context: AssetAccessContext): Promise<AIAsset> {
    const asset = this.get(assetId, context);
    const key = this.storageKeys.get(asset.id);
    if (key) await Promise.resolve(this.storage.delete(key));
    return this.replace(asset.id, { ...asset, status: 'DELETED', updatedAt: new Date().toISOString() });
  }

  version(assetId: string, lineage: Omit<AssetLineageRecord, 'assetId' | 'createdAt'> & { readonly createdAt?: string }, context: AssetAccessContext): AssetVersionRecord {
    const asset = this.get(assetId, context);
    if (lineage.parentAssetId) this.get(lineage.parentAssetId, context);
    const record: AssetVersionRecord = immutable({ versionId: createVersionId(), assetId, parentAssetId: lineage.parentAssetId, operation: lineage.operation, workflowId: lineage.workflowId, executionId: lineage.executionId, createdAt: lineage.createdAt ?? new Date().toISOString() });
    this.lineage.set(assetId, record);
    this.replace(assetId, { ...asset, versions: [...asset.versions, record], updatedAt: new Date().toISOString() });
    return immutable(record);
  }

  history(assetId: string, context: AssetAccessContext): readonly AssetVersionRecord[] {
    this.get(assetId, context);
    const chain: AssetVersionRecord[] = [];
    let current: AssetLineageRecord | undefined = this.lineage.get(assetId);
    while (current) {
      chain.unshift(current as AssetVersionRecord);
      current = current.parentAssetId ? this.lineage.get(current.parentAssetId) : undefined;
    }
    return immutable(chain);
  }

  async debug(assetId: string, context?: AssetAccessContext): Promise<AssetDebugSnapshot> {
    const asset = context ? this.get(assetId, context) : this.getWithoutAccess(assetId);
    const versions = context ? this.history(assetId, context) : this.historyWithoutAccess(assetId);
    const key = this.storageKeys.get(assetId);
    const storageObject = key ? await Promise.resolve(this.storage.read(key)) : null;
    return immutable({ asset, versions, operations: versions.map((version) => version.operation), workflow: versions.map((version) => version.workflowId), execution: versions.map((version) => version.executionId), storageMetadata: storageObject?.metadata ?? null });
  }

  async storageExists(assetId: string): Promise<boolean> {
    const key = this.storageKeys.get(assetId);
    return key ? Promise.resolve(this.storage.exists(key)) : false;
  }

  persist(): AssetManagerSnapshot {
    return immutable({ assets: [...this.assets.values()], lineage: [...this.lineage.values()], storage: [] });
  }

  private replace(assetId: string, asset: AIAsset): AIAsset {
    const stored = immutable(asset);
    this.assets.set(assetId, stored);
    return immutable(stored);
  }
  private contextFor(asset: AIAsset): AssetAccessContext { return { tenantId: asset.tenantId, projectId: asset.projectId, userId: asset.ownerId }; }
  private getWithoutAccess(assetId: string): AIAsset { const asset = this.assets.get(assetId); if (!asset) throw new Error(`AI asset not found: ${assetId}`); return immutable(asset); }
  private historyWithoutAccess(assetId: string): readonly AssetVersionRecord[] { const asset = this.getWithoutAccess(assetId); const context = this.contextFor(asset); return this.history(assetId, context); }
}
