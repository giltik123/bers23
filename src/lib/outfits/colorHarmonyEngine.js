// ColorHarmonyEngine — evaluates the color relationships in an outfit from the
// garments' named colors. Returns a scheme, score and recommendations.
const COLOR_HUES = {
  red: 0, burgundy: 350, maroon: 345, coral: 15, orange: 30, rust: 25, gold: 45, yellow: 60,
  olive: 80, lime: 90, green: 120, emerald: 140, mint: 150, teal: 170, turquoise: 175, cyan: 190,
  blue: 220, navy: 230, indigo: 250, purple: 280, violet: 275, lavender: 285, magenta: 310, pink: 330, rose: 340,
};
const NEUTRALS = ['black', 'white', 'gray', 'grey', 'beige', 'cream', 'ivory', 'tan', 'khaki', 'brown', 'charcoal', 'off-white', 'sand', 'camel', 'silver'];

class ColorHarmonyEngine {
  parse(colorName) {
    const c = (colorName || '').toLowerCase();
    if (NEUTRALS.some((n) => c.includes(n))) return { neutral: true };
    for (const [name, hue] of Object.entries(COLOR_HUES)) {
      if (c.includes(name)) return { neutral: false, hue, name };
    }
    return null; // unknown color
  }

  hueDistance(a, b) {
    const d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  analyze(colors) {
    const parsed = colors.map((c) => this.parse(c)).filter(Boolean);
    const hues = parsed.filter((p) => !p.neutral);
    const neutralCount = parsed.filter((p) => p.neutral).length;
    const recommendations = [];

    if (parsed.length === 0) {
      return { scheme: 'unknown', score: 70, recommendations: ['Add color information to your garments for better harmony analysis.'] };
    }
    if (hues.length === 0) {
      recommendations.push('An all-neutral palette is timeless — an accent color garment or accessory would add interest.');
      return { scheme: 'neutral', score: 90, recommendations };
    }
    const uniqueHues = [];
    for (const h of hues) {
      if (!uniqueHues.some((u) => this.hueDistance(u, h.hue) < 20)) uniqueHues.push(h.hue);
    }
    if (uniqueHues.length === 1) {
      if (neutralCount === 0 && hues.length > 2) recommendations.push('A neutral piece (black, white, beige) would balance the monochrome look.');
      return { scheme: neutralCount > 0 ? 'accent' : 'monochrome', score: 95, recommendations };
    }
    const maxDist = Math.max(...uniqueHues.flatMap((a, i) => uniqueHues.slice(i + 1).map((b) => this.hueDistance(a, b))));
    if (maxDist <= 60) {
      return { scheme: 'analogous', score: 85, recommendations: ['Analogous colors flow well — keep contrast in brightness for depth.'] };
    }
    if (uniqueHues.length === 2 && maxDist >= 150) {
      recommendations.push('Complementary colors are bold — let one dominate and use the other as an accent.');
      return { scheme: 'complementary', score: 80, recommendations };
    }
    recommendations.push('The palette mixes several unrelated hues — consider grounding the look with neutrals or removing one color.');
    if (neutralCount === 0) recommendations.push('Add a neutral garment to calm the contrast.');
    return { scheme: 'mixed', score: uniqueHues.length > 3 ? 50 : 62, recommendations };
  }
}

export const colorHarmonyEngine = new ColorHarmonyEngine();