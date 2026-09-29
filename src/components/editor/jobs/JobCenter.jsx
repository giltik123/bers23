import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ListOrdered, RefreshCw } from 'lucide-react';
import { coreClient } from '@/api/coreClient';
import { jobManager } from '@/lib/jobs/jobManager';
import { JOB_EXECUTION_CLASSES } from '@/lib/jobs/jobModel';
import { createExecutionRunProjection } from '@/lib/jobs/executionRunProjection';
import { CreativeExecutionControlPolicy } from '@/lib/jobs/creativeExecutionControl';
import { WorkflowExecutionRetryPolicy } from '@/lib/jobs/workflowExecutionRetryControl';
import JobRow from '@/components/editor/jobs/JobRow';
import CanonicalExecutionRunRow from '@/components/editor/jobs/CanonicalExecutionRunRow';

export default function JobCenter({ projectId = null }) {
  const canonicalProjection = useMemo(() => createExecutionRunProjection(), []);
  const creativeControl = useMemo(() => new CreativeExecutionControlPolicy(coreClient.creative), []);
  const workflowRetryControl = useMemo(() => new WorkflowExecutionRetryPolicy(coreClient.agent), []);
  const workflowRetryInFlightRef = useRef(new Set());
  const [state, setState] = useState(jobManager.snapshot());
  const [canonical, setCanonical] = useState(() => canonicalProjection.snapshot());
  const [canonicalControls, setCanonicalControls] = useState(() => Object.freeze({}));
  const [workflowRetryControls, setWorkflowRetryControls] = useState(() => Object.freeze({}));

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

  useEffect(() => {
    let active = true;
    if (!canonicalScopeMatches || !canonical.authoritative) {
      setCanonicalControls(Object.freeze({}));
      return () => { active = false; };
    }

    const checking = Object.fromEntries(canonical.runs.map((run) => [run.runId, Object.freeze({ state: 'CHECKING' })]));
    setCanonicalControls(Object.freeze(checking));
    void Promise.all(canonical.runs.map(async (run) => [run.runId, await creativeControl.inspect(run)])).then((entries) => {
      if (!active) return;
      setCanonicalControls(Object.freeze(Object.fromEntries(entries)));
    });
    return () => { active = false; };
  }, [creativeControl, canonicalScopeMatches, canonical.authoritative, canonical.runs]);

  useEffect(() => {
    if (!canonicalScopeMatches || !canonical.authoritative) {
      setWorkflowRetryControls(Object.freeze({}));
      return;
    }
    setWorkflowRetryControls(Object.freeze(Object.fromEntries(
      canonical.runs.map((run) => [run.runId, workflowRetryControl.inspect(run)]),
    )));
  }, [workflowRetryControl, canonicalScopeMatches, canonical.authoritative, canonical.runs]);

  async function cancelCanonicalRun(run) {
    setCanonicalControls((current) => Object.freeze({
      ...current,
      [run.runId]: Object.freeze({ state: 'PENDING' }),
    }));
    try {
      await creativeControl.cancel(run);
    } catch {
      setCanonicalControls((current) => Object.freeze({
        ...current,
        [run.runId]: Object.freeze({ state: 'UNAVAILABLE', reasonCode: 'CANCEL_REQUEST_FAILED' }),
      }));
    } finally {
      await canonicalProjection.refresh();
    }
  }

  async function retryCanonicalWorkflow(run) {
    if (!normalizedProjectId || workflowRetryInFlightRef.current.has(run.runId)) return;
    workflowRetryInFlightRef.current.add(run.runId);
    setWorkflowRetryControls((current) => Object.freeze({
      ...current,
      [run.runId]: Object.freeze({ state: 'PENDING' }),
    }));
    try {
      await workflowRetryControl.retry(run, normalizedProjectId);
    } catch {
      setWorkflowRetryControls((current) => Object.freeze({
        ...current,
        [run.runId]: Object.freeze({ state: 'UNAVAILABLE', reasonCode: 'RETRY_REQUEST_FAILED' }),
      }));
    } finally {
      workflowRetryInFlightRef.current.delete(run.runId);
      await canonicalProjection.refresh();
    }
  }

  if (!jobs.length && !canonicalVisible) return null;

  return <section className="border border-border/60 rounded-2xl p-3 space-y-3">
    <div className="flex items-center justify-between">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5"><ListOrdered className="w-3.5 h-3.5" />Job Center</p>
    </div>

    {canonicalVisible && <div className="space-y-2" data-job-center-canonical-executions>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-[11px] font-medium">Server executions</p>
          <p className="text-[10px] text-muted-foreground">Canonical recovery state · owning authority controls only</p>
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
      {canonicalRuns.map((run) => <CanonicalExecutionRunRow key={run.runId} run={run} control={canonicalControls[run.runId]} retryControl={workflowRetryControls[run.runId]} onCancel={cancelCanonicalRun} onRetry={retryCanonicalWorkflow} />)}
    </div>}

    {jobs.length > 0 && <div className="space-y-2" data-job-center-session-jobs data-execution-class={JOB_EXECUTION_CLASSES.EPHEMERAL_CLIENT_TASK}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[11px] font-medium">This session</p>
          <p className="text-[10px] text-muted-foreground">Ephemeral browser-only tasks · reload interrupts them · Run again starts a new operation</p>
        </div>
        <button onClick={() => state.paused ? jobManager.resume() : jobManager.pause()} className="text-[11px] text-muted-foreground hover:text-foreground">{state.paused ? 'Resume queue' : 'Pause queue'}</button>
      </div>
      {unsupportedSessionJobs > 0 && <p className="text-[11px] text-destructive">Unsupported session task classification. Controls are withheld.</p>}
      {ephemeralJobs.map((job) => <JobRow key={job.id} job={job} onCancel={(id) => jobManager.cancel(id)} onRunAgain={(id) => jobManager.runAgain(id)} onDuplicate={(id) => jobManager.duplicate(id)} onMoveUp={(id) => jobManager.reorder(id, Math.max(0, state.queued.findIndex((item) => item.id === id) - 1))} />)}
    </div>}
  </section>;
}
