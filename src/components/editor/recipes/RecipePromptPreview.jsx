import React from 'react';
import { Wand2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

// Recipe metadata is a prompt template, not a Core quote or execution request.
export default function RecipePromptPreview({ compiled, prompt, onPromptChange, onUse, disabled }) {
  const { t } = useTranslation();
  const structured = compiled.structuredPrompt;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor="recipe-generated-prompt" className="block text-xs font-medium mb-1.5">
          {t('recipes.generatedPrompt')} <span className="text-muted-foreground font-normal">({t('recipes.editable')})</span>
        </label>
        <Textarea
          id="recipe-generated-prompt"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          rows={3}
          className="text-sm"
        />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px] capitalize">{structured.action}</Badge>
        <Badge variant="secondary" className="text-[10px] capitalize">{t('recipes.target', { target: structured.target })}</Badge>
        {(structured.preserve || []).map((value) => (
          <Badge key={value} variant="outline" className="text-[10px]">{t('recipes.keeps', { value })}</Badge>
        ))}
      </div>
      <p id="recipe-handoff-note" role="note" className="text-xs text-muted-foreground">
        {t('recipes.handoffNotice')}
      </p>
      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          onClick={onUse}
          disabled={disabled || !prompt.trim()}
          aria-describedby="recipe-handoff-note"
          className="rounded-lg"
        >
          <Wand2 aria-hidden="true" className="w-3.5 h-3.5 mr-1.5" /> {t('recipes.use')}
        </Button>
      </div>
    </div>
  );
}
