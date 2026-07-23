class DiskCache {
  constructor() { this.name = 'photo-editor-previews-v1'; }
  async put(url, response) { if (!('caches' in window)) return; const cache = await caches.open(this.name); await cache.put(url, response.clone()); }
  async match(url) { if (!('caches' in window)) return null; const cache = await caches.open(this.name); return cache.match(url); }
  async usage() { if (!navigator.storage?.estimate) return null; const data = await navigator.storage.estimate(); return Math.round((data.usage || 0) / 1048576); }
}
export const diskCache = new DiskCache();