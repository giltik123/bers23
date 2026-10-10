import React, { useEffect, useState } from 'react';
import { Check, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdaptiveGestures } from '@/components/adaptive/AdaptiveGestures';
import { canCompareOperationAligned, canComparePixelsAligned } from './compareGeometryPolicy';

// A read-only inspector for an unaccepted candidate. The Core-owned Accept,
// Discard, and Retry callbacks remain the ONLY controls changing Project state.
// Split view is admitted only after both images have identical real geometry;
// cropping/rotation/failed image delivery must never masquerade as aligned pixels.
export default function ResultCompare({ beforeUrl, result, candidateOperation, onAccept, onDiscard, onRetry, busy }) {
  const [view, setView] = useState('after');
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [geometry, setGeometry] = useState('loading');
  const [naturalSizes, setNaturalSizes] = useState({ before: null, after: null });
  const afterUrl = result?.preview_url || result?.image_url || '';
  const gestures = useAdaptiveGestures({
    onSwipeLeft: () => setView('after'),
    onSwipeRight: () => setView('before'),
  });

  useEffect(() => {
    setGeometry('loading');
    setNaturalSizes({ before: null, after: null });
    setView('after');
    setZoom(1);
    setSplitPosition(50);
    if (!beforeUrl || !afterUrl) {
      setGeometry('unavailable');
      return undefined;
    }
    let alive = true;
    let beforeSize = null;
    let afterSize = null;
    const before = new Image();
    const after = new Image();
    const resolve = () => {
      if (!alive || !beforeSize || !afterSize) return;
      setGeometry(
        canComparePixelsAligned(beforeSize, afterSize)
          ? 'aligned' : 'different',
      );
    };
    before.onload = () => {
      beforeSize = { width: before.naturalWidth, height: before.naturalHeight };
      if (alive) setNaturalSizes((current) => ({ ...current, before: beforeSize }));
      resolve();
    };
    after.onload = () => {
      afterSize = { width: after.naturalWidth, height: after.naturalHeight };
      if (alive) setNaturalSizes((current) => ({ ...current, after: afterSize }));
      resolve();
    };
    const unavailable = () => { if (alive) setGeometry('unavailable'); };
    before.onerror = unavailable;
    after.onerror = unavailable;
    before.src = beforeUrl;
    after.src = afterUrl;
    return () => {
      alive = false;
      before.onload = null;
      after.onload = null;
      before.onerror = null;
      after.onerror = null;
      before.src = '';
      after.src = '';
    };
  }, [beforeUrl, afterUrl]);

  const splitAllowed = geometry === 'aligned' && canCompareOperationAligned(candidateOperation);
  const mode = view === 'split' && !splitAllowed ? 'after' : view;
  // At 100%, one decoded source pixel occupies one CSS pixel (200%=2 CSS px).
  // A fixed-height object-contain container would otherwise pretend to be 100%
  // while silently reducing detail on tall/large photographs.
  const naturalSize = mode === 'before' ? naturalSizes.before : naturalSizes.after;
  const inspectedCanvas = naturalSize
    ? { width: naturalSize.width * zoom, height: naturalSize.height * zoom }
    : { width: '100%', height: 340 };
  const executionLabel = result?.provider || 'Local / Core preview';
  const creditLabel = Number.isFinite(result?.credits_used) && result.credits_used > 0
    ? ` · ${result.credits_used} credits` : '';
  const durationLabel = Number.isFinite(result?.generation_time_ms) && result.generation_time_ms > 0
    ? ` · ${(result.generation_time_ms / 1000).toFixed(1)}s` : '';

  return (
    <section className="border border-border/60 rounded-2xl p-3 space-y-3" aria-label="Review pending image before accepting">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs" role="group" aria-label="Image comparison mode">
          <button type="button" aria-pressed={mode === 'before'} onClick={() => setView('before')}
            className={`px-3 py-1.5 ${mode === 'before' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Before</button>
          <button type="button" aria-pressed={mode === 'after'} onClick={() => setView('after')}
            className={`px-3 py-1.5 ${mode === 'after' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>After</button>
          <button type="button" aria-pressed={mode === 'split'} disabled={!splitAllowed} onClick={() => setView('split')}
            className={`px-3 py-1.5 disabled:opacity-40 ${mode === 'split' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Split</button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {executionLabel}{creditLabel}{durationLabel}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <label htmlFor="editor-preview-zoom">Inspection zoom</label>
          <select id="editor-preview-zoom" aria-label="Inspection zoom" value={zoom} disabled={!naturalSize}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1">
            <option value={1}>100%</option>
            <option value={2}>200%</option>
          </select>
        </div>
        {mode === 'split' && (
          <label className="flex flex-1 items-center gap-2 min-w-[160px] max-w-xs">
            Split boundary
            <input aria-label="Split boundary" type="range" min="0" max="100" step="1"
              value={splitPosition} onChange={(event) => setSplitPosition(Number(event.target.value))}
              className="flex-1 accent-primary" />
            <span className="tabular-nums">{splitPosition}%</span>
          </label>
        )}
      </div>

      {geometry === 'aligned' && !canCompareOperationAligned(candidateOperation) && (
        <p role="status" className="text-xs text-muted-foreground">
          This operation may change image registration. Split inspection is disabled; review Before and After separately.
        </p>
      )}
      {geometry === 'different' && (
        <p role="status" className="text-xs text-muted-foreground">
          Images have different pixel dimensions. Split comparison is disabled to avoid false alignment.
        </p>
      )}
      {geometry === 'unavailable' && (
        <p role="status" className="text-xs text-muted-foreground">
          One image cannot be measured. Before and After remain available when its preview loads.
        </p>
      )}

      <div className="overflow-auto rounded-xl bg-muted max-h-[420px]" {...gestures.handlers}>
        <div className="relative" style={inspectedCanvas}>
          {mode === 'split' ? (
            <>
              <img src={afterUrl} alt="Edited image, right side of split" draggable={false}
                className="absolute inset-0 h-full w-full object-fill" />
              <img src={beforeUrl} alt="Original image, left side of split" draggable={false}
                className="absolute inset-0 h-full w-full object-fill"
                style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }} />
              <div aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
                style={{ left: `${splitPosition}%` }} />
            </>
          ) : (
            <img src={mode === 'before' ? beforeUrl : afterUrl}
              alt={mode === 'before' ? 'Original image' : 'Unaccepted edited image'}
              draggable={false} className="h-full w-full object-fill" />
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Zoom uses actual decoded image dimensions (one CSS pixel per source pixel at 100%). This remains a visual preview, not a pixel-level quality certificate. Accept alone commits to Project history.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAccept} disabled={busy} className="flex-1 min-w-[100px]">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Accept
        </Button>
        <Button variant="outline" onClick={onRetry} disabled={busy} className="rounded-xl">
          <RotateCcw className="w-4 h-4 mr-2" /> Retry
        </Button>
        <Button variant="outline" onClick={onDiscard} disabled={busy} className="rounded-xl text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" /> Discard
        </Button>
      </div>
    </section>
  );
}
