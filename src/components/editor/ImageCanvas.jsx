import React, { useEffect, useRef } from 'react';
import { performanceMonitor } from '@/lib/performance/performanceMonitor';
import CanonicalMaskPreview from '@/components/editor/CanonicalMaskPreview';
import { useAdaptiveGestures } from '@/components/adaptive/AdaptiveGestures';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';
import { adaptiveRenderer } from '@/lib/platform/AdaptiveRenderer';

// Renders the current image with tappable detected-object overlays.
// Boxes are normalized (0–1) so they scale with any screen size.
function SelectionOverlay({ selection }) {
  const ref = useRef(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !selection) return;
    const scale = Math.min(1, 1024 / Math.max(selection.width, selection.height));
    canvas.width = Math.max(1, Math.round(selection.width * scale)); canvas.height = Math.max(1, Math.round(selection.height * scale));
    const context = canvas.getContext('2d'), pixels = context.createImageData(canvas.width, canvas.height);
    for (let y = 0; y < canvas.height; y += 1) for (let x = 0; x < canvas.width; x += 1) {
      const source = Math.min(selection.height - 1, Math.floor(y / scale)) * selection.width + Math.min(selection.width - 1, Math.floor(x / scale));
      const target = (y * canvas.width + x) * 4, alpha = selection.alpha[source];
      pixels.data[target] = 16; pixels.data[target + 1] = 185; pixels.data[target + 2] = 129; pixels.data[target + 3] = Math.round(alpha * .45);
    }
    context.putImageData(pixels, 0, 0);
  }, [selection]);
  return <canvas ref={ref} className="absolute inset-0 size-full pointer-events-none" aria-hidden="true" />;
}

