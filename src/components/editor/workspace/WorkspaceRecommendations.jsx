import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { workspaceManager } from '@/lib/workspace/workspaceManager';
import { workspaceRecommendations } from '@/lib/workspace/workspaceRecommendations';
import { recipeEngine } from '@/lib/recipes/recipeEngine';

// The workspace's recommended recipe collection. Clicking a recipe prefills the
// prompt (compiled by the Recipe Engine) — no direct execution here.
export default function WorkspaceRecommendations({ onUse, disabled }) {
  const [state, setState] = useState(workspaceManager.state);
  useEffect(() => workspaceManager.subscribe(setState), []);

  const { recipes, tip } = workspaceRecommendations.recommend(state.workspaceId);
  if (!recipes.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Sparkles className="w-3.5 h-3.5" /> Recommended for this workspace</p>
      <div className="flex flex-wrap gap-1.5">
        {recipes.map((recipe) => (
          <button
            key={recipe.id}
            disabled={disabled}
            onClick={() => onUse(recipeEngine.compile(recipe, {}).prompt, recipe)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-primary/30 text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            {recipe.name}
          </button>
        ))}
      </div>
      {tip && <p className="text-[10px] text-muted-foreground italic">{tip}</p>}
    </div>
  );
}