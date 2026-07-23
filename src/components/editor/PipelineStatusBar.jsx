import React, { useState, useEffect } from 'react';
import { Loader2, Layers, CheckCircle2, AlertCircle } from 'lucide-react';
import { pipelineEvents } from '@/lib/pipeline/pipelineEvents';
import { resolutionManager, RESOLUTION_TIERS } from '@/lib/pipeline/resolutionManager';
import { PREVIEW_LEVELS } from '@/lib/pipeline/previewGenerator';

const STAGE_LABELS = {
  validation: 'Validating', metadata: 'Reading metadata', optimization: 'Optimizing',
  resolution: 'Selecting resolution', masks: 'Processing masks', crop: 'Computing crop',
  preview: 'Generating preview', restore: 'Restoring result', export: 'Exporting',
};

export default function PipelineStatusBar({ width, height }) {
  const [state, setState] = useState({ status: 'idle', stage: null, run: null });
  useEffect(() => pipelineEvents.subscribe(setState), []);

  const tier = width && height ? resolutionManager.selectProcessingTier(width, height) : null;
  const previewDim = width && height
    ? resolutionManager.dimensionsFor('preview', width, height)
    : null;

  const statusIcon = state.status === 'processing'
    ? <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
    : state.status === 'error'
      ? <AlertCircle className="w-3.5 h-3.5 text-destructive" />
      : state.status === 'ready'
        ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
        : <Layers className="w-3.5 h-3.5" />;

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground border border-border/60 rounded-xl px-3 py-2">
      <span className="flex items-center gap-1.5">
        {statusIcon}
        {state.status === 'processing'
          ? (STAGE_LABELS[state.stage] || 'Processing') + '…'
          : state.status === 'error' ? 'Pipeline error'
          : state.status === 'ready' ? 'Pipeline ready' : 'Pipeline idle'}
      </span>
      <span>Preview: {previewDim ? `${Math.min(PREVIEW_LEVELS.medium.maxDim, Math.max(previewDim.width, previewDim.height))}px ${RESOLUTION_TIERS.preview.label.toLowerCase()}` : '—'}</span>
      <span>Final: {resolutionManager.format(width, height)}</span>
      {tier && <span>Processing tier: {resolutionManager.tierLabel(tier)}</span>}
      {state.run?.durationMs != null && <span>{state.run.durationMs}ms</span>}
    </div>
  );
}