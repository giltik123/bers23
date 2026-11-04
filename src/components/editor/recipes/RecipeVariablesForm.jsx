import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sliderWord } from '@/lib/recipes/recipeTemplates';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const SLIDER_STRENGTH_KEYS = {
  'very subtle': 'verySubtle',
  subtle: 'subtle',
  gentle: 'gentle',
  light: 'light',
  moderate: 'moderate',
  noticeable: 'noticeable',
  strong: 'strong',
  'very strong': 'veryStrong',
  intense: 'intense',
  maximum: 'maximum',
};

export default function RecipeVariablesForm({ definitions, values, onChange }) {
  const { t } = useTranslation();
  if (!definitions.length) return null;

  return (
    <div className="space-y-3">
      {definitions.map((definition) => {
        const controlId = `recipe-variable-${definition.id}`;
        return (
          <div key={definition.id} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor={controlId} className="font-medium">{definition.label}</label>
              {definition.type === 'slider' && (
                <span className="text-muted-foreground">
                  {t(`recipes.sliderStrength.${SLIDER_STRENGTH_KEYS[sliderWord(values[definition.id], definition.min, definition.max)] || 'moderate'}`)}
                </span>
              )}
            </div>
            {definition.type === 'select' && (
              <Select value={String(values[definition.id])} onValueChange={(value) => onChange(definition.id, value)}>
                <SelectTrigger id={controlId} aria-label={definition.label} className="h-8 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {definition.options.map((option) => <SelectItem key={option} value={option} className="text-xs capitalize">{option}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
            {definition.type === 'slider' && (
              <Slider
                id={controlId}
                aria-label={definition.label}
                value={[Number(values[definition.id])]}
                min={definition.min}
                max={definition.max}
                step={definition.step}
                onValueChange={([value]) => onChange(definition.id, value)}
              />
            )}
            {definition.type === 'text' && (
              <Input
                id={controlId}
                aria-label={definition.label}
                value={values[definition.id] || ''}
                onChange={(event) => onChange(definition.id, event.target.value)}
                className="h-8 text-xs"
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
