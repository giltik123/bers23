import { networkManager } from './networkManager.js';

// In-memory, tab-scoped retry queue. Never persist File payloads or replay
// an operation more than once concurrently.
export class OfflineQueue {
  constructor() {
    this.items = [];
    this.handlers = new Map();
    this.running = new Map();
    this.flushPromise = null;
    networkManager.subscribe((state) => state.online && this.flush());
  }

  register(kind, handler) { this.handlers.set(kind, handler); }

  enqueue(item) {
    const queued = { ...item, id: `${Date.now()}_${Math.random()}`, attempts: 0 };
    this.items.push(queued);
    return queued.id;
  }

  cancel(id) {
    this.running.get(id)?.abort();
    this.running.delete(id);
    this.items = this.items.filter((item) => item.id !== id);
  }

  async flush() {
    // Network reconnect events can overlap while a File upload is pending.
    // All callers join the same drain, rather than dispatching the head twice.
    if (this.flushPromise) return this.flushPromise;
    const task = (async () => {
      while (this.items.length && networkManager.snapshot().online) {
        const item = this.items[0];
        const handler = this.handlers.get(item.kind);
        if (!handler) {
          this.items.shift();
          continue;
        }
        const controller = new AbortController();
        this.running.set(item.id, controller);
        try {
          await handler(item, controller.signal);
          // A cancelled upload must not consume the next queued operation.
          if (this.items[0]?.id === item.id) this.items.shift();
        } catch {
          // The caller may have cancelled and removed this item while the
          // handler was in flight; never penalize or drop the next item.
          if (this.items[0]?.id !== item.id) continue;
          item.attempts += 1;
          if (item.attempts >= 3) this.items.shift();
          else break;
        } finally {
          this.running.delete(item.id);
        }
      }
    })();
    this.flushPromise = task;
    try {
      await task;
    } finally {
      if (this.flushPromise === task) this.flushPromise = null;
    }
  }

  snapshot() { return { queued: this.items.length, running: this.running.size }; }
}
export const offlineQueue = new OfflineQueue();
