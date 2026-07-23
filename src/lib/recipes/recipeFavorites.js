// RecipeFavorites — persisted favorite recipes (localStorage, per device).
const KEY = 'recipe_favorites';

class RecipeFavorites {
  _load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } }
  _save(ids) { localStorage.setItem(KEY, JSON.stringify(ids)); }

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