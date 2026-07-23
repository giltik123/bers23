import { RECIPE_LIBRARY } from '@/lib/recipes/recipeLibrary';

// RecipeSearch — query / category / tags / premium filtering over the library.
class RecipeSearch {
  search({ query = '', category = null, tags = [], premiumOnly = false, ids = null } = {}) {
    const q = query.trim().toLowerCase();
    let results = ids ? ids.map((id) => RECIPE_LIBRARY.find((r) => r.id === id)).filter(Boolean) : [...RECIPE_LIBRARY];

    if (category) results = results.filter((r) => r.category === category);
    if (premiumOnly) results = results.filter((r) => r.isPremium);
    if (tags.length) results = results.filter((r) => tags.some((t) => r.tags.includes(t)));
    if (q) {
      results = results.filter((r) =>
        r.name.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.tags.some((t) => t.includes(q)) ||
        r.category.includes(q)
      );
    }
    return results;
  }
}

export const recipeSearch = new RecipeSearch();