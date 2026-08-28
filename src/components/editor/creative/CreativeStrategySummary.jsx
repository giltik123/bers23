import React from 'react';
import { Clock3, Coins, Heart, Save, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function CreativeStrategySummary({ strategy, saved, onSave, onFavorite }) {
  const minutes = Math.ceil(strategy.estimatedTimeMs / 60000);
  return (
    <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
      <div>
        <p className="font-medium">Strategy preview</p>
        <p className="text-xs text-muted-foreground">Planned multi-step workflow. Canonical composite execution is not enabled yet.</p>
      </div>
      <div className="flex gap-3 text-xs">
        <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5" />Est. {strategy.estimatedCredits} credits</span>
        <span className="flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" />~{minutes} min</span>
      </div>
      <ol className="space-y-1 text-xs">
        {strategy.executionOrder.map((step, index) => <li key={step.recipeId}>{step.order}. {step.label} <span className="text-muted-foreground">· {strategy.requiredOperations[index]}</span></li>)}
      </ol>
      <div className="rounded-lg bg-background/70 p-2 text-xs text-muted-foreground flex gap-2" role="status">
        <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-0.5" />
        <span>Preview only. Applying this multi-step strategy requires the server-owned Execution Fabric.</span>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="icon" onClick={onSave} aria-label="Save strategy"><Save className="w-4 h-4" /></Button>
        <Button variant="outline" size="icon" onClick={onFavorite} aria-label="Favorite strategy"><Heart className={saved?.favorite ? 'w-4 h-4 fill-current' : 'w-4 h-4'} /></Button>
      </div>
    </div>
  );
}
