// PerspectiveAnalyzer — extracts the perspective profile and detects perspective drift.
class PerspectiveAnalyzer {
  extract(raw = {}) {
    const p = raw.perspective || {};
    return {
      horizon: p.horizon || 'level',
      vanishing: p.vanishing || 'single-point',
      distortion: p.distortion || 'none',
    };
  }

  directive(p) {
    if (!p) return '';
    return `Preserve the perspective: ${p.horizon} horizon, ${p.vanishing} perspective, ${p.distortion} distortion.`;
  }

  drift(text, p) {
    if (!p) return null;
    if (/perspective|rotate|tilt|viewpoint|straighten|vanishing|horizon/i.test(text)) {
      return {
        category: 'perspective', severity: 0.65,
        message: 'Perspective mismatch detected.',
        correction: 'Match the original perspective, horizon line and vanishing points exactly.',
      };
    }
    return null;
  }
}

export const perspectiveAnalyzer = new PerspectiveAnalyzer();