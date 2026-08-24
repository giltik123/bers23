import type { FleetBlobPort, FleetMetadataPort, FleetState } from './DurableModelFleet';

const copy = <T>(value: T): T => structuredClone(value);

/** Deterministic shared backing store used for domain tests and native adapter contracts. */
export class InMemoryFleetBacking {
  state?: FleetState; readonly blobs = new Map<string, Uint8Array>(); readonly partials = new Map<string, Uint8Array>();
  constructor(readonly capacityBytes = Number.MAX_SAFE_INTEGER) {}
}
export class InMemoryFleetMetadata implements FleetMetadataPort {
  #tail = Promise.resolve();
  constructor(private readonly backing = new InMemoryFleetBacking()) {}
  async read(): Promise<FleetState | undefined> { await this.#tail; return this.backing.state && copy(this.backing.state); }
  update(mutator: (current: FleetState) => FleetState): Promise<FleetState> {
    let result!: FleetState; const work = this.#tail.then(() => { const current = this.backing.state ?? { schemaVersion: 1 as const, revision: 0, models: {} }; result = copy(mutator(copy(current))); this.backing.state = result; });
    this.#tail = work; return work.then(() => copy(result));
  }
}
export class InMemoryFleetBlobs implements FleetBlobPort {
  constructor(readonly backing = new InMemoryFleetBacking()) {}
  async freeBytes(): Promise<number> { return Math.max(0, this.backing.capacityBytes - [...this.backing.blobs.values(), ...this.backing.partials.values()].reduce((sum, value) => sum + value.byteLength, 0)); }
  async read(hash: string): Promise<Uint8Array | undefined> { return this.backing.blobs.get(hash)?.slice(); }
  async put(hash: string, bytes: Uint8Array): Promise<void> { this.backing.blobs.set(hash, bytes.slice()); }
  async remove(hash: string): Promise<void> { this.backing.blobs.delete(hash); }
  async readPartial(id: string): Promise<Uint8Array | undefined> { return this.backing.partials.get(id)?.slice(); }
  async putPartial(id: string, bytes: Uint8Array): Promise<void> { this.backing.partials.set(id, bytes.slice()); }
  async removePartial(id: string): Promise<void> { this.backing.partials.delete(id); }
}
