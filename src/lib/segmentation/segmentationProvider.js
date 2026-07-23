// SegmentationProvider — abstract interface every segmentation provider must implement.
// Future providers (SAM3, etc.) extend this class and are fully interchangeable.
// Nothing outside the Segmentation Layer may talk to a provider directly.

export class SegmentationProvider {
  constructor(name) {
    this.name = name;
    this.status = 'idle'; // idle | running | completed | failed | cancelled
  }

  // Must return { objects: [], masks: [] } in project-schema shape.
  async segmentImage(_imageUrl, _options = {}) {
    throw new Error(`${this.name}: segmentImage() not implemented`);
  }

  getStatus() {
    return this.status;
  }

  cancel() {
    this.status = 'cancelled';
  }

  async healthCheck() {
    return { healthy: false, provider: this.name };
  }
}

// --- Provider registry: exactly one active provider at a time ---
let activeProvider = null;

export function registerProvider(provider) {
  activeProvider = provider;
}

export function getActiveProvider() {
  return activeProvider;
}