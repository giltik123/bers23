import { recipeManager } from '@/lib/recipes/recipeManager';

const WORKSPACES = { portrait: 'portrait', fashion: 'fashion', automotive: 'automotive', food: 'food', real_estate: 'architecture', architecture: 'architecture', ecommerce: 'product' };
export const creativeRecommendations = {
  build({ idea, goal, outfits = [] }) {
    const recipes = idea.recipeIds.map((id) => recipeManager.get(id)).filter(Boolean);
    return { recipes, workspace: WORKSPACES[goal.id] || 'universal', outfits: goal.id === 'fashion' ? outfits.slice(0, 3) : [] };
  },
};