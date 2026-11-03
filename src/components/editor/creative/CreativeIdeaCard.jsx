import React from 'react';
import { Sparkles } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function CreativeIdeaCard({ idea, active, onSelect }) {
  const { t } = useTranslation();
  const theme = t('creative.themes.' + idea.themeKey);
  const goal = t('creative.goalDescriptions.' + idea.goalId);
  const orientation = t('creative.orientations.' + idea.orientation);
  const emphasis = t('creative.emphasis.' + idea.emphasis.toLowerCase());
  const stateClass = active
    ? 'border-primary bg-primary/5'
    : 'border-border/60 hover:border-primary/50';

  return (
    <button
      type="button"
      onClick={() => onSelect(idea)}
      aria-pressed={active}
      aria-label={t('creative.selectIdea', { theme })}
      className={'w-full rounded-xl border p-3 text-left transition-colors ' + stateClass}
    >
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-primary" />
        <span className="flex-1 text-sm font-medium">{theme}</span>
        <span className="text-[10px] text-muted-foreground">{emphasis}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        {t('creative.ideaDescription', { goal, theme, orientation })}
      </p>
    </button>
  );
}
