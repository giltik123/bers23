// GarmentMetadata — normalization, defaults and metadata merging for the Garment Model.
export const SEASONS = ['all_season', 'spring', 'summer', 'autumn', 'winter'];
export const GENDERS = ['unisex', 'women', 'men', 'kids'];
export const FITS = ['regular', 'slim', 'relaxed', 'oversized', 'tailored'];
export const MATERIALS = ['cotton', 'denim', 'leather', 'wool', 'silk', 'linen', 'polyester', 'suede', 'knit', 'velvet', 'other'];
export const PATTERNS = ['solid', 'striped', 'plaid', 'floral', 'polka_dot', 'graphic', 'camo', 'animal', 'other'];

class GarmentMetadata {
  // Fills defaults so every garment matches the full Garment Model.
  normalize(data = {}) {
    return {
      name: (data.name || 'Untitled garment').trim(),
      category: data.category || 'other',
      subcategory: data.subcategory || '',
      thumbnail_url: data.thumbnail_url || data.original_image_url || '',
      preview_url: data.preview_url || data.original_image_url || '',
      original_image_url: data.original_image_url || '',
      mask_url: data.mask_url || '',
      dominant_color: data.dominant_color || '',
      secondary_colors: data.secondary_colors || [],
      material: data.material || '',
      pattern: data.pattern || '',
      texture: data.texture || '',
      season: data.season || 'all_season',
      gender: data.gender || 'unisex',
      fit: data.fit || 'regular',
      brand: data.brand || '',
      size: data.size || '',
      tags: data.tags || [],
      favorite: !!data.favorite,
      archived: !!data.archived,
      source: data.source || 'personal',
      usage_count: data.usage_count || 0,
      metadata: data.metadata || {},
    };
  }

  // Merges a metadata patch into an existing garment: scalars override when set,
  // arrays are unioned, nested metadata is shallow-merged.
  merge(existing, patch = {}) {
    const merged = { ...existing };
    for (const [key, value] of Object.entries(patch)) {
      if (value == null || value === '') continue;
      if (Array.isArray(value)) {
        merged[key] = [...new Set([...(existing[key] || []), ...value])];
      } else if (key === 'metadata' && typeof value === 'object') {
        merged.metadata = { ...(existing.metadata || {}), ...value };
      } else {
        merged[key] = value;
      }
    }
    return merged;
  }
}

export const garmentMetadata = new GarmentMetadata();