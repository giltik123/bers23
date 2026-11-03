import { readRecipeStorage, writeRecipeStorage } from '@/lib/recipes/recipeStorage';

// RecipeHistory — most used, recently used, and success rate per recipe.
// Browser persistence is optional; the current page keeps a memory-only fallback.
const KEY = 'recipe_history';

class RecipeHistory {
  _load() {
    const value = readRecipeStorage(KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  _save(data) { writeRecipeStorage(KEY, data); }

  record(recipeId, { success }) {
    const data = this._load();
    const entry = data[recipeId] || { uses: 0, successes: 0, failures: 0, lastUsed: null };
    entry.uses += 1;
    success ? entry.successes++ : entry.failures++;
    entry.lastUsed = Date.now();
    data[recipeId] = entry;
    this._save(data);
  }

  successRate(recipeId) {
    const entry = this._load()[recipeId];
    return entry && entry.uses ? entry.successes / entry.uses : null;
  }

  mostUsed(limit = 8) {
    return Object.entries(this._load()).sort((a, b) => b[1].uses - a[1].uses).slice(0, limit).map(([id]) => id);
  }

  recentlyUsed(limit = 8) {
    return Object.entries(this._load()).sort((a, b) => b[1].lastUsed - a[1].lastUsed).slice(0, limit).map(([id]) => id);
  }
}

export const recipeHistory = new RecipeHistory();
