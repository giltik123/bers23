import type { StorageAdapter } from './StorageAdapter';
/** Process-local storage adapter. */
export class MemoryStorageAdapter implements StorageAdapter {
  private readonly values = new Map<string, string>();
  /** Number of stored keys. */ get length(): number { return this.values.size; }
  /** Reads a raw value. */ getItem(key: string): string | null { return this.values.get(key) ?? null; }
  /** Writes a raw value. */ setItem(key: string, value: string): void { this.values.set(key, value); }
  /** Removes a raw value. */ removeItem(key: string): void { this.values.delete(key); }
  /** Returns a key by insertion order. */ key(index: number): string | null { return [...this.values.keys()][index] ?? null; }
  /** Removes every value. */ clear(): void { this.values.clear(); }
}
