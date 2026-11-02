import React, { useState, useEffect } from 'react';
import { Loader2, XCircle } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { editingEvents, EDITING_STAGES } from '@/lib/editing/editingEvents';
import { editingEngine } from '@/lib/editing/editingEngine';
import PipelineFlow from '@/components/editor/PipelineFlow';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const STAGE_KEYS = Object.freeze({
  preparing: 'editorProgress.stages.preparing',
  compiling: 'editorProgress.stages.compiling',
  generating: 'editorProgress.stages.generating',
  validating: 'editorProgress.stages.validating',
  composing: 'editorProgress.stages.composing',
  finalizing: 'editorProgress.stages.finalizing',
});

export default function GenerationProgress() {
  const { t } = useTranslation();
  const [state, setState] = useState({ status: 'idle' });
  useEffect(() => editingEvents.subscribe(setState), []);

  if (state.status !== 'running') return null;
  const stage = EDITING_STAGES[state.stage] || { pct: 5 };
  const stageLabel = STAGE_KEYS[state.stage]
    ? t(STAGE_KEYS[state.stage])
    : t('editorProgress.working');

  return (
    <div role="status" aria-live="polite" className="border border-border/60 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-primary" />
          <span className="font-medium">{stageLabel}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={() => editingEngine.cancel()} className="text-muted-foreground">
          <XCircle className="w-4 h-4 mr-1" /> {t('common.cancel')}
        </Button>
      </div>
      <PipelineFlow stage={state.stage} />
      <Progress value={stage.pct} className="h-1.5" />
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{t('editorProgress.provider')}: {state.provider || 'reve'}</span>
        {state.etaMs && <span>{t('editorProgress.estimatedSeconds', { seconds: Math.round(state.etaMs / 1000) })}</span>}
      </div>
    </div>
  );
}