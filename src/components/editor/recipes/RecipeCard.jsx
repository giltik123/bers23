import React from 'react';
import { Star, Lock } from 'lucide-react';
import RecipeIcon from '@/components/editor/recipes/RecipeIcon';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function RecipeCard({ recipe, isFavorite, onSelect, onToggleFavorite, disabled }) {
  const { t } = useTranslation();

  return (
    <div className={`relative rounded-xl border border-border/60 transition-all hover:border-primary/50 hover:shadow-sm ${disabled ? 'opacity-40' : ''}`}>
      <button
        type="button"
        onClick={() => onSelect(recipe)}
        disabled={disabled}
        aria-label={t(recipe.isPremium ? 'editor.recipeUi.openPremiumRecipe' : 'editor.recipeUi.openRecipe', { name: recipe.name })}
        className="block w-full rounded-xl p-3 pr-11 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed"
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="p-1.5 rounded-lg bg-secondary"><RecipeIcon name={recipe.icon} className="w-3.5 h-3.5" /></span>
          <span className="text-sm font-medium truncate flex-1">{recipe.name}</span>
          {recipe.isPremium && <Lock className="w-3 h-3 text-amber-500 shrink-0" aria-hidden="true" />}
        </div>
        <p className="text-[11px] text-muted-foreground line-clamp-2">{recipe.description}</p>
        <p className="text-[10px] text-muted-foreground/70 mt-1">
          {t('editor.recipeUi.creditsEstimate', { count: recipe.credits })}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onToggleFavorite(recipe.id)}
        disabled={disabled}
        aria-label={t(isFavorite ? 'editor.recipeUi.removeFavorite' : 'editor.recipeUi.addFavorite', { name: recipe.name })}
        aria-pressed={Boolean(isFavorite)}
        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      >
        <Star aria-hidden="true" className={isFavorite ? 'w-3.5 h-3.5 fill-amber-400 text-amber-400' : 'w-3.5 h-3.5 text-muted-foreground/40'} />
      </button>
    </div>
  );
}
