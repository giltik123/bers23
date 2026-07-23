// RecipeVariables — reusable variable definitions recipes can include.
// Types: 'select' (options), 'slider' (min/max/step), 'color', 'text'.
export const RECIPE_VARIABLES = {
  hair_color: { id: 'hair_color', label: 'Hair Color', type: 'select', options: ['blonde', 'brunette', 'black', 'red', 'auburn', 'platinum', 'silver', 'pastel pink', 'blue'], default: 'blonde' },
  hair_length: { id: 'hair_length', label: 'Hair Length', type: 'select', options: ['short', 'shoulder-length', 'long', 'very long'], default: 'long' },
  smile_strength: { id: 'smile_strength', label: 'Smile Strength', type: 'slider', min: 1, max: 10, step: 1, default: 5 },
  skin_smoothness: { id: 'skin_smoothness', label: 'Skin Smoothness', type: 'slider', min: 1, max: 10, step: 1, default: 5 },
  object_color: { id: 'object_color', label: 'Color', type: 'select', options: ['red', 'blue', 'green', 'black', 'white', 'yellow', 'pink', 'purple', 'orange', 'beige'], default: 'blue' },
  brightness: { id: 'brightness', label: 'Brightness', type: 'slider', min: -5, max: 5, step: 1, default: 2 },
  contrast: { id: 'contrast', label: 'Contrast', type: 'slider', min: -5, max: 5, step: 1, default: 1 },
  material: { id: 'material', label: 'Material', type: 'select', options: ['leather', 'denim', 'silk', 'cotton', 'wool', 'velvet', 'metal', 'wood'], default: 'leather' },
  weather: { id: 'weather', label: 'Weather', type: 'select', options: ['sunny', 'cloudy', 'rainy', 'snowy', 'foggy', 'stormy'], default: 'sunny' },
  time_of_day: { id: 'time_of_day', label: 'Time of Day', type: 'select', options: ['sunrise', 'midday', 'golden hour', 'sunset', 'blue hour', 'night'], default: 'golden hour' },
  intensity: { id: 'intensity', label: 'Intensity', type: 'slider', min: 1, max: 10, step: 1, default: 5 },
  background_scene: { id: 'background_scene', label: 'Scene', type: 'select', options: ['studio white', 'studio gray', 'beach', 'city street', 'forest', 'mountains', 'office', 'gradient'], default: 'studio white' },
};

export function defaultsFor(variableIds = []) {
  const out = {};
  for (const id of variableIds) if (RECIPE_VARIABLES[id]) out[id] = RECIPE_VARIABLES[id].default;
  return out;
}