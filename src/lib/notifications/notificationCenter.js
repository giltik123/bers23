import { coreClient } from '@/api/coreClient';

// NotificationCenter — persistent, user-scoped notifications for completed
// history commits and job failures. It remains independent of AI providers.
class NotificationCenter {
  constructor() { this.items = []; this.listeners = new Set(); this.loaded = false; }
  subscribe(fn) { this.listeners.add(fn); fn(this.snapshot()); return () => this.listeners.delete(fn); }
  snapshot() { return { items: [...this.items], unread: this.items.filter((item) => !item.read).length }; }
  _notify() { const state = this.snapshot(); this.listeners.forEach((fn) => fn(state)); }
  async ensure() {
    if (this.loaded) return this.items;
    const user = await coreClient.auth.me();
    this.items = await coreClient.entities.Notification.filter({ created_by_id: user.id }, '-created_date', 25);
    this.loaded = true; this._notify(); return this.items;
  }
  async push({ title, message, type = 'info', jobId = null, projectId = null }) {
    const item = await coreClient.entities.Notification.create({ title, message, type, read: false, job_id: jobId, project_id: projectId, metadata: {} });
    this.items = [item, ...this.items].slice(0, 25); this._notify(); return item;
  }
  async markRead(id) {
    const item = this.items.find((entry) => entry.id === id); if (!item || item.read) return;
    await coreClient.entities.Notification.update(id, { read: true });
    this.items = this.items.map((entry) => entry.id === id ? { ...entry, read: true } : entry); this._notify();
  }
  async markAllRead() {
    await Promise.all(this.items.filter((item) => !item.read).map((item) => coreClient.entities.Notification.update(item.id, { read: true })));
    this.items = this.items.map((item) => ({ ...item, read: true })); this._notify();
  }
}
export const notificationCenter = new NotificationCenter();