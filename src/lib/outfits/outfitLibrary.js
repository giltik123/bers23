// OutfitLibrary — shelves for the outfit collection. Pure filtering.
export const OUTFIT_VIEWS = [
  { id: 'personal', name: 'My Outfits' },
  { id: 'favorites', name: 'Favorites' },
  { id: 'recent', name: 'Recent' },
  { id: 'suggested', name: 'Suggested' },
  { id: 'archived', name: 'Archived' },
];

class OutfitLibrary {
  filter(outfits, viewId) {
    switch (viewId) {
      case 'personal': return outfits.filter((o) => !o.archived);
      case 'favorites': return outfits.filter((o) => o.favorite && !o.archived);
      case 'recent': return outfits.filter((o) => !o.archived).slice(0, 8); // sorted by updated_date desc
      case 'suggested': return [...outfits.filter((o) => !o.archived)].sort((a, b) => (b.rating || 0) - (a.rating || 0)).slice(0, 6);
      case 'archived': return outfits.filter((o) => o.archived);
      default: return outfits.filter((o) => !o.archived);
    }
  }
}

export const outfitLibrary = new OutfitLibrary();