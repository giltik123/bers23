import type { WorkerDefinition, WorkerLifecycleState } from './WorkerTypes';

/** Starts and stops registered workers without knowing provider implementations. */
export class WorkerLifecycle {
  private readonly states = new Map<string, WorkerLifecycleState>();
  register(workerId: string): void { this.states.set(workerId, 'REGISTERED'); }
  get(workerId: string): WorkerLifecycleState | undefined { return this.states.get(workerId); }
  async start(worker: WorkerDefinition): Promise<void> { this.states.set(worker.id, 'STARTING'); try { await worker.start?.(); this.states.set(worker.id, 'RUNNING'); } catch (error) { this.states.set(worker.id, 'FAILED'); throw error; } }
  async stop(worker: WorkerDefinition): Promise<void> { this.states.set(worker.id, 'STOPPING'); try { await worker.stop?.(); this.states.set(worker.id, 'STOPPED'); } catch (error) { this.states.set(worker.id, 'FAILED'); throw error; } }
}
