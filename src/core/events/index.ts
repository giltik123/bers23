/** Listener accepted by the framework-independent event bus. */
export type EventListener<Payload> = (payload: Payload) => void;

/** Synchronous, typed event bus with explicit subscription cleanup. */
export class EventBus<Events extends object = Record<string, unknown>> {
  private readonly listeners = new Map<keyof Events, Set<EventListener<Events[keyof Events]>>>();

  /** Emits an event to a snapshot of its current listeners. */
  emit<EventName extends keyof Events>(event: EventName, payload: Events[EventName]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    for (const handler of [...handlers]) handler(payload);
  }

  /** Subscribes to an event and returns an unsubscribe function. */
  on<EventName extends keyof Events>(event: EventName, listener: EventListener<Events[EventName]>): () => void {
    const handlers = this.listeners.get(event) ?? new Set<EventListener<Events[keyof Events]>>();
    handlers.add(listener as EventListener<Events[keyof Events]>);
    this.listeners.set(event, handlers);
    return () => this.off(event, listener);
  }

  /** Subscribes to the next occurrence of an event. */
  once<EventName extends keyof Events>(event: EventName, listener: EventListener<Events[EventName]>): () => void {
    const unsubscribe = this.on(event, (payload) => {
      unsubscribe();
      listener(payload);
    });
    return unsubscribe;
  }

  /** Removes one listener from an event. */
  off<EventName extends keyof Events>(event: EventName, listener: EventListener<Events[EventName]>): void {
    const handlers = this.listeners.get(event);
    handlers?.delete(listener as EventListener<Events[keyof Events]>);
    if (handlers?.size === 0) this.listeners.delete(event);
  }

  /** Removes listeners for one event or for the entire bus. */
  removeAll<EventName extends keyof Events>(event?: EventName): void {
    if (event === undefined) this.listeners.clear();
    else this.listeners.delete(event);
  }

  /** Returns the number of listeners registered for an event. */
  listenerCount<EventName extends keyof Events>(event: EventName): number {
    return this.listeners.get(event)?.size ?? 0;
  }
}

