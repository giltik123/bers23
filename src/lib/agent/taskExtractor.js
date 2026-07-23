import { createTask } from '@/lib/agent/taskModel';
import { recipeManager } from '@/lib/recipes/recipeManager';
import { recipeEngine } from '@/lib/recipes/recipeEngine';

// TaskExtractor — normalizes raw parser output into Task Model objects,
// binding recipes from the library and estimating credits/time.
class TaskExtractor {
  extract(rawTasks = []) {
    const tasks = rawTasks.map((raw) => {
      const recipe = raw.recipe_id ? recipeManager.get(raw.recipe_id) : null;
      const compiled = recipe ? recipeEngine.compile(recipe, {}) : null;
      return createTask({
        label: raw.label || raw.prompt?.slice(0, 40) || 'Edit',
        type: recipe ? 'recipe' : 'custom',
        action: raw.action || 'other',
        targetObject: raw.target_object || null,
        recipe: recipe ? recipe.id : null,
        customPrompt: raw.prompt || compiled?.prompt || null,
        estimatedCredits: compiled?.credits ?? 30,
        estimatedTime: compiled?.estimatedTimeMs ?? 30000,
        ambiguous: !!raw.ambiguous,
        ambiguityReason: raw.ambiguity_reason || null,
      });
    });
    // Map index-based depends_on → task ids.
    rawTasks.forEach((raw, i) => {
      tasks[i].action = raw.action || 'other';
      tasks[i].dependencies = (raw.depends_on || [])
        .filter((d) => d >= 0 && d < tasks.length && d !== i)
        .map((d) => tasks[d].id);
    });
    return tasks;
  }
}

export const taskExtractor = new TaskExtractor();