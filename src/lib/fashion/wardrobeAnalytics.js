// WardrobeAnalytics — learning layer for the wardrobe: most used garments,
// favorite categories, collection usage and import counts. Stored locally.
const KEY = 'wardrobe_analytics_v1';

class WardrobeAnalytics {
  read() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { garments: {}, categories: {}, collections: {}, imports: 0 }; } catch { return { garments: {}, categories: {}, collections: {}, imports: 0 }; }
  }

  write(store) {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch { /* best-effort */ }
  }

  track(event, data = {}) {
    const store = this.read();
    if (event === 'garment_used' && data.garmentId) {
      store.garments[data.garmentId] = (store.garments[data.garmentId] || 0) + 1;
      if (data.category) store.categories[data.category] = (store.categories[data.category] || 0) + 1;
    } else if (event === 'favorite' && data.category) {
      store.categories[data.category] = (store.categories[data.category] || 0) + 1;
    } else if (event === 'collection_used' && data.collectionId) {
      store.collections[data.collectionId] = (store.collections[data.collectionId] || 0) + 1;
    } else if (event === 'import') {
      store.imports += 1;
    }
    this.write(store);
  }

  summary() {
    const store = this.read();
    const top = (obj, n = 3) => Object.entries(obj).sort((a, b) => b[1] - a[1]).slice(0, n);
    return {
      mostUsedGarmentIds: top(store.garments).map(([id, count]) => ({ id, count })),
      favoriteCategories: top(store.categories).map(([id, count]) => ({ id, count })),
      collectionUsage: top(store.collections).map(([id, count]) => ({ id, count })),
      importCount: store.imports,
    };
  }
}

export const wardrobeAnalytics = new WardrobeAnalytics();