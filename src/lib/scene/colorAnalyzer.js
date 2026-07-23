// ColorAnalyzer — extracts the color/grading profile and detects color drift.
class ColorAnalyzer {
  extract(raw = {}) {
    const c = raw.color || {};
    return {
      palette: Array.isArray(c.palette) ? c.palette.slice(0, 6) : [],
      white_balance: c.white_balance || 'neutral',
      saturation: c.saturation || 'natural',
      grading_style: c.grading_style || 'natural',
    };
  }

  directive(p) {
    if (!p) return '';
    const palette = p.palette.length ? ` Dominant palette: ${p.palette.join(', ')}.` : '';
    return `Preserve the original color grading: ${p.grading_style} grade, ${p.white_balance} white balance, ${p.saturation} saturation.${palette}`;
  }

  drift(text, p) {
    if (!p) return null;
    if (/black and white|monochrome|vintage|sepia|color grad|saturat|desaturat|filter|teal and orange|cinematic color/i.test(text)) {
      return {
        category: 'color', severity: 0.6,
        message: 'Color grading drift detected.',
        correction: 'Keep the new colors harmonized with the original white balance and overall color grading of the photo.',
      };
    }
    return null;
  }
}

export const colorAnalyzer = new ColorAnalyzer();