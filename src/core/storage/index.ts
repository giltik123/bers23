/** Browser storage kinds supported by the foundation adapter. */
export type StorageKind = 'local' | 'session';

/** Minimal storage contract that can later be backed by IndexedDB. */
export interface KeyValueStorage {
  get<T>(key: string): T | null;
  set<T>(key: string, value: T): void;
  remove(key: string): void;
  clear(): void;
}

/** JSON-serialized storage service with optional key namespacing. */
export class StorageService implements KeyValueStorage {
  constructor(private readonly storage: Storage, private readonly namespace = 'core') {}

  /** Creates a service backed by localStorage or sessionStorage. */
  static create(kind: StorageKind, namespace?: string): StorageService {
    if (typeof window === 'undefined') throw new Error(`${kind}Storage is not available`);
    return new StorageService(kind === 'local' ? window.localStorage : window.sessionStorage, namespace);
  }

  /** Reads and deserializes a value. */
  get<T>(key: string): T | null {
    const value = this.storage.getItem(this.key(key));
    return value === null ? null : JSON.parse(value) as T;
  }

  /** Serializes and stores a value. */
  set<T>(key: string, value: T): void {
    this.storage.setItem(this.key(key), JSON.stringify(value));
  }

  /** Removes a stored value. */
  remove(key: string): void { this.storage.removeItem(this.key(key)); }

  /** Removes only values owned by this namespace. */
  clear(): void {
    const prefix = `${this.namespace}:`;
    const keys = Array.from({ length: this.storage.length }, (_, index) => this.storage.key(index))
      .filter((key): key is string => key?.startsWith(prefix) ?? false);
    for (const key of keys) this.storage.removeItem(key);
  }

  private key(key: string): string { return `${this.namespace}:${key}`; }
}

