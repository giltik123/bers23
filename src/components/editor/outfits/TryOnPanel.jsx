import React, { useState, useEffect } from 'react';
import { Wand2, Loader2, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { tryonEngine } from '@/lib/tryon/tryonEngine';
import { tryonEvents } from '@/lib/tryon/tryonEvents';
import { garmentSelector } from '@/lib/tryon/garmentSelector';
import { outfitAnalyzer } from '@/lib/outfits/outfitAnalyzer';
import { outfitManager } from '@/lib/outfits/outfitManager';
import { garmentManager } from '@/lib/fashion/garmentManager';
import { sceneMemory } from '@/lib/scene/sceneMemory';
import ResultCompare from '@/components/editor/ResultCompare';

// Virtual Try-On runner — drives the TryOnEngine chain and commits accepted
// results to project History via the Editor's onCommit.
export default function TryOnPanel({ project, objects, outfit, wardrobe, onCommit }) {
  const [progress, setProgress] = useState(tryonEvents.state);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [committing, setCommitting] = useState(false);

  useEffect(() => tryonEvents.subscribe(setProgress), []);

  const garments = outfitAnalyzer.resolveGarments(outfit, wardrobe);
  const { selected, skipped } = garmentSelector.select(garments);
  const running = busy && progress.status === 'running';

  const run = async () => {
    setError(null);
    setBusy(true);
    try {
      const outcome = await tryonEngine.execute({ project, outfit, garments, objects, memory: sceneMemory.getActive() });
      setPending(outcome);
    } catch (e) {
      if (e.code !== 'cancelled') setError(e.message || 'Try-on failed');
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    setCommitting(true);
    try {
      await onCommit(pending.result, outfit);
      outfitManager.recordUsage(outfit).catch(() => {});
      pending.used.forEach((g) => garmentManager.recordUsage(g).catch(() => {}));
      setPending(null);
    } finally {
      setCommitting(false);
    }
  };

  if (pending) {
    return (
      <div className="space-y-2">
        {pending.warnings.length > 0 && (
          <p className="text-[10px] text-muted-foreground">{pending.warnings.join(' · ')}</p>
        )}
        <ResultCompare
          beforeUrl={project.current_image_url}
          result={pending.result}
          onAccept={accept}
          onDiscard={() => setPending(null)}
          onRetry={() => { setPending(null); run(); }}
          busy={committing}
        />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium flex items-center gap-1.5"><Wand2 className="w-3.5 h-3.5 text-primary" /> Virtual Try-On</p>
          <p className="text-[10px] text-muted-foreground">
            {selected.length
              ? `${selected.length} garment${selected.length === 1 ? '' : 's'} will be applied to the photo`
              : 'Add a top, bottoms or a dress with photos to try on'}
          </p>
        </div>
        {running ? (
          <Button variant="outline" size="sm" onClick={() => tryonEngine.cancel()}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
        ) : (
          <Button size="sm" onClick={run} disabled={!selected.length || busy}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Wand2 className="w-3.5 h-3.5 mr-1" />} Try on
          </Button>
        )}
      </div>
      {running && (
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          {progress.label || 'Working…'}
          {progress.totalSteps > 0 && <span>({progress.step}/{progress.totalSteps})</span>}
        </div>
      )}
      {skipped.length > 0 && (
        <p className="text-[10px] text-muted-foreground">Skipped: {skipped.map((s) => s.reason).join(' · ')}</p>
      )}
      {error && (
        <p className="text-[11px] text-destructive flex gap-1.5"><AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" /> {error}</p>
      )}
    </div>
  );
}