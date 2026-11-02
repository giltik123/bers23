import React, { useRef, useState } from 'react';
import { ArrowUp, Loader2, RotateCcw, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { priorityLabel } from '@/lib/jobs/jobModel';
import { JOB_REPEAT_ACTIONS, manualRepeatConsentMessage } from '@/lib/jobs/jobRepeatPolicy';

export default function JobRow({ job, onCancel, onRunAgain, onDuplicate, onMoveUp }) {
  const { language } = useTranslation();
  const [repeatPending, setRepeatPending] = useState(false);
  const [repeatError, setRepeatError] = useState('');
  const repeatInFlight = useRef(false);
  const active = ['preparing', 'running', 'retrying'].includes(job.status);

  async function startNewOperation(action, handler) {
    // Guard synchronously: two clicks before React renders must not dispatch twice.
    if (repeatInFlight.current || typeof handler !== 'function') return;
    const warning = manualRepeatConsentMessage(job, action, language);
    if (!warning || !window.confirm(warning)) return;
    repeatInFlight.current = true;
    setRepeatPending(true);
    setRepeatError('');
    try {
      await handler(job.id);
    } catch {
      // The owning adapter still controls execution and financial settlement.
      // Never swallow a failed explicit repeat without user feedback.
      setRepeatError(language === 'ru'
        ? 'Новая операция не запустилась или завершилась ошибкой. Проверьте состояние задачи перед повтором.'
        : 'The new operation could not start or failed. Check the task state before trying again.');
    } finally {
      repeatInFlight.current = false;
      setRepeatPending(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 p-3 text-xs space-y-1" aria-busy={repeatPending || undefined}>
      <div className="flex items-center gap-2">
        {active && <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />}
        <span className="font-medium truncate flex-1">{job.label}</span>
        <span className="text-muted-foreground">{priorityLabel(job.priority)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="capitalize">{job.status} · {job.metadata?.currentStage || `${job.progress || 0}%`}</span>
        <div className="flex gap-1">
          {job.status === 'queued' && onMoveUp && (
            <Button type="button" size="sm" variant="ghost" disabled={repeatPending}
              aria-label={language === 'ru' ? 'Поднять задачу в очереди' : 'Move task up in queue'}
              onClick={() => onMoveUp(job.id)}><ArrowUp className="w-3.5 h-3.5" aria-hidden="true" /></Button>
          )}
          {job.status === 'failed' && onRunAgain && (
            <Button type="button" size="sm" variant="ghost" disabled={repeatPending}
              onClick={() => void startNewOperation(JOB_REPEAT_ACTIONS.RUN_AGAIN, onRunAgain)}>
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" /><span>Run again</span>
            </Button>
          )}
          {['queued', 'preparing', 'running', 'retrying'].includes(job.status) && onCancel && (
            <Button type="button" size="sm" variant="ghost"
              aria-label={language === 'ru' ? 'Отменить задачу' : 'Cancel task'}
              onClick={() => onCancel(job.id)}><X className="w-3.5 h-3.5" aria-hidden="true" /></Button>
          )}
          {['completed', 'cancelled'].includes(job.status) && onDuplicate && (
            <Button type="button" size="sm" variant="ghost" disabled={repeatPending}
              onClick={() => void startNewOperation(JOB_REPEAT_ACTIONS.DUPLICATE, onDuplicate)}>
              {language === 'ru' ? 'Запустить копию' : 'Run copy'}
            </Button>
          )}
        </div>
      </div>
      {repeatError && <p role="alert" className="text-[11px] text-destructive">{repeatError}</p>}
      {job.estimatedTime && <p className="text-[10px] text-muted-foreground">Estimated {Math.ceil(job.estimatedTime / 1000)}s</p>}
    </div>
  );
}