function PolygonPreview({ selection }) {
  if ((selection?.mode !== 'POLYGON' && selection?.mode !== 'LASSO') || !selection.polygonVertices?.length) return null;
  const points = selection.polygonVertices.map((vertex) => `${vertex.x},${vertex.y}`).join(' ');
  const closed = selection.polygonVertices.length >= 3;
  return (
    <svg
      className="absolute inset-0 size-full pointer-events-none"
      viewBox={`0 0 ${selection.width} ${selection.height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {closed && <polygon points={points} fill="rgba(16,185,129,0.12)" stroke="none" />}
      <polyline points={points} fill="none" stroke="rgb(16,185,129)" strokeWidth={Math.max(1, Math.min(selection.width, selection.height) / 300)} vectorEffect="non-scaling-stroke" />
      {selection.polygonVertices.map((vertex, index) => (
        <circle key={`${vertex.x}:${vertex.y}:${index}`} cx={vertex.x} cy={vertex.y} r={Math.max(1.5, Math.min(selection.width, selection.height) / 180)} fill="rgb(16,185,129)" vectorEffect="non-scaling-stroke" />
      ))}
    </svg>
  );
}

function ShapePreview({ selection, onHandlePointer }) {
  if ((selection?.mode !== 'RECTANGLE' && selection?.mode !== 'ELLIPSE') || selection.shapeVertices?.length !== 2) return null;
  const [a,b] = selection.shapeVertices;
  const x = Math.min(a.x,b.x), y = Math.min(a.y,b.y), width = Math.abs(b.x-a.x), height = Math.abs(b.y-a.y);
  if (!(width > 0 && height > 0)) return null;
  const common = { fill: 'rgba(16,185,129,0.12)', stroke: 'rgb(16,185,129)', strokeWidth: Math.max(1, Math.min(selection.width, selection.height) / 300), vectorEffect: 'non-scaling-stroke' };
  const handles = [
    ['NW', x, y, 'northwest'],
    ['NE', x + width, y, 'northeast'],
    ['SW', x, y + height, 'southwest'],
    ['SE', x + width, y + height, 'southeast'],
  ];
  const pointer = (handle, phase) => (event) => {
    if (!onHandlePointer) return;
    event.preventDefault();
    event.stopPropagation();
    if (phase === 'down') event.currentTarget.setPointerCapture?.(event.pointerId);
    const host = event.currentTarget.parentElement;
    const rect = host?.getBoundingClientRect();
    if (rect?.width && rect?.height) {
      onHandlePointer(
        handle,
        phase,
        { x: event.clientX - rect.left, y: event.clientY - rect.top },
        { displayWidth: rect.width, displayHeight: rect.height, originalWidth: selection.width, originalHeight: selection.height },
      );
    }
    if ((phase === 'up' || phase === 'cancel') && event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }
  };
  return (
    <div className="absolute inset-0 pointer-events-none">
      <svg className="absolute inset-0 size-full pointer-events-none" viewBox={`0 0 ${selection.width} ${selection.height}`} preserveAspectRatio="none" aria-hidden="true">
        {selection.mode === 'RECTANGLE'
          ? <rect x={x} y={y} width={width} height={height} {...common} />
          : <ellipse cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} {...common} />}
      </svg>
      {handles.map(([handle, handleX, handleY, label]) => (
        <button
          key={handle}
          type="button"
          aria-label={`Resize selection from ${label} handle`}
          className="absolute w-4 h-4 rounded-full border-2 border-white bg-emerald-500 shadow pointer-events-auto -translate-x-1/2 -translate-y-1/2 touch-none"
          style={{ left: `${handleX / selection.width * 100}%`, top: `${handleY / selection.height * 100}%` }}
          onPointerDown={pointer(handle, 'down')}
          onPointerMove={pointer(handle, 'move')}
          onPointerUp={pointer(handle, 'up')}
          onPointerCancel={pointer(handle, 'cancel')}
        />
      ))}
    </div>
  );
}

function CropOverlay({ crop }) {
  if (!crop) return null;
  const left = crop.x / crop.sourceWidth * 100;
  const top = crop.y / crop.sourceHeight * 100;
  const width = crop.width / crop.sourceWidth * 100;
  const height = crop.height / crop.sourceHeight * 100;
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div
        className="absolute border-2 border-white"
        style={{ left: `${left}%`, top: `${top}%`, width: `${width}%`, height: `${height}%`, boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }}
      />
    </div>
  );
}

export default function ImageCanvas({ imageUrl, projectId, sourceArtifactId, imageWidth, imageHeight, objects, selectedId, onSelect, busy, onUndo, onRedo, selection, onSelectionPointer, onShapeHandlePointer, crop, cropSource, onCropPointer }) {
  const gestures = useAdaptiveGestures({ onSwipeLeft: onRedo, onSwipeRight: onUndo });
  const renderer = adaptiveRenderer(usePlatformProfile());
  const drawing = useRef(false);
  const interactive = Boolean(selection || cropSource);
  const selectedMaskId=objects.find(obj=>obj.id===selectedId)?.mask_artifact_id;
  const pointer = (phase) => (event) => {
    if (!interactive) return;
    event.preventDefault(); event.stopPropagation();
    if (phase === 'down') { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); }
    if (phase === 'move' && !drawing.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (cropSource && onCropPointer) {
      const x = Math.max(0, Math.min(cropSource.sourceWidth - 1, Math.floor((event.clientX - rect.left) / rect.width * cropSource.sourceWidth)));
      const y = Math.max(0, Math.min(cropSource.sourceHeight - 1, Math.floor((event.clientY - rect.top) / rect.height * cropSource.sourceHeight)));
      onCropPointer(phase, { x, y });
    } else if (selection && onSelectionPointer) {
      onSelectionPointer(phase, { x: event.clientX - rect.left, y: event.clientY - rect.top }, { displayWidth: rect.width, displayHeight: rect.height, originalWidth: selection.width, originalHeight: selection.height });
    }
    if (phase === 'up' || phase === 'cancel') drawing.current = false;
  };
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-muted select-none ${interactive ? 'touch-none' : ''}`} {...(!interactive ? gestures.handlers : {})} onPointerDown={pointer('down')} onPointerMove={pointer('move')} onPointerUp={pointer('up')} onPointerCancel={pointer('cancel')}>
      <div className="relative" style={gestures.style}>
      <img src={imageUrl} alt="Project" decoding={renderer.decoding} fetchPriority="high" style={{ imageRendering: renderer.imageRendering }} onLoad={(event) => { if (event.currentTarget.naturalWidth * event.currentTarget.naturalHeight > 2000000) performanceMonitor.markLargeDecode(); }} className="w-full h-auto block" draggable={false} />
      {!interactive && selectedMaskId && projectId && sourceArtifactId && (
        <CanonicalMaskPreview
          key={`${sourceArtifactId}:${selectedMaskId}`}
          projectId={projectId} sourceArtifactId={sourceArtifactId}
          maskArtifactId={selectedMaskId} width={imageWidth} height={imageHeight}
        />
      )}
      <SelectionOverlay selection={selection} />
      <PolygonPreview selection={selection} />
      <ShapePreview selection={selection} onHandlePointer={onShapeHandlePointer} />
      <CropOverlay crop={crop} />
      {!interactive && objects.filter(obj=>obj?.box &&
        [obj.box.x,obj.box.y,obj.box.w,obj.box.h].every(Number.isFinite) &&
        obj.box.w>0 && obj.box.h>0).map((obj) => {
        const selected = obj.id === selectedId;
        return (
          <button
            key={obj.id}
            onClick={() => onSelect(selected ? null : obj)}
            disabled={busy}
            style={{
              left: `${obj.box.x * 100}%`,
              top: `${obj.box.y * 100}%`,
              width: `${obj.box.w * 100}%`,
              height: `${obj.box.h * 100}%`,
            }}
            className={`absolute rounded-lg border-2 transition-all duration-200 ${
              selected
                ? 'border-emerald-400 bg-emerald-400/20 shadow-[0_0_0_4px_rgba(52,211,153,0.25)]'
                : 'border-white/70 bg-white/5 hover:bg-white/15'
            }`}
          >
            <span className={`absolute -top-7 left-0 text-xs px-2 py-0.5 rounded-md whitespace-nowrap ${
              selected ? 'bg-emerald-400 text-emerald-950 font-medium' : 'bg-black/60 text-white'
            }`}>
              {obj.label}
            </span>
          </button>
        );
      })}
      </div>
      {busy && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center">
          <div className="w-8 h-8 border-[3px] border-white/30 border-t-white rounded-full animate-spin" />
        </div>
      )}
    </div>
  );
}
