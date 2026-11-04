import { coreClient } from '@/api/coreClient';
import { readRecipeStorage, writeRecipeStorage } from '@/lib/recipes/recipeStorage';

// RecipeAnalytics — local usage stats plus best-effort canonical telemetry.
const KEY = 'recipe_analytics';

class RecipeAnalytics {
  _load() {
    const value = readRecipeStorage(KEY, {});
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  }

  _save(data) { writeRecipeStorage(KEY, data); }

  track(recipeId, { success, durationMs = 0, credits = 0 }) {
    const data = this._load();
    const entry = data[recipeId] || { uses: 0, successes: 0, failures: 0, totalDurationMs: 0, creditsSpent: 0 };
    entry.uses += 1;
    success ? entry.successes++ : entry.failures++;
    entry.totalDurationMs += durationMs;
    entry.creditsSpent += credits;
    data[recipeId] = entry;
    this._save(data);

    // Optional telemetry must never turn a completed recipe action into a UI failure.
    try {
      const tracking = coreClient.analytics.track({
        eventName: 'recipe_executed',
        properties: { recipe_id: recipeId, success, duration_ms: Math.round(durationMs), credits },
      });
      if (tracking && typeof tracking.catch === 'function') tracking.catch(() => undefined);
    } catch {
      // Local/session statistics remain available when telemetry is unavailable.
    }
  }

  stats(recipeId) {
    const entry = this._load()[recipeId];
    if (!entry) return null;
    return { ...entry, avgDurationMs: entry.uses ? Math.round(entry.totalDurationMs / entry.uses) : 0, successRate: entry.uses ? entry.successes / entry.uses : 0 };
  }
}

export const recipeAnalytics = new RecipeAnalytics();
