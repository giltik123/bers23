import { getCategory } from '@/lib/fashion/garmentCategories';

// GarmentSelector — decides which of the outfit's garments can go through FASHN
// try-on, maps them to FASHN categories and orders them for sequential dressing.
const FASHN_CATEGORY_BY_GROUP = { tops: 'tops', bottoms: 'bottoms', dresses: 'one-pieces' };
const ORDER = { 'one-pieces': 0, tops: 1, bottoms: 2 };

class GarmentSelector {
  select(garments) {
    const selected = [];
    const skipped = [];
    for (const garment of garments) {
      const group = getCategory(garment.category).group;
      const fashnCategory = FASHN_CATEGORY_BY_GROUP[group];
      if (!fashnCategory) {
        skipped.push({ garment, reason: `${getCategory(garment.category).name} isn't supported by try-on yet` });
      } else if (!garment.original_image_url) {
        skipped.push({ garment, reason: `"${garment.name}" has no photo — add one in the wardrobe` });
      } else {
        selected.push({ garment, fashnCategory });
      }
    }
    selected.sort((a, b) => ORDER[a.fashnCategory] - ORDER[b.fashnCategory]);
    return { selected, skipped };
  }
}

export const garmentSelector = new GarmentSelector();