import { colorHarmonyEngine } from '@/lib/outfits/colorHarmonyEngine';
import { materialCompatibility } from '@/lib/outfits/materialCompatibility';
import { styleEngine } from '@/lib/outfits/styleEngine';
import { getCategory } from '@/lib/fashion/garmentCategories';

// CompatibilityEngine — the core intelligence: scores an outfit across color,
// material, season, style, occasion and structural conflicts. Analysis only.
const OCCASION_STYLES = {
  casual: ['casual', 'streetwear', 'minimal', 'sport', 'smart_casual', 'modern'],
  business: ['business', 'classic', 'smart_casual', 'minimal'],
  formal: ['elegant', 'classic', 'business', 'luxury'],
  wedding: ['elegant', 'classic', 'luxury'],
  party: ['elegant', 'streetwear', 'creative', 'modern', 'luxury'],
  travel: ['casual', 'smart_casual', 'minimal', 'sport'],
  sport: ['sport', 'casual'],
  outdoor: ['casual', 'sport', 'classic'],
  streetwear: ['streetwear', 'casual', 'creative', 'sport'],
  luxury: ['luxury', 'elegant', 'classic'],
  home: ['casual', 'minimal', 'sport'],
  beach: ['casual', 'minimal'],
  night_out: ['elegant', 'streetwear', 'modern', 'luxury', 'creative'],
};

class CompatibilityEngine {
  assess({ outfit, garments }) {
    const warnings = [];
    const suggestions = [];

    // Color, material, style sub-engines.
    const color = colorHarmonyEngine.analyze(garments.map((g) => g.dominant_color).filter(Boolean));
    const material = materialCompatibility.analyze(garments.map((g) => g.material));
    const style = styleEngine.analyze(garments, outfit.style);

    material.clashes.forEach((c) => warnings.push(c.note));
    color.recommendations.forEach((r) => suggestions.push(r));
    material.notes.forEach((n) => suggestions.push(n));
    style.improvements.forEach((i) => suggestions.push(i));
    style.missing.forEach((m) => warnings.push(`The outfit is missing ${m}.`));

    // Season compatibility.
    const offSeason = garments.filter((g) => g.season && g.season !== 'all_season' && outfit.season !== 'all_season' && g.season !== outfit.season);
    offSeason.forEach((g) => warnings.push(`"${g.name}" is a ${g.season} piece in a ${outfit.season} outfit.`));
    const seasonScore = Math.max(30, 100 - offSeason.length * 25);

    // Occasion compatibility.
    const allowed = OCCASION_STYLES[outfit.occasion] || [];
    const occasionOk = allowed.length === 0 || allowed.includes(style.dominantStyle);
    if (!occasionOk) warnings.push(`A ${style.dominantStyle.replace('_', ' ')} look may feel out of place for ${outfit.occasion.replace('_', ' ')}.`);
    const occasionScore = occasionOk ? 95 : 55;

    // Structural garment conflicts.
    const groups = garments.map((g) => getCategory(g.category).group);
    const countOf = (grp) => groups.filter((g) => g === grp).length;
    if (countOf('bottoms') > 1) warnings.push('The outfit has more than one pair of bottoms.');
    if (countOf('footwear') > 1) warnings.push('The outfit has more than one pair of footwear.');
    if (countOf('dresses') >= 1 && countOf('bottoms') >= 1) warnings.push('A dress and bottoms conflict — keep one.');
    const conflictPenalty = Math.max(0, countOf('bottoms') - 1) + Math.max(0, countOf('footwear') - 1) + (countOf('dresses') >= 1 && countOf('bottoms') >= 1 ? 1 : 0);

    const score = garments.length === 0 ? 0 : Math.max(10, Math.round(
      color.score * 0.25 + material.score * 0.2 + style.consistency * 0.2 + seasonScore * 0.2 + occasionScore * 0.15 - conflictPenalty * 15
    ));

    return { score, color, material, style, seasonScore, occasionScore, warnings, suggestions };
  }
}

export const compatibilityEngine = new CompatibilityEngine();