// OutfitModel — supported occasions, style types and outfit normalization.
export const OCCASIONS = ['casual', 'business', 'formal', 'wedding', 'party', 'travel', 'sport', 'outdoor', 'streetwear', 'luxury', 'home', 'beach', 'night_out'];

export const OUTFIT_STYLES = ['minimal', 'classic', 'elegant', 'streetwear', 'business', 'luxury', 'sport', 'vintage', 'casual', 'modern', 'creative', 'smart_casual'];

export const labelize = (v) => (v || '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const normalizeOutfit = (data = {}) => ({
  name: (data.name || 'Untitled outfit').trim(),
  thumbnail_url: data.thumbnail_url || '',
  cover_image_url: data.cover_image_url || '',
  garment_ids: data.garment_ids || [],
  style: data.style || 'casual',
  season: data.season || 'all_season',
  occasion: data.occasion || 'casual',
  gender: data.gender || 'unisex',
  primary_colors: data.primary_colors || [],
  secondary_colors: data.secondary_colors || [],
  materials: data.materials || [],
  rating: data.rating || 0,
  favorite: !!data.favorite,
  archived: !!data.archived,
  template_id: data.template_id || '',
  usage_count: data.usage_count || 0,
  metadata: data.metadata || {},
});