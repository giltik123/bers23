import { deviceProfiler } from '@/lib/performance/deviceProfiler';
import { imageMemoryCache } from '@/lib/performance/imageMemoryCache';
import { diskCache } from '@/lib/performance/diskCache';
import { networkManager } from '@/lib/performance/networkManager';

export const PREVIEW_LEVELS = ['thumbnail', 'low', 'medium', 'high', 'original'];
class PreviewCache {
  constructor() { this.pending = new Map(); }
  source(project, requested = 'thumbnail') {
    const profile = deviceProfiler.snapshot(); const level = requested === 'high' && profile.previewQuality === 'medium' ? 'medium' : requested;
    const url = level === 'thumbnail' ? project.thumbnail_url : project.preview_url || project.current_image_url;
    if (url) imageMemoryCache.set(`${project.id}:${level}`, url); return url || null;
  }
  gallery(project) { return project.thumbnail_url ? this.source(project, 'thumbnail') : null; }
  warm(url) {
    const network = networkManager.snapshot(); if (!url || !network.online || network.slow || network.metered) return () => {};
    if (this.pending.has(url)) return this.pending.get(url).cancel;
    const controller = new AbortController(); const cancel = () => controller.abort(); this.pending.set(url, { cancel });
    diskCache.match(url).then((cached) => !cached && fetch(url, { signal: controller.signal }).then((response) => diskCache.put(url, response))).catch(() => {}).finally(() => this.pending.delete(url));
    return cancel;
  }
  cancelAll() { this.pending.forEach(({ cancel }) => cancel()); this.pending.clear(); }
  snapshot() { return { levels: PREVIEW_LEVELS, pending: this.pending.size, ...imageMemoryCache.snapshot() }; }
}
export const previewCache = new PreviewCache();