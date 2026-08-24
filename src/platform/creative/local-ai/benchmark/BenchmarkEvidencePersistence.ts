import type { BenchmarkEvidence, BenchmarkEvidencePort } from './BenchmarkEvidence';

const copy = <T>(value: T): T => structuredClone(value);

export class InMemoryBenchmarkEvidenceBacking {
  readonly evidence = new Map<string, BenchmarkEvidence>();
}

/** Deterministic restart simulation for benchmark-evidence domain tests. */
export class InMemoryBenchmarkEvidencePort implements BenchmarkEvidencePort {
  constructor(readonly backing = new InMemoryBenchmarkEvidenceBacking()) {}

  async list(): Promise<readonly BenchmarkEvidence[]> {
    return [...this.backing.evidence.values()]
      .sort((a, b) => a.evidenceKey.localeCompare(b.evidenceKey))
      .map(copy);
  }

  async put(evidence: BenchmarkEvidence): Promise<void> {
    this.backing.evidence.set(evidence.evidenceKey, copy(evidence));
  }

  async remove(evidenceKey: string): Promise<void> {
    this.backing.evidence.delete(evidenceKey);
  }
}

/**
 * Browser benchmark evidence deliberately uses a database separate from the durable fleet authority.
 * Telemetry schema upgrades therefore cannot block or mutate model install/rollback metadata.
 */
export class IndexedDbBenchmarkEvidencePort implements BenchmarkEvidencePort {
  #db?: Promise<IDBDatabase>;

  constructor(readonly name = 'bers-local-model-benchmark-evidence-v1') {}

  async list(): Promise<readonly BenchmarkEvidence[]> {
    const values = await this.#request<BenchmarkEvidence[]>('readonly', (store) => store.getAll());
    return values.sort((a, b) => a.evidenceKey.localeCompare(b.evidenceKey)).map(copy);
  }

  async put(evidence: BenchmarkEvidence): Promise<void> {
    await this.#request('readwrite', (store) => store.put(copy(evidence), evidence.evidenceKey));
  }

  async remove(evidenceKey: string): Promise<void> {
    await this.#request('readwrite', (store) => store.delete(evidenceKey));
  }

  #open(): Promise<IDBDatabase> {
    return this.#db ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('evidence')) request.result.createObjectStore('evidence');
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async #request<T>(mode: IDBTransactionMode, create: (store: IDBObjectStore) => IDBRequest): Promise<T> {
    const db = await this.#open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('evidence', mode);
      const store = transaction.objectStore('evidence');
      let result!: T;
      let failure: unknown;
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(failure ?? transaction.error ?? new Error('Benchmark evidence transaction aborted'));
      transaction.onerror = () => { failure ??= transaction.error; };
      let request: IDBRequest;
      try {
        request = create(store);
      } catch (error) {
        failure = error;
        transaction.abort();
        return;
      }
      request.onsuccess = () => { result = request.result as T; };
      request.onerror = () => { failure = request.error; };
    });
  }
}
