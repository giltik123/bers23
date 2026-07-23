// MemoryCache — caches scene analysis per (project, original image). Invalidated
// ONLY when the original image changes or the user explicitly resets scene memory.
const KEY = 'scene_memory_cache_v1';

class MemoryCache {
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
  }

  write(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* storage full — cache is best-effort */ }
  }

  get(projectId, sourceUrl) {
    const entry = this.read()[projectId];
    return entry && entry.source_url === sourceUrl ? entry : null;
  }

  set(projectId, memory) {
    const store = this.read();
    store[projectId] = memory;
    this.write(store);
  }

  invalidate(projectId) {
    const store = this.read();
    delete store[projectId];
    this.write(store);
  }
}

export const memoryCache = new MemoryCache();