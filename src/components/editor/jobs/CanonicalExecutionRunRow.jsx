import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { executionRunCapabilityLabel, executionRunStatusLabel, localExecutionAuthorityStateLabel } from '@/lib/jobs/executionRunProjection';

function StatusIcon({ status }) {
  if (status === 'RUNNING') return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
  if (status === 'QUEUED') return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
  if (status === 'SUCCEEDED') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'FAILED' || status === 'CANCELLED') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (status === 'UNKNOWN') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function CanonicalExecutionRunRow({ run, control, onCancel, depth = 0 }) {
  const creativeRunning = run.capability === 'CREATIVE_EXECUTION' && run.authorityKind === 'CREATIVE_EXECUTION' && run.status === 'RUNNING';
  const recoveredFinal = run.capability === 'CREATIVE_EXECUTION' && run.authorityKind === 'CREATIVE_EXECUTION' && run.status === 'SUCCEEDED' && run.result?.kind === 'FINAL_IMAGE';
  const localRun = run.capability === 'LOCAL_EXECUTION' && run.authorityKind === 'LOCAL_EXECUTION_TICKET';
  const localAuthority = localRun ? run.localExecution : undefined;
  const cancelAvailable = creativeRunning && control?.state === 'AVAILABLE' && typeof onCancel === 'function';
  const cancelPending = creativeRunning && control?.state === 'PENDING';
  const cancelUnavailable = creativeRunning && control?.state === 'UNAVAILABLE';

  return <div data-canonical-execution-run={run.runId} className={depth ? 'ml-4 border-l border-border/60 pl-3' : ''}>
    <div className="rounded-xl border border-border/60 p-3 text-xs space-y-1">
      <div className="flex items-center gap-2">
        <StatusIcon status={run.status} />
        <span className="font-medium truncate flex-1">{executionRunCapabilityLabel(run.capability)}</span>
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">server</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span>{executionRunStatusLabel(run.status)}{run.statusReasonCode ? ` · ${run.statusReasonCode}` : ''}</span>
        <span className="font-mono">r{run.revision}</span>
      </div>
      {localRun && <div data-local-execution-authority className="pt-1 text-[10px] text-muted-foreground">
        <p>{localAuthority ? `${localExecutionAuthorityStateLabel(localAuthority.state)} · expires ${localAuthority.expiresAt}` : 'Local ticket authority unavailable'}</p>
        <p>Cancellation unsupported.</p>
      </div>}
      {recoveredFinal && <div className="flex items-center justify-between gap-2 pt-1 text-[10px] text-muted-foreground" data-canonical-execution-result>
        <span>{run.result.width}×{run.result.height} FINAL</span>
        <a href={run.result.imageUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Open result</a>
      </div>}
      {cancelAvailable && <div className="flex justify-end pt-1">
        <button type="button" onClick={() => onCancel(run)} className="text-[11px] text-destructive hover:underline">Cancel</button>
      </div>}
      {cancelPending && <p className="text-[10px] text-muted-foreground text-right">Cancelling through Creative authority…</p>}
      {cancelUnavailable && <p className="text-[10px] text-muted-foreground text-right">Cancellation unavailable.</p>}
    </div>
    {run.children?.length > 0 && <div className="mt-1 space-y-1">{run.children.map((child) => <CanonicalExecutionRunRow key={child.runId} run={child} depth={depth + 1} />)}</div>}
  </div>;
}