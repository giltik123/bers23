import React from 'react';
import { AlertTriangle, CheckCircle2, Circle, Loader2, XCircle } from 'lucide-react';
import { executionRunCapabilityLabel, executionRunStatusLabel } from '@/lib/jobs/executionRunProjection';

function StatusIcon({ status }) {
  if (status === 'RUNNING') return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
  if (status === 'QUEUED') return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
  if (status === 'SUCCEEDED') return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />;
  if (status === 'FAILED' || status === 'CANCELLED') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  if (status === 'UNKNOWN') return <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground" />;
}

export default function CanonicalExecutionRunRow({ run, depth = 0 }) {
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
    </div>
    {run.children?.length > 0 && <div className="mt-1 space-y-1">{run.children.map((child) => <CanonicalExecutionRunRow key={child.runId} run={child} depth={depth + 1} />)}</div>}
  </div>;
}
