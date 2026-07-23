import { genId } from '@/lib/projectService';

// MaskManager — in-memory store for object masks.
// Mask: { maskId, objectId, resolution, polygon, preview, createdAt, status }

const masks = new Map();

export function saveMask(data) {
  const mask = {
    maskId: data.maskId || genId(),
    objectId: data.objectId || null,
    resolution: data.resolution || null, // { width, height }
    polygon: data.polygon || null, // array of [x, y] points
    preview: data.preview || null, // preview image url
    createdAt: data.createdAt || new Date().toISOString(),
    status: data.status || 'ready', // pending | ready | failed
  };
  masks.set(mask.maskId, mask);
  return mask;
}

export function loadMask(maskId) {
  return masks.get(maskId) || null;
}

export function replaceMask(maskId, data) {
  const existing = masks.get(maskId);
  if (!existing) return null;
  const updated = { ...existing, ...data, maskId };
  masks.set(maskId, updated);
  return updated;
}

export function deleteMask(maskId) {
  return masks.delete(maskId);
}

// Reduce polygon detail — keeps every Nth point.
export function compressMask(maskId, factor = 2) {
  const mask = masks.get(maskId);
  if (!mask?.polygon) return mask || null;
  return replaceMask(maskId, {
    polygon: mask.polygon.filter((_, i) => i % factor === 0),
  });
}

export function getMasksForObject(objectId) {
  return [...masks.values()].filter((m) => m.objectId === objectId);
}

export function getAllMasks() {
  return [...masks.values()];
}

export function clearMasks() {
  masks.clear();
}