import type { StorageAdapter } from './StorageAdapter';
/** Adapter for browser localStorage. */
export class LocalStorageAdapter implements StorageAdapter {
  constructor(private readonly storage: Storage = window.localStorage) {}
  get length(): number { return this.storage.length; } getItem(key: string): string | null { return this.storage.getItem(key); }
  setItem(key: string, value: string): void { this.storage.setItem(key, value); } removeItem(key: string): void { this.storage.removeItem(key); }
  key(index: number): string | null { return this.storage.key(index); } clear(): void { this.storage.clear(); }
}
/** Adapter for browser sessionStorage. */
export class SessionStorageAdapter extends LocalStorageAdapter { constructor(storage: Storage = window.sessionStorage) { super(storage); } }
