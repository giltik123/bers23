// OutfitTemplates — built-in starting points. Slots are garment categories the
// user fills from their wardrobe.
export const OUTFIT_TEMPLATES = [
  { id: 'business_suit', name: 'Business Suit', style: 'business', occasion: 'business', season: 'all_season', slots: ['shirts', 'jackets', 'pants', 'shoes', 'belts'], description: 'Sharp office-ready look' },
  { id: 'summer_casual', name: 'Summer Casual', style: 'casual', occasion: 'casual', season: 'summer', slots: ['tshirts', 'shorts', 'sneakers', 'glasses'], description: 'Light and easy warm-weather outfit' },
  { id: 'winter_outfit', name: 'Winter Outfit', style: 'classic', occasion: 'outdoor', season: 'winter', slots: ['sweaters', 'jackets', 'pants', 'boots', 'scarves', 'gloves'], description: 'Warm layered cold-weather look' },
  { id: 'evening_look', name: 'Evening Look', style: 'elegant', occasion: 'night_out', season: 'all_season', slots: ['dresses', 'shoes', 'jewelry', 'bags'], description: 'Refined look for dinners and events' },
  { id: 'travel_kit', name: 'Travel Kit', style: 'smart_casual', occasion: 'travel', season: 'all_season', slots: ['tshirts', 'jackets', 'jeans', 'sneakers', 'bags'], description: 'Comfortable and versatile for the road' },
  { id: 'gym_outfit', name: 'Gym Outfit', style: 'sport', occasion: 'sport', season: 'all_season', slots: ['tshirts', 'shorts', 'sneakers', 'socks'], description: 'Performance-ready training set' },
  { id: 'minimal_style', name: 'Minimal Style', style: 'minimal', occasion: 'casual', season: 'all_season', slots: ['tshirts', 'pants', 'sneakers'], description: 'Clean neutral essentials' },
  { id: 'streetwear', name: 'Streetwear', style: 'streetwear', occasion: 'streetwear', season: 'all_season', slots: ['hoodies', 'jeans', 'sneakers', 'hats'], description: 'Bold urban statement look' },
];

export const getTemplate = (id) => OUTFIT_TEMPLATES.find((t) => t.id === id) || null;