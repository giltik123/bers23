// WardrobeLibrary — the wardrobe's views/shelves. Pure filtering over loaded garments.
// 'online' is a placeholder for future online collections (no provider calls yet).
export const LIBRARY_VIEWS = [
  { id: 'personal', name: 'Wardrobe' },
  { id: 'favorites', name: 'Favorites' },
  { id: 'recent', name: 'Recent' },
  { id: 'imported', name: 'Imported' },
  { id: 'online', name: 'Online' },
  { id: 'archived', name: 'Archived' },
];

class WardrobeLibrary {
  filter(garments, viewId) {
    switch (viewId) {
      case 'personal': return garments.filter((g) => !g.archived);
      case 'favorites': return garments.filter((g) => g.favorite && !g.archived);
      case 'recent': return garments.filter((g) => !g.archived).slice(0, 12); // list is sorted by updated_date desc
      case 'imported': return garments.filter((g) => g.source === 'imported' && !g.archived);
      case 'online': return []; // future online collections
      case 'archived': return garments.filter((g) => g.archived);
      default: return garments.filter((g) => !g.archived);
    }
  }
}

export const wardrobeLibrary = new WardrobeLibrary();