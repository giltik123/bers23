import { ExecutionContext } from '../execution/ExecutionContext';
import type { ExecutionPlan } from '../execution/ExecutionPlan';
import { ExecutionValidator } from '../execution/ExecutionValidator';
import { ExecutionCancellation, ExecutionCancelledError } from './ExecutionCancellation';
import { type ExecutionCheckpoint, type ExecutionCheckpointStore, MemoryExecutionCheckpointStore } from './ExecutionCheckpoint';
import { ExecutionEvents } from './ExecutionEvents';
import { ExecutionQueue } from './ExecutionQueue';
import { ExecutionRecovery } from './ExecutionRecovery';
import { ExecutionScheduler, type ScheduledStepState } from './ExecutionScheduler';
import { ExecutionStateMachine, type ExecutionState } from './ExecutionState';
import { ExecutionWorker, type ExecutionWorkerAdapter, type ExecutionWorkerOptions } from './ExecutionWorker';

export interface ManagedExecutionResult {
  readonly executionId: string; readonly planId: string; readonly state: Extract<ExecutionState, 'COMPLETED' | 'FAILED' | 'CANCELLED'>;
  readonly steps: Readonly<Record<string, ScheduledStepState>>; readonly attempts: Readonly<Record<string, number>>;
  readonly context: Readonly<Record<string, unknown>>; readonly error?: string;
}
export interface RuntimeInspection { readonly executions: readonly { readonly executionId: string; readonly planId: string; readonly state: ExecutionState; readonly activeSteps: readonly string[] }[]; readonly queued: readonly string[]; }
export interface ExecutionRuntimeOptions extends ExecutionWorkerOptions { readonly checkpointStore?: ExecutionCheckpointStore; readonly validator?: ExecutionValidator; }
interface ExecutionControl { readonly plan: ExecutionPlan; readonly machine: ExecutionStateMachine; readonly cancellation: ExecutionCancellation; readonly states: Map<string, ScheduledStepState>; readonly attempts: Map<string, number>; readonly context: ExecutionContext; readonly activeSteps: Set<string>; checkpointCount: number; resume?: () => void; }

/** Managed runtime for plans, parallel scheduling, checkpoints, retries, pause, cancellation, and recovery. */
export class ExecutionRuntime {
  readonly events = new ExecutionEvents(); readonly queue = new ExecutionQueue();
  private readonly scheduler = new ExecutionScheduler(); private readonly worker: ExecutionWorker; private readonly validator: ExecutionValidator;
  private readonly checkpoints: ExecutionCheckpointStore; private readonly recovery: ExecutionRecovery; private readonly controls = new Map<string, ExecutionControl>(); private sequence = 0;
  constructor(adapter: ExecutionWorkerAdapter, options: ExecutionRuntimeOptions = {}) {
    this.validator = options.validator ?? new ExecutionValidator(); this.checkpoints = options.checkpointStore ?? new MemoryExecutionCheckpointStore();
    this.recovery = new ExecutionRecovery(this.checkpoints); this.worker = new ExecutionWorker(adapter, this.events, options);
  }

  /** Adds a plan to the priority queue without starting it. */
  enqueue(plan: ExecutionPlan, priority = 0): string { const id = this.nextId(plan); this.queue.enqueue({ id, plan, priority, enqueuedAt: new Date().toISOString() }); return id; }
  /** Runs the next queued plan, if present. */
  async runNext(): Promise<ManagedExecutionResult | undefined> { const item = this.queue.dequeue(); return item ? this.start(item.id, item.plan) : undefined; }
  /** Immediately validates and executes a plan. */
  execute(plan: ExecutionPlan): Promise<ManagedExecutionResult> { return this.start(this.nextId(plan), plan); }

  pause(executionId: string): boolean { const control = this.controls.get(executionId); if (!control || control.machine.current !== 'RUNNING') return false; this.changeState(executionId, control, 'PAUSED'); return true; }
  resume(executionId: string): boolean { const control = this.controls.get(executionId); if (!control || control.machine.current !== 'PAUSED') return false; this.changeState(executionId, control, 'RUNNING'); control.resume?.(); control.resume = undefined; return true; }
  cancel(executionId: string): boolean { const control = this.controls.get(executionId); if (!control || ['COMPLETED', 'FAILED', 'CANCELLED'].includes(control.machine.current)) return false; control.cancellation.cancel(); control.resume?.(); return true; }

  /** Re-runs a prior execution from its last successful checkpoint. */
  async recover(plan: ExecutionPlan, priorExecutionId: string): Promise<ManagedExecutionResult> {
    const restored = await this.recovery.restore(priorExecutionId); return this.start(`${priorExecutionId}-recovery-${++this.sequence}`, plan, restored);
  }
  inspect(): RuntimeInspection { return Object.freeze({ executions: Object.freeze([...this.controls].map(([executionId, control]) => Object.freeze({ executionId, planId: control.plan.id, state: control.machine.current, activeSteps: Object.freeze([...control.activeSteps]) }))), queued: Object.freeze(this.queue.getAll().map((item) => item.id)) }); }
  getCheckpoints(executionId: string): Promise<readonly ExecutionCheckpoint[]> { return Promise.resolve(this.checkpoints.getAll(executionId)); }

