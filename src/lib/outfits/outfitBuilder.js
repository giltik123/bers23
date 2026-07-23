import { outfitManager } from '@/lib/outfits/outfitManager';
import { getCategory } from '@/lib/fashion/garmentCategories';
import { outfitHistory } from '@/lib/outfits/outfitHistory';

// OutfitBuilder — garment composition inside an outfit: add, remove, replace,
// reorder. Enforces slot conflicts (e.g. a dress excludes bottoms).
const EXCLUSIVE_GROUPS = ['bottoms', 'footwear', 'dresses'];

class OutfitBuilder {
  // Checks whether a garment can be added without a slot conflict.
  canAdd(outfit, wardrobe, garment) {
    const current = (outfit.garment_ids || []).map((id) => wardrobe.find((g) => g.id === id)).filter(Boolean);
    if (outfit.garment_ids?.includes(garment.id)) return { ok: false, reason: 'Already in this outfit' };
    const group = getCategory(garment.category).group;
    if (EXCLUSIVE_GROUPS.includes(group) && current.some((g) => getCategory(g.category).group === group)) {
      return { ok: false, reason: `This outfit already has ${group}` };
    }
    if (group === 'dresses' && current.some((g) => getCategory(g.category).group === 'bottoms')) {
      return { ok: false, reason: 'A dress conflicts with the bottoms in this outfit' };
    }
    if (group === 'bottoms' && current.some((g) => getCategory(g.category).group === 'dresses')) {
      return { ok: false, reason: 'Bottoms conflict with the dress in this outfit' };
    }
    return { ok: true };
  }

  async save(outfit, wardrobe, garment_ids) {
    const derived = outfitManager.derived({ ...outfit, garment_ids }, wardrobe);
    return outfitManager.update(outfit.id, { garment_ids, ...derived });
  }

  async addGarment(outfit, wardrobe, garment) {
    outfitHistory.record({ type: 'garment_added', outfitId: outfit.id, name: garment.name });
    return this.save(outfit, wardrobe, [...(outfit.garment_ids || []), garment.id]);
  }

  async removeGarment(outfit, wardrobe, garmentId) {
    outfitHistory.record({ type: 'garment_removed', outfitId: outfit.id });
    return this.save(outfit, wardrobe, (outfit.garment_ids || []).filter((id) => id !== garmentId));
  }

  async replaceGarment(outfit, wardrobe, oldId, newGarment) {
    outfitHistory.record({ type: 'garment_replaced', outfitId: outfit.id, name: newGarment.name });
    return this.save(outfit, wardrobe, (outfit.garment_ids || []).map((id) => (id === oldId ? newGarment.id : id)));
  }

  async reorder(outfit, wardrobe, fromIndex, toIndex) {
    const ids = [...(outfit.garment_ids || [])];
    const [moved] = ids.splice(fromIndex, 1);
    ids.splice(toIndex, 0, moved);
    return this.save(outfit, wardrobe, ids);
  }
}

export const outfitBuilder = new OutfitBuilder();