import { coreClient } from '@/api/coreClient';
import { normalizeOutfit } from '@/lib/outfits/outfitModel';
import { outfitHistory } from '@/lib/outfits/outfitHistory';
import { outfitAnalytics } from '@/lib/outfits/outfitAnalytics';

// OutfitManager — the outfit lifecycle. Pure data management; future FASHN
// Virtual Try-On will consume outfits directly from here. No AI editing.
class OutfitManager {
  async list() {
    return coreClient.entities.Outfit.list('-updated_date', 200);
  }

  async create(data) {
    const outfit = await coreClient.entities.Outfit.create(normalizeOutfit(data));
    outfitHistory.record({ type: 'created', outfitId: outfit.id, name: outfit.name });
    outfitAnalytics.track('outfit_created', { style: outfit.style, occasion: outfit.occasion });
    return outfit;
  }

  async update(id, data) {
    return coreClient.entities.Outfit.update(id, data);
  }

  async rename(outfit, name) {
    outfitHistory.record({ type: 'renamed', outfitId: outfit.id, name });
    return this.update(outfit.id, { name });
  }

  async duplicate(outfit, suffix = '(copy)') {
    const { id, created_date, updated_date, created_by_id, ...rest } = outfit;
    const copy = await coreClient.entities.Outfit.create(normalizeOutfit({ ...rest, name: `${outfit.name} ${suffix}`, favorite: false }));
    outfitHistory.record({ type: 'duplicated', outfitId: copy.id, name: copy.name });
    return copy;
  }

  // Clone — an editable working copy (kept distinct from duplicate for future try-on variants).
  async clone(outfit) {
    return this.duplicate(outfit, '(clone)');
  }

  async remove(outfit) {
    outfitHistory.record({ type: 'deleted', outfitId: outfit.id, name: outfit.name });
    return coreClient.entities.Outfit.delete(outfit.id);
  }

  async archive(outfit) {
    outfitHistory.record({ type: 'archived', outfitId: outfit.id, name: outfit.name });
    return this.update(outfit.id, { archived: true });
  }

  async restore(outfit) {
    outfitHistory.record({ type: 'restored', outfitId: outfit.id, name: outfit.name });
    return this.update(outfit.id, { archived: false });
  }

  async setFavorite(outfit, favorite) {
    if (favorite) outfitAnalytics.track('favorite', { style: outfit.style, occasion: outfit.occasion, colors: outfit.primary_colors });
    return this.update(outfit.id, { favorite });
  }

  async recordUsage(outfit) {
    outfitAnalytics.track('outfit_used', { outfitId: outfit.id, name: outfit.name, style: outfit.style, occasion: outfit.occasion, colors: outfit.primary_colors });
    return this.update(outfit.id, { usage_count: (outfit.usage_count || 0) + 1 });
  }

  // Recomputes derived fields (colors, materials, thumbnail) from the garments in the outfit.
  derived(outfit, wardrobe) {
    const garments = (outfit.garment_ids || []).map((id) => wardrobe.find((g) => g.id === id)).filter(Boolean);
    const colors = garments.map((g) => g.dominant_color).filter(Boolean);
    return {
      primary_colors: [...new Set(colors)].slice(0, 3),
      secondary_colors: [...new Set(garments.flatMap((g) => g.secondary_colors || []))].slice(0, 5),
      materials: [...new Set(garments.map((g) => g.material).filter(Boolean))],
      thumbnail_url: outfit.thumbnail_url || garments.find((g) => g.thumbnail_url)?.thumbnail_url || '',
    };
  }
}

export const outfitManager = new OutfitManager();