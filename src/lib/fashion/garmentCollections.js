import { coreClient } from '@/api/coreClient';
import { wardrobeAnalytics } from '@/lib/fashion/wardrobeAnalytics';
import { wardrobeHistory } from '@/lib/fashion/wardrobeHistory';

// GarmentCollections — user collections (Summer, Business, Travel…). Garments can
// belong to many collections; move/copy operate on collection membership.
export const SUGGESTED_COLLECTIONS = ['Summer', 'Winter', 'Business', 'Travel', 'Party', 'Sport', 'Minimal', 'Formal'];

class GarmentCollections {
  async list() {
    return coreClient.entities.GarmentCollection.list('-updated_date', 100);
  }

  async create(name, description = '') {
    const collection = await coreClient.entities.GarmentCollection.create({ name, description, garment_ids: [] });
    wardrobeHistory.record({ type: 'collection_created', name });
    return collection;
  }

  async rename(collection, name) {
    return coreClient.entities.GarmentCollection.update(collection.id, { name });
  }

  async remove(collection) {
    return coreClient.entities.GarmentCollection.delete(collection.id);
  }

  async addGarment(collection, garmentId) {
    if ((collection.garment_ids || []).includes(garmentId)) return collection;
    wardrobeAnalytics.track('collection_used', { collectionId: collection.id, name: collection.name });
    return coreClient.entities.GarmentCollection.update(collection.id, { garment_ids: [...(collection.garment_ids || []), garmentId] });
  }

  async removeGarment(collection, garmentId) {
    return coreClient.entities.GarmentCollection.update(collection.id, { garment_ids: (collection.garment_ids || []).filter((id) => id !== garmentId) });
  }

  // Copy keeps the garment in the source collection; move removes it.
  async copyGarment(garmentId, toCollection) {
    return this.addGarment(toCollection, garmentId);
  }

  async moveGarment(garmentId, fromCollection, toCollection) {
    await this.removeGarment(fromCollection, garmentId);
    return this.addGarment(toCollection, garmentId);
  }

  garmentsIn(collection, garments) {
    const ids = new Set(collection.garment_ids || []);
    return garments.filter((g) => ids.has(g.id));
  }
}

export const garmentCollections = new GarmentCollections();