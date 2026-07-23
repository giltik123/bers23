import { RECIPE_VARIABLES, defaultsFor } from '@/lib/recipes/recipeVariables';
import { renderTemplate } from '@/lib/recipes/recipeTemplates';
import { recipeHistory } from '@/lib/recipes/recipeHistory';
import { recipeAnalytics } from '@/lib/recipes/recipeAnalytics';

// RecipeEngine — compiles a recipe + variables into a structured prompt for the AI Planner.
// Recipes NEVER call providers: the compiled prompt flows Recipe Engine → Planner → Editing Engine → Provider.
class RecipeEngine {
  variableDefs(recipe) {
    return (recipe.variables || []).map((id) => RECIPE_VARIABLES[id]).filter(Boolean);
  }

  defaults(recipe) { return defaultsFor(recipe.variables || []); }

  // (recipe, variables) → { prompt (user-editable), structuredPrompt, credits, estimatedTimeMs }
  compile(recipe, variables = {}) {
    const merged = { ...this.defaults(recipe), ...variables };
    const prompt = renderTemplate(recipe.defaultPrompt, merged, RECIPE_VARIABLES);
    return {
      recipeId: recipe.id,
      prompt,
      structuredPrompt: { ...recipe.structuredPrompt, variables: merged },
      credits: recipe.credits,
      estimatedTimeMs: recipe.qualityLevel === 'hd' ? 45000 : 30000,
      recommendedProvider: recipe.recommendedProvider,
    };
  }

  // Called by the Editor after the Editing Engine finishes a recipe-driven run.
  recordOutcome(recipeId, { success, durationMs, credits }) {
    if (!recipeId) return;
    recipeHistory.record(recipeId, { success });
    recipeAnalytics.track(recipeId, { success, durationMs, credits });
  }
}

export const recipeEngine = new RecipeEngine();