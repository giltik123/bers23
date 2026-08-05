import type { StorageAdapter } from './StorageAdapter';
/** Explicit placeholder for a future IndexedDB adapter. */
export class IndexedDBStorageAdapter implements StorageAdapter {
  readonly length = 0; getItem(): string | null { return null; } setItem(): void { throw new Error('IndexedDB storage is not implemented'); }
  removeItem(): void {} key(): string | null { return null; } clear(): void {}
}
/** Explicit placeholder for a future encrypted secure-storage adapter. */
export class SecureStorageAdapter extends IndexedDBStorageAdapter { override setItem(): void { throw new Error('Secure storage is not implemented'); } }
