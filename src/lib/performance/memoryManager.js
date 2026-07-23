class MemoryManager {
  constructor() { this.releases = new Map(); this.limitMb = 96; }
  configure(profile) { this.limitMb = profile.cacheMb; }
  register(key, release) { this.releases.set(key, { release, touched: Date.now() }); this.trim(); }
  touch(key) { const entry = this.releases.get(key); if (entry) entry.touched = Date.now(); }
  release(key) { const entry = this.releases.get(key); if (!entry) return; entry.release?.(); this.releases.delete(key); }
  trim() { while (this.releases.size > 24) { const oldest = [...this.releases.entries()].sort((a, b) => a[1].touched - b[1].touched)[0]; this.release(oldest[0]); } }
  usageMb() { return performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null; }
  snapshot() { return { usageMb: this.usageMb(), retainedImages: this.releases.size, limitMb: this.limitMb }; }
}
export const memoryManager = new MemoryManager();