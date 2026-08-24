import type {
  FleetBlobPort,
  FleetMetadataPort,
  FleetMutationLockPort,
  FleetState,
  FleetStorageReservationLease,
  FleetStorageReservationPort,
} from './DurableModelFleet';

type ReservationRecord = Readonly<{ id: string; bytes: number; expiresAt: number }>;
type WebLockManagerLike = Readonly<{
  request<T>(name: string, options: Readonly<{ mode: 'exclusive' }>, callback: () => Promise<T>): Promise<T>;
}>;

class IndexedDbConnection {
  #db?: Promise<IDBDatabase>;
  constructor(readonly name: string) {}

  open(): Promise<IDBDatabase> {
    return this.#db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 2);
      request.onupgradeneeded = () => {
        for (const name of ['metadata', 'blobs', 'partials', 'reservations']) {
          if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async request<T>(storeName: string, mode: IDBTransactionMode, create: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const request = create(db.transaction(storeName, mode).objectStore(storeName));
      request.onsuccess = () => resolve(request.result as T);
      request.onerror = () => reject(request.error);
    });
  }
}

export class IndexedDbFleetMetadata implements FleetMetadataPort {
  readonly #connection: IndexedDbConnection;
  constructor(name = 'bers-local-model-fleet-v1') { this.#connection = new IndexedDbConnection(name); }

  read(): Promise<FleetState | undefined> {
    return this.#connection.request('metadata', 'readonly', (store) => store.get('fleet'));
  }

  async update(mutator: (current: FleetState) => FleetState): Promise<FleetState> {
    const db = await this.#connection.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('metadata', 'readwrite');
      const store = transaction.objectStore('metadata');
      const get = store.get('fleet');
      let next!: FleetState;
      let failure: unknown;
      get.onsuccess = () => {
        try {
          next = mutator(get.result ?? { schemaVersion: 1, revision: 0, models: {} });
          store.put(next, 'fleet');
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      get.onerror = () => { failure = get.error; transaction.abort(); };
      transaction.oncomplete = () => resolve(structuredClone(next));
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Fleet metadata transaction aborted'));
      transaction.onerror = () => { failure ??= transaction.error; };
    });
  }
}

export class IndexedDbFleetBlobs implements FleetBlobPort {
  readonly #connection: IndexedDbConnection;
  constructor(
    name = 'bers-local-model-fleet-v1',
    private readonly estimate: () => Promise<{ quota?: number; usage?: number }> = () => navigator.storage.estimate(),
  ) { this.#connection = new IndexedDbConnection(name); }

  async freeBytes(): Promise<number> {
    const { quota = 0, usage = quota } = await this.estimate();
    return Math.max(0, quota - usage);
  }
  read(hash: string): Promise<Uint8Array | undefined> { return this.#connection.request('blobs', 'readonly', (store) => store.get(hash)); }
  async put(hash: string, bytes: Uint8Array): Promise<void> { await this.#connection.request('blobs', 'readwrite', (store) => store.put(bytes.slice(), hash)); }
  async remove(hash: string): Promise<void> { await this.#connection.request('blobs', 'readwrite', (store) => store.delete(hash)); }
  readPartial(id: string): Promise<Uint8Array | undefined> { return this.#connection.request('partials', 'readonly', (store) => store.get(id)); }
  async putPartial(id: string, bytes: Uint8Array): Promise<void> { await this.#connection.request('partials', 'readwrite', (store) => store.put(bytes.slice(), id)); }
  async removePartial(id: string): Promise<void> { await this.#connection.request('partials', 'readwrite', (store) => store.delete(id)); }
}

/**
 * Web Locks are the browser cross-context serialization primitive. If unavailable, fail closed rather
 * than silently falling back to an in-process mutex that would be unsafe across tabs/workers.
 */
export class BrowserFleetMutationLocks implements FleetMutationLockPort {
  constructor(private readonly manager?: WebLockManagerLike) {}

  runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const manager = this.manager ?? browserLockManager();
    if (!manager) return Promise.reject(new Error('Cross-context Web Locks are required for durable browser model mutations'));
    return manager.request(`bers:local-model-fleet:${key}`, { mode: 'exclusive' }, operation);
  }
}

/**
 * IndexedDB-backed storage reservations. Claims are created in one readwrite transaction, so
 * concurrent tabs observe each other's active reservations. Leases are renewed while the operation
 * is live and must be revalidated by the domain before every storage mutation after an await.
 */
export class IndexedDbFleetReservations implements FleetStorageReservationPort {
  readonly #connection: IndexedDbConnection;
  constructor(
    name = 'bers-local-model-fleet-v1',
    private readonly estimate: () => Promise<{ quota?: number; usage?: number }> = () => navigator.storage.estimate(),
    private readonly clock: () => number = Date.now,
    private readonly leaseMs = 30_000,
  ) {
    if (!Number.isFinite(leaseMs) || leaseMs < 3_000) throw new Error('Fleet reservation lease must be at least 3000ms');
    this.#connection = new IndexedDbConnection(name);
  }

  async runWithReservation<T>(
    request: Readonly<{ id: string; bytes: number; safetyReserveBytes: number }>,
    operation: (lease: FleetStorageReservationLease) => Promise<T>,
  ): Promise<T> {
    if (!Number.isFinite(request.bytes) || request.bytes < 0 || !Number.isFinite(request.safetyReserveBytes) || request.safetyReserveBytes < 0) {
      throw new Error('Invalid fleet storage reservation request');
    }
    await this.#claim(request);
    const heartbeat = globalThis.setInterval(() => { void this.#renew(request.id).catch(() => undefined); }, Math.max(1_000, Math.floor(this.leaseMs / 3)));
    const lease: FleetStorageReservationLease = Object.freeze({ assertActive: () => this.#renew(request.id) });
    try {
      return await operation(lease);
    } finally {
      globalThis.clearInterval(heartbeat);
      await this.#release(request.id);
    }
  }

  async #claim(request: Readonly<{ id: string; bytes: number; safetyReserveBytes: number }>): Promise<void> {
    const { quota = 0, usage = quota } = await this.estimate();
    const physicallyFree = Math.max(0, quota - usage);
    const db = await this.#connection.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('reservations', 'readwrite');
      const store = transaction.objectStore('reservations');
      const getAll = store.getAll();
      let failure: unknown;
      getAll.onsuccess = () => {
        try {
          const now = this.clock();
          const active = (getAll.result as ReservationRecord[]).filter((record) => {
            if (record.expiresAt <= now) { store.delete(record.id); return false; }
            return record.id !== request.id;
          });
          const reservedByOthers = active.reduce((sum, record) => sum + record.bytes, 0);
          if (physicallyFree - reservedByOthers - request.safetyReserveBytes < request.bytes) {
            throw new Error('Insufficient model storage including safety reserve and concurrent reservations');
          }
          store.put({ id: request.id, bytes: request.bytes, expiresAt: now + this.leaseMs } satisfies ReservationRecord, request.id);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      getAll.onerror = () => { failure = getAll.error; transaction.abort(); };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Fleet storage reservation aborted'));
      transaction.onerror = () => { failure ??= transaction.error; };
    });
  }

  async #renew(id: string): Promise<void> {
    const db = await this.#connection.open();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction('reservations', 'readwrite');
      const store = transaction.objectStore('reservations');
      const get = store.get(id);
      let failure: unknown;
      get.onsuccess = () => {
        try {
          const record = get.result as ReservationRecord | undefined;
          const now = this.clock();
          if (!record || record.expiresAt <= now) throw new Error('Fleet storage reservation expired or was lost');
          store.put({ ...record, expiresAt: now + this.leaseMs } satisfies ReservationRecord, id);
        } catch (error) {
          failure = error;
          transaction.abort();
        }
      };
      get.onerror = () => { failure = get.error; transaction.abort(); };
      transaction.oncomplete = () => resolve();
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Fleet storage reservation renewal aborted'));
      transaction.onerror = () => { failure ??= transaction.error; };
    });
  }

  async #release(id: string): Promise<void> {
    await this.#connection.request('reservations', 'readwrite', (store) => store.delete(id));
  }
}

function browserLockManager(): WebLockManagerLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { locks?: WebLockManagerLike }).locks;
}
