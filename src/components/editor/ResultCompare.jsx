import React, { useState } from 'react';
import { Check, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdaptiveGestures } from '@/components/adaptive/AdaptiveGestures';

// Before/After compare for a pending generation — Accept commits to history, Discard drops it, Retry regenerates.
export default function ResultCompare({ beforeUrl, result, onAccept, onDiscard, onRetry, busy }) {
  const [view, setView] = useState('after');
  const gestures = useAdaptiveGestures({ onSwipeLeft: () => setView('after'), onSwipeRight: () => setView('before') });
  return (
    <div className="border border-border/60 rounded-2xl p-3 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs">
          <button onClick={() => setView('before')} className={`px-3 py-1.5 ${view === 'before' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>Before</button>
          <button onClick={() => setView('after')} className={`px-3 py-1.5 ${view === 'after' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>After</button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {result.provider} · {result.credits_used} credit{result.credits_used === 1 ? '' : 's'}
          {result.generation_time_ms ? ` · ${(result.generation_time_ms / 1000).toFixed(1)}s` : ''}
        </span>
      </div>

      <div className="rounded-xl overflow-hidden bg-muted touch-pan-y" {...gestures.handlers}>
        <img src={view === 'before' ? beforeUrl : (result.preview_url || result.image_url)} alt={view} className="w-full object-contain max-h-[420px]" />
      </div>

      <div className="flex gap-2">
        <Button onClick={onAccept} disabled={busy} className="flex-1 rounded-xl">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} Accept
        </Button>
        <Button variant="outline" onClick={onRetry} disabled={busy} className="rounded-xl">
          <RotateCcw className="w-4 h-4 mr-2" /> Retry
        </Button>
        <Button variant="outline" onClick={onDiscard} disabled={busy} className="rounded-xl text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" /> Discard
        </Button>
      </div>
    </div>
  );
}