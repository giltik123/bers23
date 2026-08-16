import { coreClient } from '@/api/coreClient';
import { garmentMetadata } from '@/lib/fashion/garmentMetadata';
import { wardrobeHistory } from '@/lib/fashion/wardrobeHistory';
import { wardrobeAnalytics } from '@/lib/fashion/wardrobeAnalytics';

// GarmentManager — all garment lifecycle operations. Pure data management: no AI,
// no providers. Everything persists on the Garment entity.
class GarmentManager {
  async list() {
    return coreClient.entities.Garment.list('-updated_date', 500);
  }

  async create(data) {
    const garment = await coreClient.entities.Garment.create(garmentMetadata.normalize(data));
    wardrobeHistory.record({ type: 'created', garmentId: garment.id, name: garment.name });
    if (garment.source === 'imported') wardrobeAnalytics.track('import', { garmentId: garment.id });
    return garment;
  }

  async update(id, data) {
    return coreClient.entities.Garment.update(id, data);
  }

  async rename(garment, name) {
    wardrobeHistory.record({ type: 'renamed', garmentId: garment.id, name });
    return this.update(garment.id, { name });
  }

  async duplicate(garment) {
    const { id, created_date, updated_date, created_by_id, ...rest } = garment;
    const copy = await coreClient.entities.Garment.create(garmentMetadata.normalize({ ...rest, name: `${garment.name} (copy)`, favorite: false }));
    wardrobeHistory.record({ type: 'duplicated', garmentId: copy.id, name: copy.name });
    return copy;
  }

  async remove(garment) {
    wardrobeHistory.record({ type: 'deleted', garmentId: garment.id, name: garment.name });
    return coreClient.entities.Garment.delete(garment.id);
  }

  async archive(garment) {
    wardrobeHistory.record({ type: 'archived', garmentId: garment.id, name: garment.name });
    return this.update(garment.id, { archived: true });
  }

  async restore(garment) {
    wardrobeHistory.record({ type: 'restored', garmentId: garment.id, name: garment.name });
    return this.update(garment.id, { archived: false });
  }

  async setFavorite(garment, favorite) {
    if (favorite) wardrobeAnalytics.track('favorite', { garmentId: garment.id, category: garment.category });
    return this.update(garment.id, { favorite });
  }

  // Merges a metadata patch (arrays unioned, scalars overridden when set).
  async mergeMetadata(garment, patch) {
    const merged = garmentMetadata.merge(garment, patch);
    const { id, created_date, updated_date, created_by_id, ...data } = merged;
    return this.update(garment.id, data);
  }

  // Marks a garment as used (future Try-On and cross-project reuse hook).
  async recordUsage(garment) {
    wardrobeAnalytics.track('garment_used', { garmentId: garment.id, name: garment.name, category: garment.category });
    return this.update(garment.id, { usage_count: (garment.usage_count || 0) + 1 });
  }
}

export const garmentManager = new GarmentManager();