import { getActiveProvider } from '@/lib/segmentation/segmentationProvider';

// Segmentation progress bus — providers publish, UI subscribes.
// Keeps the Editor decoupled from any specific provider.

const listeners = new Set();

// event: { phase: 'validating'|'preparing'|'segmenting'|'retrying'|'parsing'|'done'|'error'|'cancelled',
//          provider, attempt?, message? }
export function publishSegmentationEvent(event) {
  listeners.forEach((fn) => fn(event));
}

export function subscribeSegmentation(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// Cancels whatever segmentation is currently running (stays inside the layer).
export function cancelActiveSegmentation() {
  getActiveProvider()?.cancel();
}