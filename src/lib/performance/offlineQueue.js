import { networkManager } from '@/lib/performance/networkManager';

class OfflineQueue {
  constructor() { this.items = []; this.handlers = new Map(); this.running = new Map(); networkManager.subscribe((state) => state.online && this.flush()); }
  register(kind, handler) { this.handlers.set(kind, handler); }
  enqueue(item) { const queued = { ...item, id: `${Date.now()}_${Math.random()}`, attempts: 0 }; this.items.push(queued); return queued.id; }
  cancel(id) { this.running.get(id)?.abort(); this.running.delete(id); this.items = this.items.filter((item) => item.id !== id); }
  async flush() { while (this.items.length && networkManager.snapshot().online) { const item = this.items[0]; const handler = this.handlers.get(item.kind); if (!handler) { this.items.shift(); continue; } const controller = new AbortController(); this.running.set(item.id, controller); try { await handler(item, controller.signal); this.items.shift(); } catch { item.attempts += 1; if (item.attempts >= 3) this.items.shift(); else break; } finally { this.running.delete(item.id); } } }
  snapshot() { return { queued: this.items.length, running: this.running.size }; }
}
export const offlineQueue = new OfflineQueue();