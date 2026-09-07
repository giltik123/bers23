// NotificationCenter is intentionally session-local until a narrow durable Core
// notification authority exists. The generic legacy /data/Notification surface is
// not production authority and must not be contacted by the release browser path.
class NotificationCenter {
  constructor() { this.items = []; this.listeners = new Set(); this.loaded = false; }
  subscribe(fn) { this.listeners.add(fn); fn(this.snapshot()); return () => this.listeners.delete(fn); }
  snapshot() { return { items: [...this.items], unread: this.items.filter((item) => !item.read).length }; }
  _notify() { const state = this.snapshot(); this.listeners.forEach((fn) => fn(state)); }
  async ensure() {
    if (!this.loaded) { this.loaded = true; this._notify(); }
    return this.items;
  }
  async push({ title, message, type = 'info', jobId = null, projectId = null }) {
    const item = Object.freeze({
      id: globalThis.crypto?.randomUUID?.() || `notification-${Date.now()}`,
      title,
      message,
      type,
      read: false,
      job_id: jobId,
      project_id: projectId,
      metadata: Object.freeze({}),
      created_date: new Date().toISOString(),
    });
    this.items = [item, ...this.items].slice(0, 25); this._notify(); return item;
  }
  async markRead(id) {
    const item = this.items.find((entry) => entry.id === id); if (!item || item.read) return;
    this.items = this.items.map((entry) => entry.id === id ? { ...entry, read: true } : entry); this._notify();
  }
  async markAllRead() {
    this.items = this.items.map((item) => ({ ...item, read: true })); this._notify();
  }
}
export const notificationCenter = new NotificationCenter();