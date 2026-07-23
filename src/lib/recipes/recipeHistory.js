// RecipeHistory — most used, recently used, and success rate per recipe (localStorage).
const KEY = 'recipe_history';

class RecipeHistory {
  _load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  _save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }

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
    const e = this._load()[recipeId];
    return e && e.uses ? e.successes / e.uses : null;
  }

  mostUsed(limit = 8) {
    return Object.entries(this._load()).sort((a, b) => b[1].uses - a[1].uses).slice(0, limit).map(([id]) => id);
  }

  recentlyUsed(limit = 8) {
    return Object.entries(this._load()).sort((a, b) => b[1].lastUsed - a[1].lastUsed).slice(0, limit).map(([id]) => id);
  }
}

export const recipeHistory = new RecipeHistory();