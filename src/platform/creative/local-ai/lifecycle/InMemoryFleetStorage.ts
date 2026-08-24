import type {
  FleetBlobPort,
  FleetMetadataPort,
  FleetMutationLockPort,
  FleetState,
  FleetStorageReservationLease,
  FleetStorageReservationPort,
} from './DurableModelFleet';

const copy = <T>(value: T): T => structuredClone(value);

/** Deterministic shared backing store used for domain tests and native adapter contracts. */
export class InMemoryFleetBacking {
  state?: FleetState;
  readonly blobs = new Map<string, Uint8Array>();
  readonly partials = new Map<string, Uint8Array>();
  readonly lockTails = new Map<string, Promise<void>>();
  readonly reservations = new Map<string, number>();
  reservationTail: Promise<void> = Promise.resolve();
  constructor(readonly capacityBytes = Number.MAX_SAFE_INTEGER) {}
}

export class InMemoryFleetMetadata implements FleetMetadataPort {
  #tail = Promise.resolve();
  constructor(private readonly backing = new InMemoryFleetBacking()) {}
  async read(): Promise<FleetState | undefined> { await this.#tail; return this.backing.state && copy(this.backing.state); }
  update(mutator: (current: FleetState) => FleetState): Promise<FleetState> {
    let result!: FleetState;
    const work = this.#tail.then(() => {
      const current = this.backing.state ?? { schemaVersion: 1 as const, revision: 0, models: {} };
      result = copy(mutator(copy(current)));
      this.backing.state = result;
    });
    this.#tail = work;
    return work.then(() => copy(result));
  }
}

export class InMemoryFleetBlobs implements FleetBlobPort {
  constructor(readonly backing = new InMemoryFleetBacking()) {}
  async freeBytes(): Promise<number> { return Math.max(0, this.backing.capacityBytes - usedBytes(this.backing)); }
  async read(hash: string): Promise<Uint8Array | undefined> { return this.backing.blobs.get(hash)?.slice(); }
  async put(hash: string, bytes: Uint8Array): Promise<void> { this.backing.blobs.set(hash, bytes.slice()); }
  async remove(hash: string): Promise<void> { this.backing.blobs.delete(hash); }
  async readPartial(id: string): Promise<Uint8Array | undefined> { return this.backing.partials.get(id)?.slice(); }
  async putPartial(id: string, bytes: Uint8Array): Promise<void> { this.backing.partials.set(id, bytes.slice()); }
  async removePartial(id: string): Promise<void> { this.backing.partials.delete(id); }
}

/** Shared per-key lock used to prove cross-instance serialization in deterministic tests. */
export class InMemoryFleetMutationLocks implements FleetMutationLockPort {
  constructor(private readonly backing = new InMemoryFleetBacking()) {}

  async runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const prior = this.backing.lockTails.get(key) ?? Promise.resolve();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const queued = prior.then(() => gate);
    this.backing.lockTails.set(key, queued);
    await prior;
    try {
      return await operation();
    } finally {
      release();
      if (this.backing.lockTails.get(key) === queued) this.backing.lockTails.delete(key);
    }
  }
}

/**
 * Shared deterministic reservation authority. Reservation claims are serialized globally while the
 * actual model mutations remain per-model, so independent models can still progress concurrently.
 */
export class InMemoryFleetReservations implements FleetStorageReservationPort {
  constructor(private readonly backing = new InMemoryFleetBacking()) {}

  async runWithReservation<T>(
    request: Readonly<{ id: string; bytes: number; safetyReserveBytes: number }>,
    operation: (lease: FleetStorageReservationLease) => Promise<T>,
  ): Promise<T> {
    await this.#claim(request);
    const lease: FleetStorageReservationLease = Object.freeze({
      assertActive: async () => {
        if (!this.backing.reservations.has(request.id)) throw new Error('Fleet storage reservation is no longer active');
      },
    });
    try {
      return await operation(lease);
    } finally {
      await this.#release(request.id);
    }
  }

  async #claim(request: Readonly<{ id: string; bytes: number; safetyReserveBytes: number }>): Promise<void> {
    let release!: () => void;
    const prior = this.backing.reservationTail;
    const next = new Promise<void>((resolve) => { release = resolve; });
    this.backing.reservationTail = prior.then(() => next);
    await prior;
    try {
      const reservedByOthers = [...this.backing.reservations.entries()]
        .filter(([id]) => id !== request.id)
        .reduce((sum, [, bytes]) => sum + bytes, 0);
      const available = this.backing.capacityBytes - usedBytes(this.backing) - reservedByOthers - request.safetyReserveBytes;
      if (available < request.bytes) throw new Error('Insufficient model storage including safety reserve and concurrent reservations');
      this.backing.reservations.set(request.id, request.bytes);
    } finally {
      release();
    }
  }

  async #release(id: string): Promise<void> {
    this.backing.reservations.delete(id);
  }
}

function usedBytes(backing: InMemoryFleetBacking): number {
  return [...backing.blobs.values(), ...backing.partials.values()].reduce((sum, value) => sum + value.byteLength, 0);
}
