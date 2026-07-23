import { memoryManager } from '@/lib/performance/memoryManager';

class ImageMemoryCache {
  constructor() { this.entries = new Map(); this.visible = new Set(); }
  set(key, url) { this.entries.set(key, { url, touched: Date.now() }); memoryManager.register(`image:${key}`, () => this.entries.delete(key)); }
  get(key) { const entry = this.entries.get(key); if (entry) { entry.touched = Date.now(); memoryManager.touch(`image:${key}`); } return entry?.url || null; }
  setVisible(keys) { this.visible = new Set(keys); [...this.entries.keys()].filter((key) => !this.visible.has(key)).forEach((key) => this.entries.delete(key)); }
  snapshot() { return { entries: this.entries.size, visible: this.visible.size }; }
}
export const imageMemoryCache = new ImageMemoryCache();