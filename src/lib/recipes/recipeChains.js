// RecipeChains — one-tap multi-step flows. Each step runs an existing recipe
// through the normal pipeline (Recipe Engine → AI Planner → Editing Engine) and
// feeds its result into the next step.
export const RECIPE_CHAINS = [
  {
    id: 'chain_portrait_enhancement',
    name: 'Portrait Enhancement',
    description: 'Complete portrait retouch in one tap',
    icon: 'Sparkles',
    credits: 150,
    steps: [
      { recipeId: 'skin_smooth', label: 'Remove Skin Imperfections', variables: { skin_smoothness: 5 }, objectHints: ['face', 'skin', 'person', 'woman', 'man'] },
      { recipeId: 'face_whiten_teeth', label: 'Whiten Teeth', objectHints: ['face', 'person', 'woman', 'man'] },
      { recipeId: 'eyes_enhance', label: 'Enhance Eyes', objectHints: ['face', 'eyes', 'person', 'woman', 'man'] },
      { recipeId: 'hair_improve', label: 'Improve Hair', objectHints: ['hair', 'person', 'woman', 'man', 'face'] },
      { recipeId: 'detail_sharpen', label: 'Increase Sharpness', variables: { intensity: 4 }, objectHints: [] },
    ],
  },
  {
    id: 'chain_car_photography',
    name: 'Car Photography',
    description: 'Showroom-quality car shot in one tap',
    icon: 'Car',
    credits: 160,
    steps: [
      { recipeId: 'vehicle_remove_reflections', label: 'Remove Reflections', objectHints: ['car', 'truck', 'vehicle', 'motorcycle'] },
      { recipeId: 'vehicle_gloss', label: 'Increase Gloss', variables: { intensity: 6 }, objectHints: ['car', 'truck', 'vehicle', 'motorcycle'] },
      { recipeId: 'vehicle_clean_wheels', label: 'Clean Wheels', objectHints: ['wheel', 'car', 'truck', 'vehicle', 'motorcycle'] },
      { recipeId: 'bg_replace', label: 'Replace Background', variables: { background_scene: 'city street' }, objectHints: [] },
      { recipeId: 'light_golden', label: 'Golden Hour Lighting', variables: { intensity: 5 }, objectHints: [] },
    ],
  },
  {
    id: 'chain_fashion',
    name: 'Fashion',
    description: 'Full outfit restyle in one tap',
    icon: 'Shirt',
    credits: 130,
    steps: [
      { recipeId: 'clothing_replace_top', label: 'Replace Shirt', objectHints: ['shirt', 't-shirt', 'top', 'blouse', 'jacket', 'person'] },
      { recipeId: 'clothing_change_pants', label: 'Change Pants', objectHints: ['pants', 'jeans', 'trousers', 'shorts', 'skirt', 'person'] },
      { recipeId: 'accessories_add', label: 'Add Accessories', objectHints: ['person', 'woman', 'man'] },
      { recipeId: 'light_improve', label: 'Improve Lighting', variables: { intensity: 5 }, objectHints: [] },
    ],
  },
];