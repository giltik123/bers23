import { outfitManager } from '@/lib/outfits/outfitManager';

// OutfitFavorites — favorite management on top of the OutfitManager.
class OutfitFavorites {
  async toggle(outfit) {
    return outfitManager.setFavorite(outfit, !outfit.favorite);
  }

  list(outfits) {
    return outfits.filter((o) => o.favorite && !o.archived);
  }
}

export const outfitFavorites = new OutfitFavorites();