// SegmentationCache — caches full segmentation results per image URL so
// identical images never trigger a second provider call.

const cache = new Map();

export const segmentationCache = {
  get(imageUrl) {
    return cache.get(imageUrl) || null;
  },
  set(imageUrl, result) {
    cache.set(imageUrl, { ...result, cachedAt: new Date().toISOString() });
  },
  invalidate(imageUrl) {
    cache.delete(imageUrl);
  },
  clear() {
    cache.clear();
  },
  size() {
    return cache.size;
  },
};