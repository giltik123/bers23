import React from 'react';
import { Star, Lock } from 'lucide-react';
import RecipeIcon from '@/components/editor/recipes/RecipeIcon';

export default function RecipeCard({ recipe, isFavorite, onSelect, onToggleFavorite, disabled }) {
  return (
    <button
      onClick={() => onSelect(recipe)}
      disabled={disabled}
      className={`relative text-left border border-border/60 rounded-xl p-3 hover:border-primary/50 hover:shadow-sm transition-all ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <span className="p-1.5 rounded-lg bg-secondary"><RecipeIcon name={recipe.icon} className="w-3.5 h-3.5" /></span>
        <span className="text-sm font-medium truncate flex-1">{recipe.name}</span>
        {recipe.isPremium && <Lock className="w-3 h-3 text-amber-500 shrink-0" />}
      </div>
      <p className="text-[11px] text-muted-foreground line-clamp-2">{recipe.description}</p>
      <p className="text-[10px] text-muted-foreground/70 mt-1">{recipe.credits} credits</p>
      <span
        role="button"
        onClick={(e) => { e.stopPropagation(); onToggleFavorite(recipe.id); }}
        className="absolute top-2 right-2 p-1"
        aria-label="Toggle favorite"
      >
        <Star className={isFavorite ? 'w-3.5 h-3.5 fill-amber-400 text-amber-400' : 'w-3.5 h-3.5 text-muted-foreground/40'} />
      </span>
    </button>
  );
}