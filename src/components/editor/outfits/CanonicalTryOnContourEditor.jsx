import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Loader2, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  MANUAL_PARAMETRIC_MAX_POINTS,
  manualAcquisitionErrorMessage,
} from '@/application/fashion/canonicalTryOnManualAcquisition';
import {
  normalizeManualContourEditorSource,
  validateManualContourDraft,
} from '@/application/fashion/canonicalTryOnManualContourDraft';

function explicitCoordinate(raw) {
  if (typeof raw !== 'string' || raw.trim() === '') return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 && value <= 1 ? value : null;
}

function movePoint(points, from, to) {
  if (to < 0 || to >= points.length || from === to) return points;
  const next = points.map((point) => [...point]);
  const [point] = next.splice(from, 1);
  next.splice(to, 0, point);
  return next;
}

export default function CanonicalTryOnContourEditor({
  source,
  onSave,
  onSaved,
  onReloadRequired,
  onCancel,
  disabled = false,
}) {
  const sourceState = useMemo(() => {
    try {
      return Object.freeze({ source: normalizeManualContourEditorSource(source), error: '' });
    } catch {
      return Object.freeze({ source: null, error: 'The canonical garment image is unavailable for contour editing.' });
    }
  }, [source]);
  const safeSource = sourceState.source;
  const sourceKey = safeSource
    ? `${safeSource.garmentId}:${safeSource.expectedRevision}:${safeSource.imageUrl}:${safeSource.imageExpiresAt}`
    : 'unavailable';

  const imageRef = useRef(null);
  const [points, setPoints] = useState([]);
  const [draftX, setDraftX] = useState('');
  const [draftY, setDraftY] = useState('');
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  useEffect(() => {
    setPoints([]);
    setDraftX('');
    setDraftY('');
    setBusy(false);
    setLocked(false);
    setError('');
    setStatus('');
  }, [sourceKey]);

  const feedback = useMemo(() => validateManualContourDraft(points), [points]);
  const blocked = disabled || busy || locked || !safeSource;

  const appendPoint = (point) => {
    if (blocked) return;
    if (points.length >= MANUAL_PARAMETRIC_MAX_POINTS) {
      setError(`Use at most ${MANUAL_PARAMETRIC_MAX_POINTS} explicit outline points.`);
      return;
    }
    setError('');
    setStatus('');
    setPoints((current) => (
      current.length >= MANUAL_PARAMETRIC_MAX_POINTS
        ? current
        : [...current, point]
    ));
  };

  const addTypedPoint = () => {
    const x = explicitCoordinate(draftX);
    const y = explicitCoordinate(draftY);
    if (x === null || y === null) {
      setError('Enter explicit X and Y coordinates from 0 to 1.');
      return;
    }
    appendPoint([x, y]);
    setDraftX('');
    setDraftY('');
  };

  const addCanvasPoint = (event) => {
    if (blocked) return;
    const rect = imageRef.current?.getBoundingClientRect();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return;
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1) return;
    appendPoint([x, y]);
  };

  const commitCoordinate = (index, axis, input) => {
    if (blocked) return;
    const currentValue = points[index]?.[axis];
    const value = explicitCoordinate(input.value);
    if (value === null) {
      input.value = Number.isFinite(currentValue) ? String(currentValue) : '';
      setError('Point coordinates must stay between 0 and 1.');
      return;
    }
    setError('');
    setStatus('');
    setPoints((current) => current.map((point, pointIndex) => (
      pointIndex === index
        ? axis === 0 ? [value, point[1]] : [point[0], value]
        : point
    )));
  };

  const removePoint = (index) => {
    if (blocked) return;
    setError('');
    setStatus('');
    setPoints((current) => current.filter((_, pointIndex) => pointIndex !== index));
  };

  const reorderPoint = (from, to) => {
    if (blocked) return;
    setError('');
    setStatus('');
    setPoints((current) => movePoint(current, from, to));
  };

  const clear = () => {
    if (blocked) return;
    setPoints([]);
    setError('');
    setStatus('');
  };

  const save = async () => {
    if (blocked || !feedback.canSave || typeof onSave !== 'function') return;
    setBusy(true);
    setError('');
    setStatus('');
    try {
      await onSave({
        garmentId: safeSource.garmentId,
        expectedRevision: safeSource.expectedRevision,
        points,
      });
      setLocked(true);
      setStatus('Contour saved. Recheck canonical Try-On readiness before another submission.');
      if (typeof onSaved === 'function') onSaved();
    } catch (cause) {
      if (cause?.code === 'TRYON_MANUAL_CONTOUR_SAVED_RELOAD_PENDING') {
        setLocked(true);
        setStatus(manualAcquisitionErrorMessage(cause));
        if (typeof onReloadRequired === 'function') onReloadRequired();
      } else {
        setError(manualAcquisitionErrorMessage(cause));
      }
    } finally {
      setBusy(false);
    }
  };

  if (!safeSource) {
    return (
      <section className="rounded-xl border border-border p-3" aria-label="Manual garment contour editor">
        <p className="text-xs text-destructive" role="alert">{sourceState.error}</p>
      </section>
    );
  }

  const polygon = points.map((point) => `${point[0] * 100},${point[1] * 100}`).join(' ');

  return (
    <section className="rounded-xl border border-border p-3 space-y-3" aria-label="Manual garment contour editor">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium">Garment outline</p>
          <p className="text-[11px] text-muted-foreground">
            Place only points you explicitly choose on the managed {safeSource.category} image. Core performs the final geometry validation.
          </p>
        </div>
        {typeof onCancel === 'function' && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy} aria-label="Close manual contour editor">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      <div
        className={`relative overflow-hidden rounded-lg border border-border bg-secondary/20 ${blocked ? 'cursor-not-allowed opacity-70' : 'cursor-crosshair'}`}
        onPointerDown={addCanvasPoint}
        aria-describedby="manual-contour-feedback"
      >
        <img
          ref={imageRef}
          src={safeSource.imageUrl}
          alt="Managed garment primary view for manual contour editing"
          className="block h-auto w-full select-none"
          draggable={false}
        />
        <svg className="pointer-events-none absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {points.length >= 3 && <polygon points={polygon} className="fill-primary/10 stroke-primary" vectorEffect="non-scaling-stroke" />}
          {points.length === 2 && <polyline points={polygon} className="fill-none stroke-primary" vectorEffect="non-scaling-stroke" />}
          {points.map((point, index) => (
            <circle key={`${index}:${point[0]}:${point[1]}`} cx={point[0] * 100} cy={point[1] * 100} r="1.2" className="fill-primary stroke-background" vectorEffect="non-scaling-stroke" />
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5" aria-label="Add contour point by coordinates">
        <Input
          type="number"
          min="0"
          max="1"
          step="any"
          inputMode="decimal"
          value={draftX}
          onChange={(event) => setDraftX(event.target.value)}
          placeholder="X 0…1"
          aria-label="New contour point x"
          disabled={blocked}
        />
        <Input
          type="number"
          min="0"
          max="1"
          step="any"
          inputMode="decimal"
          value={draftY}
          onChange={(event) => setDraftY(event.target.value)}
          placeholder="Y 0…1"
          aria-label="New contour point y"
          disabled={blocked}
        />
        <Button type="button" size="sm" onClick={addTypedPoint} disabled={blocked || points.length >= MANUAL_PARAMETRIC_MAX_POINTS}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add
        </Button>
      </div>

      {points.length > 0 && (
        <div className="space-y-1" aria-label="Contour point controls">
          {points.map((point, index) => (
            <div key={`control:${index}:${point[0]}:${point[1]}`} className="grid grid-cols-[auto_1fr_1fr_auto_auto_auto] items-center gap-1 rounded-lg bg-secondary/30 p-1.5">
              <span className="w-6 text-center text-[10px] text-muted-foreground">{index + 1}</span>
              <Input
                type="number"
                min="0"
                max="1"
                step="any"
                inputMode="decimal"
                defaultValue={point[0]}
                onBlur={(event) => commitCoordinate(index, 0, event.currentTarget)}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                aria-label={`Contour point ${index + 1} x`}
                disabled={blocked}
              />
              <Input
                type="number"
                min="0"
                max="1"
                step="any"
                inputMode="decimal"
                defaultValue={point[1]}
                onBlur={(event) => commitCoordinate(index, 1, event.currentTarget)}
                onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); }}
                aria-label={`Contour point ${index + 1} y`}
                disabled={blocked}
              />
              <button type="button" className="rounded-md p-1 disabled:opacity-40" onClick={() => reorderPoint(index, index - 1)} disabled={blocked || index === 0} aria-label={`Move contour point ${index + 1} earlier`}>
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded-md p-1 disabled:opacity-40" onClick={() => reorderPoint(index, index + 1)} disabled={blocked || index === points.length - 1} aria-label={`Move contour point ${index + 1} later`}>
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
              <button type="button" className="rounded-md p-1 text-destructive disabled:opacity-40" onClick={() => removePoint(index)} disabled={blocked} aria-label={`Remove contour point ${index + 1}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div id="manual-contour-feedback" className="space-y-1">
        <p className={`text-[11px] ${feedback.canSave ? 'text-muted-foreground' : 'text-amber-700 dark:text-amber-300'}`} role="status">
          {feedback.message} {points.length}/{MANUAL_PARAMETRIC_MAX_POINTS} points.
        </p>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        {status && <p className="text-xs text-muted-foreground" role="status">{status}</p>}
      </div>

      <div className="flex flex-wrap justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" onClick={clear} disabled={blocked || points.length === 0}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Clear
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={blocked || !feedback.canSave || typeof onSave !== 'function'}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
          Save contour
        </Button>
      </div>
    </section>
  );
}
