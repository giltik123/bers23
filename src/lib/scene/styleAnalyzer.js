// StyleAnalyzer — extracts the overall image style profile (realism, noise,
// sharpness, dynamic range, mood) and detects style drift.
class StyleAnalyzer {
  extract(raw = {}) {
    const s = raw.style || {};
    return {
      overall_style: s.overall_style || 'photograph',
      realism: s.realism || 'photorealistic',
      noise: s.noise || 'low',
      sharpness: s.sharpness || 'sharp',
      dynamic_range: s.dynamic_range || 'medium',
      mood: s.mood || 'neutral',
    };
  }

  directive(p) {
    if (!p) return '';
    return `Preserve the image style: ${p.realism} ${p.overall_style}, ${p.sharpness} sharpness, ${p.noise} noise level, ${p.dynamic_range} dynamic range.`;
  }

  drift(text, p) {
    if (!p) return null;
    if (/cartoon|anime|painting|illustration|3d render|sketch|drawing|pixel art|watercolor|stylize/i.test(text)) {
      return {
        category: 'style', severity: 0.8,
        message: 'The edit may break the photographic realism of the scene.',
        correction: 'Apply the change while keeping the photographic realism, grain and sharpness of the original image.',
      };
    }
    return null;
  }
}

export const styleAnalyzer = new StyleAnalyzer();