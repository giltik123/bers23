import type { FleetBlobPort, FleetMetadataPort, FleetState } from './DurableModelFleet';

class IndexedDbConnection {
  #db?: Promise<IDBDatabase>;
  constructor(readonly name: string) {}
  open(): Promise<IDBDatabase> { return this.#db ??= new Promise((resolve, reject) => { const request = indexedDB.open(this.name, 1); request.onupgradeneeded = () => { for (const name of ['metadata', 'blobs', 'partials']) if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name); }; request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); }
  async request<T>(storeName: string, mode: IDBTransactionMode, create: (store: IDBObjectStore) => IDBRequest): Promise<T> { const db = await this.open(); return new Promise((resolve, reject) => { const request = create(db.transaction(storeName, mode).objectStore(storeName)); request.onsuccess = () => resolve(request.result as T); request.onerror = () => reject(request.error); }); }
}
export class IndexedDbFleetMetadata implements FleetMetadataPort {
  readonly #connection: IndexedDbConnection;
  constructor(name = 'bers-local-model-fleet-v1') { this.#connection = new IndexedDbConnection(name); }
  read(): Promise<FleetState | undefined> { return this.#connection.request('metadata', 'readonly', (store) => store.get('fleet')); }
  async update(mutator: (current: FleetState) => FleetState): Promise<FleetState> { const db = await this.#connection.open(); return new Promise((resolve, reject) => { const transaction = db.transaction('metadata', 'readwrite'); const store = transaction.objectStore('metadata'); const get = store.get('fleet'); let next!: FleetState; get.onsuccess = () => { try { next = mutator(get.result ?? { schemaVersion: 1, revision: 0, models: {} }); store.put(next, 'fleet'); } catch (error) { transaction.abort(); reject(error); } }; get.onerror = () => reject(get.error); transaction.oncomplete = () => resolve(structuredClone(next)); transaction.onerror = () => reject(transaction.error); }); }
}
export class IndexedDbFleetBlobs implements FleetBlobPort {
  readonly #connection: IndexedDbConnection;
  constructor(name = 'bers-local-model-fleet-v1', private readonly estimate: () => Promise<{ quota?: number; usage?: number }> = () => navigator.storage.estimate()) { this.#connection = new IndexedDbConnection(name); }
  async freeBytes(): Promise<number> { const { quota = 0, usage = quota } = await this.estimate(); return Math.max(0, quota - usage); }
  read(hash: string): Promise<Uint8Array | undefined> { return this.#connection.request('blobs', 'readonly', (store) => store.get(hash)); }
  async put(hash: string, bytes: Uint8Array): Promise<void> { await this.#connection.request('blobs', 'readwrite', (store) => store.put(bytes.slice(), hash)); }
  async remove(hash: string): Promise<void> { await this.#connection.request('blobs', 'readwrite', (store) => store.delete(hash)); }
  readPartial(id: string): Promise<Uint8Array | undefined> { return this.#connection.request('partials', 'readonly', (store) => store.get(id)); }
  async putPartial(id: string, bytes: Uint8Array): Promise<void> { await this.#connection.request('partials', 'readwrite', (store) => store.put(bytes.slice(), id)); }
  async removePartial(id: string): Promise<void> { await this.#connection.request('partials', 'readwrite', (store) => store.delete(id)); }
}
