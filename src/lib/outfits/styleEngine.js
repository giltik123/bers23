import { getCategory } from '@/lib/fashion/garmentCategories';

// StyleEngine — infers the outfit's dominant style from its garments, measures
// consistency, and flags missing elements and improvements.
const STYLE_VOTES = {
  tshirts: ['casual', 'streetwear', 'minimal'],
  shirts: ['classic', 'business', 'smart_casual'],
  jackets: ['modern', 'smart_casual', 'streetwear'],
  hoodies: ['streetwear', 'casual', 'sport'],
  sweaters: ['classic', 'minimal', 'smart_casual'],
  pants: ['classic', 'business', 'smart_casual'],
  shorts: ['casual', 'sport'],
  jeans: ['casual', 'streetwear'],
  skirts: ['elegant', 'classic'],
  dresses: ['elegant', 'classic'],
  shoes: ['classic', 'business', 'elegant'],
  boots: ['streetwear', 'vintage'],
  sneakers: ['sport', 'streetwear', 'casual'],
  sandals: ['casual'],
  hats: ['streetwear', 'casual'],
  glasses: ['modern', 'minimal'],
  scarves: ['classic', 'elegant'],
  bags: ['elegant', 'modern'],
  belts: ['classic', 'business'],
  jewelry: ['elegant', 'luxury'],
  gloves: ['classic', 'luxury'],
  socks: ['casual', 'sport'],
};

class StyleEngine {
  analyze(garments, declaredStyle) {
    const votes = {};
    for (const g of garments) {
      const styles = STYLE_VOTES[g.category] || [];
      styles.forEach((s, i) => { votes[s] = (votes[s] || 0) + (styles.length - i); });
    }
    const ranked = Object.entries(votes).sort((a, b) => b[1] - a[1]);
    const dominantStyle = ranked[0]?.[0] || declaredStyle || 'casual';
    const total = ranked.reduce((s, [, v]) => s + v, 0);
    const consistency = total ? Math.round(((ranked[0]?.[1] || 0) / total) * 100 + 40) : 50;

    const groups = new Set(garments.map((g) => getCategory(g.category).group));
    const missing = [];
    if (!groups.has('tops') && !groups.has('dresses')) missing.push('a top');
    if (!groups.has('bottoms') && !groups.has('dresses')) missing.push('bottoms');
    if (!groups.has('footwear')) missing.push('footwear');

    const improvements = [];
    if (declaredStyle && dominantStyle !== declaredStyle && garments.length >= 2) {
      improvements.push(`The garments lean ${dominantStyle.replace('_', ' ')} rather than ${declaredStyle.replace('_', ' ')} — adjust the style or swap a piece.`);
    }
    if (!groups.has('accessories') && garments.length >= 3) {
      improvements.push('An accessory (belt, watch, bag) would complete the look.');
    }

    return { dominantStyle, consistency: Math.min(100, consistency), missing, improvements };
  }
}

export const styleEngine = new StyleEngine();