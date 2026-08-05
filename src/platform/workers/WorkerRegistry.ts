import type { WorkerDefinition } from './WorkerTypes';

/** Registry for runtime workers and capability discovery. */
export class WorkerRegistry {
  private readonly workers = new Map<string, WorkerDefinition>();
  register(worker: WorkerDefinition): WorkerDefinition { if (this.workers.has(worker.id)) throw new Error(`Worker "${worker.id}" is already registered.`); if (worker.maxConcurrency < 1) throw new Error('Worker concurrency must be at least one.'); const frozen = Object.freeze({ ...worker, capabilities: Object.freeze([...worker.capabilities]) }); this.workers.set(worker.id, frozen); return frozen; }
  unregister(id: string): boolean { return this.workers.delete(id); }
  get(id: string): WorkerDefinition | undefined { return this.workers.get(id); }
  getByCapability(capability: string): readonly WorkerDefinition[] { return Object.freeze([...this.workers.values()].filter((worker) => worker.capabilities.includes(capability))); }
  getAll(): readonly WorkerDefinition[] { return Object.freeze([...this.workers.values()]); }
}
