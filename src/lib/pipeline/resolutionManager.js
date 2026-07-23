// ResolutionManager — resolution tiers and automatic selection of the best processing resolution.
export const RESOLUTION_TIERS = {
  preview: { label: 'Preview', maxDim: 512 },
  standard: { label: 'Standard', maxDim: 1024 },
  hd: { label: 'HD', maxDim: 2048 },
  original: { label: 'Original', maxDim: Infinity },
};

class ResolutionManager {
  // Auto-select: small images process at original; large ones step down to keep AI calls fast.
  selectProcessingTier(width, height) {
    const dim = Math.max(width, height);
    if (dim <= RESOLUTION_TIERS.standard.maxDim) return 'original';
    if (dim <= RESOLUTION_TIERS.hd.maxDim) return 'hd';
    return 'hd';
  }

  dimensionsFor(tier, width, height) {
    const maxDim = RESOLUTION_TIERS[tier]?.maxDim ?? Infinity;
    const dim = Math.max(width, height);
    if (dim <= maxDim) return { width, height, scale: 1 };
    const scale = maxDim / dim;
    return { width: Math.round(width * scale), height: Math.round(height * scale), scale };
  }

  format(width, height) { return width && height ? `${width} × ${height}px` : '—'; }

  tierLabel(tier) { return RESOLUTION_TIERS[tier]?.label || tier; }
}

export const resolutionManager = new ResolutionManager();