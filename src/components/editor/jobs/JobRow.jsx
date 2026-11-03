import React from 'react';
import { ArrowUp, Loader2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const STATUS_KEYS = Object.freeze({
  queued: 'jobs.queued',
  preparing: 'jobs.preparing',
  running: 'jobs.running',
  waiting: 'jobs.waiting',
  completed: 'jobs.completed',
  cancelled: 'jobs.cancelled',
  failed: 'jobs.failed',
  retrying: 'jobs.retrying',
});

const PRIORITY_KEYS = Object.freeze({
  high: 'jobs.priority.high',
  normal: 'jobs.priority.normal',
  low: 'jobs.priority.low',
});

function translatedValue(t, keys, value, fallbackKey) {
  return keys[value] ? t(keys[value]) : t(fallbackKey);
}

export default function JobRow({ job, onCancel, onRunAgain, onDuplicate, onMoveUp }) {
  const { t } = useTranslation();
  const active = ['preparing', 'running', 'retrying'].includes(job.status);
  const status = translatedValue(t, STATUS_KEYS, job.status, 'jobs.unavailable');
  const priority = translatedValue(t, PRIORITY_KEYS, job.priority, 'jobs.priority.unknown');
  const progress = job.metadata?.currentStage
    ? t('jobs.stage', { stage: String(job.metadata.currentStage) })
    : `${job.progress || 0}%`;

  return (
    <div className="rounded-xl border border-border/60 p-3 text-xs space-y-1">
      <div className="flex items-center gap-2">
        {active && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />}
        <span className="font-medium truncate flex-1">{job.label}</span>
        <span className="text-muted-foreground">{priority}</span>
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{status} · {progress}</span>
        <div className="flex gap-1">
          {job.status === 'queued' && onMoveUp && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t('jobs.moveUp')}
              title={t('jobs.moveUp')}
              onClick={() => onMoveUp(job.id)}
            >
              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          )}
          {job.status === 'failed' && onRunAgain && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onRunAgain(job.id).catch(() => {})}>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              {t('jobs.runAgain')}
            </Button>
          )}
          {['queued', 'preparing', 'running', 'retrying'].includes(job.status) && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              aria-label={t('jobs.cancel')}
              title={t('jobs.cancel')}
              onClick={() => onCancel(job.id)}
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </Button>
          )}
          {['completed', 'cancelled'].includes(job.status) && (
            <Button type="button" size="sm" variant="ghost" onClick={() => onDuplicate(job.id).catch(() => {})}>
              {t('jobs.duplicate')}
            </Button>
          )}
        </div>
      </div>
      {job.estimatedTime && (
        <p className="text-[10px] text-muted-foreground">
          {t('jobs.estimatedSeconds', { seconds: Math.ceil(job.estimatedTime / 1000) })}
        </p>
      )}
    </div>
  );
}
