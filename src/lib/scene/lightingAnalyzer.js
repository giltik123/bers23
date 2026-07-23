// LightingAnalyzer — extracts the lighting profile from raw scene analysis and
// produces preservation directives + drift detection for lighting.
class LightingAnalyzer {
  extract(raw = {}) {
    const l = raw.lighting || {};
    return {
      type: l.type || 'natural',
      direction: l.direction || 'front',
      quality: l.quality || 'soft',
      time_of_day: l.time_of_day || 'day',
      contrast: l.contrast || 'medium',
      brightness: l.brightness || 'medium',
    };
  }

  directive(p) {
    if (!p) return '';
    return `Preserve the original scene lighting: ${p.quality} ${p.type} light from the ${p.direction}, ${p.time_of_day} time of day, ${p.contrast} contrast and ${p.brightness} brightness.`;
  }

  drift(text, p) {
    if (!p) return null;
    if (/relight|lighting|golden hour|sunset|sunrise|dramatic light|studio light|neon|night|dark|brighter|moody/i.test(text)) {
      return {
        category: 'lighting', severity: 0.7,
        message: 'Lighting differs from the original scene.',
        correction: 'Blend the new lighting smoothly with the original scene lighting, keeping shadow direction and overall exposure consistent.',
      };
    }
    return null;
  }
}

export const lightingAnalyzer = new LightingAnalyzer();