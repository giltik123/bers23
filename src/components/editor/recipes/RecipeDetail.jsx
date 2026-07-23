import React, { useState, useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import RecipeIcon from '@/components/editor/recipes/RecipeIcon';
import RecipeVariablesForm from '@/components/editor/recipes/RecipeVariablesForm';
import RecipePromptPreview from '@/components/editor/recipes/RecipePromptPreview';
import { recipeEngine } from '@/lib/recipes/recipeEngine';

// Selected recipe: variables → live compiled prompt (editable) → hand off to the Planner flow.
export default function RecipeDetail({ recipe, onBack, onUse, disabled }) {
  const [values, setValues] = useState(() => recipeEngine.defaults(recipe));
  const definitions = recipeEngine.variableDefs(recipe);
  const compiled = useMemo(() => recipeEngine.compile(recipe, values), [recipe, values]);
  const [prompt, setPrompt] = useState(compiled.prompt);
  const [edited, setEdited] = useState(false);

  const handleVarChange = (id, v) => {
    const next = { ...values, [id]: v };
    setValues(next);
    if (!edited) setPrompt(recipeEngine.compile(recipe, next).prompt);
  };

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
        <ArrowLeft className="w-3.5 h-3.5" /> All recipes
      </button>
      <div className="flex items-center gap-2">
        <span className="p-2 rounded-lg bg-secondary"><RecipeIcon name={recipe.icon} /></span>
        <div>
          <p className="text-sm font-medium">{recipe.name}</p>
          <p className="text-[11px] text-muted-foreground">{recipe.description}</p>
        </div>
      </div>
      <RecipeVariablesForm definitions={definitions} values={values} onChange={handleVarChange} />
      <RecipePromptPreview
        compiled={compiled}
        prompt={prompt}
        onPromptChange={(p) => { setPrompt(p); setEdited(true); }}
        onUse={() => onUse(prompt, recipe)}
        disabled={disabled}
      />
    </div>
  );
}