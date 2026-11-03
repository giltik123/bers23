import React, { useState, useEffect } from 'react';
import { Loader2, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { pipelineEvents } from '@/lib/pipeline/pipelineEvents';
import { resolutionManager } from '@/lib/pipeline/resolutionManager';
import { PREVIEW_LEVELS } from '@/lib/pipeline/previewGenerator';

const STAGE_KEYS = {
  validation: 'editor.statusBar.pipeline.stages.validation',
  metadata: 'editor.statusBar.pipeline.stages.metadata',
  optimization: 'editor.statusBar.pipeline.stages.optimization',
  resolution: 'editor.statusBar.pipeline.stages.resolution',
  masks: 'editor.statusBar.pipeline.stages.masks',
  crop: 'editor.statusBar.pipeline.stages.crop',
  preview: 'editor.statusBar.pipeline.stages.preview',
  restore: 'editor.statusBar.pipeline.stages.restore',
  export: 'editor.statusBar.pipeline.stages.export',
};

const STATUS_KEYS = {
  processing: 'editor.statusBar.pipeline.status.processing',
  error: 'editor.statusBar.pipeline.status.error',
  ready: 'editor.statusBar.pipeline.status.ready',
  idle: 'editor.statusBar.pipeline.status.idle',
};

const TIER_KEYS = {
  preview: 'editor.statusBar.pipeline.tiers.preview',
  standard: 'editor.statusBar.pipeline.tiers.standard',
  hd: 'editor.statusBar.pipeline.tiers.hd',
  original: 'editor.statusBar.pipeline.tiers.original',
};

const translatedKnownValue = (t, keys, value, fallback = '') => (
  keys[value] ? t(keys[value]) : String(fallback || value || '')
);

export default function PipelineStatusBar({ width, height }) {
  const { t } = useTranslation();
  const [state, setState] = useState({ status: 'idle', stage: null, run: null });
  useEffect(() => pipelineEvents.subscribe(setState), []);

  const tier = width && height ? resolutionManager.selectProcessingTier(width, height) : null;
  const previewDim = width && height
    ? resolutionManager.dimensionsFor('preview', width, height)
    : null;

  const statusIcon = state.status === 'processing'
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />
    : state.status === 'error'
      ? <AlertCircle className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />
      : state.status === 'ready'
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />
        : <Layers className="w-3.5 h-3.5" aria-hidden="true" />;

  const statusLabel = state.status === 'processing'
    ? translatedKnownValue(t, STAGE_KEYS, state.stage, t(STATUS_KEYS.processing)) + '…'
    : translatedKnownValue(t, STATUS_KEYS, state.status, '');

  const previewPixels = previewDim
    ? `${Math.min(PREVIEW_LEVELS.medium.maxDim, Math.max(previewDim.width, previewDim.height))}px`
    : '—';
  const tierLabel = tier
    ? translatedKnownValue(t, TIER_KEYS, tier, resolutionManager.tierLabel(tier))
    : null;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground border border-border/60 rounded-xl px-3 py-2"
      role="status" aria-live="polite" aria-label={t('editor.statusBar.pipeline.region')}>
      <span className="flex items-center gap-1.5">
        {statusIcon}
        {statusLabel}
      </span>
      <span>{t('editor.statusBar.pipeline.preview')}: {previewPixels}</span>
      <span>{t('editor.statusBar.pipeline.final')}: {resolutionManager.format(width, height)}</span>
      {tierLabel && <span>{t('editor.statusBar.pipeline.processingTier', { tier: tierLabel })}</span>}
      {state.run?.durationMs != null && <span>{state.run.durationMs}ms</span>}
    </div>
  );
}
