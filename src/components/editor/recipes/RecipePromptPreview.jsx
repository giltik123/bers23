import React from 'react';
import { Coins, Clock, Wand2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Shows the compiled prompt (editable), structured prompt, credits and estimated time before execution.
export default function RecipePromptPreview({ compiled, prompt, onPromptChange, onUse, disabled }) {
  const { t } = useTranslation();
  const sp = compiled.structuredPrompt;
  const estimatedSeconds = Math.round(compiled.estimatedTimeMs / 1000);

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="recipe-prompt" className="mb-1.5 flex items-center gap-1 text-xs font-medium">
          <span>{t('editor.recipeUi.generatedPrompt')}</span>
          <span className="font-normal text-muted-foreground">({t('editor.recipeUi.editable')})</span>
        </label>
        <Textarea
          id="recipe-prompt"
          aria-label={t('editor.recipeUi.generatedPrompt')}
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={3}
          className="text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px] capitalize">{sp.action}</Badge>
        <Badge variant="secondary" className="text-[10px] capitalize">{t('editor.recipeUi.target', { target: sp.target })}</Badge>
        {(sp.preserve || []).map((p) => (
          <Badge key={p} variant="outline" className="text-[10px]">{t('editor.recipeUi.keeps', { value: p })}</Badge>
        ))}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <Coins className="w-3 h-3" aria-hidden="true" />
            {t('editor.recipeUi.creditsEstimate', { count: compiled.credits })}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" aria-hidden="true" />
            {t('editor.recipeUi.estimatedSeconds', { seconds: estimatedSeconds })}
          </span>
        </div>
        <Button type="button" size="sm" onClick={onUse} disabled={disabled || !prompt.trim()} className="rounded-lg">
          <Wand2 className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" /> {t('editor.recipeUi.useRecipe')}
        </Button>
      </div>
    </div>
  );
}
