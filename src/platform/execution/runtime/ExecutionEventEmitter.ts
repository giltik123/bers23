import type { ExecutionResult, StepExecutionState } from './ExecutionResult';

/** Payload map for runtime lifecycle events. */
export interface ExecutionEventMap {
  'execution.started': { readonly executionId: string; readonly planId: string };
  'execution.step.started': { readonly executionId: string; readonly step: StepExecutionState };
  'execution.step.completed': { readonly executionId: string; readonly step: StepExecutionState };
  'execution.step.failed': { readonly executionId: string; readonly step: StepExecutionState };
  'execution.completed': ExecutionResult;
  'execution.failed': ExecutionResult;
  'execution.cancelled': ExecutionResult;
}
type ExecutionEventName = keyof ExecutionEventMap;
type ExecutionEventListener<Event extends ExecutionEventName> = (payload: ExecutionEventMap[Event]) => void | Promise<void>;

/** Small typed event emitter independent of Core, UI, and business modules. */
export class ExecutionEventEmitter {
  private readonly listeners = new Map<ExecutionEventName, Set<(payload: never) => void | Promise<void>>>();

  on<Event extends ExecutionEventName>(event: Event, listener: ExecutionEventListener<Event>): () => void {
    const listeners = this.listeners.get(event) ?? new Set();
    listeners.add(listener as (payload: never) => void | Promise<void>);
    this.listeners.set(event, listeners);
    return () => this.off(event, listener);
  }
  once<Event extends ExecutionEventName>(event: Event, listener: ExecutionEventListener<Event>): () => void {
    const wrapped: ExecutionEventListener<Event> = async (payload) => { this.off(event, wrapped); await listener(payload); };
    return this.on(event, wrapped);
  }
  off<Event extends ExecutionEventName>(event: Event, listener: ExecutionEventListener<Event>): void {
    this.listeners.get(event)?.delete(listener as (payload: never) => void | Promise<void>);
  }
  async emit<Event extends ExecutionEventName>(event: Event, payload: ExecutionEventMap[Event]): Promise<void> {
    await Promise.allSettled([...(this.listeners.get(event) ?? [])].map((listener) => listener(payload as never)));
  }
}
