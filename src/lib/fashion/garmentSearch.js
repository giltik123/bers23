// GarmentSearch — client-side search and filtering across the wardrobe.
class GarmentSearch {
  // filters: { text, category, season, material, gender }
  search(garments, filters = {}) {
    let result = garments;
    if (filters.category) result = result.filter((g) => g.category === filters.category);
    if (filters.season) result = result.filter((g) => g.season === filters.season || g.season === 'all_season');
    if (filters.material) result = result.filter((g) => g.material === filters.material);
    if (filters.gender) result = result.filter((g) => g.gender === filters.gender);
    if (filters.text?.trim()) {
      const q = filters.text.trim().toLowerCase();
      result = result.filter((g) =>
        [g.name, g.category, g.subcategory, g.material, g.season, g.dominant_color, g.brand, ...(g.tags || []), ...(g.secondary_colors || [])]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(q))
      );
    }
    return result;
  }
}

export const garmentSearch = new GarmentSearch();