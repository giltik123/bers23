import React, { useEffect, useRef, useState } from 'react';
import { Check, Trash2, RotateCcw, Loader2, ZoomIn, ZoomOut, Scan } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  clampComparisonSplit,
  clampInspectorPan,
  isComparableGeometry,
  nextInspectorZoom,
} from './qualityInspectorGeometry';

// Quality Inspector never modifies image bytes or grants FINAL/Project authority.
// Accept/Discard/Retry are the existing explicit Editor callbacks.
export default function ResultCompare({ beforeUrl, result, onAccept, onDiscard, onRetry, busy }) {
  const afterUrl = result?.preview_url || result?.image_url;
  const [mode, setMode] = useState('after');
  const [split, setSplit] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [beforeSize, setBeforeSize] = useState(null);
  const [afterSize, setAfterSize] = useState(null);
  const [imageErrors, setImageErrors] = useState({ before: false, after: false });
  const pointer = useRef(null);
  const sameGeometry = isComparableGeometry(beforeSize, afterSize);

  useEffect(() => {
    setMode('after');
    setSplit(50);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setBeforeSize(null);
    setAfterSize(null);
    setImageErrors({ before: false, after: false });
    pointer.current = null;
  }, [beforeUrl, afterUrl]);

  useEffect(() => {
    if (mode === 'split' && !sameGeometry) setMode('after');
  }, [sameGeometry, mode]);

  const changeZoom = (direction) => {
    const next = nextInspectorZoom(zoom, direction);
    setZoom(next);
    setPan((current) => clampInspectorPan(current, next));
  };
  const resetView = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setSplit(50);
  };
  const pointerDown = (event) => {
    if (event.button !== 0 || pointer.current) return;
    pointer.current = { id: event.pointerId, x: event.clientX, y: event.clientY, startX: event.clientX };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event) => {
    const previous = pointer.current;
    if (!previous || previous.id !== event.pointerId) return;
    if (zoom > 1) {
      const bounds = event.currentTarget.getBoundingClientRect();
      if (bounds.width > 0 && bounds.height > 0) {
        const dx = 100 * (event.clientX - previous.x) / bounds.width;
        const dy = 100 * (event.clientY - previous.y) / bounds.height;
        setPan((current) => clampInspectorPan({ x: current.x + dx, y: current.y + dy }, zoom));
      }
    }
    pointer.current = { ...previous, x: event.clientX, y: event.clientY };
  };
  const pointerUp = (event) => {
    const previous = pointer.current;
    if (!previous || previous.id !== event.pointerId) return;
    if (zoom === 1 && mode !== 'split') {
      const delta = event.clientX - previous.startX;
      if (Math.abs(delta) > 72) setMode(delta < 0 ? 'after' : 'before');
    }
    pointer.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };
  const pointerCancel = (event) => {
    if (pointer.current?.id === event.pointerId) pointer.current = null;
  };
  const handleKeys = (event) => {
    if (zoom === 1) return;
    const movement = { ArrowLeft: [-10, 0], ArrowRight: [10, 0], ArrowUp: [0, -10], ArrowDown: [0, 10] }[event.key];
    if (!movement) return;
    event.preventDefault();
    setPan((current) => clampInspectorPan({ x: current.x + movement[0], y: current.y + movement[1] }, zoom));
  };

  // Transform applied to both layers identically. Comparison split clips the
  // After layer at viewport coordinates, not independent image positions.
  const transform = { transform: `translate(${pan.x}%, ${pan.y}%) scale(${zoom})`, transformOrigin: 'center', userSelect: 'none' };
  const afterClipLeft = mode === 'before' ? 100 : mode === 'after' ? 0 : split;
  const metadata = [
    typeof result?.provider === 'string' && result.provider.trim() ? result.provider.trim() : null,
    Number.isFinite(result?.credits_used) && result.credits_used >= 0 ? `${result.credits_used} credits` : null,
    Number.isFinite(result?.generation_time_ms) && result.generation_time_ms > 0
      ? `${(result.generation_time_ms / 1000).toFixed(1)} s` : null,
  ].filter(Boolean).join(' · ');

  return (
    <section aria-label="Result quality inspector" className="border border-border/60 rounded-2xl p-3 space-y-3" data-testid="result-quality-inspector">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs" role="group" aria-label="Compare modes">
          {['before', 'after', 'split'].map((value) => (
            <button key={value} type="button" onClick={() => setMode(value)}
              aria-pressed={mode === value}
              disabled={value === 'split' && !sameGeometry}
              className={`px-3 py-2 min-h-9 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary disabled:opacity-40 ${mode === value ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>
              {value === 'split' ? 'Split view' : value === 'before' ? 'Before' : 'After'}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1" role="group" aria-label="Synchronized image zoom">
          <button type="button" aria-label="Zoom out" title="Zoom out" onClick={() => changeZoom('out')}
            disabled={zoom === 1} className="rounded-md p-2 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-xs text-muted-foreground tabular-nums w-8 text-center" aria-label={`Preview zoom ${zoom} times fit`}>{zoom}×</span>
          <button type="button" aria-label="Zoom in" title="Zoom in" onClick={() => changeZoom('in')}
            disabled={zoom === 4} className="rounded-md p-2 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <ZoomIn className="h-4 w-4" />
          </button>
          <button type="button" aria-label="Reset image view" title="Reset view" onClick={resetView}
            className="rounded-md p-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">
            <Scan className="h-4 w-4" />
          </button>
        </div>
      </div>

      {metadata && <p className="text-[11px] text-muted-foreground" aria-label="Provided execution metadata">{metadata}</p>}
      <div
        data-testid="quality-compare-viewport"
        role="region" tabIndex={0} aria-label="Before and after image inspection. Drag to pan when zoomed. Use arrow keys to pan."
        className={`relative isolate w-full h-[min(65vw,420px)] min-h-[260px] max-h-[520px] rounded-xl overflow-hidden bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${zoom > 1 ? 'touch-none cursor-grab' : 'touch-pan-y'}`}
        onPointerDown={pointerDown} onPointerMove={pointerMove}
        onPointerUp={pointerUp} onPointerCancel={pointerCancel}
        onKeyDown={handleKeys}
      >
        {beforeUrl && <img src={beforeUrl} alt="" draggable={false}
          onLoad={(event) => setBeforeSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
          onError={() => { setBeforeSize(null); setImageErrors((s) => ({ ...s, before: true })); }}
          className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          style={transform} />}
        {afterUrl && <div aria-hidden="true" className="absolute inset-0 pointer-events-none" style={{ clipPath: `inset(0 0 0 ${afterClipLeft}%)` }}>
          <img src={afterUrl} alt="" draggable={false}
            onLoad={(event) => setAfterSize({ width: event.currentTarget.naturalWidth, height: event.currentTarget.naturalHeight })}
            onError={() => { setAfterSize(null); setImageErrors((s) => ({ ...s, after: true })); }}
            className="absolute inset-0 w-full h-full object-contain" style={transform} />
        </div>}
        {mode === 'split' && sameGeometry && <>
          <div aria-hidden="true" className="absolute inset-y-0 w-[2px] bg-white shadow-md pointer-events-none"
            style={{ left: `${split}%` }} />
          <span aria-hidden="true" className="absolute top-2 left-2 rounded bg-black/70 px-2 py-1 text-xs text-white">Before</span>
          <span aria-hidden="true" className="absolute top-2 right-2 rounded bg-black/70 px-2 py-1 text-xs text-white">After</span>
        </>}
        {(imageErrors.before || imageErrors.after || !beforeUrl || !afterUrl) && (
          <p role="alert" className="absolute inset-x-3 bottom-3 rounded bg-destructive/95 p-2 text-sm text-destructive-foreground">
            Preview image unavailable. The source or result could not be loaded.
          </p>
        )}
      </div>

      {mode === 'split' && sameGeometry && (
        <label className="block text-xs text-muted-foreground" htmlFor="result-compare-split">
          Comparison position: {split}% from left
          <input id="result-compare-split" type="range" aria-label="Comparison split position"
            className="block w-full mt-2 accent-primary" min="0" max="100" step="1"
            value={split} onChange={(event) => setSplit(clampComparisonSplit(Number(event.target.value)))} />
        </label>
      )}
      {!sameGeometry && beforeSize && afterSize && (
        <p role="status" className="text-xs text-muted-foreground">
          Split view requires identical image dimensions. Use Before / After for this result.
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {zoom}× relative to fitted preview (not actual-size pixels). Viewing does not change the Project or image bytes.
      </p>
      <div className="flex gap-2">
        <Button onClick={onAccept} disabled={busy} className="flex-1">
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
