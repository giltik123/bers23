import React, { useState, useMemo } from 'react';
import { Search, ShieldCheck } from 'lucide-react';
import { Input } from '@/components/ui/input';
import RecipeCard from '@/components/editor/recipes/RecipeCard';
import RecipeDetail from '@/components/editor/recipes/RecipeDetail';
import { RECIPE_CATEGORIES } from '@/lib/recipes/recipeCategories';
import { recipeManager } from '@/lib/recipes/recipeManager';
import { recipeSearch } from '@/lib/recipes/recipeSearch';
import { recipeFavorites } from '@/lib/recipes/recipeFavorites';
import { recipeHistory } from '@/lib/recipes/recipeHistory';

const VIEWS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'popular', label: 'Popular' },
  { id: 'recent', label: 'Recent' },
  { id: 'favorites', label: 'Favorites' },
];

export default function RecipePanel({ objects = [], selectedObjects = [], onUse, disabled }) {
  const [query, setQuery] = useState('');
  const [view, setView] = useState('recommended');
  const [category, setCategory] = useState(null);
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [favVersion, setFavVersion] = useState(0);

  const recipes = useMemo(() => {
    if (query.trim() || category) return recipeSearch.search({ query, category });
    if (view === 'favorites') return recipeSearch.search({ ids: recipeFavorites.list() });
    if (view === 'popular') return recipeSearch.search({ ids: recipeHistory.mostUsed() });
    if (view === 'recent') return recipeSearch.search({ ids: recipeHistory.recentlyUsed() });
    const recommended = recipeManager.recommendFor(objects);
    return recommended.length ? recommended.slice(0, 12) : recipeManager.all().slice(0, 12);
  }, [query, category, view, objects, favVersion]);

  if (selectedRecipe) {
    return (
      <div className="border border-border/60 rounded-2xl p-4">
        <RecipeDetail recipe={selectedRecipe} onBack={() => setSelectedRecipe(null)} onUse={onUse} disabled={disabled} />
      </div>
    );
  }

  return (
    <div className="border border-border/60 rounded-2xl p-4 space-y-3">
      <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground" role="status">
        <p className="flex items-center gap-1.5 font-medium text-foreground"><ShieldCheck className="w-3.5 h-3.5" />Recipe chains are not enabled yet.</p>
        <p className="mt-1">Individual recipes remain available as prompt templates and enter the canonical Prompt single-edit flow. Multi-step chains require server-owned composite execution.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes…" className="h-8 pl-8 text-xs" />
      </div>

      {!query && (
        <div className="flex gap-1.5">
          {VIEWS.map((item) => (
            <button key={item.id} onClick={() => { setView(item.id); setCategory(null); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${view === item.id && !category ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'}`}>
              {item.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {RECIPE_CATEGORIES.map((item) => (
          <button key={item.id} onClick={() => setCategory(category === item.id ? null : item.id)}
            className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap border transition-colors ${category === item.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
            {item.label}
          </button>
        ))}
      </div>

      {recipes.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-6">
          {view === 'favorites' && !query ? 'No favorites yet — tap the star on a recipe.' : view === 'recent' && !query ? 'No recipes used yet.' : 'No recipes found.'}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {recipes.map((recipe) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              isFavorite={recipeFavorites.isFavorite(recipe.id)}
              onSelect={setSelectedRecipe}
              onToggleFavorite={(id) => { recipeFavorites.toggle(id); setFavVersion((value) => value + 1); }}
              disabled={disabled || !recipeManager.isApplicable(recipe, selectedObjects)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
