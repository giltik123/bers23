/** Standard namespaces reserved for application event names. */
export type CoreEventNamespace = 'editing' | 'planner' | 'scene' | 'recipe' | 'provider' | 'workspace' | 'fashion' | 'jobs' | 'automation';

/** Namespaced event name, such as `editing.started`. */
export type NamespacedEventName = `${CoreEventNamespace}.${string}`;

/** Listener accepted by the framework-independent event bus. */
export type EventListener<Payload> = (payload: Payload, event: string) => void | Promise<void>;

type EventKey<Events> = Extract<keyof Events, string>;
type WildcardKey = `${string}.*` | '*';

/** Synchronous and asynchronous typed event bus with namespace wildcards. */
export class EventBus<Events extends object = Record<NamespacedEventName, unknown>> {
  private readonly listeners = new Map<string, Set<EventListener<unknown>>>();

  /** Emits an event synchronously; returned promises continue independently. */
  emit<EventName extends EventKey<Events>>(event: EventName, payload: Events[EventName]): void {
    for (const listener of this.matchingListeners(event)) void listener(payload, event);
  }

  /** Emits an event and waits for all matching listeners to settle successfully. */
  async emitAsync<EventName extends EventKey<Events>>(event: EventName, payload: Events[EventName]): Promise<void> {
    await Promise.all(this.matchingListeners(event).map((listener) => listener(payload, event)));
  }

  /** Subscribes to an exact event and returns an unsubscribe function. */
  on<EventName extends EventKey<Events>>(event: EventName, listener: EventListener<Events[EventName]>): () => void;
  /** Subscribes to a namespace wildcard and returns an unsubscribe function. */
  on(event: WildcardKey, listener: EventListener<unknown>): () => void;
  on(event: string, listener: EventListener<unknown>): () => void {
    const handlers = this.listeners.get(event) ?? new Set<EventListener<unknown>>();
    handlers.add(listener);
    this.listeners.set(event, handlers);
    return () => this.offInternal(event, listener);
  }

  /** Subscribes to the next matching event. */
  once<EventName extends EventKey<Events>>(event: EventName, listener: EventListener<Events[EventName]>): () => void;
  /** Subscribes once to a namespace wildcard. */
  once(event: WildcardKey, listener: EventListener<unknown>): () => void;
  once(event: string, listener: EventListener<unknown>): () => void {
    let unsubscribe = (): void => undefined;
    unsubscribe = this.onInternal(event, async (payload, emittedEvent) => {
      unsubscribe();
      await listener(payload, emittedEvent);
    });
    return unsubscribe;
  }

  /** Removes one exact-event listener. */
  off<EventName extends EventKey<Events>>(event: EventName, listener: EventListener<Events[EventName]>): void;
  /** Removes one wildcard listener. */
  off(event: WildcardKey, listener: EventListener<unknown>): void;
  off(event: string, listener: EventListener<unknown>): void { this.offInternal(event, listener); }

  /** Removes listeners for one event pattern or for the entire bus. */
  removeAll(event?: EventKey<Events> | WildcardKey): void {
    if (event === undefined) this.listeners.clear(); else this.listeners.delete(event);
  }

  /** Returns the number of listeners registered for an exact name or wildcard. */
  listenerCount(event: EventKey<Events> | WildcardKey): number { return this.listeners.get(event)?.size ?? 0; }

  /** Resolves with the next payload for an event, with optional timeout and cancellation. */
  waitFor<EventName extends EventKey<Events>>(
    event: EventName,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<Events[EventName]> {
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const cleanup = this.on(event, (payload) => { finish(); resolve(payload); });
      const abort = (): void => { finish(); reject(options.signal?.reason); };
      const finish = (): void => {
        cleanup();
        if (timer) clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
      };
      if (options.signal?.aborted) return abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.timeoutMs !== undefined) timer = setTimeout(() => {
        finish();
        reject(new Error(`Timed out waiting for event: ${event}`));
      }, options.timeoutMs);
    });
  }

  private onInternal(event: string, listener: EventListener<unknown>): () => void {
    const handlers = this.listeners.get(event) ?? new Set<EventListener<unknown>>();
    handlers.add(listener); this.listeners.set(event, handlers);
    return () => this.offInternal(event, listener);
  }

  private offInternal(event: string, listener: EventListener<unknown>): void {
    const handlers = this.listeners.get(event);
    handlers?.delete(listener);
    if (handlers?.size === 0) this.listeners.delete(event);
  }

  private matchingListeners(event: string): EventListener<unknown>[] {
    const namespace = `${event.split('.')[0]}.*`;
    return [...(this.listeners.get(event) ?? []), ...(this.listeners.get(namespace) ?? []), ...(this.listeners.get('*') ?? [])];
  }
}
