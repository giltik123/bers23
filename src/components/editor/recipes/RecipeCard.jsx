import React from 'react';
import { Star } from 'lucide-react';
import RecipeIcon from '@/components/editor/recipes/RecipeIcon';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Selection prepares a prompt; device-local favorites remain usable even when selection is disabled.
export default function RecipeCard({ recipe, isFavorite, onSelect, onToggleFavorite, disabled }) {
  const { t } = useTranslation();
  return (
    <div className="relative rounded-xl border border-border/60 hover:border-primary/50">
      <button type="button" onClick={() => onSelect(recipe)} disabled={disabled}
        className={`block w-full rounded-xl p-3 pr-10 text-left focus-visible:ring-2 focus-visible:ring-primary ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-accent/30'}`}>
        <div className="flex items-center gap-2 mb-1">
          <span className="p-1.5 rounded-lg bg-secondary"><RecipeIcon name={recipe.icon} className="w-3.5 h-3.5" /></span>
          <span className="text-sm font-medium truncate flex-1">{recipe.name}</span>
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2">{recipe.description}</p>
      </button>
      <button type="button" onClick={() => onToggleFavorite(recipe.id)} aria-pressed={isFavorite}
        aria-label={t(isFavorite ? 'recipes.removeFavorite' : 'recipes.addFavorite', { name: recipe.name })}
        className="absolute top-2 right-2 rounded-lg p-2 hover:bg-accent focus-visible:ring-2 focus-visible:ring-primary">
        <Star aria-hidden="true" className={isFavorite ? 'w-3.5 h-3.5 fill-amber-400 text-amber-400' : 'w-3.5 h-3.5 text-muted-foreground'} />
      </button>
    </div>
  );
}
