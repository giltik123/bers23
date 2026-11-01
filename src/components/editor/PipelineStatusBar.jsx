import React, { useState, useEffect } from 'react';
import { Loader2, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { pipelineEvents } from '@/lib/pipeline/pipelineEvents';
import { resolutionManager } from '@/lib/pipeline/resolutionManager';
import { PREVIEW_LEVELS } from '@/lib/pipeline/previewGenerator';

const STAGE_KEYS = {
  validation: 'validation', metadata: 'metadata', optimization: 'optimization',
  resolution: 'resolution', masks: 'masks', crop: 'crop',
  preview: 'preview', restore: 'restore', export: 'export',
};
const TIER_KEYS = { preview: 'tierPreview', standard: 'tierStandard', hd: 'tierHd', original: 'tierOriginal' };

export default function PipelineStatusBar({ width, height }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ status: 'idle', stage: null, run: null });
  useEffect(() => pipelineEvents.subscribe(setState), []);

  const tier = width && height ? resolutionManager.selectProcessingTier(width, height) : null;
  const previewDim = width && height
    ? resolutionManager.dimensionsFor('preview', width, height)
    : null;
  const stageLabel = STAGE_KEYS[state.stage]
    ? t('editorStatusUi.stages.' + STAGE_KEYS[state.stage])
    : t('editorStatusUi.processing');
  // The pipeline event bus is not Project-scoped. Completed/error states
  // describe the last pipeline event, not an accepted Project FINAL.
  const statusText = state.status === 'processing'
    ? stageLabel + '…'
    : state.status === 'error' ? t('editorStatusUi.pipelineError')
    : state.status === 'ready' ? t('editorStatusUi.pipelineReady')
    : t('editorStatusUi.pipelineIdle');
  const statusIcon = state.status === 'processing'
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />
    : state.status === 'error'
      ? <AlertCircle className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />
      : state.status === 'ready'
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
        : <Layers className="w-3.5 h-3.5" aria-hidden="true" />;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground border border-border/60 rounded-xl px-3 py-2" role="group" aria-label={t('editorStatusUi.pipelineStatus')}>
      <span className="flex items-center gap-1.5" role="status" aria-live="polite">
        {statusIcon}
        {statusText}
      </span>
      <span>{t('editorStatusUi.previewLimit')}: {previewDim ? Math.min(PREVIEW_LEVELS.medium.maxDim, Math.max(previewDim.width, previewDim.height)) + 'px' : '—'}</span>
      <span>{t('editorStatusUi.currentImage')}: {resolutionManager.format(width, height)}</span>
      {tier && <span>{t('editorStatusUi.estimatedTier')}: {TIER_KEYS[tier] ? t('editorStatusUi.' + TIER_KEYS[tier]) : tier}</span>}
      {state.run?.durationMs != null && <span>{state.run.durationMs}ms</span>}
    </div>
  );
}
