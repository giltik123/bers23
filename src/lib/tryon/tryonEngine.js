export const TRYON_EXECUTION_NOT_WIRED = 'TRYON_EXECUTION_NOT_WIRED';

// Compatibility facade only. Production image-producing Try-On must be owned by
// the canonical server execution/Artifact/Transaction authorities. No browser
// provider call or URL-chained multi-garment execution is permitted here.
class TryOnEngine {
  constructor() { this.cancelled = false; }

  cancel() { this.cancelled = true; }

  async execute() {
    const error = new Error('Virtual Try-On execution is not wired to the canonical server authority.');
    error.code = TRYON_EXECUTION_NOT_WIRED;
    error.retryable = false;
    throw error;
  }
}

export const tryonEngine = new TryOnEngine();
