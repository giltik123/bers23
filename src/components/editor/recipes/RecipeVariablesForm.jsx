import React from 'react';
import { Slider } from '@/components/ui/slider';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sliderWord } from '@/lib/recipes/recipeTemplates';

export default function RecipeVariablesForm({ definitions, values, onChange }) {
  if (!definitions.length) return null;
  return (
    <div className="space-y-3">
      {definitions.map((def) => (
        <div key={def.id} className="space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <label className="font-medium">{def.label}</label>
            {def.type === 'slider' && <span className="text-muted-foreground">{sliderWord(values[def.id], def.min, def.max)}</span>}
          </div>
          {def.type === 'select' && (
            <Select value={String(values[def.id])} onValueChange={(v) => onChange(def.id, v)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {def.options.map((o) => <SelectItem key={o} value={o} className="text-xs capitalize">{o}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {def.type === 'slider' && (
            <Slider value={[Number(values[def.id])]} min={def.min} max={def.max} step={def.step} onValueChange={([v]) => onChange(def.id, v)} />
          )}
          {def.type === 'text' && (
            <Input value={values[def.id] || ''} onChange={(e) => onChange(def.id, e.target.value)} className="h-8 text-xs" />
          )}
        </div>
      ))}
    </div>
  );
}