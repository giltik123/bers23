import { readRecipeStorage, writeRecipeStorage } from '@/lib/recipes/recipeStorage';

// RecipeFavorites — persisted when possible, session-local when Web Storage is unavailable.
const KEY = 'recipe_favorites';

class RecipeFavorites {
  _load() {
    const value = readRecipeStorage(KEY, []);
    return Array.isArray(value) ? value.filter((id) => typeof id === 'string') : [];
  }

  _save(ids) { writeRecipeStorage(KEY, ids); }

  list() { return this._load(); }
  isFavorite(id) { return this._load().includes(id); }

  toggle(id) {
    const ids = this._load();
    const next = ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id];
    this._save(next);
    return next.includes(id);
  }
}

export const recipeFavorites = new RecipeFavorites();
