// GenerationCache — caches completed generations to avoid duplicate provider calls.
export const PIPELINE_VERSION = '1.0';

export function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

class GenerationCache {
  constructor() { this.map = new Map(); this.hits = 0; this.misses = 0; }

  key({ projectId, prompt, objectIds = [], maskUrls = [], resolution }) {
    return hashString([
      projectId, prompt,
      [...objectIds].sort().join(','),
      [...maskUrls].sort().join(','),
      resolution ? `${resolution.width}x${resolution.height}` : '',
      PIPELINE_VERSION,
    ].join('|'));
  }

  get(key) {
    const hit = this.map.get(key) || null;
    hit ? this.hits++ : this.misses++;
    return hit;
  }

  set(key, result) {
    this.map.set(key, { ...result, cachedAt: Date.now() });
    if (this.map.size > 50) this.map.delete(this.map.keys().next().value);
  }

  stats() { return { size: this.map.size, hits: this.hits, misses: this.misses }; }
}

export const generationCache = new GenerationCache();