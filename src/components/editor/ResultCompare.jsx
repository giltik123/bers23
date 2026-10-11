import React, { useState } from 'react';
import { Check, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdaptiveGestures } from '@/components/adaptive/AdaptiveGestures';

// Pending previews are never committed automatically. Accept is the only canonical save action.
export default function ResultCompare({ beforeUrl, result, onAccept, onDiscard, onRetry, busy }) {
  const [view, setView] = useState('after');
  const gestures = useAdaptiveGestures({ onSwipeLeft: () => setView('after'), onSwipeRight: () => setView('before') });

  return (
    <section className="space-y-4 rounded-3xl border border-primary/35 bg-card p-4 shadow-md sm:p-5" aria-label="Review edit preview">
      <header>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Almost there</p>
        <h2 className="mt-1 text-xl font-semibold">Review your edit</h2>
        <p className="mt-1 text-sm leading-5 text-muted-foreground" role="status">Preview ready — not saved yet. Compare both images, then choose Accept to keep the change or Discard to leave your original untouched.</p>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-border bg-muted p-1" role="group" aria-label="Compare image versions">
          <button type="button" aria-pressed={view === 'before'} onClick={() => setView('before')} className={['min-h-10 rounded-lg px-4 text-sm font-medium', view === 'before' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/80'].join(' ')}>Before</button>
          <button type="button" aria-pressed={view === 'after'} onClick={() => setView('after')} className={['min-h-10 rounded-lg px-4 text-sm font-medium', view === 'after' ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/80'].join(' ')}>After</button>
        </div>
        <span className="text-xs text-muted-foreground">
          {result.provider} · {result.credits_used} credit{result.credits_used === 1 ? '' : 's'}
          {result.generation_time_ms ? ' · ' + (result.generation_time_ms / 1000).toFixed(1) + 's' : ''}
        </span>
      </div>

      <div className="overflow-hidden rounded-2xl bg-muted touch-pan-y" {...gestures.handlers}>
        <img src={view === 'before' ? beforeUrl : (result.preview_url || result.image_url)} alt={view} className="mx-auto max-h-[560px] w-full object-contain" />
      </div>

      <div className="flex flex-wrap gap-2 border-t border-border pt-4">
        <Button type="button" onClick={onAccept} disabled={busy} className="min-h-12 flex-1 rounded-xl px-5">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
          Accept
        </Button>
        <Button type="button" variant="outline" onClick={onRetry} disabled={busy} className="min-h-12 rounded-xl">
          <RotateCcw className="h-4 w-4" aria-hidden="true" /> Retry
        </Button>
        <Button type="button" variant="outline" onClick={onDiscard} disabled={busy} className="min-h-12 rounded-xl text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Discard
        </Button>
      </div>
    </section>
  );
}
