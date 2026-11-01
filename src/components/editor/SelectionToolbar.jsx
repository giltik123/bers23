import React from 'react';
import { Loader2, Brush } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const modeKeys = Object.freeze([
  ['SMART_SELECT', 'smartMode'], ['BRUSH_ADD', 'addMode'], ['BRUSH_SUBTRACT', 'removeMode'],
  ['POLYGON', 'polygonMode'], ['LASSO', 'lassoMode'], ['RECTANGLE', 'rectangleMode'], ['ELLIPSE', 'ellipseMode'],
]);
const modeHintKeys = Object.freeze({
  SMART_SELECT: 'smartHint', BRUSH_ADD: 'addHint', BRUSH_SUBTRACT: 'removeHint',
  POLYGON: 'polygonHint', LASSO: 'lassoHint', RECTANGLE: 'rectangleHint', ELLIPSE: 'ellipseHint',
});
const overlayChoices = Object.freeze([
  { id: 'teal', labelKey: 'tealOverlay', className: 'bg-emerald-500' },
  { id: 'magenta', labelKey: 'magentaOverlay', className: 'bg-fuchsia-500' },
  { id: 'amber', labelKey: 'amberOverlay', className: 'bg-amber-500' },
]);
export default function SelectionToolbar({ selection, brushSize, onBrushSize, brushHardness, onBrushHardness, brushOpacity = 100, onBrushOpacity = () => {},
  maskOverlayVisible = true, onMaskOverlayVisible = () => {}, maskOverlayColor = 'teal', onMaskOverlayColor = () => {},
  maskOverlayOpacity = 45, onMaskOverlayOpacity = () => {}, morphologyRadius, onMorphologyRadius, onGrow, onShrink, onOpen, onClose, onFeather, polygonComposition, onPolygonComposition, onApplyPolygon, onClearPolygon, onApplyShape, onClearShape, onNudgeShape, exposureEighthStops, onExposureEighthStops, canApplyExposure = false, applyingExposure = false, onApplyExposure, whiteBalanceTemperatureQ8, onWhiteBalanceTemperatureQ8, whiteBalanceTintQ8, onWhiteBalanceTintQ8, canApplyWhiteBalance = false, applyingWhiteBalance = false, onApplyWhiteBalance, levelsInputBlack, onLevelsInputBlack, levelsInputMidpoint, onLevelsInputMidpoint, levelsInputWhite, onLevelsInputWhite, levelsOutputBlack, onLevelsOutputBlack, levelsOutputWhite, onLevelsOutputWhite, canApplyLevels = false, applyingLevels = false, onApplyLevels, onMode, onUndo, onRedo, onClear, onInvert, onCancel, onDone, onStart, startDisabled = false, hasSelectedMask = false, canIsolateBackground = false, isolatingBackground = false, onIsolateBackground }) {
  const { t } = useTranslation();
  const modes = modeKeys.map(([id, key]) => [id, t('selectionUi.' + key)]);
  const modeHints = Object.fromEntries(Object.entries(modeHintKeys).map(([id, key]) => [id, t('selectionUi.' + key)]));
  const levelsIdentity = levelsInputBlack === 0 && levelsInputMidpoint === 128 && levelsInputWhite === 255 && levelsOutputBlack === 0 && levelsOutputWhite === 255;
  if (!selection) return (
    <section className="space-y-4" aria-label={t('selectionUi.imageSelectionAndAdjustments')}>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" disabled={startDisabled} onClick={onStart}>
          <Brush className="h-4 w-4" aria-hidden="true" /> {t('selectionUi.smartSelect')}
        </Button>
        {hasSelectedMask && (
          <Button type="button" variant="outline" disabled={startDisabled || !canIsolateBackground || isolatingBackground} onClick={onIsolateBackground}>
            {isolatingBackground && <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />}
            {isolatingBackground ? t('selectionUi.removingBackground') : t('selectionUi.removeBackground')}
          </Button>
        )}
      </div>

      {hasSelectedMask ? (
        <details className="rounded-2xl border border-border/70 bg-card p-3" open>
          <summary className="cursor-pointer select-none text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary">{t('selectionUi.adjustSelectedArea')} <span className="font-normal text-muted-foreground">{t('selectionUi.adjustSelectedAreaSuffix')}</span>
          </summary>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">
            {t('selectionUi.adjustSelectedAreaHint')}
          </p>
          <div className="mt-4 space-y-4">

            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" role="group" aria-label={t('selectionUi.exposureAdjustments')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('selectionUi.exposure')}</h3>
                <Button type="button" size="sm" variant="ghost" disabled={startDisabled || applyingExposure || exposureEighthStops === 0} onClick={() => onExposureEighthStops(0)}>{t('selectionUi.reset')}</Button>
              </div>
              <label className="block space-y-2 text-xs">
                <span className="flex items-center justify-between"><span>{t('selectionUi.brightnessEv')}</span><strong className="tabular-nums">{formatExposure(exposureEighthStops)}</strong></span>
                <input
                  aria-label={t('selectionUi.maskedExposure')}
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
                <span className="flex justify-between text-[10px] text-muted-foreground"><span>{t('selectionUi.minusFourEv')}</span><span>{t('selectionUi.neutralZero')}</span><span>{t('selectionUi.plusFourEv')}</span></span>
              </label>
              <Button type="button" className="w-full" variant="outline" aria-label={t('selectionUi.previewMaskedExposure')} disabled={startDisabled || !canApplyExposure || applyingExposure || exposureEighthStops === 0} onClick={onApplyExposure}>
                {applyingExposure && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {applyingExposure ? t('selectionUi.applyingExposure') : t('selectionUi.previewExposure')}
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" role="group" aria-label={t('selectionUi.whiteBalanceAdjustments')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('selectionUi.whiteBalance')}</h3>
                <Button type="button" size="sm" variant="ghost" disabled={startDisabled || applyingWhiteBalance || (whiteBalanceTemperatureQ8 === 0 && whiteBalanceTintQ8 === 0)} onClick={() => { onWhiteBalanceTemperatureQ8(0); onWhiteBalanceTintQ8(0); }}>{t('selectionUi.reset')}</Button>
              </div>
              <label className="block space-y-2 text-xs">
                <span className="flex justify-between"><span>{t('selectionUi.temperatureCoolWarm')}</span><strong className="tabular-nums">{formatWhiteBalanceQ8(whiteBalanceTemperatureQ8)}</strong></span>
                <input
                  aria-label={t('selectionUi.maskedWhiteBalanceTemperature')}
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
                <span className="flex justify-between text-[10px] text-muted-foreground"><span>{t('selectionUi.cool')}</span><span>{t('selectionUi.neutral')}</span><span>{t('selectionUi.warm')}</span></span>
              </label>
              <label className="block space-y-2 text-xs">
                <span className="flex justify-between"><span>{t('selectionUi.tintGreenMagenta')}</span><strong className="tabular-nums">{formatWhiteBalanceQ8(whiteBalanceTintQ8)}</strong></span>
                <input
                  aria-label={t('selectionUi.maskedWhiteBalanceTint')}
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
              <Button type="button" className="w-full" variant="outline" aria-label={t('selectionUi.previewMaskedWhiteBalance')} disabled={startDisabled || !canApplyWhiteBalance || applyingWhiteBalance || (whiteBalanceTemperatureQ8 === 0 && whiteBalanceTintQ8 === 0)} onClick={onApplyWhiteBalance}>
                {applyingWhiteBalance && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {applyingWhiteBalance ? t('selectionUi.applyingWhiteBalance') : t('selectionUi.previewWhiteBalance')}
              </Button>
            </div>

            <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" role="group" aria-label={t('selectionUi.levelsAdjustments')}>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">{t('selectionUi.levelsTonalRange')}</h3>
                <Button type="button" size="sm" variant="ghost" disabled={startDisabled || applyingLevels || levelsIdentity} onClick={() => { onLevelsInputBlack(0); onLevelsInputMidpoint(128); onLevelsInputWhite(255); onLevelsOutputBlack(0); onLevelsOutputWhite(255); }}>{t('selectionUi.reset')}</Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('selectionUi.adjustLevelsHint')}</p>
              <fieldset className="space-y-3" disabled={startDisabled || applyingLevels}>
                <legend className="sr-only">{t('selectionUi.maskedLevels')}</legend>
                <span aria-hidden="true" className="sr-only">{t('selectionUi.levels')}</span>

                <div className="space-y-1">
                  <label className="flex items-center justify-between gap-2 text-xs" htmlFor="levels-input-black">{t('selectionUi.inputBlack')}</label>
                  <div className="flex items-center gap-2">
                    <input aria-label={t('selectionUi.inputBlackSlider')} type="range" className="min-w-0 flex-1 accent-primary" min="0" max={Math.max(0, levelsInputMidpoint - 1)} step="1" value={levelsInputBlack} onChange={(event) => onLevelsInputBlack(Number(event.target.value))} />
                    <input id="levels-input-black" aria-label={t('selectionUi.inputBlack')} type="number" min="0" max={Math.max(0, levelsInputMidpoint - 1)} step="1" value={levelsInputBlack} onChange={(event) => onLevelsInputBlack(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" htmlFor="levels-input-mid">{t('selectionUi.inputMidtones')}</label>
                  <div className="flex items-center gap-2">
                    <input aria-label={t('selectionUi.inputMidtonesSlider')} type="range" className="min-w-0 flex-1 accent-primary" min={Math.min(254, levelsInputBlack + 1)} max={Math.max(1, levelsInputWhite - 1)} step="1" value={levelsInputMidpoint} onChange={(event) => onLevelsInputMidpoint(Number(event.target.value))} />
                    <input id="levels-input-mid" aria-label={t('selectionUi.inputMidtones')} type="number" min={Math.min(254, levelsInputBlack + 1)} max={Math.max(1, levelsInputWhite - 1)} step="1" value={levelsInputMidpoint} onChange={(event) => onLevelsInputMidpoint(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" htmlFor="levels-input-white">{t('selectionUi.inputWhite')}</label>
                  <div className="flex items-center gap-2">
                    <input aria-label={t('selectionUi.inputWhiteSlider')} type="range" className="min-w-0 flex-1 accent-primary" min={Math.min(255, levelsInputMidpoint + 1)} max="255" step="1" value={levelsInputWhite} onChange={(event) => onLevelsInputWhite(Number(event.target.value))} />
                    <input id="levels-input-white" aria-label={t('selectionUi.inputWhite')} type="number" min={Math.min(255, levelsInputMidpoint + 1)} max="255" step="1" value={levelsInputWhite} onChange={(event) => onLevelsInputWhite(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1 border-t border-border/70 pt-3">
                  <label className="text-xs" htmlFor="levels-output-black">{t('selectionUi.outputBlack')}</label>
                  <div className="flex items-center gap-2">
                    <input aria-label={t('selectionUi.outputBlackSlider')} type="range" className="min-w-0 flex-1 accent-primary" min="0" max={Math.max(0, levelsOutputWhite - 1)} step="1" value={levelsOutputBlack} onChange={(event) => onLevelsOutputBlack(Number(event.target.value))} />
                    <input id="levels-output-black" aria-label={t('selectionUi.outputBlack')} type="number" min="0" max={Math.max(0, levelsOutputWhite - 1)} step="1" value={levelsOutputBlack} onChange={(event) => onLevelsOutputBlack(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-xs" htmlFor="levels-output-white">{t('selectionUi.outputWhite')}</label>
                  <div className="flex items-center gap-2">
                    <input aria-label={t('selectionUi.outputWhiteSlider')} type="range" className="min-w-0 flex-1 accent-primary" min={Math.min(255, levelsOutputBlack + 1)} max="255" step="1" value={levelsOutputWhite} onChange={(event) => onLevelsOutputWhite(Number(event.target.value))} />
                    <input id="levels-output-white" aria-label={t('selectionUi.outputWhite')} type="number" min={Math.min(255, levelsOutputBlack + 1)} max="255" step="1" value={levelsOutputWhite} onChange={(event) => onLevelsOutputWhite(Number(event.target.value))} className="w-16 rounded-lg border bg-card px-2 py-1 text-right text-sm tabular-nums" />
                  </div>
                </div>
              </fieldset>
              <Button type="button" className="w-full" variant="outline" aria-label={t('selectionUi.previewMaskedLevels')} disabled={startDisabled || !canApplyLevels || applyingLevels || levelsIdentity} onClick={onApplyLevels}>
                {applyingLevels && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
                {applyingLevels ? t('selectionUi.applyingLevels') : t('selectionUi.previewLevels')}
              </Button>
            </div>
          </div>
        </details>
      ) : (
        <p className="rounded-xl bg-muted px-3 py-3 text-xs leading-5 text-muted-foreground">{t('selectionUi.adjustPartOfImageHint')}</p>
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
    <section className="rounded-xl border bg-card p-3 space-y-3" aria-label={t('selectionUi.selectionTools')}>
      <header className="space-y-1">
        <h3 className="text-base font-semibold">{t('selectionUi.selectAndMask')}</h3>
        <p className="text-xs leading-5 text-muted-foreground">{t('selectionUi.selectionIntro')}</p>
      </header>
      <div className="flex flex-wrap gap-2">
        {modes.map(([id, label]) => <Button key={id} type="button" size="sm" aria-pressed={selection.mode === id} title={modeHints[id]} variant={selection.mode === id ? 'default' : 'outline'} disabled={busy} onClick={() => onMode(id)}>{label}</Button>)}
        {(selection.mode === 'BRUSH_ADD' || selection.mode === 'BRUSH_SUBTRACT') && <>
        <label className="flex items-center gap-2 px-2 text-xs">{t('selectionUi.brushRadius')}
          <input aria-label={t('selectionUi.brushSize')} aria-valuetext={t('selectionUi.valueInPixels', { count: brushSize })} type="range" min="2" max="96" value={brushSize} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushSize(Number(event.target.value))} />
          <span aria-hidden="true">{brushSize}px</span>
        </label>
        <label className="flex items-center gap-2 px-2 text-xs">{t('selectionUi.hardness')}
          <input aria-label={t('selectionUi.brushHardness')} aria-valuetext={t('selectionUi.valueInPercent', { count: brushHardness })} type="range" min="0" max="100" value={brushHardness} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushHardness(Number(event.target.value))} />
          <span aria-hidden="true">{brushHardness}%</span>
        </label>
        <label className="flex items-center gap-2 px-2 text-xs">{t('selectionUi.opacity')}
          <input aria-label={t('selectionUi.brushOpacity')} aria-valuetext={t('selectionUi.valueInPercent', { count: brushOpacity })} type="range" min="0" max="100" step="1" value={brushOpacity} disabled={busy || (selection.mode !== 'BRUSH_ADD' && selection.mode !== 'BRUSH_SUBTRACT')} onChange={(event) => onBrushOpacity(Number(event.target.value))} />
          <span aria-hidden="true">{brushOpacity}%</span>
        </label>
        </>}
      </div>
      <p className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground" role="status">{modeHints[selection.mode]} {selection.quality ? t('selectionUi.maskCoverage', { coverage: (selection.quality.coverage * 100).toFixed(1) }) : t('selectionUi.noMaskAreaCommitted')}</p>

      <div className="space-y-3 rounded-xl border border-border/70 bg-background p-3" aria-label={t('selectionUi.maskOverlayControls')}>
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold">{t('selectionUi.maskOverlay')}</h4>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" aria-label={t('selectionUi.showMaskOverlay')} checked={maskOverlayVisible} onChange={(event) => onMaskOverlayVisible(event.target.checked)} className="h-4 w-4 accent-primary" />
            {t('selectionUi.show')}
          </label>
        </div>
        <label className="block space-y-1 text-xs">
          <span className="flex justify-between text-muted-foreground"><span>{t('selectionUi.overlayOpacityViewOnly')}</span><strong className="tabular-nums">{maskOverlayOpacity}%</strong></span>
          <input type="range" aria-label={t('selectionUi.maskOverlayOpacity')} min="0" max="100" step="1" value={maskOverlayOpacity} onChange={(event) => onMaskOverlayOpacity(Number(event.target.value))} disabled={!maskOverlayVisible} className="w-full accent-primary" />
        </label>
        <div className="flex items-center gap-2" role="group" aria-label={t('selectionUi.maskOverlayColor')}>
          <span className="mr-1 text-xs text-muted-foreground">{t('selectionUi.color')}</span>
          {overlayChoices.map((choice) => (
            <button key={choice.id} type="button" aria-label={t('selectionUi.' + choice.labelKey)} aria-pressed={maskOverlayColor === choice.id} disabled={!maskOverlayVisible} onClick={() => onMaskOverlayColor(choice.id)} className={`flex h-9 w-9 items-center justify-center rounded-xl border-2 transition-transform disabled:opacity-50 ${maskOverlayColor === choice.id ? 'border-primary scale-105' : 'border-border'}`}>
              <span className={`h-5 w-5 rounded-full ${choice.className}`} aria-hidden="true" />
            </button>
          ))}
        </div>
        <p className="text-[11px] leading-4 text-muted-foreground">{t('selectionUi.onlyDisplayColorChanges')}</p>
      </div>
      {selection.mode === 'POLYGON' && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('selectionUi.polygonSelectionControls')}>
          <label className="flex items-center gap-2 text-xs">{t('selectionUi.composition')}
            <select aria-label={t('selectionUi.polygonComposition')} value={polygonComposition} disabled={busy} onChange={(event) => onPolygonComposition(event.target.value)} className="rounded-md border bg-background px-2 py-1">
              <option value="REPLACE">{t('selectionUi.replace')}</option>
              <option value="ADD">{t('selectionUi.add')}</option>
              <option value="SUBTRACT">{t('selectionUi.subtract')}</option>
              <option value="INTERSECT">{t('selectionUi.intersect')}</option>
            </select>
          </label>
          <span className="text-xs text-muted-foreground" role="status">{t('selectionUi.verticesCount', { count: selection.polygonVertices.length })}</span>
          <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.applyPolygonSelection')} disabled={busy || selection.polygonVertices.length < 3} onClick={onApplyPolygon}>{t('selectionUi.applyPolygon')}</Button>
          <Button type="button" size="sm" variant="ghost" aria-label={t('selectionUi.clearPolygonVertices')} disabled={busy || selection.polygonVertices.length === 0} onClick={onClearPolygon}>{t('selectionUi.clearPoints')}</Button>
        </div>
      )}
      {selection.mode === 'LASSO' && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('selectionUi.lassoSelectionControls')}>
          <label className="flex items-center gap-2 text-xs">{t('selectionUi.composition')}
            <select aria-label={t('selectionUi.lassoComposition')} value={polygonComposition} disabled={busy} onChange={(event) => onPolygonComposition(event.target.value)} className="rounded-md border bg-background px-2 py-1">
              <option value="REPLACE">{t('selectionUi.replace')}</option>
              <option value="ADD">{t('selectionUi.add')}</option>
              <option value="SUBTRACT">{t('selectionUi.subtract')}</option>
              <option value="INTERSECT">{t('selectionUi.intersect')}</option>
            </select>
          </label>
          <span className="text-xs text-muted-foreground" role="status">{t('selectionUi.sampledPointsCount', { count: selection.polygonVertices.length })}</span>
          <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.applyLassoSelection')} disabled={busy || selection.polygonVertices.length < 3} onClick={onApplyPolygon}>{t('selectionUi.applyLasso')}</Button>
          <Button type="button" size="sm" variant="ghost" aria-label={t('selectionUi.clearLassoPoints')} disabled={busy || selection.polygonVertices.length === 0} onClick={onClearPolygon}>{t('selectionUi.clearPoints')}</Button>
        </div>
      )}
      {(selection.mode === 'RECTANGLE' || selection.mode === 'ELLIPSE') && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('selectionUi.shapeSelectionControls')}>
          <label className="flex items-center gap-2 text-xs">{t('selectionUi.composition')}
            <select aria-label={t('selectionUi.shapeComposition')} value={polygonComposition} disabled={busy} onChange={(event) => onPolygonComposition(event.target.value)} className="rounded-md border bg-background px-2 py-1">
              <option value="REPLACE">{t('selectionUi.replace')}</option>
              <option value="ADD">{t('selectionUi.add')}</option>
              <option value="SUBTRACT">{t('selectionUi.subtract')}</option>
              <option value="INTERSECT">{t('selectionUi.intersect')}</option>
            </select>
          </label>
          <span className="text-xs text-muted-foreground" role="status">{selection.shapeVertices.length === 2 ? t('selectionUi.dragReady') : t('selectionUi.dragOnImage')}</span>
          <div
            role="group"
            aria-label={t('selectionUi.shapeKeyboardNudging')}
            aria-disabled={!shapeReady || busy}
            tabIndex={shapeReady && !busy ? 0 : -1}
            onKeyDown={shapeKeyDown}
            className="rounded-md border px-2 py-1 text-[11px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {t('selectionUi.arrowMoveHint')}
          </div>
          <Button type="button" size="sm" variant="outline" aria-label={selection.mode === 'RECTANGLE' ? t('selectionUi.applyRectangleSelection') : t('selectionUi.applyEllipseSelection')} disabled={busy || selection.shapeVertices.length !== 2} onClick={onApplyShape}>{selection.mode === 'RECTANGLE' ? t('selectionUi.applyRectangle') : t('selectionUi.applyEllipse')}</Button>
          <Button type="button" size="sm" variant="ghost" aria-label={t('selectionUi.clearShapeAnchors')} disabled={busy || selection.shapeVertices.length === 0} onClick={onClearShape}>{t('selectionUi.clearShape')}</Button>
        </div>
      )}
      <details className="rounded-lg border border-border/60 p-2">
        <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">{t('selectionUi.refineSelectionEdges')}</summary>
        <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex items-center gap-2 px-2 text-xs">{t('selectionUi.edgeRadius')}
          <input aria-label={t('selectionUi.selectionEdgeRadius')} type="range" min="1" max="32" value={morphologyRadius} disabled={busy || !editable} onChange={(event) => onMorphologyRadius(Number(event.target.value))} />
          <span aria-hidden="true">{morphologyRadius}px</span>
        </label>
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.growSelection')} disabled={busy || !editable} onClick={onGrow}>{t('selectionUi.grow')}</Button>
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.shrinkSelection')} disabled={busy || !editable} onClick={onShrink}>{t('selectionUi.shrink')}</Button>
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.openSelection')} disabled={busy || !editable} onClick={onOpen}>{t('selectionUi.open')}</Button>
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.closeSelection')} disabled={busy || !editable} onClick={onClose}>{t('selectionUi.close')}</Button>
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.featherSelection')} disabled={busy || !editable} onClick={onFeather}>{t('selectionUi.feather')}</Button>
        </div>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.undoSelectionEdit')} aria-keyshortcuts="Control+Z Meta+Z" disabled={busy || !selection.canUndo} onClick={onUndo}>{t('selectionUi.undo')}</Button>
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.redoSelectionEdit')} aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y" disabled={busy || !selection.canRedo} onClick={onRedo}>{t('selectionUi.redo')}</Button>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={onClear}>{t('selectionUi.clearSelection')}</Button>
        <Button type="button" size="sm" variant="outline" aria-label={t('selectionUi.invertSelection')} disabled={!editable} onClick={onInvert}>{t('selectionUi.invert')}</Button>
        <span className="flex-1" />
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>{t('selectionUi.cancelSelection')}</Button>
        <Button type="button" size="sm" disabled={!canDone} onClick={onDone} title={t('selectionUi.doneSelectionTitle')}>{t('selectionUi.doneSelection')}</Button>
      </div>
      {selection.state === 'SELECTING' && <p className="text-xs text-muted-foreground" role="status">{t('selectionUi.preparingSmartSelection')}</p>}
      {selection.warning && <p className="text-xs text-amber-600" role="status">{selection.warning}</p>}
      {selection.quality?.warning === 'EMPTY' && <p className="text-xs text-amber-600" role="status">{t('selectionUi.selectionEmpty')}</p>}
      {selection.quality?.warning === 'TINY' && <p className="text-xs text-amber-600" role="status">{t('selectionUi.selectionTiny')}</p>}
      {selection.quality?.warning === 'SUSPICIOUSLY_FULL' && <p className="text-xs text-amber-600" role="status">{t('selectionUi.selectionSuspiciouslyFull')}</p>}
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
