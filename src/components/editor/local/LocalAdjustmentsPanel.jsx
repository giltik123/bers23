import React, { useEffect, useReducer, useRef, useState } from 'react';
import { Download, ImagePlus, Loader2, RotateCcw, ShieldCheck, Undo2, Redo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canonicalCoreResourcePath, CONFIGURED_CORE_API_ROOT, resolveCoreResourceUrl } from '@/api/coreResourceUrl';
import {
  applyLocalAdjustments, localLuminanceHistogram, LOCAL_CONTROLS, LOCAL_DEFAULTS,
  LOCAL_EFFECTS, LOCAL_PRESETS, MAX_LOCAL_PIXELS, normalizeLocalSettings,
  presetLocalSettings, isNeutralLocalSettings,
} from '@/lib/local-editor/localAdjustments';

const MAX_INPUT_BYTES = 32 * 1024 * 1024;
const MAX_PREVIEW_EDGE = 1100;
const SUPPORTED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function historyReducer(state, action) {
  if (action.type === 'undo') return { ...state, index: Math.max(0, state.index - 1) };
  if (action.type === 'redo') return { ...state, index: Math.min(state.entries.length - 1, state.index + 1) };
  if (action.type === 'reset') return { entries: [LOCAL_DEFAULTS], index: 0 };
  const last = state.entries[state.index];
  const next = action.type === 'preset' ? presetLocalSettings(action.id) : normalizeLocalSettings({ ...last, [action.key]: action.value });
  if (Object.keys(LOCAL_DEFAULTS).every(key => next[key] === last[key])) return state;
  const entries = [...state.entries.slice(0, state.index + 1), next].slice(-40);
  return { entries, index: entries.length - 1 };
}

function safeFilename(name) {
  return String(name || 'photo').replace(/\.[^.]+$/, '').normalize('NFKC').replace(/[^\p{L}\p{N}._-]+/gu, '-').slice(0, 60) || 'photo';
}

async function decodeLocalImage(blob) {
  if (!SUPPORTED_TYPES.has(blob.type)) throw new Error('Choose PNG, JPEG or WebP.');
  if (!blob.size || blob.size > MAX_INPUT_BYTES) throw new Error('Local image must be 32 MB or smaller.');
  if (typeof createImageBitmap !== 'function') throw new Error('This browser cannot decode local images.');
  const bitmap = await createImageBitmap(blob);
  try {
    const width = bitmap.width, height = bitmap.height;
    if (!width || !height || width * height > MAX_LOCAL_PIXELS) throw new Error('Maximum local photo size is 12 megapixels; resize larger projects first.');
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('Local canvas is unavailable.');
    ctx.drawImage(bitmap, 0, 0);
    const full = ctx.getImageData(0, 0, width, height).data;
    const scale = Math.min(1, MAX_PREVIEW_EDGE / Math.max(width, height));
    const previewWidth = Math.max(1, Math.round(width * scale)), previewHeight = Math.max(1, Math.round(height * scale));
    if (previewWidth === width && previewHeight === height) return { width, height, full, previewWidth, previewHeight, preview: full };
    const small = document.createElement('canvas');
    small.width = previewWidth; small.height = previewHeight;
    const smallCtx = small.getContext('2d', { willReadFrequently: true });
    if (!smallCtx) throw new Error('Local preview canvas is unavailable.');
    smallCtx.imageSmoothingEnabled = true;
    smallCtx.imageSmoothingQuality = 'high';
    smallCtx.drawImage(bitmap, 0, 0, previewWidth, previewHeight);
    return { width, height, full, previewWidth, previewHeight, preview: smallCtx.getImageData(0, 0, previewWidth, previewHeight).data };
  } finally { bitmap.close(); }
}

