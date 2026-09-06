import React, { useEffect, useMemo, useState } from 'react';
import { ListOrdered, RefreshCw } from 'lucide-react';
import { jobManager } from '@/lib/jobs/jobManager';
import { JOB_EXECUTION_CLASSES } from '@/lib/jobs/jobModel';
import { createExecutionRunProjection } from '@/lib/jobs/executionRunProjection';
import JobRow from '@/components/editor/jobs/JobRow';
import CanonicalExecutionRunRow from '@/components/editor/jobs/CanonicalExecutionRunRow';

export default function JobCenter({ projectId = null }) {
  const canonicalProjection = useMemo(() => createExecutionRunProjection(), []);
  const [state, setState] = useState(jobManager.snapshot());
  const [canonical, setCanonical] = useState(() => canonicalProjection.snapshot());

  useEffect(() => jobManager.subscribe(setState), []);
  useEffect(() => {
    const unsubscribe = canonicalProjection.subscribe(setCanonical);
    void canonicalProjection.start(projectId);
    return () => {
      canonicalProjection.stop();
      unsubscribe();
    };
  }, [canonicalProjection, projectId]);

  const jobs = [...state.running, ...state.queued, ...state.recent];
  const ephemeralJobs = jobs.filter((job) => job.executionClass === JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK);
  const unsupportedSessionJobs = jobs.length - ephemeralJobs.length;
  const normalizedProjectId = typeof projectId === 'string' ? projectId.trim().toLowerCase() : null;
  const canonicalScopeMatches = Boolean(normalizedProjectId) && canonical.projectId === normalizedProjectId;
  const canonicalRuns = canonicalScopeMatches ? canonical.runs : [];
  const canonicalVisible = canonicalScopeMatches && (canonical.loading || canonical.authoritative || canonical.error);
  if (!jobs.length && !canonicalVisible) return null;

  return <section className="border border-border/60 rounded-2xl p-3 space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><ListOrdered className="w-3.5 h-3.5" />Job Center</p>
    </div>

    {canonicalVisible && <div className="space-y-2" data-job-center-canonical-executions>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium">Server executions</p>
          <p className="text-[10px] text-muted-foreground">Canonical recovery state · read only</p>
        </div>
        <button
          type="button"
          disabled={canonical.loading || canonical.refreshing}
          onClick={() => { void canonicalProjection.refresh(); }}
          className="text-[11px] text-muted-foreground hover:text-foreground disabled:opacity-50 flex items-center gap-1"
        ><RefreshCw className={`w-3 h-3 ${canonical.refreshing ? 'animate-spin' : ''}`} />Refresh</button>
      </div>
      {canonical.loading && <p className="text-[11px] text-muted-foreground">Loading canonical execution state…</p>}
      {canonical.error && !canonical.stale && <p className="text-[11px] text-destructive">Server execution recovery is unavailable.</p>}
      {canonical.error && canonical.stale && <p className="text-[11px] text-amber-600">Server refresh failed. Showing the last confirmed state.</p>}
      {!canonical.loading && canonical.authoritative && canonicalRuns.length === 0 && <p className="text-[11px] text-muted-foreground">No canonical server executions for this project.</p>}
      {canonicalRuns.map((run) => <CanonicalExecutionRunRow key={run.runId} run={run} />)}
    </div>}

    {jobs.length > 0 && <div className="space-y-2" data-job-center-session-jobs data-execution-class={JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium">This session</p>
          <p className="text-[10px] text-muted-foreground">Ephemeral browser-only tasks · reload interrupts them</p>
        </div>
        <button onClick={() => state.paused ? jobManager.resume() : jobManager.pause()} className="text-[11px] text-muted-foreground hover:text-foreground">{state.paused ? 'Resume queue' : 'Pause queue'}</button>
      </div>
      {unsupportedSessionJobs > 0 && <p className="text-[11px] text-destructive">Unsupported session task classification. Controls are withheld.</p>}
      {ephemeralJobs.map((job) => <JobRow key={job.id} job={job} onCancel={(id) => jobManager.cancel(id)} onRetry={(id) => jobManager.retry(id)} onDuplicate={(id) => jobManager.duplicate(id)} onMoveUp={(id) => jobManager.reorder(id, Math.max(0, state.queued.findIndex((item) => item.id === id) - 1))} />)}
    </div>}
  </section>;
}