import { MemoryStorageAdapter } from './MemoryStorageAdapter';
import { IndexedDBStorageAdapter, SecureStorageAdapter } from './StubStorageAdapters';
import type { StorageAdapter, StorageKind } from './StorageAdapter';
import { LocalStorageAdapter, SessionStorageAdapter } from './WebStorageAdapters';

/** Storage write options including expiration and schema version. */
export interface StorageSetOptions { ttlMs?: number; version?: number; }
/** Migration transforms a stored value between schema versions. */
export interface StorageMigration<T = unknown> { readonly from: number; readonly to: number; migrate(value: T): T; }
/** Typed storage contract that can later be backed by asynchronous infrastructure. */
export interface KeyValueStorage { get<T>(key: string): T | null; set<T>(key: string, value: T, options?: StorageSetOptions): void; remove(key: string): void; clear(): void; }
interface Envelope<T> { value: T; expiresAt?: number; version: number; }

/** Namespaced, versioned JSON storage engine with TTL and migrations. */
export class StorageService implements KeyValueStorage {
  constructor(private readonly storage: StorageAdapter, private readonly namespace = 'core', private readonly migrations: readonly StorageMigration[] = []) {}
  /** Creates a service backed by a standard adapter. */
  static create(kind: StorageKind, namespace?: string): StorageService {
    if ((kind === 'local' || kind === 'session') && typeof window === 'undefined') throw new Error(`${kind}Storage is not available`);
    const adapters: Record<StorageKind, () => StorageAdapter> = { local: () => new LocalStorageAdapter(), session: () => new SessionStorageAdapter(), memory: () => new MemoryStorageAdapter(), indexedDB: () => new IndexedDBStorageAdapter(), secure: () => new SecureStorageAdapter() };
    return new StorageService(adapters[kind](), namespace);
  }
  /** Reads, expires, migrates, and deserializes a value. */
  get<T>(key: string): T | null {
    const raw = this.storage.getItem(this.key(key)); if (raw === null) return null;
    const parsed = JSON.parse(raw) as Envelope<T> | T;
    if (!this.isEnvelope<T>(parsed)) return parsed;
    if (parsed.expiresAt !== undefined && parsed.expiresAt <= Date.now()) { this.remove(key); return null; }
    let value = parsed.value; let version = parsed.version;
    for (const migration of this.migrations.filter((item) => item.from >= version).sort((a, b) => a.from - b.from)) {
      if (migration.from !== version) continue; value = migration.migrate(value) as T; version = migration.to;
    }
    if (version !== parsed.version) this.set(key, value, { version });
    return value;
  }
  /** Serializes a value with optional TTL and schema version. */
  set<T>(key: string, value: T, options: StorageSetOptions = {}): void { const envelope: Envelope<T> = { value, version: options.version ?? 1, ...(options.ttlMs === undefined ? {} : { expiresAt: Date.now() + options.ttlMs }) }; this.storage.setItem(this.key(key), JSON.stringify(envelope)); }
  /** Removes a stored value. */ remove(key: string): void { this.storage.removeItem(this.key(key)); }
  /** Removes only values owned by this namespace. */
  clear(): void { const prefix = `${this.namespace}:`; const keys = Array.from({ length: this.storage.length }, (_, index) => this.storage.key(index)).filter((key): key is string => key?.startsWith(prefix) ?? false); for (const key of keys) this.storage.removeItem(key); }
  /** Creates a service sharing the adapter under a child namespace. */ namespaceScope(name: string): StorageService { return new StorageService(this.storage, `${this.namespace}:${name}`, this.migrations); }
  private key(key: string): string { return `${this.namespace}:${key}`; }
  private isEnvelope<T>(value: Envelope<T> | T): value is Envelope<T> { return typeof value === 'object' && value !== null && 'value' in value && 'version' in value; }
}
