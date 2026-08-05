import type { CreativeCanvas, CreativeCanvasSnapshot } from './CreativeTypes';

export function immutableCreativeSnapshot<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map((item) => immutableCreativeSnapshot(item))) as T;
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, item]) => [key, immutableCreativeSnapshot(item)]))) as T;
}

export function canvasSnapshot(canvas: CreativeCanvas): CreativeCanvasSnapshot {
  return immutableCreativeSnapshot({ layers: canvas.layers, masks: canvas.masks, adjustments: canvas.adjustments, selectedLayerId: canvas.selectedLayerId, status: canvas.status });
}
