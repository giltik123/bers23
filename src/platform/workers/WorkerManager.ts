import type { ProviderExecutionContext } from '../providers/runtime/ProviderExecutionContext';
import type { ProviderExecutionResult } from '../providers/runtime/ProviderExecutionResult';
import type { ProviderRuntimeBinding } from '../providers/runtime/ProviderRuntimeRegistry';
import { ProviderUnavailableError } from '../providers/runtime/ProviderError';
import { WorkerHealthMonitor } from './WorkerHealthMonitor';
import { WorkerLifecycle } from './WorkerLifecycle';
import { WorkerPool } from './WorkerPool';
import { WorkerRegistry } from './WorkerRegistry';
import type { WorkerDefinition, WorkerMetrics } from './WorkerTypes';

/** Orchestrates worker discovery, lifecycle, health-aware fallback, limits, and metrics. */
export class WorkerManager {
  readonly registry = new WorkerRegistry(); readonly pool = new WorkerPool(); readonly lifecycle = new WorkerLifecycle(); readonly health = new WorkerHealthMonitor();
  register(worker: WorkerDefinition): WorkerDefinition { const registered = this.registry.register(worker); this.lifecycle.register(worker.id); this.health.register(worker.id); return registered; }
  registerProvider(binding: ProviderRuntimeBinding, maxConcurrency = 1): WorkerDefinition {
    return this.register({ id: binding.id, capabilities: binding.capabilities, maxConcurrency, execute: (request) => binding.executor.execute(request) });
  }
  async start(id: string): Promise<void> { const worker = this.require(id); await this.lifecycle.start(worker); }
  async stop(id: string): Promise<void> { const worker = this.require(id); await this.lifecycle.stop(worker); }
  async startAll(): Promise<void> { await Promise.all(this.registry.getAll().map((worker) => this.lifecycle.start(worker))); }
  async stopAll(): Promise<void> { await Promise.all(this.registry.getAll().map((worker) => this.lifecycle.stop(worker))); }
  getByCapability(capability: string): readonly WorkerDefinition[] { return this.available(capability); }

  /** Executes with the healthiest worker and falls back after runtime failure. */
  async execute(request: ProviderExecutionContext): Promise<ProviderExecutionResult> {
    const candidates = this.available(request.capability); const failures: unknown[] = [];
    for (const worker of candidates) {
      const started = performance.now();
      try { const result = await this.pool.run(worker, () => worker.execute(request)); this.health.recordSuccess(worker.id, result); return result; }
      catch (error) { failures.push(error); this.health.recordFailure(worker.id, error, performance.now() - started); }
    }
    const last = failures.at(-1); if (last instanceof Error) throw last; throw new ProviderUnavailableError(candidates[0]?.id ?? request.capability);
  }
  async checkHealth(id?: string): Promise<void> {
    const workers = id ? [this.require(id)] : this.registry.getAll();
    await Promise.all(workers.map(async (worker) => { if (!worker.healthCheck) return; try { this.health.update(worker.id, await worker.healthCheck()); } catch (error) { this.health.setStatus(worker.id, 'OFFLINE', error instanceof Error ? error.message : String(error)); } }));
  }
  metrics(id: string): WorkerMetrics { return this.health.getMetrics(id); }
  private available(capability: string): readonly WorkerDefinition[] {
    return Object.freeze(this.registry.getByCapability(capability).filter((worker) => ['REGISTERED', 'RUNNING'].includes(this.lifecycle.get(worker.id) ?? '') && ['ONLINE', 'DEGRADED'].includes(this.health.get(worker.id).status)).sort((left, right) => rank(this.health.get(left.id).status) - rank(this.health.get(right.id).status)));
  }
  private require(id: string): WorkerDefinition { const worker = this.registry.get(id); if (!worker) throw new Error(`Worker "${id}" is not registered.`); return worker; }
}
function rank(status: string): number { return status === 'ONLINE' ? 0 : status === 'DEGRADED' ? 1 : 2; }
