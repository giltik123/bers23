import React, { useState, useEffect } from 'react';
import { Loader2, X, RefreshCw } from 'lucide-react';
import { subscribeSegmentation, cancelActiveSegmentation } from '@/lib/segmentation/segmentationEvents';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const PHASE_KEYS = Object.freeze({
  validating: 'editorProgress.segmentation.validating',
  preparing: 'editorProgress.segmentation.preparing',
  segmenting: 'editorProgress.segmentation.segmenting',
  retrying: 'editorProgress.segmentation.retrying',
  parsing: 'editorProgress.segmentation.parsing',
});

// Self-contained progress strip: subscribes to the segmentation event bus,
// shows provider, current operation, retry state and a cancel button.
export default function SegmentationProgress() {
  const { t } = useTranslation();
  const [event, setEvent] = useState(null);

  useEffect(() => {
    const unsubscribe = subscribeSegmentation((e) => {
      setEvent(['done', 'error', 'cancelled'].includes(e.phase) ? null : e);
    });
    return unsubscribe;
  }, []);

  if (!event) return null;

  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card px-3 py-2.5 text-sm">
      {event.phase === 'retrying'
        ? <RefreshCw className="w-4 h-4 animate-spin text-amber-600" />
        : <Loader2 className="w-4 h-4 animate-spin text-primary" />}
      <span className="flex-1 min-w-0">
        <span className="block truncate">{PHASE_KEYS[event.phase] ? t(PHASE_KEYS[event.phase]) : t('editorProgress.working')}</span>
        <span className="block text-[11px] text-muted-foreground">
          {t('editorProgress.provider')}: {event.provider || t('editorProgress.unknownProvider')}{event.attempt ? ` · ${t('editorProgress.attempt', { count: event.attempt })}` : ''}
        </span>
      </span>
      <button
        onClick={cancelActiveSegmentation}
        className="p-1.5 rounded-lg hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
        aria-label={t('editorProgress.cancelSegmentation')}
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}