import React from 'react';
import { Brush, Crosshair, MousePointer2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  LOCAL_CURVE_DEFAULT, LOCAL_HUE_BANDS, LOCAL_HSL_DEFAULT,
} from '@/lib/local-editor/localAdvanced';

const CURVE_POINTS = Object.freeze([
  { key: 'black', label: 'Black point', x: 0 },
  { key: 'shadows', label: 'Shadows', x: 64 },
  { key: 'midtones', label: 'Midtones', x: 128 },
  { key: 'highlights', label: 'Highlights', x: 192 },
  { key: 'white', label: 'White point', x: 255 },
]);
const HSL_CONTROLS = Object.freeze([
  { key: 'hue', label: 'Hue shift', min: -60, max: 60 },
  { key: 'saturation', label: 'Saturation', min: -100, max: 100 },
  { key: 'lightness', label: 'Lightness', min: -100, max: 100 },
]);

export default function AdvancedLocalControls({
  advanced, onAdvancedChange, hueBand, onHueBandChange,
  cloneMode, onCloneMode, cloneSource, cloneRadius, onCloneRadius,
  cloneHardness, onCloneHardness, cloneOpacity, onCloneOpacity,
}) {
  const editCurve = (key, value) => onAdvancedChange({
    ...advanced, curve: { ...advanced.curve, [key]: value },
  });
  const editHsl = (key, value) => onAdvancedChange({
    ...advanced,
    hsl: {
      ...advanced.hsl,
      [hueBand]: { ...advanced.hsl[hueBand], [key]: value },
    },
  });
  const resetCurve = () => onAdvancedChange({ ...advanced, curve: LOCAL_CURVE_DEFAULT });
  const resetBand = () => onAdvancedChange({
    ...advanced, hsl: { ...advanced.hsl, [hueBand]: LOCAL_HSL_DEFAULT },
  });

  return (
    <section className="space-y-4" aria-label="Advanced local editing tools">
      <div>
        <h3 className="text-lg font-semibold">Precision editing</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">
          Real tone curves, color ranges and a manually sampled clone brush. Every change stays in your local undo history.
        </p>
      </div>
      <div className="grid items-start gap-4 lg:grid-cols-3">
        <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-base font-semibold">Tone curve</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">Five exact output points, from black to white. Move a point to remap the image tones. No hidden auto curve.</p>
            <svg viewBox="0 0 256 256" className="aspect-square w-full rounded-xl border border-border bg-background" role="img" aria-label="Live five-point tone curve">
              <path d="M0 0V256H256" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="1" />
              <path d="M0 256L255 1" fill="none" stroke="currentColor" strokeOpacity=".25" strokeDasharray="6 6" />
              <polyline points={CURVE_POINTS.map(item => item.x + ',' + (255 - advanced.curve[item.key])).join(' ')} fill="none" stroke="currentColor" strokeWidth="3" className="text-primary" />
              {CURVE_POINTS.map(item => <circle key={item.key} cx={item.x} cy={255 - advanced.curve[item.key]} r="4" fill="currentColor" className="text-primary" />)}
            </svg>
            {CURVE_POINTS.map(point => (
              <label className="block space-y-1 text-xs" key={point.key}>
                <span className="flex justify-between"><span>{point.label}</span><output className="tabular-nums">{advanced.curve[point.key]}</output></span>
                <input aria-label={'Curve ' + point.label} type="range" min="0" max="255" step="1" value={advanced.curve[point.key]} onChange={event => editCurve(point.key, Number(event.target.value))} className="w-full accent-primary" />
              </label>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={resetCurve}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset tone curve</Button>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-base font-semibold">Selective HSL</summary>
          <div className="mt-3 space-y-4">
            <p className="text-xs leading-5 text-muted-foreground">Edit reds, oranges, yellows, greens, aquas, blues, purples or magentas independently. Feathered transitions protect nearby colors.</p>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Color range</span>
              <select aria-label="Selective HSL color range" value={hueBand} onChange={event => onHueBandChange(event.target.value)} className="min-h-11 w-full rounded-xl border border-input bg-background px-3">
                {LOCAL_HUE_BANDS.map(band => <option key={band.id} value={band.id}>{band.label}</option>)}
              </select>
            </label>
            {HSL_CONTROLS.map(control => (
              <label key={control.key} className="block space-y-1 text-xs">
                <span className="flex justify-between"><span>{control.label}</span><output className="tabular-nums">{advanced.hsl[hueBand][control.key]}</output></span>
                <input aria-label={'Selective ' + control.label} type="range" min={control.min} max={control.max} step="1" value={advanced.hsl[hueBand][control.key]} onChange={event => editHsl(control.key, Number(event.target.value))} className="w-full accent-primary" />
              </label>
            ))}
            <Button type="button" variant="outline" size="sm" className="w-full" onClick={resetBand}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset this color</Button>
          </div>
        </details>

        <details className="rounded-2xl border border-border/70 bg-muted/20 p-3">
          <summary className="cursor-pointer text-base font-semibold">Manual clone stamp</summary>
          <div className="mt-3 space-y-3">
            <p className="text-xs leading-5 text-muted-foreground">Copy real pixels from one part of your photo to another — no generative fill. Choose a source, then paint on the image. Release to apply each stroke.</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Clone stamp mode">
              <Button type="button" variant={cloneMode === 'pick' ? 'default' : 'outline'} size="sm" onClick={() => onCloneMode('pick')}><Crosshair className="h-4 w-4" aria-hidden="true" /> Pick source</Button>
              <Button type="button" variant={cloneMode === 'paint' ? 'default' : 'outline'} size="sm" disabled={!cloneSource || advanced.cloneStrokes.length >= 32} onClick={() => onCloneMode('paint')}><Brush className="h-4 w-4" aria-hidden="true" /> Paint</Button>
              <Button type="button" variant={cloneMode === 'off' ? 'default' : 'outline'} size="sm" onClick={() => onCloneMode('off')}><MousePointer2 className="h-4 w-4" aria-hidden="true" /> Off</Button>
            </div>
            <p role="status" className="rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
              {cloneMode === 'pick' ? 'Tap the photo to set the pixel source.' : cloneMode === 'paint' ? 'Drag across the photo to clone sampled pixels. Release to complete each stroke.' : 'The photo is in inspection mode.'}
              {cloneSource ? ' Source selected.' : ' No source selected.'} {advanced.cloneStrokes.length}/32 strokes.
            </p>
            <label className="block space-y-1 text-xs">
              <span className="flex justify-between"><span>Brush radius · % of shorter side</span><output>{cloneRadius}%</output></span>
              <input aria-label="Clone radius" type="range" min="1" max="10" value={cloneRadius} onChange={event => onCloneRadius(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="flex justify-between"><span>Edge hardness</span><output>{cloneHardness}%</output></span>
              <input aria-label="Clone hardness" type="range" min="0" max="100" value={cloneHardness} onChange={event => onCloneHardness(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            <label className="block space-y-1 text-xs">
              <span className="flex justify-between"><span>Stamp opacity</span><output>{cloneOpacity}%</output></span>
              <input aria-label="Clone opacity" type="range" min="1" max="100" value={cloneOpacity} onChange={event => onCloneOpacity(Number(event.target.value))} className="w-full accent-primary" />
            </label>
            {advanced.cloneStrokes.length >= 32 && <p role="status" className="text-xs text-amber-700 dark:text-amber-300">32-stroke safety limit reached. Undo a stroke or export the image before continuing.</p>}
            <Button type="button" size="sm" variant="outline" className="w-full" disabled={!advanced.cloneStrokes.length} onClick={() => onAdvancedChange({ ...advanced, cloneStrokes: [] })}>Clear clone strokes</Button>
          </div>
        </details>
      </div>
    </section>
  );
}
