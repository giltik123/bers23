// RecipeCategories — the canonical category list for the Recipe System.
export const RECIPE_CATEGORIES = [
  { id: 'hair', label: 'Hair', icon: 'Scissors' },
  { id: 'face', label: 'Face', icon: 'Smile' },
  { id: 'skin', label: 'Skin', icon: 'Sparkles' },
  { id: 'eyes', label: 'Eyes', icon: 'Eye' },
  { id: 'lips', label: 'Lips', icon: 'Heart' },
  { id: 'body', label: 'Body', icon: 'PersonStanding' },
  { id: 'clothing', label: 'Clothing', icon: 'Shirt' },
  { id: 'shoes', label: 'Shoes', icon: 'Footprints' },
  { id: 'accessories', label: 'Accessories', icon: 'Watch' },
  { id: 'background', label: 'Background', icon: 'Image' },
  { id: 'sky', label: 'Sky', icon: 'Cloud' },
  { id: 'nature', label: 'Nature', icon: 'Trees' },
  { id: 'architecture', label: 'Architecture', icon: 'Building2' },
  { id: 'food', label: 'Food', icon: 'UtensilsCrossed' },
  { id: 'pets', label: 'Pets', icon: 'PawPrint' },
  { id: 'vehicles', label: 'Vehicles', icon: 'Car' },
  { id: 'objects', label: 'Objects', icon: 'Box' },
  { id: 'lighting', label: 'Lighting', icon: 'Sun' },
  { id: 'color', label: 'Color', icon: 'Palette' },
  { id: 'professional', label: 'Professional', icon: 'Briefcase' },
  { id: 'social', label: 'Social Media', icon: 'Share2' },
  { id: 'restoration', label: 'Restoration', icon: 'Wand2' },
  { id: 'creative', label: 'Creative', icon: 'Paintbrush' },
];

export const categoryById = (id) => RECIPE_CATEGORIES.find((c) => c.id === id);