import React from 'react';
import { performanceMonitor } from '@/lib/performance/performanceMonitor';
import { useAdaptiveGestures } from '@/components/adaptive/AdaptiveGestures';
import { usePlatformProfile } from '@/lib/platform/PlatformManager';
import { adaptiveRenderer } from '@/lib/platform/AdaptiveRenderer';

// Renders the current image with tappable detected-object overlays.
// Boxes are normalized (0–1) so they scale with any screen size.
export default function ImageCanvas({ imageUrl, objects, selectedId, onSelect, busy, onUndo, onRedo }) {
  const gestures = useAdaptiveGestures({ onSwipeLeft: onRedo, onSwipeRight: onUndo });
  const renderer = adaptiveRenderer(usePlatformProfile());
  return (
    <div className="relative rounded-2xl overflow-hidden bg-muted select-none touch-none" {...gestures.handlers}>
      <div className="relative" style={gestures.style}>
      <img src={imageUrl} alt="Project" decoding={renderer.decoding} fetchPriority="high" style={{ imageRendering: renderer.imageRendering }} onLoad={(event) => { if (event.currentTarget.naturalWidth * event.currentTarget.naturalHeight > 2000000) performanceMonitor.markLargeDecode(); }} className="w-full h-auto block" draggable={false} />
      {objects.map((obj) => {
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