import { CREATIVE_THEMES } from '@/lib/creative/CreativeThemes';

const RECIPES = {
  social: ['social_instagram', 'color_pop', 'detail_sharpen'], marketing: ['bg_studio', 'light_improve', 'detail_sharpen'], advertising: ['bg_studio', 'color_pop', 'detail_sharpen'], ecommerce: ['bg_studio', 'light_improve', 'detail_sharpen'], portrait: ['pro_headshot', 'bg_blur', 'light_improve'], real_estate: ['arch_facade', 'light_improve', 'sky_sunset'], automotive: ['vehicle_remove_reflections', 'vehicle_gloss', 'light_golden'], food: ['food_appetizing', 'light_improve', 'color_pop'], architecture: ['arch_facade', 'light_improve', 'detail_sharpen'], fashion: ['clothing_replace_top', 'light_golden', 'social_instagram'], creative_art: ['creative_painting', 'color_pop'],
};

export const creativeIdeaGenerator = {
  generate(goal, analysis) {
    const themes = CREATIVE_THEMES[goal.id] || CREATIVE_THEMES.marketing;
    return themes.map((theme, index) => ({ id: `${goal.id}-${index}`, title: theme, description: `${goal.description} with ${theme.toLowerCase()} direction, informed by the current ${analysis.composition.orientation} composition.`, theme, recipeIds: RECIPES[goal.id] || RECIPES.marketing, emphasis: index === 0 ? 'Recommended' : 'Alternative' }));
  },
};