function Adjustment({ definition, value, setValue }) {
  return (
    <label className="block space-y-2 rounded-xl border border-border/60 bg-background p-3 text-sm">
      <span className="flex justify-between gap-2 font-medium"><span>{definition.label}</span><output className="tabular-nums text-primary">{value}</output></span>
      <input aria-label={'Local ' + definition.label} type="range" min={definition.min} max={definition.max} step={definition.step} value={value} onChange={event => setValue(definition.key, Number(event.target.value))} className="w-full accent-primary" />
      <span className="flex justify-between text-[10px] text-muted-foreground"><span>{definition.min}</span><span>{definition.max}</span></span>
    </label>
  );
}

export default function LocalAdjustmentsPanel({ imageUrl, projectName }) {
  const image = useRef(null), imageInput = useRef(null), canvasRef = useRef(null), abortRef = useRef(null), exportUrls = useRef(new Set()), loadGeneration = useRef(0);
  const [details, setDetails] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [histogram, setHistogram] = useState(null);
  const [openCategories, setOpenCategories] = useState({ Light: true, Color: false, Effects: false });
  const [history, dispatch] = useReducer(historyReducer, { entries: [LOCAL_DEFAULTS], index: 0 });
  const settings = history.entries[history.index];

  useEffect(() => () => {
    abortRef.current?.abort();
    loadGeneration.current++;
    image.current = null;
    for (const url of exportUrls.current) URL.revokeObjectURL(url);
    exportUrls.current.clear();
  }, []);

  const useImage = async (blob, name, generation) => {
    const raster = await decodeLocalImage(blob);
    if (generation !== loadGeneration.current) return;
    image.current = raster;
    dispatch({ type: 'reset' });
    setShowOriginal(false);
    setDetails({ name, width: raster.width, height: raster.height });
    setError('');
  };

  const loadFromProject = async () => {
    if (loading) return;
    const resourcePath = canonicalCoreResourcePath(imageUrl);
    if (!resourcePath) { setError('This image is not a verified Core resource. Open a local file instead.'); return; }
    const generation = ++loadGeneration.current;
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(resolveCoreResourceUrl(resourcePath, CONFIGURED_CORE_API_ROOT), { credentials: 'include', cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Core image unavailable (HTTP ' + response.status + ').');
      const mime = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      if (!SUPPORTED_TYPES.has(mime)) throw new Error('Core returned an unsupported image format.');
      if (Number(response.headers.get('content-length') || 0) > MAX_INPUT_BYTES) throw new Error('Core image exceeds 32 MB.');
      const blob = await response.blob();
      if (!controller.signal.aborted) await useImage(new Blob([blob], { type: mime }), projectName || 'project', generation);
    } catch (cause) {
      if (!controller.signal.aborted) setError(cause?.message || 'Could not load project photo.');
    } finally {
      if (abortRef.current === controller) { abortRef.current = null; setLoading(false); }
    }
  };

  const loadFromFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    abortRef.current?.abort();
    const generation = ++loadGeneration.current;
    setLoading(true);
    setError('');
    try { await useImage(file, file.name, generation); }
    catch (cause) { setError(cause?.message || 'Local photo could not be decoded.'); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    if (!details || !image.current) return undefined;
    const frame = requestAnimationFrame(() => {
      try {
        const source = image.current, canvas = canvasRef.current;
        if (!source || !canvas) return;
        const pixels = showOriginal
          ? new Uint8ClampedArray(source.preview)
          : applyLocalAdjustments(source.preview, source.previewWidth, source.previewHeight, settings);
        canvas.width = source.previewWidth;
        canvas.height = source.previewHeight;
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Local preview canvas is unavailable.');
        context.putImageData(new ImageData(pixels, canvas.width, canvas.height), 0, 0);
        setHistogram(localLuminanceHistogram(pixels, canvas.width, canvas.height));
      } catch (cause) { setError(cause?.message || 'Local preview failed.'); }
    });
    return () => cancelAnimationFrame(frame);
  }, [details, settings, showOriginal]);

  const download = async () => {
    if (!image.current || exporting) return;
    setExporting(true);
    setError('');
    try {
      const source = image.current;
      const pixels = applyLocalAdjustments(source.full, source.width, source.height, settings);
      const canvas = document.createElement('canvas');
      canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('PNG encoder canvas is unavailable.');
      ctx.putImageData(new ImageData(pixels, source.width, source.height), 0, 0);
      const blob = await new Promise((resolve, reject) => canvas.toBlob(output => output ? resolve(output) : reject(new Error('PNG export failed.')), 'image/png'));
      if (blob.type !== 'image/png' || !blob.size) throw new Error('Browser did not produce a valid PNG.');
      const url = URL.createObjectURL(blob);
      exportUrls.current.add(url);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = safeFilename(details?.name || projectName) + '-local-edit.png';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => { URL.revokeObjectURL(url); exportUrls.current.delete(url); }, 30_000);
    } catch (cause) { setError(cause?.message || 'Unable to export PNG.'); }
    finally { setExporting(false); }
  };

  const update = (key, value) => dispatch({ type: 'change', key, value });
  const maxBin = histogram ? Math.max(1, ...histogram) : 1;
  const histogramPath = histogram
    ? Array.from(histogram, (count, index) => index + ',' + (72 - count / maxBin * 68)).join(' ')
    : '';

  return (
    <section className="space-y-5 rounded-3xl border border-border/70 bg-card p-4 shadow-sm sm:p-6" aria-label="Local photo adjustments">
      <header className="space-y-2">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-primary"><ShieldCheck className="h-5 w-5" aria-hidden="true" /> 100% local · No AI · No credits</p>
        <h2 className="text-2xl font-semibold">Local photo lab</h2>
        <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Adjust colors, lighting and details in your browser. Download a PNG to keep your work. Local edits do not mutate the BERS project or its Core history.</p>
      </header>
      <div className="flex flex-wrap gap-2">
        <Button type="button" onClick={loadFromProject} disabled={!imageUrl || loading || exporting} className="min-h-11 rounded-xl">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ImagePlus className="h-4 w-4" aria-hidden="true" />}
          {loading ? 'Loading image…' : 'Load current project photo'}
        </Button>
        <Button type="button" variant="outline" onClick={() => imageInput.current?.click()} disabled={loading || exporting} className="min-h-11 rounded-xl">
          <ImagePlus className="h-4 w-4" aria-hidden="true" /> Open local photo
        </Button>
        <input ref={imageInput} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" tabIndex={-1} onChange={loadFromFile} aria-label="Choose a local photo without uploading it" />
      </div>
      <p className="text-xs text-muted-foreground">PNG, JPEG or WebP · up to 32 MB / 12 megapixels. Resize larger projects first.</p>
      {error && <p className="rounded-xl border border-destructive/40 p-3 text-sm text-destructive" role="alert">{error}</p>}

      {!details ? (
        <div className="flex min-h-44 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-border bg-muted/40 p-6 text-center">
          <ImagePlus className="mb-2 h-7 w-7 text-primary" aria-hidden="true" />
          <p className="font-medium">Choose a photo to edit without AI.</p>
          <p className="mt-2 text-sm text-muted-foreground">No cloud processing or credit charges.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0"><h3 className="truncate font-semibold">{details.name}</h3><p className="text-xs text-muted-foreground">{details.width} × {details.height} px · PNG at original resolution</p></div>
            <div className="flex gap-2" role="group" aria-label="Compare local image">
              <Button type="button" size="sm" aria-pressed={showOriginal} variant={showOriginal ? 'default' : 'outline'} onClick={() => setShowOriginal(true)}>Before</Button>
              <Button type="button" size="sm" aria-pressed={!showOriginal} variant={!showOriginal ? 'default' : 'outline'} onClick={() => setShowOriginal(false)}>After</Button>
            </div>
          </div>

          <div className="rounded-2xl border border-border/70 bg-muted p-2">
            <canvas ref={canvasRef} role="img" aria-label={showOriginal ? 'Original local photo' : 'Locally edited photo preview'} className="mx-auto block max-h-[65vh] max-w-full rounded-xl object-contain" />
            <p className="mt-2 text-center text-xs text-muted-foreground">Fast preview max 1100 px. Export uses the original full-resolution pixels.</p>
          </div>
          {histogram && (
            <svg role="img" aria-label="Preview brightness histogram" viewBox="0 0 256 76" preserveAspectRatio="none" className="h-20 w-full rounded-xl border border-border/70 bg-muted">
              <polygon points={'0,76 ' + histogramPath + ' 255,76'} fill="currentColor" className="text-primary/40" />
            </svg>
          )}

          <div className="space-y-2">
            <h3 className="font-semibold">Presets</h3>
            <div role="group" aria-label="Local editing presets" className="flex flex-wrap gap-2">
              {LOCAL_PRESETS.map(preset => <Button key={preset.id} type="button" size="sm" variant="outline" onClick={() => dispatch({ type: 'preset', id: preset.id })}>{preset.label}</Button>)}
            </div>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Local editing history">
            <Button type="button" variant="outline" disabled={!history.index} onClick={() => dispatch({ type: 'undo' })}><Undo2 className="h-4 w-4" aria-hidden="true" /> Undo</Button>
            <Button type="button" variant="outline" disabled={history.index === history.entries.length - 1} onClick={() => dispatch({ type: 'redo' })}><Redo2 className="h-4 w-4" aria-hidden="true" /> Redo</Button>
            <Button type="button" variant="outline" disabled={isNeutralLocalSettings(settings)} onClick={() => dispatch({ type: 'reset' })}><RotateCcw className="h-4 w-4" aria-hidden="true" /> Reset all</Button>
          </div>

          <div className="grid items-start gap-4 lg:grid-cols-3">
            {['Light', 'Color', 'Effects'].map(category => (
              <details key={category} open={openCategories[category]} onToggle={event => {
                const next = event.currentTarget.open;
                setOpenCategories(current => current[category] === next ? current : { ...current, [category]: next });
              }} className="min-w-0 rounded-2xl border border-border/70 bg-muted/20 p-3">
                <summary className="cursor-pointer text-base font-semibold">{category}</summary>
                <div className="mt-3 space-y-3">
                  {category === 'Effects' && (
                    <label className="block space-y-2 rounded-xl border border-border/60 bg-background p-3 text-sm">
                      <span className="block font-medium">Color effect</span>
                      <select aria-label="Local color effect" value={settings.effect} onChange={event => update('effect', event.target.value)} className="min-h-11 w-full rounded-lg border border-input bg-card px-3">
                        {LOCAL_EFFECTS.map(effect => <option key={effect.value} value={effect.value}>{effect.label}</option>)}
                      </select>
                    </label>
                  )}
                  {LOCAL_CONTROLS.filter(definition => definition.category === category && (definition.key !== 'thresholdCutoff' || settings.effect === 'threshold')).map(definition =>
                    definition.key === 'posterize' || definition.key === 'pixelate' ? (
                      <label key={definition.key} className="block space-y-2 rounded-xl border border-border/60 bg-background p-3 text-sm">
                        <span className="block font-medium">{definition.label}</span>
                        <select aria-label={'Local ' + definition.label} value={settings[definition.key]} onChange={event => update(definition.key, Number(event.target.value))} className="min-h-11 w-full rounded-lg border border-input bg-card px-3">
                          <option value="0">Off</option>
                          {Array.from({ length: definition.max - 1 }, (_, i) => i + 2).map(value => <option key={value} value={value}>{value}</option>)}
                        </select>
                      </label>
                    ) : (
                      <Adjustment key={definition.key} definition={definition} value={settings[definition.key]} setValue={update} />
                    )
                  )}
                </div>
              </details>
            ))}
          </div>

          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border/70 pt-4">
            <p className="max-w-lg text-xs leading-5 text-muted-foreground">Browser-only editing. Downloaded PNG does not enter Core history; import it as a new project if desired.</p>
            <Button type="button" onClick={download} disabled={exporting || loading} className="min-h-12 rounded-xl px-5">
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
              {exporting ? 'Preparing PNG…' : 'Download edited PNG'}
            </Button>
          </footer>
        </>
      )}
    </section>
  );
}
