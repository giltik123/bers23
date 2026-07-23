import { compatibilityEngine } from '@/lib/outfits/compatibilityEngine';
import { colorHarmonyEngine } from '@/lib/outfits/colorHarmonyEngine';
import { getCategory } from '@/lib/fashion/garmentCategories';
import { outfitAnalytics } from '@/lib/outfits/outfitAnalytics';

// OutfitAnalyzer — resolves an outfit's garments and produces the full analysis
// report plus smart garment recommendations from the user's wardrobe.
const COMPLEMENT_TARGETS = [
  { group: 'footwear', label: 'shoes' },
  { group: 'tops', label: 'a top' },
  { group: 'bottoms', label: 'bottoms' },
  { group: 'accessories', label: 'accessories' },
];

class OutfitAnalyzer {
  resolveGarments(outfit, wardrobe) {
    return (outfit.garment_ids || []).map((id) => wardrobe.find((g) => g.id === id)).filter(Boolean);
  }

  analyze({ outfit, wardrobe }) {
    const garments = this.resolveGarments(outfit, wardrobe);
    const report = compatibilityEngine.assess({ outfit, garments });
    return { garments, ...report };
  }

  scoreCandidate(candidate, outfit, garments) {
    let score = 0;
    if (candidate.season === 'all_season' || outfit.season === 'all_season' || candidate.season === outfit.season) score += 2;
    const colors = [...garments.map((g) => g.dominant_color), candidate.dominant_color].filter(Boolean);
    score += colorHarmonyEngine.analyze(colors).score / 50;
    if (candidate.favorite) score += 0.5;
    return score;
  }

  // Recommends wardrobe garments that complete or improve the outfit.
  recommend({ outfit, wardrobe }) {
    const garments = this.resolveGarments(outfit, wardrobe);
    const presentGroups = new Set(garments.map((g) => getCategory(g.category).group));
    const inOutfit = new Set(outfit.garment_ids || []);
    const available = wardrobe.filter((g) => !g.archived && !inOutfit.has(g.id));
    const recommendations = [];

    for (const target of COMPLEMENT_TARGETS) {
      if (presentGroups.has(target.group) && target.group !== 'accessories') continue;
      const candidates = available
        .filter((g) => getCategory(g.category).group === target.group)
        .sort((a, b) => this.scoreCandidate(b, outfit, garments) - this.scoreCandidate(a, outfit, garments))
        .slice(0, 2);
      candidates.forEach((g) => recommendations.push({ garment: g, reason: `Matching ${target.label}` }));
    }
    if (recommendations.length) outfitAnalytics.track('recommendation_shown', { count: recommendations.length });
    return recommendations.slice(0, 6);
  }

  // Alternatives for a specific garment (same category, best harmony first).
  alternatives({ garment, outfit, wardrobe }) {
    const garments = this.resolveGarments(outfit, wardrobe).filter((g) => g.id !== garment.id);
    return wardrobe
      .filter((g) => !g.archived && g.id !== garment.id && g.category === garment.category)
      .sort((a, b) => this.scoreCandidate(b, outfit, garments) - this.scoreCandidate(a, outfit, garments))
      .slice(0, 4);
  }
}

export const outfitAnalyzer = new OutfitAnalyzer();