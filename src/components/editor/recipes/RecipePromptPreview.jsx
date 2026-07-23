import React from 'react';
import { Coins, Clock, Wand2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

// Shows the compiled prompt (editable), structured prompt, credits and estimated time before execution.
export default function RecipePromptPreview({ compiled, prompt, onPromptChange, onUse, disabled }) {
  const sp = compiled.structuredPrompt;
  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-medium mb-1.5">Generated prompt <span className="text-muted-foreground font-normal">(editable)</span></p>
        <Textarea value={prompt} onChange={(e) => onPromptChange(e.target.value)} rows={3} className="text-sm" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary" className="text-[10px] capitalize">{sp.action}</Badge>
        <Badge variant="secondary" className="text-[10px] capitalize">target: {sp.target}</Badge>
        {(sp.preserve || []).map((p) => <Badge key={p} variant="outline" className="text-[10px]">keeps {p}</Badge>)}
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><Coins className="w-3 h-3" />{compiled.credits} credits</span>
          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />~{Math.round(compiled.estimatedTimeMs / 1000)}s</span>
        </div>
        <Button size="sm" onClick={onUse} disabled={disabled || !prompt.trim()} className="rounded-lg">
          <Wand2 className="w-3.5 h-3.5 mr-1.5" /> Use recipe
        </Button>
      </div>
    </div>
  );
}