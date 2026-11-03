import React from 'react';
import { CREATIVE_GOALS } from '@/lib/creative/CreativeGoals';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function CreativeGoalPicker({ value, onChange }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={t('creative.goal')}>
      {CREATIVE_GOALS.map((goal) => {
        const label = t('creative.goals.' + goal.id);
        const stateClass = value === goal.id
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border hover:bg-accent';
        return (
          <button
            key={goal.id}
            type="button"
            aria-pressed={value === goal.id}
            aria-label={label}
            title={t('creative.goalDescriptions.' + goal.id)}
            onClick={() => onChange(goal.id)}
            className={'shrink-0 rounded-full border px-3 py-1.5 text-xs ' + stateClass}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
