import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, RotateCcw, XCircle } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const STATUS_KEYS = Object.freeze({
  QUEUED: 'jobs.queued',
  RUNNING: 'jobs.running',
  SUCCEEDED: 'jobs.succeeded',
  FAILED: 'jobs.failed',
  CANCELLED: 'jobs.cancelled',
  UNKNOWN: 'jobs.unknown',
});

const CAPABILITY_KEYS = Object.freeze({
  CREATIVE_EXECUTION: 'jobs.capabilities.creativeExecution',
  LOCAL_EXECUTION: 'jobs.capabilities.localExecution',
  WORKFLOW_CONTINUATION: 'jobs.capabilities.workflowContinuation',
  WORKFLOW_STEP: 'jobs.capabilities.workflowStep',
});

const LOCAL_AUTHORITY_KEYS = Object.freeze({
  ACTIVE: 'jobs.localAuthority.active',
  EXPIRED: 'jobs.localAuthority.expired',
  FINALIZED_SUCCESS: 'jobs.localAuthority.finalizedSuccess',
  FINALIZED_FAILED: 'jobs.localAuthority.finalizedFailed',
  FINALIZED_UNKNOWN: 'jobs.localAuthority.finalizedUnknown',
});

function translatedValue(t, keys, value, fallbackKey) {
  return keys[value] ? t(keys[value]) : t(fallbackKey);
}

function StatusIcon({ status }) {
  if (status === 'RUNNING') return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" aria-hidden="true" />;
  if (status === 'QUEUED') return <Circle className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />;
  if (status === 'SUCCEEDED') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" aria-hidden="true" />;
  if (status === 'FAILED' || status === 'CANCELLED') return <XCircle className="w-3.5 h-3.5 text-destructive" aria-hidden="true" />;
  if (status === 'UNKNOWN') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" aria-hidden="true" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" aria-hidden="true" />;
}

export default function CanonicalExecutionRunRow({ run, control, retryControl, onCancel, onRetry, depth = 0 }) {
  const { t } = useTranslation();
  const creativeRunning = run.capability === 'CREATIVE_EXECUTION' && run.authorityKind === 'CREATIVE_EXECUTION' && run.status === 'RUNNING';
  const recoveredFinal = run.capability === 'CREATIVE_EXECUTION' && run.authorityKind === 'CREATIVE_EXECUTION' && run.status === 'SUCCEEDED' && run.result?.kind === 'FINAL_IMAGE';
  const localRun = run.capability === 'LOCAL_EXECUTION' && run.authorityKind === 'LOCAL_EXECUTION_TICKET';
  const localAuthority = localRun ? run.localExecution : undefined;
  const cancelAvailable = creativeRunning && control?.state === 'AVAILABLE' && typeof onCancel === 'function';
  const cancelPending = creativeRunning && control?.state === 'PENDING';
  const cancelUnavailable = creativeRunning && control?.state === 'UNAVAILABLE';
  const workflowRoot = run.capability === 'WORKFLOW_CONTINUATION' && run.authorityKind === 'WORKFLOW_CONTINUATION';
  const retryAvailable = workflowRoot && retryControl?.state === 'AVAILABLE' && typeof onRetry === 'function';
  const retryPending = workflowRoot && retryControl?.state === 'PENDING';

  return (
    <div data-canonical-execution-run={run.runId} className={depth ? 'ml-4 border-l border-border/60 pl-3' : ''}>
      <div className="rounded-xl border border-border/60 p-3 text-xs space-y-1">
        <div className="flex items-center gap-2">
          <StatusIcon status={run.status} />
          <span className="font-medium truncate flex-1">
            {translatedValue(t, CAPABILITY_KEYS, run.capability, 'jobs.execution')}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{t('jobs.server')}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>
            {translatedValue(t, STATUS_KEYS, run.status, 'jobs.unavailable')}
            {run.statusReasonCode ? ` · ${t('jobs.reasonCode', { code: run.statusReasonCode })}` : ''}
          </span>
          <span className="font-mono">{t('jobs.revision', { revision: run.revision })}</span>
        </div>
        {localRun && (
          <div data-local-execution-authority className="pt-1 text-[10px] text-muted-foreground">
            <p>
              {localAuthority
                ? `${translatedValue(t, LOCAL_AUTHORITY_KEYS, localAuthority.state, 'jobs.ticketAuthorityUnavailable')} · ${t('jobs.expiresAt', { date: localAuthority.expiresAt })}`
                : t('jobs.ticketAuthorityUnavailable')}
            </p>
            <p>{t('jobs.cancellationUnsupported')}</p>
          </div>
        )}
        {recoveredFinal && (
          <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-muted-foreground" data-canonical-execution-result>
            <span>{run.result.width}×{run.result.height} {t('jobs.final')}</span>
            <a href={run.result.imageUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
              {t('jobs.openResult')}
            </a>
          </div>
        )}
        {cancelAvailable && (
          <div className="flex justify-end pt-1">
            <button type="button" onClick={() => onCancel(run)} className="text-[11px] text-destructive hover:underline">
              {t('jobs.cancel')}
            </button>
          </div>
        )}
        {cancelPending && <p className="text-[10px] text-muted-foreground text-right">{t('jobs.cancelling')}</p>}
        {cancelUnavailable && <p className="text-[10px] text-muted-foreground text-right">{t('jobs.cancellationUnavailable')}</p>}
        {retryAvailable && (
          <div className="flex justify-end pt-1">
            <button type="button" onClick={() => onRetry(run)} className="text-[11px] text-primary hover:underline flex items-center gap-1">
              <RotateCcw className="w-3 h-3" aria-hidden="true" />
              {t('jobs.retryWorkflow')}
            </button>
          </div>
        )}
        {retryPending && <p className="text-[10px] text-muted-foreground text-right">{t('jobs.retryingThroughWorkflow')}</p>}
      </div>
      {run.children?.length > 0 && (
        <div className="mt-1 space-y-1">
          {run.children.map((child) => <CanonicalExecutionRunRow key={child.runId} run={child} depth={depth + 1} />)}
        </div>
      )}
    </div>
  );
}
