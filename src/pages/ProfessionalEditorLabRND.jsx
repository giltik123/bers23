import React, { useEffect, useRef, useState } from 'react';
import { resizeProfessionalLanczos3Rgba8RND } from '@/platform/creative/deterministic/ProfessionalResizeLanczosRND';
import { highlightProtectedToneRgba8RND } from '@/platform/creative/deterministic/HighlightProtectedToneRND';
import { precisionCloneStampRgba8RND } from '@/platform/creative/deterministic/ProfessionalCloneStampRND';
import { composeLinearLightLayersRgba8RND } from '@/platform/creative/deterministic/ProfessionalLinearLayersRND';
import { encodeDeterministicRgbaPng } from '@/platform/creative/deterministic/DeterministicPng';
import { professionalToneRangeMaskRgba8RND } from '@/platform/creative/deterministic/ProfessionalToneRangeMaskRND';
import { paintProfessionalMaskR8RND } from '@/platform/creative/deterministic/ProfessionalMaskBrushRND';

// Deliberately NOT an authorized Project editor. Developer-only image-quality
// playground. No network, Core/Artifact history, Final or provider execution.
// Browser Canvas decoding can transform ICC/EXIF; do not treat this as a
// lossless ingestion or a production tool until Core independently validates.
const MAX_UPLOAD_BYTES = 20_000_000;
const MAX_PIXELS = 2_097_152;
const MAX_HISTORY = 5;

const snapshot = frame => ({
  width: frame.width, height: frame.height, data: new Uint8ClampedArray(frame.data),
});

function PreviewCanvas({ frame, title, onPick, onPaintMove, selectionOverlay }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!frame || !canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const visual = new Uint8ClampedArray(frame.data);
    if (selectionOverlay && selectionOverlay.length === frame.width * frame.height) {
      // Magenta coverage is only a visual hint. Source and output RGBA stay untouched.
      for (let p = 0; p < selectionOverlay.length; p++) {
        const weight = selectionOverlay[p] / 255 * 0.35;
        if (weight === 0) continue;
        const o = p * 4;
        visual[o] = Math.round(visual[o] * (1 - weight) + 255 * weight);
        visual[o + 1] = Math.round(visual[o + 1] * (1 - weight));
        visual[o + 2] = Math.round(visual[o + 2] * (1 - weight) + 210 * weight);
      }
    }
    ctx.putImageData(new ImageData(visual, frame.width, frame.height), 0, 0);
  }, [frame, selectionOverlay]);
  return (
    <section className="min-w-0 space-y-2">
      <h2 className="text-sm font-medium">{title} — {frame ? `${frame.width} × ${frame.height}` : 'No image'}</h2>
      <div className="overflow-auto max-h-[580px] rounded-xl border border-border bg-muted">
        {frame ? (
          <canvas
            ref={ref}
            width={frame.width}
            height={frame.height}
            className="block max-w-full h-auto"
            aria-label={title}
            onPointerDown={onPick ? event => {
              const rect = event.currentTarget.getBoundingClientRect();
              const x = Math.min(frame.width - 1, Math.max(0,
                Math.floor((event.clientX - rect.left) * frame.width / rect.width)));
              const y = Math.min(frame.height - 1, Math.max(0,
                Math.floor((event.clientY - rect.top) * frame.height / rect.height)));
              onPick(x, y);
            } : undefined}
            onPointerMove={onPaintMove ? event => {
              if (event.buttons !== 1) return;
              const rect = event.currentTarget.getBoundingClientRect();
              const x = Math.min(frame.width - 1, Math.max(0,
                Math.floor((event.clientX - rect.left) * frame.width / rect.width)));
              const y = Math.min(frame.height - 1, Math.max(0,
                Math.floor((event.clientY - rect.top) * frame.height / rect.height)));
              onPaintMove(x, y);
            } : undefined}
          />
        ) : <div className="h-52 flex items-center justify-center text-sm text-muted-foreground">Choose a local image</div>}
      </div>
    </section>
  );
}

