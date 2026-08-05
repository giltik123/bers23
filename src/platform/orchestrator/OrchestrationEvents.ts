export type OrchestrationEventName = 'orchestration.started' | 'orchestration.planned' | 'orchestration.runtime.started' | 'orchestration.completed' | 'orchestration.failed' | 'orchestration.cancelled' | 'orchestration.recovered';
export interface OrchestrationEvent { readonly name: OrchestrationEventName; readonly sessionId: string; readonly timestamp: string; readonly metadata?: Readonly<Record<string, unknown>>; }
export type OrchestrationEventListener = (event: OrchestrationEvent) => void | Promise<void>;

/** Tiny typed event emitter dedicated to orchestration lifecycle events. */
export class OrchestrationEvents {
  private readonly listeners = new Map<OrchestrationEventName, Set<OrchestrationEventListener>>();
  on(name: OrchestrationEventName, listener: OrchestrationEventListener): () => void { const set = this.listeners.get(name) ?? new Set(); set.add(listener); this.listeners.set(name, set); return () => this.off(name, listener); }
  off(name: OrchestrationEventName, listener: OrchestrationEventListener): void { this.listeners.get(name)?.delete(listener); }
  async emit(name: OrchestrationEventName, sessionId: string, metadata?: Readonly<Record<string, unknown>>): Promise<void> {
    const event = Object.freeze({ name, sessionId, timestamp: new Date().toISOString(), metadata: metadata ? Object.freeze({ ...metadata }) : undefined });
    await Promise.all([...(this.listeners.get(name) ?? [])].map((listener) => listener(event)));
  }
}
