import React, { useState, useEffect } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { editingEvents, EDITING_STAGES } from '@/lib/editing/editingEvents';
import { editingEngine } from '@/lib/editing/editingEngine';
import PipelineFlow from '@/components/editor/PipelineFlow';

export default function GenerationProgress() {
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => editingEvents.subscribe(setState), []);

  if (state.status !== 'running') return null;
  const stage = EDITING_STAGES[state.stage] || { label: 'Working', pct: 5 };

  return (
    <div className="border border-border/60 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="font-medium">{stage.label}…</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => editingEngine.cancel()} className="text-muted-foreground">
          <XCircle className="w-4 h-4 mr-1" /> Cancel
        </Button>
      </div>
      <PipelineFlow stage={state.stage} />
      <Progress value={stage.pct} className="h-1.5" />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>Provider: {state.provider || 'reve'}</span>
        {state.etaMs && <span>~{Math.round(state.etaMs / 1000)}s estimated</span>}
      </div>
    </div>
  );
}