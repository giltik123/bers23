// RecipeTemplates — template interpolation for recipe prompts.
// Templates use {{variable_id}} placeholders; sliders render as qualitative strength words.
const SLIDER_WORDS = ['very subtle', 'subtle', 'gentle', 'light', 'moderate', 'noticeable', 'strong', 'very strong', 'intense', 'maximum'];

export function sliderWord(value, min = 1, max = 10) {
  const t = (value - min) / (max - min || 1);
  return SLIDER_WORDS[Math.max(0, Math.min(SLIDER_WORDS.length - 1, Math.round(t * (SLIDER_WORDS.length - 1))))];
}

export function renderTemplate(template, variables = {}, definitions = {}) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, id) => {
    const def = definitions[id];
    const value = variables[id] ?? def?.default ?? '';
    if (def?.type === 'slider') return sliderWord(Number(value), def.min, def.max);
    return String(value);
  });
}