export default function ProfessionalEditorLabRND() {
  const [original, setOriginal] = useState(null);
  const [current, setCurrent] = useState(null);
  const [undoStack, setUndoStack] = useState([]);
  const [redoStack, setRedoStack] = useState([]);
  const [eighthStops, setEighthStops] = useState(8);
  const [resizeWidth, setResizeWidth] = useState(512);
  const [brushRadius, setBrushRadius] = useState(30);
  const [brushOpacity, setBrushOpacity] = useState(180);
  const [brushHardness, setBrushHardness] = useState(180);
  const [cloneMode, setCloneMode] = useState('PICK_SAMPLE');
  const [samplePoint, setSamplePoint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [toolMode, setToolMode] = useState('CLONE');
  const [toneRegion, setToneRegion] = useState('ALL');
  const [manualMask, setManualMask] = useState(null);
  const [maskHistory, setMaskHistory] = useState([]);
  const [maskStrokeMode, setMaskStrokeMode] = useState('ADD');
  const [showSelectionOverlay, setShowSelectionOverlay] = useState(true);
  const blankQuality = () => ({
    looksNatural:false,preservesSubject:false,noVisibleArtifacts:false,betterThanSource:false,
  });
  const [qualityReview, setQualityReview] = useState(blankQuality);
  const resetQualityReview = () => setQualityReview(blankQuality());
  const reviewed = original !== null && current !== null &&
    Object.values(qualityReview).every(value => value === true);

  const commit = next => {
    if (!current) return;
    setUndoStack(before => [...before.slice(-(MAX_HISTORY - 1)), snapshot(current)]);
    setRedoStack([]);
    setCurrent(snapshot(next));
    resetQualityReview();
  };
  const fail = error => setMessage(error instanceof Error ? error.message : String(error));
  const disabled = !current || busy;

  const upload = async file => {
    if (!file) return;
    setMessage('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > MAX_UPLOAD_BYTES) {
      setMessage('Local PNG, JPEG or WebP up to 20 MB required.');
      return;
    }
    setBusy(true);
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      if (bitmap.width > 4096 || bitmap.height > 4096 ||
          bitmap.width * bitmap.height > MAX_PIXELS) {
        throw new Error('R&D quality preview supports at most 2 megapixels; the original file was not changed.');
      }
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width; canvas.height = bitmap.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('This browser cannot decode local pixels.');
      ctx.drawImage(bitmap, 0, 0);
      const rgba = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
      const frame = { width: bitmap.width, height: bitmap.height, data: new Uint8ClampedArray(rgba) };
      setOriginal(snapshot(frame));
      setCurrent(snapshot(frame));
      setUndoStack([]); setRedoStack([]); setSamplePoint(null);
      setManualMask(new Uint8Array(frame.width * frame.height));
      setMaskHistory([]);
      resetQualityReview();
      setResizeWidth(Math.min(4096, bitmap.width));
      setMessage('Loaded only in local browser memory. ICC/EXIF conversion during Canvas decode is not Core-verified.');
    } catch (error) {
      fail(error);
    } finally {
      bitmap?.close();
      setBusy(false);
    }
  };

  const applyTone = () => {
    if (!current || busy) return;
    try {
      const mask = professionalToneRangeMaskRgba8RND(
        current.data,current.width,current.height,
        toneRegion === 'BRUSH' ? 'ALL' : toneRegion,
        toneRegion === 'BRUSH' ? manualMask : undefined,
      ).mask;
      if (toneRegion === 'BRUSH' && !mask.some(value => value !== 0)) {
        throw new Error('Paint a soft edit mask before applying selective tone.');
      }
      const data = highlightProtectedToneRgba8RND(current.data, mask,
        current.width, current.height, { eighthStops });
      commit({ ...current, data });
      setMessage('Soft highlight-protected tone applied in local memory. No Project/FINAL was changed.');
    } catch (error) { fail(error); }
  };

  const applyResize = () => {
    if (!current || busy) return;
    try {
      const width = Number(resizeWidth);
      if (!Number.isSafeInteger(width) || width < 1 || width > 4096) throw new Error('Resize width out of bounds.');
      const height = Math.max(1, Math.round(current.height * width / current.width));
      const data = resizeProfessionalLanczos3Rgba8RND(current.data,current.width,
        current.height,{ width,height });
      commit({ width,height,data });
      setSamplePoint(null);
      setManualMask(new Uint8Array(width * height));
      setMaskHistory([]);
      setMessage('Antialiased Lanczos3 / linear-light resize applied locally.');
    } catch (error) { fail(error); }
  };

  const applyLightLayer = () => {
    if (!current || busy) return;
    try {
      const pixels = new Uint8Array(current.data.length);
      for (let i=0;i<pixels.length;i+=4) pixels.set([255,255,255,255],i);
      const data = composeLinearLightLayersRgba8RND(current.data,current.width,current.height,[{
        id:'local-light',pixels,visible:true,opacityQ8:36,blendMode:'NORMAL',
      }]);
      commit({ ...current,data });
      setMessage('Local light blend flattened into an undoable preview (not a persistent editable layer).');
    } catch(error){fail(error);}
  };

  const paintMask = (x,y,recordUndo) => {
    if (!current || busy || !manualMask) return;
    try {
      if (recordUndo) setMaskHistory(history =>
        [...history.slice(-(MAX_HISTORY - 1)),new Uint8Array(manualMask)]);
      setManualMask(previous => paintProfessionalMaskR8RND(previous,current.width,current.height,{
        centerX:x,centerY:y,radius:brushRadius,hardnessQ8:brushHardness,
        opacityQ8:brushOpacity,mode:maskStrokeMode,
      }));
      setMessage('Selection brush updated. Magenta is only a preview overlay.');
    } catch(error){fail(error);}
  };

  const onCanvasPick = (x,y) => {
    if (toolMode === 'MASK') {
      paintMask(x,y,true);
      return;
    }
    if (!current || busy) return;
    if (cloneMode === 'PICK_SAMPLE') {
      setSamplePoint({ x,y });
      setCloneMode('CLONE');
      setMessage(`Clone source selected: ${x}, ${y}. Click the result to clone its texture.`);
      return;
    }
    if (!samplePoint) {
      setCloneMode('PICK_SAMPLE');
      setMessage('Select a clone source first.');
      return;
    }
    try {
      const data=precisionCloneStampRgba8RND(current.data,current.width,current.height,{
        targetX:x,targetY:y,sampleX:samplePoint.x,sampleY:samplePoint.y,
        radius:brushRadius,hardnessQ8:brushHardness,opacityQ8:brushOpacity,
      });
      commit({ ...current,data });
      setMessage(`Cloned sampled pixels into a soft brush at ${x}, ${y}. Alpha preserved.`);
    }catch(error){fail(error);}
  };

  const undo = () => {
    if (!current || !undoStack.length || busy) return;
    const previous=undoStack[undoStack.length-1];
    setUndoStack(s=>s.slice(0,-1));
    setRedoStack(s=>[...s.slice(-(MAX_HISTORY-1)),snapshot(current)]);
    setCurrent(snapshot(previous));
    setSamplePoint(null);
    setManualMask(new Uint8Array(previous.width * previous.height));
    setMaskHistory([]);
    resetQualityReview();
    setMessage('Reverted local preview snapshot.');
  };
  const redo = () => {
    if (!current || !redoStack.length || busy) return;
    const next=redoStack[redoStack.length-1];
    setRedoStack(s=>s.slice(0,-1));
    setUndoStack(s=>[...s.slice(-(MAX_HISTORY-1)),snapshot(current)]);
    setCurrent(snapshot(next));
    setSamplePoint(null);
    setManualMask(new Uint8Array(next.width * next.height));
    setMaskHistory([]);
    resetQualityReview();
    setMessage('Restored local preview snapshot.');
  };
  const exportLocalPng = async () => {
    if (!current || busy || !reviewed) return;
    setBusy(true);
    let url;
    try {
      const png = await encodeDeterministicRgbaPng({
        width:current.width,height:current.height,
        data:new Uint8ClampedArray(current.data),
        orientation:1,colorSpace:'srgb',format:'RGBA8',
      });
      url=URL.createObjectURL(new Blob([new Uint8Array(png)],{type:'image/png'}));
      const a=document.createElement('a');
      a.href=url;a.download='bers-professional-local-preview-rnd.png';
      a.click();
      setMessage('Human-reviewed PNG generated locally; the review is not a Core certificate.');
    }catch(error){fail(error);}finally{
      if(url)URL.revokeObjectURL(url);
      setBusy(false);
    }
  };

  return (
    <main className="p-4 max-w-[1500px] mx-auto space-y-5" aria-label="BERS experimental professional local image quality lab">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">Professional Image Quality Lab</h1>
        <p className="text-sm text-muted-foreground">
          Development-only local editor. No upload, AI, billing, Project modification or Core Accept.
          This preview has NOT passed Photoshop-class visual/ICC/browser acceptance.
        </p>
      </header>
      <label className="inline-flex flex-col gap-1 text-sm font-medium">
        Open local photo (PNG/JPEG/WebP; 20MB, up to 2MP)
        <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
          onChange={event=>upload(event.target.files?.[0])} className="text-sm" />
      </label>
      <section className="flex flex-wrap items-end gap-3 border rounded-xl p-3" aria-label="Professional local photo editing tools">
        <label className="flex flex-col text-sm gap-1">Tone region
          <select aria-label="Tone region" value={toneRegion} disabled={disabled}
            onChange={e=>setToneRegion(e.target.value)}
            className="rounded border bg-background px-2 py-1">
            <option value="ALL">Whole image</option>
            <option value="SHADOWS">Shadows</option>
            <option value="MIDTONES">Midtones</option>
            <option value="HIGHLIGHTS">Highlights</option>
            <option value="BRUSH">Hand-painted selection only</option>
          </select>
        </label>
        <label className="flex flex-col text-sm gap-1">Tone (+/− eighth stops)
          <input type="range" min="-24" max="24" step="1" value={eighthStops}
            onChange={e=>setEighthStops(Number(e.target.value))} disabled={disabled}/>
          <span>{(eighthStops/8).toFixed(3)} tonal stops</span>
        </label>
        <button type="button" disabled={disabled} onClick={applyTone}
          className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">Soft tone</button>
        <label className="flex flex-col text-sm gap-1">Resize width (px)
          <input type="number" min="1" max="4096" value={resizeWidth}
            onChange={e=>setResizeWidth(e.target.value)} disabled={disabled}
            className="w-28 border rounded px-2 py-1 bg-background"/>
        </label>
        <button type="button" disabled={disabled} onClick={applyResize}
          className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">Lanczos3 resize</button>
        <button type="button" disabled={disabled} onClick={applyLightLayer}
          className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">Linear light blend</button>
        <button type="button" disabled={disabled||undoStack.length===0} onClick={undo}
          className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">Undo</button>
        <button type="button" disabled={disabled||redoStack.length===0} onClick={redo}
          className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">Redo</button>
        <button type="button" disabled={disabled || !reviewed} onClick={exportLocalPng}
          className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">Export visually reviewed PNG</button>
      </section>
      <section className="border rounded-xl p-3 space-y-3" aria-label="Local Clone Stamp brush settings">
        <div className="flex flex-wrap gap-3 items-center">
          <button type="button" disabled={disabled} onClick={()=>setCloneMode('PICK_SAMPLE')}
            className="border rounded-lg px-3 py-2 text-sm disabled:opacity-40">
            Select Clone source point
          </button>
          <span className="text-sm text-muted-foreground">Brush mode: {cloneMode==='PICK_SAMPLE'?'pick source':'clone texture'} · {samplePoint?`${samplePoint.x},${samplePoint.y}`:'no source selected'}</span>
          <label className="text-sm">Radius <input type="range" min="1" max="120" value={brushRadius}
            onChange={e=>setBrushRadius(Number(e.target.value))} disabled={disabled} />{brushRadius}px</label>
          <label className="text-sm">Hardness <input type="range" min="0" max="255" value={brushHardness}
            onChange={e=>setBrushHardness(Number(e.target.value))} disabled={disabled} />{brushHardness}/255</label>
          <label className="text-sm">Opacity <input type="range" min="0" max="255" value={brushOpacity}
            onChange={e=>setBrushOpacity(Number(e.target.value))} disabled={disabled} />{brushOpacity}/255</label>
        </div>
        <p className="text-xs text-muted-foreground">Select a source point, then click the Current image. Texture is sampled from the unchanged pre-stroke pixels. Undo reverses any stamp. This is manual clone, not healing AI.</p>
      </section>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <PreviewCanvas frame={original} title="Original browser-decoded source" />
        <PreviewCanvas frame={current} title="Current unaccepted local preview"
          onPick={onCanvasPick}
          onPaintMove={toolMode==='MASK'?((x,y)=>paintMask(x,y,false)):undefined}
          selectionOverlay={toolMode==='MASK'&&showSelectionOverlay?manualMask:null} />
      </div>
    </main>
  );
}
