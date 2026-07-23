import { RECIPE_LIBRARY } from '@/lib/recipes/recipeLibrary';

// RecipeManager — access layer over the library + smart recommendations from detected objects.
class RecipeManager {
  all() { return RECIPE_LIBRARY; }

  get(id) { return RECIPE_LIBRARY.find((r) => r.id === id) || null; }

  byCategory(categoryId) { return RECIPE_LIBRARY.filter((r) => r.category === categoryId); }

  // Recommend recipes for detected objects by matching labels against supportedObjectTypes.
  recommendFor(objects = []) {
    const labels = objects.map((o) => (o.label || '').toLowerCase());
    const scored = RECIPE_LIBRARY.map((recipe) => {
      let score = 0;
      for (const type of recipe.supportedObjectTypes) {
        if (labels.some((l) => l.includes(type) || type.includes(l))) score += 2;
      }
      // Untargeted recipes (background, lighting, color…) are always mildly relevant.
      if (!recipe.supportedObjectTypes.length && !recipe.requiredObjects) score += 0.5;
      return { recipe, score };
    });
    return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).map((s) => s.recipe);
  }

  // Whether the recipe can run with the current selection.
  isApplicable(recipe, selectedObjects = []) {
    return selectedObjects.length >= (recipe.requiredObjects || 0);
  }
}

export const recipeManager = new RecipeManager();