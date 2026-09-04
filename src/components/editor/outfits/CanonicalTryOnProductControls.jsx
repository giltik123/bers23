import React, { useMemo } from 'react';
import { Loader2, Play, RefreshCw, RotateCcw, Search, Square } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { canonicalTryOnProductUiState } from '@/application/fashion/canonicalTryOnProductUiState';

export default function CanonicalTryOnProductControls({
  garmentLabel,
  result = null,
  host,
  busy = false,
  disabled = false,
  onInspect,
  onRun,
  onResume,
  onRecover,
  onAbandon,
  onClose,
}) {
  const ui = useMemo(
    () => canonicalTryOnProductUiState({ result, host, busy, disabled }),
    [result, host, busy, disabled],
  );

  return (
    <section className="rounded-xl border border-border bg-background/70 p-2.5 space-y-2" aria-label="Deterministic Try-On controls">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium truncate">Deterministic Try-On{garmentLabel ? ` · ${garmentLabel}` : ''}</p>
          <p className="text-[10px] text-muted-foreground" role="status">{ui.message}</p>
        </div>
        {typeof onClose === 'function' && !ui.hasInFlight && (
          <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px]" onClick={onClose} disabled={busy}>
            Close
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={onInspect} disabled={!ui.canInspect || typeof onInspect !== 'function'}>
          {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1" />}
          Check readiness
        </Button>

        <Button type="button" size="sm" className="h-8 text-xs" onClick={onRun} disabled={!ui.canRun || typeof onRun !== 'function'}>
          <Play className="h-3.5 w-3.5 mr-1" /> Run
        </Button>

        {ui.hasInFlight && (
          <>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={onResume} disabled={!ui.canResume || typeof onResume !== 'function'}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" /> Resume
            </Button>
            <Button type="button" variant="secondary" size="sm" className="h-8 text-xs" onClick={onRecover} disabled={!ui.canRecover || typeof onRecover !== 'function'}>
              <RefreshCw className="h-3.5 w-3.5 mr-1" /> Recover
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 text-xs" onClick={onAbandon} disabled={!ui.canAbandon || typeof onAbandon !== 'function'}>
              <Square className="h-3.5 w-3.5 mr-1" /> Abandon
            </Button>
          </>
        )}
      </div>

      {ui.readiness && ui.readiness.status !== 'READY' && (
        <p className="text-[10px] text-amber-700 dark:text-amber-300">
          Run remains disabled until canonical readiness returns READY. No browser fallback or automatic retry is allowed.
        </p>
      )}
    </section>
  );
}
