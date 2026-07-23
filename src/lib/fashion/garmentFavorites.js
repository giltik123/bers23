import { garmentManager } from '@/lib/fashion/garmentManager';

// GarmentFavorites — favorite management on top of the GarmentManager.
class GarmentFavorites {
  async toggle(garment) {
    return garmentManager.setFavorite(garment, !garment.favorite);
  }

  list(garments) {
    return garments.filter((g) => g.favorite && !g.archived);
  }
}

export const garmentFavorites = new GarmentFavorites();