import React from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Brush, Crosshair, MousePointer2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  LOCAL_CURVE_DEFAULT, LOCAL_CURVE_CHANNELS, LOCAL_HUE_BANDS, LOCAL_HSL_DEFAULT,
  LOCAL_GRADIENT_MODES, LOCAL_GRADIENT_DEFAULT,
} from '@/lib/local-editor/localAdvanced';

const CURVE_POINTS = Object.freeze([
  { key: 'black', labelKey: 'blackPoint', x: 0 },
  { key: 'shadows', labelKey: 'shadows', x: 64 },
  { key: 'midtones', labelKey: 'midtones', x: 128 },
  { key: 'highlights', labelKey: 'highlights', x: 192 },
  { key: 'white', labelKey: 'whitePoint', x: 255 },
]);
const HSL_CONTROLS = Object.freeze([
  { key: 'hue', labelKey: 'hueShift', min: -60, max: 60 },
  { key: 'saturation', labelKey: 'saturation', min: -100, max: 100 },
  { key: 'lightness', labelKey: 'lightness', min: -100, max: 100 },
]);

export default function AdvancedLocalControls({
  advanced, onAdvancedChange, hueBand, onHueBandChange,
  cloneMode, onCloneMode, cloneSource, cloneRadius, onCloneRadius,
  cloneHardness, onCloneHardness, cloneOpacity, onCloneOpacity,
  cloneBlendMode, onCloneBlendMode,
}) {
  const { t } = useTranslation();
  const [curveChannel, setCurveChannel] = React.useState('rgb');
  const visibleCurve = curveChannel === 'rgb' ? advanced.curve : advanced.channelCurves[curveChannel];
  const editCurve = (key, value) => onAdvancedChange(curveChannel === 'rgb'
    ? { ...advanced, curve: { ...advanced.curve, [key]: value } }
    : { ...advanced, channelCurves: {
      ...advanced.channelCurves,
      [curveChannel]: { ...advanced.channelCurves[curveChannel], [key]: value },
    } });
  const editHsl = (key, value) => onAdvancedChange({
    ...advanced,
    hsl: {
      ...advanced.hsl,
      [hueBand]: { ...advanced.hsl[hueBand], [key]: value },
    },
  });
  const resetCurve = () => onAdvancedChange(curveChannel === 'rgb'
    ? { ...advanced, curve: LOCAL_CURVE_DEFAULT }
    : { ...advanced, channelCurves: { ...advanced.channelCurves, [curveChannel]: LOCAL_CURVE_DEFAULT } });
  const resetBand = () => onAdvancedChange({
    ...advanced, hsl: { ...advanced.hsl, [hueBand]: LOCAL_HSL_DEFAULT },
  });

  return (
    <section className="space-y-4" aria-label={t('localEditorUi.advancedTools')}>
      <div>
        <h3 className="text-lg font-semibold">{t('localEditorUi.title')}</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          {t('localEditorUi.description')}
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-2 xl:grid-cols-4">
        <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-base font-semibold">{t('localEditorUi.toneCurve')}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">{t('localEditorUi.toneCurveDescription')}</p>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{t('localEditorUi.curveChannel')}</span>
              <select aria-label={t('localEditorUi.curveChannel')} value={curveChannel} onChange={event => setCurveChannel(event.target.value)} className="min-h-11 w-full rounded-xl border border-input bg-background px-3">
                {LOCAL_CURVE_CHANNELS.map(channel => <option key={channel} value={channel}>{t('localEditorUi.channel.' + channel)}</option>)}
              </select>
            </label>
            <svg viewBox="0 0 256 256" className="aspect-square w-full rounded-xl border border-border bg-background" role="img" aria-label={t('localEditorUi.liveToneCurve')}>
              <path d="M0 0V256H256" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1" />
              <path d="M0 256L255 1" fill="none" stroke="currentColor" strokeOpacity=".25" strokeDasharray="6 6" />
              <polyline points={CURVE_POINTS.map(item => item.x + ',' + (255 - visibleCurve[item.key])).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" />
              {CURVE_POINTS.map(item => <circle key={item.key} cx={item.x} cy={255 - visibleCurve[item.key]} r="4" fill="currentColor" className="text-primary" />)}
            </svg>
            {CURVE_POINTS.map(point => (
              <label className="block space-y-1 text-xs" key={point.key}>
                <span className="flex justify-between"><span>{t('localEditorUi.' + point.labelKey)}</span><output className="tabular-nums">{visibleCurve[point.key]}</output></span>
                <input aria-label={t('localEditorUi.curvePoint', { label: t('localEditorUi.' + point.labelKey) })} type="range" min="0" max="255" step="1" value={visibleCurve[point.key]} onChange={event => editCurve(point.key, Number(event.target.value))} className="w-full accent-primary" />
              </label>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={resetCurve}><RotateCcw className="h-4 w-4" aria-hidden="true" /> {t('localEditorUi.resetToneCurve')}</Button>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-base font-semibold">{t('localEditorUi.selectiveHsl')}</summary>
          <div className="mt-3 space-y-4">
            <p className="text-xs leading-5 text-muted-foreground">{t('localEditorUi.selectiveHslDescription')}</p>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{t('localEditorUi.colorRange')}</span>
              <select aria-label={t('localEditorUi.colorRange')} value={hueBand} onChange={event => onHueBandChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-input bg-background px-3">
                {LOCAL_HUE_BANDS.map(band => <option key={band.id} value={band.id}>{t('localEditorUi.hue.' + band.id)}</option>)}
              </select>
            </label>
            {HSL_CONTROLS.map(control => (
              <label key={control.key} className="block space-y-1 text-xs">
                <span className="flex justify-between"><span>{t('localEditorUi.' + control.labelKey)}</span><output className="tabular-nums">{advanced.hsl[hueBand][control.key]}</output></span>
                <input aria-label={t('localEditorUi.selectiveControl', { label: t('localEditorUi.' + control.labelKey) })} type="range" min={control.min} max={control.max} step="1" value={advanced.hsl[hueBand][control.key]} onChange={event => editHsl(control.key, Number(event.target.value))} className="w-full accent-primary" />
              </label>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={resetBand}><RotateCcw className="h-4 w-4" aria-hidden="true" /> {t('localEditorUi.resetThisColor')}</Button>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-base font-semibold">{t('localEditorUi.gradientMask')}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">
              {t('localEditorUi.gradientDescription')}
            </p>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{t('localEditorUi.direction')}</span>
              <select aria-label={t('localEditorUi.direction')} value={advanced.gradient.mode} onChange={event => onAdvancedChange({ ...advanced, gradient: { ...advanced.gradient, mode: event.target.value } })} className="min-h-11 w-full rounded-xl border border-input bg-background px-3">
                {LOCAL_GRADIENT_MODES.map(mode => <option value={mode.id} key={mode.id}>{t('localEditorUi.gradient.' + mode.id)}</option>)}
              </select>
            </label>
            {advanced.gradient.mode !== 'off' && (
              <>
                <p className="text-xs text-muted-foreground">{t('localEditorUi.gradientHint')}</p>
                <label className="block space-y-1 text-xs">
                  <span className="flex justify-between"><span>{t('localEditorUi.startTransition')}</span><output>{advanced.gradient.start}%</output></span>
                  <input aria-label={t('localEditorUi.startTransition')} type="range" min="0" max={advanced.gradient.end - 1} step="1" value={advanced.gradient.start} onChange={event => onAdvancedChange({ ...advanced, gradient: { ...advanced.gradient, start: Number(event.target.value) } })} className="w-full accent-primary" />
                </label>
                <label className="block space-y-1 text-xs">
                  <span className="flex justify-between"><span>{t('localEditorUi.endTransition')}</span><output>{advanced.gradient.end}%</output></span>
                  <input aria-label={t('localEditorUi.endTransition')} type="range" min={advanced.gradient.start + 1} max="100" step="1" value={advanced.gradient.end} onChange={event => onAdvancedChange({ ...advanced, gradient: { ...advanced.gradient, end: Number(event.target.value) } })} className="w-full accent-primary" />
                </label>
                <p role="status" className="rounded-lg bg-accent p-2 text-xs text-accent-foreground">{t('localEditorUi.gradientActive')}</p>
              </>
            )}
            <Button type="button" variant="outline" size="sm" className="w-full" disabled={advanced.gradient.mode === 'off'} onClick={() => onAdvancedChange({ ...advanced, gradient: LOCAL_GRADIENT_DEFAULT })}>{t('localEditorUi.clearGradient')}</Button>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-base font-semibold">{t('localEditorUi.manualCloneStamp')}</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">{t('localEditorUi.cloneDescription')}</p>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">{t('localEditorUi.retouchMethod')}</span>
              <select aria-label={t('localEditorUi.retouchMethod')} value={cloneBlendMode} onChange={event => onCloneBlendMode(event.target.value)} className="min-h-11 w-full rounded-xl border border-input bg-background px-3">
                <option value="clone">{t('localEditorUi.cloneExact')}</option>
                <option value="color-match">{t('localEditorUi.colorMatchedRepair')}</option>
              </select>
            </label>
            {cloneBlendMode === 'color-match' && (
              <p className="text-xs leading-5 text-muted-foreground">{t('localEditorUi.colorMatchNote')}</p>
            )}
            <div className="flex flex-wrap gap-2" role="group" aria-label={t('localEditorUi.cloneMode')}>
              <Button type="button" variant={cloneMode === 'pick' ? 'default' : 'outline'} size="sm" onClick={() => onCloneMode('pick')}><Crosshair className="h-4 w-4" aria-hidden="true" /> {t('localEditorUi.pickSource')}</Button>
              <Button type="button" variant={cloneMode === 'paint' ? 'default' : 'outline'} size="sm" disabled={!cloneSource || advanced.cloneStrokes.length >= 32} onClick={() => onCloneMode('paint')}><Brush className="h-4 w-4" aria-hidden="true" /> {t('localEditorUi.paint')}</Button>
              <Button type="button" variant={cloneMode === 'off' ? 'default' : 'outline'} size="sm" onClick={() => onCloneMode('off')}><MousePointer2 className="h-4 w-4" aria-hidden="true" /> {t('localEditorUi.off')}</Button>
            </div>
            <p role="status" className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {cloneMode === 'pick' ? t('localEditorUi.pickHint') : cloneMode === 'paint' ? t('localEditorUi.paintHint') : t('localEditorUi.inspectHint')}
              {' '}{cloneSource ? t('localEditorUi.sourceSelected') : t('localEditorUi.noSourceSelected')} {' '}{t('localEditorUi.strokeCount', { count: advanced.cloneStrokes.length })}
            </p>
            <label className="block space-y-1 text-xs">
              <span className="flex justify-between"><span>{t('localEditorUi.brushRadius')}</span><output>{cloneRadius}%</output></span>
              <input aria-label={t('localEditorUi.cloneRadius')} type="range" min="1" max="10" value={cloneRadius} onChange={event => onCloneRadius(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="flex justify-between"><span>{t('localEditorUi.edgeHardness')}</span><output>{cloneHardness}%</output></span>
              <input aria-label={t('localEditorUi.cloneHardness')} type="range" min="0" max="100" value={cloneHardness} onChange={event => onCloneHardness(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="flex justify-between"><span>{t('localEditorUi.stampOpacity')}</span><output>{cloneOpacity}%</output></span>
              <input aria-label={t('localEditorUi.cloneOpacity')} type="range" min="1" max="100" value={cloneOpacity} onChange={event => onCloneOpacity(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            {advanced.cloneStrokes.length >= 32 && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">{t('localEditorUi.strokeLimit')}</p>}
            <Button type="button" size="sm" variant="outline" className="w-full" disabled={!advanced.cloneStrokes.length} onClick={() => onAdvancedChange({ ...advanced, cloneStrokes: [] })}>{t('localEditorUi.clearCloneStrokes')}</Button>
          </div>
        </details>
      </div>
    </section>
  );
}
