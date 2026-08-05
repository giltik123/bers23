export interface StorageObject {
  readonly key: string;
  readonly data: unknown;
  readonly metadata?: Record<string, unknown>;
}

export interface StorageAdapter {
  save(object: StorageObject): Promise<StorageObject> | StorageObject;
  read(key: string): Promise<StorageObject | null> | StorageObject | null;
  delete(key: string): Promise<void> | void;
  exists(key: string): Promise<boolean> | boolean;
}

const clone = <T>(value: T): T => value === undefined ? value : JSON.parse(JSON.stringify(value));

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly objects = new Map<string, StorageObject>();

  save(object: StorageObject): StorageObject {
    const stored = Object.freeze(clone(object));
    this.objects.set(object.key, stored);
    return clone(stored);
  }

  read(key: string): StorageObject | null {
    const stored = this.objects.get(key);
    return stored ? clone(stored) : null;
  }

  delete(key: string): void { this.objects.delete(key); }
  exists(key: string): boolean { return this.objects.has(key); }
}
