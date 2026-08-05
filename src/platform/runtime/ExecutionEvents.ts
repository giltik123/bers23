import type { ExecutionState } from './ExecutionState';

export interface RuntimeExecutionEventMap {
  'execution.started': { readonly executionId: string; readonly planId: string };
  'execution.step.started': { readonly executionId: string; readonly stepId: string; readonly attempt: number };
  'execution.step.completed': { readonly executionId: string; readonly stepId: string; readonly attempt: number };
  'execution.failed': { readonly executionId: string; readonly error: string };
  'execution.completed': { readonly executionId: string; readonly planId: string };
  'execution.cancelled': { readonly executionId: string; readonly planId: string };
  'execution.state.changed': { readonly executionId: string; readonly state: ExecutionState };
}
type EventName = keyof RuntimeExecutionEventMap;
type Listener<Event extends EventName> = (payload: RuntimeExecutionEventMap[Event]) => void | Promise<void>;

/** Typed runtime event stream whose observers cannot break execution. */
export class ExecutionEvents {
  private readonly listeners = new Map<EventName, Set<(payload: never) => void | Promise<void>>>();
  on<Event extends EventName>(event: Event, listener: Listener<Event>): () => void { const set = this.listeners.get(event) ?? new Set(); set.add(listener as (payload: never) => void | Promise<void>); this.listeners.set(event, set); return () => set.delete(listener as (payload: never) => void | Promise<void>); }
  async emit<Event extends EventName>(event: Event, payload: RuntimeExecutionEventMap[Event]): Promise<void> { await Promise.allSettled([...(this.listeners.get(event) ?? [])].map((listener) => listener(payload as never))); }
}
