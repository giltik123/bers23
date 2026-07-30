import { registerProvider, getActiveProvider } from '@/lib/segmentation/segmentationProvider';
import { SAM3Provider } from '@/lib/segmentation/sam3Provider';
import { logSegmentation } from '@/lib/segmentation/segmentationLogger';
import { objectCache } from '@/lib/segmentation/objectCache';
import { segmentationCache } from '@/lib/segmentation/segmentationCache';
import { saveMask, getMasksForObject, getAllMasks } from '@/lib/segmentation/maskManager';

// SegmentationService — the ONLY public interface to segmentation.
// Editor, AI Planner and future AI services talk to this facade exclusively;
// providers behind it (current detection, future SAM3) are interchangeable.

registerProvider(new SAM3Provider());

export const segmentationService = {
  // Start segmentation: cache-first, then delegate to the active provider.
  // Returns { status, objects, masks, fromCache }.
  async start({ projectId, imageUrl, force = false }) {
    if (!force) {
      const cached = segmentationCache.get(imageUrl);
      if (cached) {
        logSegmentation({ provider: 'cache', cacheHit: true, objectsDetected: cached.objects?.length || 0 });
        return { ...cached, status: 'completed', fromCache: true };
      }
    }

    const provider = getActiveProvider();
    if (!provider) return { status: 'no_provider', objects: [], masks: [], fromCache: false };

    const { objects, masks } = await provider.segmentImage(imageUrl, projectId);
    (masks || []).forEach(saveMask);
    this.save({ projectId, imageUrl, objects, masks: masks || [] });
    return { status: 'completed', objects, masks: masks || [], fromCache: false };
  },

  // Load a cached result without triggering any provider.
  loadCached(imageUrl) {
    return segmentationCache.get(imageUrl);
  },

  // Persist a result into both caches.
  save({ projectId, imageUrl, objects, masks = [] }) {
    segmentationCache.set(imageUrl, { objects, masks });
    if (projectId) objectCache.set(projectId, imageUrl, objects);
  },

  // Force a fresh segmentation, bypassing caches.
  refresh({ projectId, imageUrl }) {
    segmentationCache.invalidate(imageUrl);
    return this.start({ projectId, imageUrl, force: true });
  },

  // Clear cached data (project restored / version restored / image changed).
  clear({ projectId, imageUrl } = {}) {
    if (imageUrl) segmentationCache.invalidate(imageUrl);
    if (projectId) objectCache.invalidateProject(projectId);
  },

  getObjects(projectId, imageUrl) {
    return objectCache.get(projectId, imageUrl) || [];
  },

  getMasks(objectId) {
    return objectId ? getMasksForObject(objectId) : getAllMasks();
  },

  getProviderStatus() {
    const provider = getActiveProvider();
    return provider ? { provider: provider.name, status: provider.getStatus() } : { provider: null, status: 'no_provider' };
  },
};
