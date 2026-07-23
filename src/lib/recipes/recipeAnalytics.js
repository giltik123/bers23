import { base44 } from '@/api/base44Client';

// RecipeAnalytics — usage, success/failure, duration and credits per recipe.
const KEY = 'recipe_analytics';

class RecipeAnalytics {
  _load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
  _save(data) { localStorage.setItem(KEY, JSON.stringify(data)); }

  track(recipeId, { success, durationMs = 0, credits = 0 }) {
    const data = this._load();
    const e = data[recipeId] || { uses: 0, successes: 0, failures: 0, totalDurationMs: 0, creditsSpent: 0 };
    e.uses += 1;
    success ? e.successes++ : e.failures++;
    e.totalDurationMs += durationMs;
    e.creditsSpent += credits;
    data[recipeId] = e;
    this._save(data);
    base44.analytics.track({
      eventName: 'recipe_executed',
      properties: { recipe_id: recipeId, success, duration_ms: Math.round(durationMs), credits },
    });
  }

  stats(recipeId) {
    const e = this._load()[recipeId];
    if (!e) return null;
    return { ...e, avgDurationMs: e.uses ? Math.round(e.totalDurationMs / e.uses) : 0, successRate: e.uses ? e.successes / e.uses : 0 };
  }
}

export const recipeAnalytics = new RecipeAnalytics();