  private async start(executionId: string, plan: ExecutionPlan, restored?: { readonly completedSteps: ReadonlySet<string>; readonly context: ExecutionContext }): Promise<ManagedExecutionResult> {
    const machine = new ExecutionStateMachine(restored ? 'RECOVERING' : 'CREATED');
    const states = new Map<string, ScheduledStepState>(plan.nodes.map((node) => [node.id, restored?.completedSteps.has(node.id) ? 'completed' : 'pending']));
    const control: ExecutionControl = { plan, machine, cancellation: new ExecutionCancellation(), states, attempts: new Map(), context: restored?.context ?? new ExecutionContext(), activeSteps: new Set(), checkpointCount: restored?.completedSteps.size ?? 0 };
    this.controls.set(executionId, control);
    try {
      if (restored) this.changeState(executionId, control, 'READY'); else { this.changeState(executionId, control, 'VALIDATING'); const validation = await this.validator.validate(plan); if (!validation.valid) throw new Error(validation.errors.join(' ')); this.changeState(executionId, control, 'READY'); }
      this.changeState(executionId, control, 'RUNNING'); await this.events.emit('execution.started', Object.freeze({ executionId, planId: plan.id }));
      while ([...states.values()].some((state) => state === 'pending')) {
        control.cancellation.throwIfCancelled(); await this.waitWhilePaused(control);
        const runnable = this.scheduler.getRunnable(plan, states); if (runnable.length === 0) throw new Error('Execution graph is blocked and has no runnable steps.');
        for (const id of runnable) { states.set(id, 'running'); control.activeSteps.add(id); }
        const results = await Promise.allSettled(runnable.map(async (id) => {
          const node = plan.nodes.find((candidate) => candidate.id === id)!; const result = await this.worker.run(executionId, node, control.context, control.cancellation);
          control.attempts.set(id, result.attempts); states.set(id, 'completed'); control.activeSteps.delete(id); await this.saveCheckpoint(executionId, control); return result;
        }));
        const failedIndex = results.findIndex((result) => result.status === 'rejected');
        if (failedIndex >= 0) { const reason = (results[failedIndex] as PromiseRejectedResult).reason; states.set(runnable[failedIndex], reason instanceof ExecutionCancelledError ? 'cancelled' : 'failed'); control.activeSteps.clear(); throw reason; }
      }
      this.changeState(executionId, control, 'COMPLETED'); await this.events.emit('execution.completed', Object.freeze({ executionId, planId: plan.id })); return this.result(executionId, control);
    } catch (error) {
      const cancelled = error instanceof ExecutionCancelledError || control.cancellation.isCancelled; this.changeState(executionId, control, cancelled ? 'CANCELLED' : 'FAILED');
      for (const [id, state] of states) if (state === 'pending' || state === 'running') states.set(id, cancelled ? 'cancelled' : 'skipped');
      if (cancelled) await this.events.emit('execution.cancelled', Object.freeze({ executionId, planId: plan.id })); else await this.events.emit('execution.failed', Object.freeze({ executionId, error: errorMessage(error) }));
      return this.result(executionId, control, errorMessage(error));
    }
  }

  private async waitWhilePaused(control: ExecutionControl): Promise<void> { if (control.machine.current !== 'PAUSED') return; await new Promise<void>((resolve) => { control.resume = resolve; }); control.cancellation.throwIfCancelled(); }
  private changeState(id: string, control: ExecutionControl, state: ExecutionState): void { control.machine.transition(state); void this.events.emit('execution.state.changed', Object.freeze({ executionId: id, state })); }
  private async saveCheckpoint(executionId: string, control: ExecutionControl): Promise<void> { const completedSteps = [...control.states].filter(([, state]) => state === 'completed').map(([id]) => id); control.checkpointCount += 1; await this.checkpoints.save(Object.freeze({ id: `${executionId}-checkpoint-${control.checkpointCount}`, executionId, planId: control.plan.id, completedSteps: Object.freeze(completedSteps), context: control.context.snapshot(), createdAt: new Date().toISOString() })); }
  private result(id: string, control: ExecutionControl, error?: string): ManagedExecutionResult { return Object.freeze({ executionId: id, planId: control.plan.id, state: control.machine.current as ManagedExecutionResult['state'], steps: Object.freeze(Object.fromEntries(control.states)), attempts: Object.freeze(Object.fromEntries(control.attempts)), context: control.context.snapshot(), error }); }
  private nextId(plan: ExecutionPlan): string { return `${plan.id}-run-${++this.sequence}`; }
}
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
