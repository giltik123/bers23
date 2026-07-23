// ObjectCache — caches detected objects per project + image state.
// Invalidated whenever the image changes (edit, undo, restore, version restore),
// because the cache key includes the image URL.

const cache = new Map();

const key = (projectId, imageUrl) => `${projectId}::${imageUrl}`;

export const objectCache = {
  get(projectId, imageUrl) {
    return cache.get(key(projectId, imageUrl)) || null;
  },
  set(projectId, imageUrl, objects) {
    cache.set(key(projectId, imageUrl), objects);
  },
  // Invalidate all cached object lists for a project (restore / version restore).
  invalidateProject(projectId) {
    for (const k of cache.keys()) {
      if (k.startsWith(`${projectId}::`)) cache.delete(k);
    }
  },
  clear() {
    cache.clear();
  },
};