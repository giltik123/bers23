/** Raw key/value adapter contract used by the storage engine. */
export interface StorageAdapter { readonly length: number; getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void; key(index: number): string | null; clear(): void; }
/** Storage engines available through the standard factory. */
export type StorageKind = 'local' | 'session' | 'memory' | 'indexedDB' | 'secure';
