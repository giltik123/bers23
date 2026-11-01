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
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const VIEWS = ['recommended', 'popular', 'recent', 'favorites'];

export default function RecipePanel({ objects = [], selectedObjects = [], onUse, disabled }) {
  const { t } = useTranslation();
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
        <RecipeDetail recipe={selectedRecipe} onBack={() => setSelectedRecipe(null)} onUse={onUse}
          disabled={disabled || !recipeManager.isApplicable(selectedRecipe, selectedObjects)} />
      </div>
    );
  }

  return (
    <div className="border border-border/60 rounded-2xl p-4 space-y-3">
      <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground" role="note">
        <p className="flex items-center gap-1.5 font-medium text-foreground"><ShieldCheck aria-hidden="true" className="w-3.5 h-3.5" />{t('recipes.chainsUnavailable')}</p>
        <p className="mt-1">{t('recipes.chainsHint')}</p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('recipes.searchPlaceholder')} aria-label={t('recipes.searchPlaceholder')} className="h-8 pl-8 text-xs" />
      </div>

      {!query && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('recipes.title')}>
          {VIEWS.map((id) => (
            <button key={id} type="button" aria-pressed={view === id && !category}
              onClick={() => { setView(id); setCategory(null); }}
              className={`px-2.5 py-1 rounded-lg text-[11px] transition-colors focus-visible:ring-2 focus-visible:ring-primary ${view === id && !category ? 'bg-primary text-primary-foreground' : 'bg-secondary hover:bg-accent'}`}>
              {t(`recipes.${id}`)}
            </button>
          ))}
        </div>
      )}

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1" role="group" aria-label={t('recipes.categoriesLabel')}>
        {RECIPE_CATEGORIES.map((item) => (
          <button key={item.id} type="button" aria-pressed={category === item.id} onClick={() => setCategory(category === item.id ? null : item.id)}
            className={`px-2 py-0.5 rounded-full text-[10px] whitespace-nowrap border transition-colors ${category === item.id ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground hover:border-primary/40'}`}>
            {t(`recipes.categories.${item.id}`)}
          </button>
        ))}
      </div>

      {recipes.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-6">
          {view === 'favorites' && !query ? t('recipes.noFavorites') : view === 'recent' && !query ? t('recipes.noRecent') : t('recipes.noResults')}
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
