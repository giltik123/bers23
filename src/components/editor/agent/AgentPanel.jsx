import React, { useEffect, useMemo, useState } from 'react';
import { Bot, Loader2, RotateCw, ShieldCheck, SquareArrowOutUpRight, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { RESIZE_MAX_DIMENSION, RESIZE_MAX_OUTPUT_PIXELS } from '@/platform/creative/deterministic/ResizeIdentity';

const MODES = Object.freeze([
  ['ROTATE_90_CW', 'Rotate 90° clockwise'],
  ['ROTATE_180', 'Rotate 180°'],
  ['ROTATE_270_CW', 'Rotate 270° clockwise'],
  ['FLIP_HORIZONTAL', 'Flip horizontal'],
  ['FLIP_VERTICAL', 'Flip vertical'],
]);

export default function AgentPanel({ project, state, busy = false, disabled = false, onStart, onRetry, onCancel }) {
  const [mode, setMode] = useState('ROTATE_90_CW');
  const [width, setWidth] = useState(project?.width ?? 1);
  const [height, setHeight] = useState(project?.height ?? 1);
  const active = Boolean(state?.active);
  const view = state?.view;

  useEffect(() => {
    if (active) return;
    setWidth(project?.width ?? 1);
    setHeight(project?.height ?? 1);
  }, [project?.current_image_artifact_id, project?.width, project?.height, active]);

  const validTarget = useMemo(() => Number.isSafeInteger(width) && Number.isSafeInteger(height)
    && width > 0 && height > 0 && width <= RESIZE_MAX_DIMENSION && height <= RESIZE_MAX_DIMENSION
    && width * height <= RESIZE_MAX_OUTPUT_PIXELS, [width, height]);
  const canStart = Boolean(project?.current_image_artifact_id) && !disabled && !busy && !active && validTarget;
  const stepLabel = view?.nextAction?.operation === 'ORTHOGONAL_TRANSFORM'
    ? 'Running orthogonal transform'
    : view?.nextAction?.operation === 'RESIZE'
      ? 'Running exact resize'
      : view?.retryAvailable
        ? `${view.attemptStatus || 'Local'} attempt can be retried`
        : view?.state || 'Ready';

  const invoke = (operation) => { void Promise.resolve().then(operation).catch(() => undefined); };

  return (
    <section className="space-y-4 rounded-2xl border border-border/60 p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4" />
          <div>
            <p className="text-sm font-medium">AI Agent · Bounded deterministic v1</p>
            <p className="text-[11px] text-muted-foreground">Core owns sequencing, tickets, lineage and recovery.</p>
          </div>
        </div>
        <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-label="Core-owned workflow" />
      </div>

      <div className="rounded-xl bg-secondary/50 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Fixed workflow</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5" aria-label="Bounded Agent workflow steps">
          <span className="rounded-md border bg-background px-2 py-1">1 · Transform</span>
          <SquareArrowOutUpRight className="h-3 w-3" />
          <span className="rounded-md border bg-background px-2 py-1">2 · Resize</span>
          <SquareArrowOutUpRight className="h-3 w-3" />
          <span className="rounded-md border bg-background px-2 py-1">3 · Core verify</span>
        </div>
        <p className="mt-2">No provider selection, paid cloud calls, generic tools or browser-owned step reordering.</p>
      </div>

      {!active && (
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 sm:col-span-2">
            <span className="text-xs font-medium">Transform</span>
            <select
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              value={mode}
              onChange={(event) => setMode(event.target.value)}
              disabled={disabled || busy}
            >
              {MODES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Final width</span>
            <input
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              type="number" min="1" max={RESIZE_MAX_DIMENSION} step="1" value={width}
              onChange={(event) => setWidth(Number(event.target.value))}
              disabled={disabled || busy}
            />
          </label>
          <label className="space-y-1">
            <span className="text-xs font-medium">Final height</span>
            <input
              className="h-10 w-full rounded-lg border bg-background px-3 text-sm"
              type="number" min="1" max={RESIZE_MAX_DIMENSION} step="1" value={height}
              onChange={(event) => setHeight(Number(event.target.value))}
              disabled={disabled || busy}
            />
          </label>
          {!validTarget && <p className="text-xs text-destructive sm:col-span-2">Target must use positive integer dimensions within the deterministic Resize limits.</p>}
          <Button
            className="sm:col-span-2"
            disabled={!canStart}
            onClick={() => invoke(() => onStart?.({ mode, width, height }))}
          >
            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCw className="mr-2 h-4 w-4" />}
            Run bounded workflow
          </Button>
        </div>
      )}

      {(active || busy) && (
        <div className="space-y-3 rounded-xl border bg-card p-3" role="status">
          <div className="flex items-center gap-2 text-sm">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            <span className="font-medium">{stepLabel}</span>
          </div>
          {view?.executionId && <p className="break-all text-[11px] text-muted-foreground">Workflow: {view.executionId}</p>}
          {view?.retryAvailable ? (
            <div className="flex gap-2">
              <Button size="sm" onClick={() => invoke(() => onRetry?.())} disabled={busy}>Retry exact step</Button>
              <Button size="sm" variant="outline" onClick={() => invoke(() => onCancel?.())} disabled={busy}><X className="mr-1 h-3.5 w-3.5" />Cancel</Button>
            </div>
          ) : view?.state && !['SUCCESS','FAILED','CANCELLED','UNKNOWN'].includes(view.state) ? (
            <Button size="sm" variant="outline" onClick={() => invoke(() => onCancel?.())} disabled={busy}><X className="mr-1 h-3.5 w-3.5" />Cancel workflow</Button>
          ) : null}
        </div>
      )}

      {state?.error && <p className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">{state.error}</p>}
    </section>
  );
}