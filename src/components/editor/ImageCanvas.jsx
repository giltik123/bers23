import React, { useEffect, useRef } from 'react';
import { performanceMonitor } from '@/lib/performance/performanceMonitor';
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

export default function ImageCanvas({ imageUrl, objects, selectedId, onSelect, busy, onUndo, onRedo, selection, onSelectionPointer }) {
  const gestures = useAdaptiveGestures({ onSwipeLeft: onRedo, onSwipeRight: onUndo });
  const renderer = adaptiveRenderer(usePlatformProfile());
  const drawing = useRef(false);
  const pointer = (phase) => (event) => {
    if (!selection || !onSelectionPointer) return;
    event.preventDefault(); event.stopPropagation();
    if (phase === 'down') { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); }
    if (phase === 'move' && !drawing.current) return;
    const rect = event.currentTarget.getBoundingClientRect();
    onSelectionPointer(phase, { x: event.clientX - rect.left, y: event.clientY - rect.top }, { displayWidth: rect.width, displayHeight: rect.height, originalWidth: selection.width, originalHeight: selection.height });
    if (phase === 'up' || phase === 'cancel') drawing.current = false;
  };
  return (
    <div className={`relative rounded-2xl overflow-hidden bg-muted select-none ${selection ? 'touch-none' : ''}`} {...(!selection ? gestures.handlers : {})} onPointerDown={pointer('down')} onPointerMove={pointer('move')} onPointerUp={pointer('up')} onPointerCancel={pointer('cancel')}>
      <div className="relative" style={gestures.style}>
      <img src={imageUrl} alt="Project" decoding={renderer.decoding} fetchPriority="high" style={{ imageRendering: renderer.imageRendering }} onLoad={(event) => { if (event.currentTarget.naturalWidth * event.currentTarget.naturalHeight > 2000000) performanceMonitor.markLargeDecode(); }} className="w-full h-auto block" draggable={false} />
      <SelectionOverlay selection={selection} />
      {!selection && objects.map((obj) => {
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
