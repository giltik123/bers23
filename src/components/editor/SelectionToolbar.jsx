import React from 'react';
import { Loader2, Brush } from 'lucide-react';
import { Button } from '@/components/ui/button';

const modes = [['SMART_SELECT', 'Smart'], ['BRUSH_ADD', 'Add'], ['BRUSH_SUBTRACT', 'Remove'], ['POLYGON', 'Polygon'], ['LASSO', 'Lasso'], ['RECTANGLE', 'Rectangle'], ['ELLIPSE', 'Ellipse']];
const modeHints = Object.freeze({
  SMART_SELECT: 'Tap a subject to create a local AI mask.',
  BRUSH_ADD: 'Paint on the image to add pixels to the mask.',
  BRUSH_SUBTRACT: 'Paint on the image to remove pixels from the mask.',
  POLYGON: 'Click points around an area, then apply the polygon.',
  LASSO: 'Draw a freehand boundary, then apply the lasso.',
  RECTANGLE: 'Drag out a rectangle on the image.',
  ELLIPSE: 'Drag out an ellipse on the image.',
});
const overlayChoices = Object.freeze([
  { id: 'teal', label: 'Teal overlay', className: 'bg-emerald-500' },
  { id: 'magenta', label: 'Magenta overlay', className: 'bg-fuchsia-500' },
  { id: 'amber', label: 'Amber overlay', className: 'bg-amber-500' },
]);
export default function SelectionToolbar({ selection, brushSize, onBrushSize, brushHardness, onBrushHardness, brushOpacity = 100, onBrushOpacity = () => {},
  maskOverlayVisible = true, onMaskOverlayVisible = () => {}, maskOverlayColor = 'teal', onMaskOverlayColor = () => {},
  maskOverlayOpacity = 45, onMaskOverlayOpacity = () => {}, morphologyRadius, onMorphologyRadius, onGrow, onShrink, onOpen, onClose, onFeather, polygonComposition, onPolygonComposition, onApplyPolygon, onClearPolygon, onApplyShape, onClearShape, onNudgeShape, exposureEighthStops, onExposureEighthStops, canApplyExposure = false, applyingExposure = false, onApplyExposure, whiteBalanceTemperatureQ8, onWhiteBalanceTemperatureQ8, whiteBalanceTintQ8, onWhiteBalanceTintQ8, canApplyWhiteBalance = false, applyingWhiteBalance = false, onApplyWhiteBalance, levelsInputBlack, onLevelsInputBlack, levelsInputMidpoint, onLevelsInputMidpoint, levelsInputWhite, onLevelsInputWhite, levelsOutputBlack, onLevelsOutputBlack, levelsOutputWhite, onLevelsOutputWhite, canApplyLevels = false, applyingLevels = false, onApplyLevels, onMode, onUndo, onRedo, onClear, onInvert, onCancel, onDone, onStart, startDisabled = false, hasSelectedMask = false, canIsolateBackground = false, isolatingBackground = false, onIsolateBackground }) {
  const levelsIdentity = levelsInputBlack === 0 && levelsInputMidpoint === 128 && levelsInputWhite === 255 && levelsOutputBlack === 0 && levelsOutputWhite === 255;
  if (!selection) return (
    <section className="space-y-4" aria-label="Image selection and adjustments">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={startDisabled} onClick={onStart}>
          <Brush className="h-4 w-4" aria-hidden="true" /> Smart Select
        </Button>
        {hasSelectedMask && (
          <Button type="button" variant="outline" disabled={startDisabled || !canIsolateBackground || isolatingBackground} onClick={onIsolateBackground}>
            {isolatingBackground && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isolatingBackground ? 'Removing background…' : 'Remove background'}
          </Button>
        )}
      </div>

      {hasSelectedMask ? (
        <details className="rounded-2xl border border-border/70 bg-card p-3" open>
          <summary className="cursor-pointer select-none text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">Adjust selected area <span className="font-normal text-muted-foreground">· exposure, color, levels</span>
          </summary>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            These adjustments affect only your saved mask. Change a value, choose Preview, then Accept or Discard the result.
          </p>
          <div className="mt-4 space-y-4">

            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" role="group" aria-label="Exposure adjustments">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Exposure</h3>
                <Button type="button" size="sm" variant="ghost" disabled={startDisabled || applyingExposure || exposureEighthStops === 0} onClick={() => onExposureEighthStops(0)}>Reset</Button>
              </div>
              <label className="block space-y-2 text-xs">
                <span className="flex items-center justify-between"><span>Brightness · EV</span><strong className="tabular-nums">{formatExposure(exposureEighthStops)}</strong></span>
                <input
                  aria-label="Masked exposure"
                  aria-valuetext={formatExposure(exposureEighthStops)}
                  className="w-full accent-primary"
                  type="range"
                  min="-32"
                  max="32"
                  step="1"
                  value={exposureEighthStops}
                  disabled={startDisabled || !canApplyExposure || applyingExposure}
                  onChange={(event) => onExposureEighthStops(Number(event.target.value))}
                />
                <span className="flex justify-between text-[10px] text-muted-foreground"><span>−4 EV</span><span>0</span><span>+4 EV</span></span>
              </label>
              <Button type="button" className="w-full" variant="outline" aria-label="Preview masked exposure" disabled={startDisabled || !canApplyExposure || applyingExposure || exposureEighthStops === 0} onClick={onApplyExposure}>
                {applyingExposure && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {applyingExposure ? 'Applying exposure…' : 'Preview exposure'}
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" role="group" aria-label="White balance adjustments">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">White balance</h3>
                <Button type="button" size="sm" variant="ghost" disabled={startDisabled || applyingWhiteBalance || (whiteBalanceTemperatureQ8 === 0 && whiteBalanceTintQ8 === 0)} onClick={() => { onWhiteBalanceTemperatureQ8(0); onWhiteBalanceTintQ8(0); }}>Reset</Button>
              </div>
              <label className="block space-y-2 text-xs">
                <span className="flex justify-between"><span>Temperature · cool ↔ warm</span><strong className="tabular-nums">{formatWhiteBalanceQ8(whiteBalanceTemperatureQ8)}</strong></span>
                <input
                  aria-label="Masked white balance temperature"
                  aria-valuetext={formatWhiteBalanceQ8(whiteBalanceTemperatureQ8)}
                  type="range"
                  className="w-full accent-primary"
                  min="-128"
                  max="128"
                  step="1"
                  value={whiteBalanceTemperatureQ8}
                  disabled={startDisabled || !canApplyWhiteBalance || applyingWhiteBalance}
                  onChange={(event) => onWhiteBalanceTemperatureQ8(Number(event.target.value))}
                />
                <span className="flex justify-between text-[10px] text-muted-foreground"><span>Cool</span><span>Neutral</span><span>Warm</span></span>
              </label>
              <label className="block space-y-2 text-xs">
                <span className="flex justify-between"><span>Tint · green ↔ magenta</span><strong className="tabular-nums">{formatWhiteBalanceQ8(whiteBalanceTintQ8)}</strong></span>
                <input
                  aria-label="Masked white balance tint"
                  aria-valuetext={formatWhiteBalanceQ8(whiteBalanceTintQ8)}
                  type="range"
                  className="w-full accent-primary"
                  min="-64"
                  max="64"
                  step="1"
                  value={whiteBalanceTintQ8}
                  disabled={startDisabled || !canApplyWhiteBalance || applyingWhiteBalance}
                  onChange={(event) => onWhiteBalanceTintQ8(Number(event.target.value))}
                />
              </label>
              <Button type="button" className="w-full" variant="outline" aria-label="Preview masked white balance" disabled={startDisabled || !canApplyWhiteBalance || applyingWhiteBalance || (whiteBalanceTemperatureQ8 === 0 && whiteBalanceTintQ8 === 0)} onClick={onApplyWhiteBalance}>
                {applyingWhiteBalance && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {applyingWhiteBalance ? 'Applying white balance…' : 'Preview white balance'}
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" role="group" aria-label="Levels adjustments">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Levels · tonal range</h3>
                <Button type="button" size="sm" variant="ghost" disabled={startDisabled || applyingLevels || levelsIdentity} onClick={() => { onLevelsInputBlack(0); onLevelsInputMidpoint(128); onLevelsInputWhite(255); onLevelsOutputBlack(0); onLevelsOutputWhite(255); }}>Reset</Button>
              </div>
              <p className="text-xs text-muted-foreground">Adjust black point, midtone and white point; then set output limits. Values use exact 8-bit steps.</p>
              <fieldset className="space-y-3" disabled={startDisabled || applyingLevels}>
                <legend className="sr-only">Masked Levels</legend>
                <span aria-hidden="true" className="sr-only">Levels</span>

                <div className="space-y-1">
                  <label className="flex items-center justify-between gap-2 text-xs" htmlFor="levels-input-black">Input black</label>
                  <div className="flex items-center gap-2">
                    <input aria-label="Masked Levels input black slider" type="range" className="min-w-0 flex-1 accent-primary" min="0" max={Math.max(0, levelsInputMidpoint - 1)} step="1" value={levelsInputBlack} onChange={(event) => onLevelsInputBlack(Number(event.target.value))} />
                    <input id="levels-input-black" aria-label="Masked Levels input black" type="number" min="0" max={Math.max(0, levelsInputMidpoint - 1)} step="1" value={levelsInputBlack} onChange={(event) => onLevelsInputBlack(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" htmlFor="levels-input-mid">Input midtones</label>
                  <div className="flex items-center gap-2">
                    <input aria-label="Masked Levels input midpoint slider" type="range" className="min-w-0 flex-1 accent-primary" min={Math.min(254, levelsInputBlack + 1)} max={Math.max(1, levelsInputWhite - 1)} step="1" value={levelsInputMidpoint} onChange={(event) => onLevelsInputMidpoint(Number(event.target.value))} />
                    <input id="levels-input-mid" aria-label="Masked Levels input midpoint" type="number" min={Math.min(254, levelsInputBlack + 1)} max={Math.max(1, levelsInputWhite - 1)} step="1" value={levelsInputMidpoint} onChange={(event) => onLevelsInputMidpoint(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" htmlFor="levels-input-white">Input white</label>
                  <div className="flex items-center gap-2">
                    <input aria-label="Masked Levels input white slider" type="range" className="min-w-0 flex-1 accent-primary" min={Math.min(255, levelsInputMidpoint + 1)} max="255" step="1" value={levelsInputWhite} onChange={(event) => onLevelsInputWhite(Number(event.target.value))} />
                    <input id="levels-input-white" aria-label="Masked Levels input white" type="number" min={Math.min(255, levelsInputMidpoint + 1)} max="255" step="1" value={levelsInputWhite} onChange={(event) => onLevelsInputWhite(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1 border-t border-border/70 pt-3">
                  <label className="text-xs" htmlFor="levels-output-black">Output black</label>
                  <div className="flex items-center gap-2">
                    <input aria-label="Masked Levels output black slider" type="range" className="min-w-0 flex-1 accent-primary" min="0" max={Math.max(0, levelsOutputWhite - 1)} step="1" value={levelsOutputBlack} onChange={(event) => onLevelsOutputBlack(Number(event.target.value))} />
                    <input id="levels-output-black" aria-label="Masked Levels output black" type="number" min="0" max={Math.max(0, levelsOutputWhite - 1)} step="1" value={levelsOutputBlack} onChange={(event) => onLevelsOutputBlack(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" htmlFor="levels-output-white">Output white</label>
                  <div className="flex items-center gap-2">
                    <input aria-label="Masked Levels output white slider" type="range" className="min-w-0 flex-1 accent-primary" min={Math.min(255, levelsOutputBlack + 1)} max="255" step="1" value={levelsOutputWhite} onChange={(event) => onLevelsOutputWhite(Number(event.target.value))} />
                    <input id="levels-output-white" aria-label="Masked Levels output white" type="number" min={Math.min(255, levelsOutputBlack + 1)} max="255" step="1" value={levelsOutputWhite} onChange={(event) => onLevelsOutputWhite(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
              </fieldset>
              <Button type="button" className="w-full" variant="outline" aria-label="Preview masked Levels" disabled={startDisabled || !canApplyLevels || applyingLevels || levelsIdentity} onClick={onApplyLevels}>
                {applyingLevels && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {applyingLevels ? 'Applying Levels…' : 'Preview Levels'}
              </Button>
            </div>
          </div>
        </details>
      ) : (
        <p className="rounded-xl bg-muted px-3 py-3 text-xs leading-5 text-muted-foreground">To adjust part of the image, use Smart Select, mark an area, then select Done. Advanced sliders appear only when a saved mask exists.</p>
      )}
    </section>
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
      <header className="space-y-1">
        <h3 className="text-base font-semibold">Select &amp; Mask</h3>
        <p className="text-xs leading-5 text-muted-foreground">Paint, draw a shape, or tap Smart. Add and Remove refine the same mask without changing your image.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {modes.map(([id, label]) => <Button key={id} type="button" size="sm" aria-pressed={selection.mode === id} title={modeHints[id]} variant={selection.mode === id ? 'default' : 'outline'} disabled={busy} onClick={() => onMode(id)}>{label}</Button>)}
        {(selection.mode === 'BRUSH_ADD' || selection.mode === 'BRUSH_SUBTRACT') && <>
        <label className="flex items-center gap-2 px-2 text-xs">Brush radius
          <input aria-label="Brush Size" aria-valuetext={`${brushSize} pixels`} type="range" min="2" max="96" value={brushSize} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushSize(Number(event.target.value))} />
          <span aria-hidden="true">{brushSize}px</span>
        </label>
        <label className="flex items-center gap-2 px-2 text-xs">Hardness
          <input aria-label="Brush Hardness" aria-valuetext={`${brushHardness} percent`} type="range" min="0" max="100" value={brushHardness} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushHardness(Number(event.target.value))} />
          <span aria-hidden="true">{brushHardness}%</span>
        </label>
        <label className="flex items-center gap-2 px-2 text-xs">Opacity
          <input aria-label="Brush Opacity" aria-valuetext={`${brushOpacity} percent`} type="range" min="0" max="100" step="1" value={brushOpacity} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushOpacity(Number(event.target.value))} />
          <span aria-hidden="true">{brushOpacity}%</span>
        </label>
        </>}
      </div>
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">{modeHints[selection.mode]} {selection.quality ? `Mask coverage: ${(selection.quality.coverage * 100).toFixed(1)}%.` : 'No mask area committed yet.'}</p>

      <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" aria-label="Mask overlay controls">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">Mask overlay</h4>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" aria-label="Show mask overlay" checked={maskOverlayVisible} onChange={(event) => onMaskOverlayVisible(event.target.checked)} className="h-4 w-4 accent-primary" />
            Show
          </label>
        </div>
        <label className="block space-y-1 text-xs">
          <span className="flex justify-between text-muted-foreground"><span>Overlay opacity · view only</span><strong className="tabular-nums">{maskOverlayOpacity}%</strong></span>
          <input type="range" aria-label="Mask overlay opacity" min="0" max="100" step="1" value={maskOverlayOpacity} onChange={(event) => onMaskOverlayOpacity(Number(event.target.value))} disabled={!maskOverlayVisible} className="w-full accent-primary" />
        </label>
        <div className="flex items-center gap-2" role="group" aria-label="Mask overlay color">
          <span className="mr-1 text-xs text-muted-foreground">Color</span>
          {overlayChoices.map((choice) => (
            <button key={choice.id} type="button" aria-label={choice.label} aria-pressed={maskOverlayColor === choice.id} disabled={!maskOverlayVisible} onClick={() => onMaskOverlayColor(choice.id)} className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-transform disabled:opacity-50 ${maskOverlayColor === choice.id ? 'border-primary scale-105' : 'border-border'}`}>
              <span className={`h-5 w-5 rounded-full ${choice.className}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">Only the display color changes. Saved mask alpha and editing strength stay untouched.</p>
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
      <details className="rounded-lg border border-border/60 p-2">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">Refine selection edges</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-2 text-xs">Edge Radius
          <input aria-label="Selection edge radius" type="range" min="1" max="32" value={morphologyRadius} disabled={busy || !editable} onChange={(event) => onMorphologyRadius(Number(event.target.value))} />
          <span aria-hidden="true">{morphologyRadius}px</span>
        </label>
        <Button type="button" size="sm" variant="outline" aria-label="Grow selection" disabled={busy || !editable} onClick={onGrow}>Grow</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Shrink selection" disabled={busy || !editable} onClick={onShrink}>Shrink</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Open selection" disabled={busy || !editable} onClick={onOpen}>Open</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Close selection" disabled={busy || !editable} onClick={onClose}>Close</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Feather selection" disabled={busy || !editable} onClick={onFeather}>Feather</Button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" aria-label="Undo selection edit" aria-keyshortcuts="Control+Z Meta+Z" disabled={busy || !selection.canUndo} onClick={onUndo}>Undo</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Redo selection edit" aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={busy || !selection.canRedo} onClick={onRedo}>Redo</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClear}>Clear</Button>
        <Button type="button" size="sm" variant="outline" aria-label="Invert selection" disabled={!editable} onClick={onInvert}>Invert</Button>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" size="sm" disabled={!canDone} onClick={onDone} title="Save the selected pixels as a canonical mask, then return to photo editing">Done</Button>
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
