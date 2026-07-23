import React, { useState, useMemo } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import RecipeCard from '@/components/editor/recipes/RecipeCard';
import RecipeDetail from '@/components/editor/recipes/RecipeDetail';
import { RECIPE_CATEGORIES } from '@/lib/recipes/recipeCategories';
import { recipeManager } from '@/lib/recipes/recipeManager';
import { recipeSearch } from '@/lib/recipes/recipeSearch';
import { recipeFavorites } from '@/lib/recipes/recipeFavorites';
import { recipeHistory } from '@/lib/recipes/recipeHistory';
import { RECIPE_CHAINS } from '@/lib/recipes/recipeChains';
import RecipeIcon from '@/components/editor/recipes/RecipeIcon';
import { Play } from 'lucide-react';

const VIEWS = [
  { id: 'recommended', label: 'Recommended' },
  { id: 'popular', label: 'Popular' },
  { id: 'recent', label: 'Recent' },
  { id: 'favorites', label: 'Favorites' },
];

export default function RecipePanel({ objects = [], selectedObjects = [], onUse, onRunChain, disabled }) {
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
      {onRunChain && !query && (
        <div className="space-y-1.5">
          {RECIPE_CHAINS.map((chain) => (
            <button key={chain.id} onClick={() => onRunChain(chain)} disabled={disabled}
              className="w-full flex items-center gap-2.5 border border-primary/30 bg-primary/5 rounded-xl p-3 text-left hover:bg-primary/10 transition-colors disabled:opacity-40">
              <span className="p-1.5 rounded-lg bg-primary text-primary-foreground"><RecipeIcon name={chain.icon} className="w-3.5 h-3.5" /></span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium">{chain.name}</span>
                <span className="block text-[11px] text-muted-foreground">{chain.description} · {chain.steps.length} steps · ~{chain.credits} credits</span>
              </span>
              <Play className="w-4 h-4 text-primary shrink-0" />
            </button>
          ))}
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search recipes…" className="h-8 pl-8 text-xs" />
      </div>

      {!query && (
        <div className="flex gap-1.5">
          {VIEWS.map((v) => (
            <button key={v.id} onClick={() => { setView(v.id); setCategory(null); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors ${view === v.id && !category ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'}`}>
              {v.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {RECIPE_CATEGORIES.map((c) => (
          <button key={c.id} onClick={() => setCategory(category === c.id ? null : c.id)}
            className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap border transition-colors ${category === c.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
            {c.label}
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
              onToggleFavorite={(id) => { recipeFavorites.toggle(id); setFavVersion((v) => v + 1); }}
              disabled={disabled || !recipeManager.isApplicable(recipe, selectedObjects)}
            />
          ))}
        </div>
      )}
    </div>
  );
}