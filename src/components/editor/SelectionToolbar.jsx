import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const modes = [['SMART_SELECT', 'Smart'], ['BRUSH_ADD', 'Add'], ['BRUSH_SUBTRACT', 'Remove'], ['POLYGON', 'Polygon'], ['LASSO', 'Lasso'], ['RECTANGLE', 'Rectangle'], ['ELLIPSE', 'Ellipse']];
export default function SelectionToolbar({ selection, brushSize, onBrushSize, brushHardness, onBrushHardness, morphologyRadius, onMorphologyRadius, onGrow, onShrink, onOpen, onClose, onFeather, polygonComposition, onPolygonComposition, onApplyPolygon, onClearPolygon, onApplyShape, onClearShape, onNudgeShape, exposureEighthStops, onExposureEighthStops, canApplyExposure = false, applyingExposure = false, onApplyExposure, whiteBalanceTemperatureQ8, onWhiteBalanceTemperatureQ8, whiteBalanceTintQ8, onWhiteBalanceTintQ8, canApplyWhiteBalance = false, applyingWhiteBalance = false, onApplyWhiteBalance, levelsInputBlack, onLevelsInputBlack, levelsInputMidpoint, onLevelsInputMidpoint, levelsInputWhite, onLevelsInputWhite, levelsOutputBlack, onLevelsOutputBlack, levelsOutputWhite, onLevelsOutputWhite, canApplyLevels = false, applyingLevels = false, onApplyLevels, onMode, onUndo, onRedo, onClear, onInvert, onCancel, onDone, onStart, startDisabled = false, canIsolateBackground = false, isolatingBackground = false, onIsolateBackground }) {
  const levelsIdentity = levelsInputBlack === 0 && levelsInputMidpoint === 128 && levelsInputWhite === 255 && levelsOutputBlack === 0 && levelsOutputWhite === 255;
  if (!selection) return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" disabled={startDisabled} onClick={onStart}>Smart Select</Button>
      <Button type="button" variant="outline" disabled={startDisabled || !canIsolateBackground || isolatingBackground} onClick={onIsolateBackground}>
        {isolatingBackground && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {isolatingBackground ? 'Removing background…' : 'Remove background'}
      </Button>
      <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
        Exposure
        <input
          aria-label="Masked exposure"
          aria-valuetext={formatExposure(exposureEighthStops)}
          type="range"
          min="-32"
          max="32"
          step="1"
          value={exposureEighthStops}
          disabled={startDisabled || !canApplyExposure || applyingExposure}
          onChange={(event) => onExposureEighthStops(Number(event.target.value))}
        />
        <span aria-live="polite">{formatExposure(exposureEighthStops)}</span>
      </label>
      <Button type="button" variant="outline" aria-label="Preview masked exposure" disabled={startDisabled || !canApplyExposure || applyingExposure || exposureEighthStops === 0} onClick={onApplyExposure}>
        {applyingExposure && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {applyingExposure ? 'Applying exposure…' : 'Preview exposure'}
      </Button>
      <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
        Temperature
        <input
          aria-label="Masked white balance temperature"
          aria-valuetext={formatWhiteBalanceQ8(whiteBalanceTemperatureQ8)}
          type="range"
          min="-128"
          max="128"
          step="1"
          value={whiteBalanceTemperatureQ8}
          disabled={startDisabled || !canApplyWhiteBalance || applyingWhiteBalance}
          onChange={(event) => onWhiteBalanceTemperatureQ8(Number(event.target.value))}
        />
        <span aria-live="polite">{formatWhiteBalanceQ8(whiteBalanceTemperatureQ8)}</span>
      </label>
      <label className="flex items-center gap-2 rounded-md border px-2 py-1 text-xs">
        Tint
        <input
          aria-label="Masked white balance tint"
          aria-valuetext={formatWhiteBalanceQ8(whiteBalanceTintQ8)}
          type="range"
          min="-64"
          max="64"
          step="1"
          value={whiteBalanceTintQ8}
          disabled={startDisabled || !canApplyWhiteBalance || applyingWhiteBalance}
          onChange={(event) => onWhiteBalanceTintQ8(Number(event.target.value))}
        />
        <span aria-live="polite">{formatWhiteBalanceQ8(whiteBalanceTintQ8)}</span>
      </label>
      <Button type="button" variant="outline" aria-label="Preview masked white balance" disabled={startDisabled || !canApplyWhiteBalance || applyingWhiteBalance || (whiteBalanceTemperatureQ8 === 0 && whiteBalanceTintQ8 === 0)} onClick={onApplyWhiteBalance}>
        {applyingWhiteBalance && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {applyingWhiteBalance ? 'Applying white balance…' : 'Preview white balance'}
      </Button>
      <fieldset className="flex flex-wrap items-center gap-2 rounded-md border px-2 py-1 text-xs" disabled={startDisabled || applyingLevels}>
        <legend className="sr-only">Masked Levels</legend>
        <span aria-hidden="true">Levels</span>
        <label className="flex items-center gap-1">
          <span>Black</span>
          <input aria-label="Masked Levels input black" type="number" min="0" max={Math.max(0, levelsInputMidpoint - 1)} step="1" value={levelsInputBlack} onChange={(event) => onLevelsInputBlack(Number(event.target.value))} className="w-14 rounded border bg-background px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          <span>Mid</span>
          <input aria-label="Masked Levels input midpoint" type="number" min={Math.min(254, levelsInputBlack + 1)} max={Math.max(1, levelsInputWhite - 1)} step="1" value={levelsInputMidpoint} onChange={(event) => onLevelsInputMidpoint(Number(event.target.value))} className="w-14 rounded border bg-background px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          <span>White</span>
          <input aria-label="Masked Levels input white" type="number" min={Math.min(255, levelsInputMidpoint + 1)} max="255" step="1" value={levelsInputWhite} onChange={(event) => onLevelsInputWhite(Number(event.target.value))} className="w-14 rounded border bg-background px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          <span>Out black</span>
          <input aria-label="Masked Levels output black" type="number" min="0" max={Math.max(0, levelsOutputWhite - 1)} step="1" value={levelsOutputBlack} onChange={(event) => onLevelsOutputBlack(Number(event.target.value))} className="w-14 rounded border bg-background px-1 py-0.5" />
        </label>
        <label className="flex items-center gap-1">
          <span>Out white</span>
          <input aria-label="Masked Levels output white" type="number" min={Math.min(255, levelsOutputBlack + 1)} max="255" step="1" value={levelsOutputWhite} onChange={(event) => onLevelsOutputWhite(Number(event.target.value))} className="w-14 rounded border bg-background px-1 py-0.5" />
        </label>
      </fieldset>
      <Button type="button" variant="outline" aria-label="Preview masked Levels" disabled={startDisabled || !canApplyLevels || applyingLevels || levelsIdentity} onClick={onApplyLevels}>
        {applyingLevels && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        {applyingLevels ? 'Applying Levels…' : 'Preview Levels'}
      </Button>
    </div>
  );
  const busy = selection.state === 'DOWNLOADING' || selection.state === 'LOADING' || selection.state === 'SELECTING';
  const editable = selection.state === 'SELECTED' || selection.state === 'REFINING';
  const canDone = editable && !selection.quality?.empty;
  const shapeReady = (selection.mode === 'RECTANGLE' || selection.mode === 'ELLIPSE') && selection.shapeVertices.length === 2;
  const shapeKeyDown = (event) => {
    if (!shapeReady || busy) return;
    const step = event.shiftKey ? 10 : 1;
    const movement = event.key === 'ArrowLeft' ? [-step, 0]
      : event.key === 'ArrowRight' ? [step, 0]
      : event.key === 'ArrowUp' ? [0, -step]
      : event.key === 'ArrowDown' ? [0, step]
      : null;
    if (!movement) return;
    event.preventDefault();
    onNudgeShape(movement[0], movement[1]);
  };
  return (
    <section className="rounded-xl border bg-card p-3 space-y-3" aria-label="Selection tools">
      <div className="flex flex-wrap gap-2">
        {modes.map(([id, label]) => <Button key={id} type="button" size="sm" aria-pressed={selection.mode === id} variant={selection.mode === id ? 'default' : 'outline'} disabled={busy} onClick={() => onMode(id)}>{label}</Button>)}
        <label className="flex items-center gap-2 px-2 text-xs">Brush Size
          <input aria-label="Brush Size" aria-valuetext={`${brushSize} pixels`} type="range" min="2" max="96" value={brushSize} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushSize(Number(event.target.value))} />
          <span aria-hidden="true">{brushSize}px</span>
        </label>
        <label className="flex items-center gap-2 px-2 text-xs">Hardness
          <input aria-label="Brush Hardness" aria-valuetext={`${brushHardness} percent`} type="range" min="0" max="100" value={brushHardness} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushHardness(Number(event.target.value))} />
          <span aria-hidden="true">{brushHardness}%</span>
        </label>
      </div>
      {selection.mode === 'POLYGON' && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Polygon selection controls">
          <label className="flex items-center gap-2 text-xs">Composition
            <select aria-label="Polygon composition" value={polygonComposition} disabled={busy} onChange={(event) => onPolygonComposition(event.target.value)} className="rounded-md border bg-background px-2 py-1">
              <option value="REPLACE">Replace</option>
              <option value="ADD">Add</option>
              <option value="SUBTRACT">Subtract</option>
              <option value="INTERSECT">Intersect</option>
            </select>
          </label>
          <span className="text-xs text-muted-foreground" role="status">{selection.polygonVertices.length} vertices</span>
          <Button type="button" size="sm" variant="outline" aria-label="Apply polygon selection" disabled={busy || selection.polygonVertices.length < 3} onClick={onApplyPolygon}>Apply Polygon</Button>
          <Button type="button" size="sm" variant="ghost" aria-label="Clear polygon vertices" disabled={busy || selection.polygonVertices.length === 0} onClick={onClearPolygon}>Clear Points</Button>
        </div>
      )}
      {selection.mode === 'LASSO' && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Lasso selection controls">
          <label className="flex items-center gap-2 text-xs">Composition
            <select aria-label="Lasso composition" value={polygonComposition} disabled={busy} onChange={(event) => onPolygonComposition(event.target.value)} className="rounded-md border bg-background px-2 py-1">
              <option value="REPLACE">Replace</option>
              <option value="ADD">Add</option>
              <option value="SUBTRACT">Subtract</option>
              <option value="INTERSECT">Intersect</option>
            </select>
          </label>
          <span className="text-xs text-muted-foreground" role="status">{selection.polygonVertices.length} sampled points</span>
          <Button type="button" size="sm" variant="outline" aria-label="Apply lasso selection" disabled={busy || selection.polygonVertices.length < 3} onClick={onApplyPolygon}>Apply Lasso</Button>
          <Button type="button" size="sm" variant="ghost" aria-label="Clear lasso points" disabled={busy || selection.polygonVertices.length === 0} onClick={onClearPolygon}>Clear Points</Button>
        </div>
      )}
      {(selection.mode === 'RECTANGLE' || selection.mode === 'ELLIPSE') && (
        <div className="flex flex-wrap items-center gap-2" aria-label="Shape selection controls">
          <label className="flex items-center gap-2 text-xs">Composition
            <select aria-label="Shape composition" value={polygonComposition} disabled={busy} onChange={(event) => onPolygonComposition(event.target.value)} className="rounded-md border bg-background px-2 py-1">
              <option value="REPLACE">Replace</option>
              <option value="ADD">Add</option>
              <option value="SUBTRACT">Subtract</option>
              <option value="INTERSECT">Intersect</option>
            </select>
          </label>
          <span className="text-xs text-muted-foreground" role="status">{selection.shapeVertices.length === 2 ? 'Drag ready' : 'Drag on image'}</span>
          <div
            role="group"
            aria-label="Shape keyboard nudging"
            aria-disabled={!shapeReady || busy}
            tabIndex={shapeReady && !busy ? 0 : -1}
            onKeyDown={shapeKeyDown}
            className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            Arrow keys move 1px · Shift+Arrow 10px
          </div>
          <Button type="button" size="sm" variant="outline" aria-label={`Apply ${selection.mode.toLowerCase()} selection`} disabled={busy || selection.shapeVertices.length !== 2} onClick={onApplyShape}>Apply {selection.mode === 'RECTANGLE' ? 'Rectangle' : 'Ellipse'}</Button>
          <Button type="button" size="sm" variant="ghost" aria-label="Clear shape anchors" disabled={busy || selection.shapeVertices.length === 0} onClick={onClearShape}>Clear Shape</Button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-2 text-xs">Edge Radius
          <input aria-label="Selection edge radius" type="range" min="1" max="32" value={morphologyRadius} disabled={busy || !editable} onChange={(event) => onMorphologyRadius(Number(event.target.value))} />
          <span aria-hidden="true">{morphologyRadius}px</span>
        </label>
        <Button type="button" size="sm" variant="outline" aria-label="Grow selection" disabled={busy || !editable} onClick={onGrow}>Grow</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Shrink selection" disabled={busy || !editable} onClick={onShrink}>Shrink</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Open selection" disabled={busy || !editable} onClick={onOpen}>Open</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Close selection" disabled={busy || !editable} onClick={onClose}>Close</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Feather selection" disabled={busy || !editable} onClick={onFeather}>Feather</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Undo selection edit" aria-keyshortcuts="Control+Z Meta+Z" disabled={busy || !selection.canUndo} onClick={onUndo}>Undo</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Redo selection edit" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={busy || !selection.canRedo} onClick={onRedo}>Redo</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClear}>Clear</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Invert selection" disabled={!editable} onClick={onInvert}>Invert</Button>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={!canDone} onClick={onDone}>Done</Button>
      </div>
      {selection.state === 'SELECTING' && <p className="text-xs text-muted-foreground" role="status">Preparing Smart Selection…</p>}
      {selection.warning && <p className="text-xs text-amber-600" role="status">{selection.warning}</p>}
      {selection.quality?.warning === 'EMPTY' && <p className="text-xs text-amber-600" role="status">Selection is empty. Add pixels before Done.</p>}
      {selection.quality?.warning === 'TINY' && <p className="text-xs text-amber-600" role="status">Selection is extremely small. Zoom in and verify the mask before Done.</p>}
      {selection.quality?.warning === 'SUSPICIOUSLY_FULL' && <p className="text-xs text-amber-600" role="status">Selection covers almost the entire image. Verify the mask before Done.</p>}
    </section>
  );
}

function formatWhiteBalanceQ8(value) {
  return `${value > 0 ? '+' : ''}${value} Q8`;
}
function formatExposure(eighthStops) {
  const ev = eighthStops / 8;
  return `${ev > 0 ? '+' : ''}${Number.isInteger(ev) ? ev.toFixed(0) : ev.toFixed(3).replace(/0+$/, '').replace(/\.$/, '')} EV`;
}
