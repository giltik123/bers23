import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';
import { createCanonicalOutfitViewModel } from '@/application/fashion/canonicalOutfitViewModel';
import CanonicalTryOnProductControls from './CanonicalTryOnProductControls';
import CanonicalTryOnManualRemediationPanel from './CanonicalTryOnManualRemediationPanel';

const IDLE_HOST = Object.freeze({ active: false, busy: false, disposed: false, hasInFlight: false, phase: 'IDLE' });

/**
 * Read-only canonical Outfit/entry chooser for deterministic Try-On.
 * Outfit mutation remains in OutfitPanel; this surface only selects one stable
 * entry and emits explicit product/manual actions to the Editor-owned host.
 */
export default function CanonicalTryOnRunnerPanel({
  project,
  state = null,
  busy = false,
  disabled = false,
  onAction,
  onLoadManualGarmentSource,
  onSaveManualContour,
  onSaveManualBodyAnchors,
  onAbandon,
  onClose,
}) {
  const model = useMemo(() => createCanonicalOutfitViewModel({
    outfits: coreClient.fashion.outfits,
    wardrobe: coreClient.fashion.wardrobe,
  }), []);
  const [outfits, setOutfits] = useState([]);
  const [garments, setGarments] = useState([]);
  const [selectedOutfitId, setSelectedOutfitId] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const hostActive = Boolean(state?.host?.active);
  const lockedSelection = hostActive ? state?.selection : null;

  const load = useCallback(async () => {
    if (hostActive || busy) return;
    setLoading(true);
    setError('');
    try {
      const snapshot = await model.load();
      setOutfits(snapshot.outfits.filter((outfit) => outfit.status === 'ACTIVE' && outfit.entries.length > 0));
      setGarments(snapshot.garments);
      setSelectedOutfitId((current) => snapshot.outfits.some((outfit) => outfit.id === current) ? current : '');
      setSelectedEntryId('');
    } catch (cause) {
      setError(cause?.message || 'Canonical Outfits could not be loaded for Try-On.');
    } finally {
      setLoading(false);
    }
  }, [busy, hostActive, model]);

  useEffect(() => { void load(); }, [model]); // deliberate read-only initial load; never runs Try-On

  const selectedOutfit = lockedSelection?.outfit
    || outfits.find((outfit) => outfit.id === selectedOutfitId)
    || null;
  const effectiveEntryId = lockedSelection?.entryId || selectedEntryId;
  const selectedEntry = selectedOutfit?.entries.find((entry) => entry.entryId === effectiveEntryId) || null;
  const garmentById = useMemo(() => new Map(garments.map((garment) => [garment.garmentId, garment])), [garments]);
  const selectedGarment = selectedEntry ? garmentById.get(selectedEntry.garmentId) : null;
  const selectionLocked = busy || loading || hostActive;
  const host = state?.host || IDLE_HOST;
  const result = state?.result || null;

  const context = () => {
    if (lockedSelection) {
      if (!selectedOutfit || !selectedEntry) {
        throw new Error('Canonical Try-On locked selection no longer resolves its Outfit entry.');
      }
      return Object.freeze({
        selection: Object.freeze({
          entryId: lockedSelection.entryId,
          outfit: lockedSelection.outfit,
          projectId: lockedSelection.projectId,
          sourceArtifactId: lockedSelection.sourceArtifactId,
        }),
        beforeUrl: lockedSelection.beforeUrl,
      });
    }
    if (!selectedOutfit || !selectedEntry || !project?.id || !project?.current_image_artifact_id || !project?.current_image_url) {
      throw new Error('Canonical Try-On requires one Outfit entry and the current canonical Project image.');
    }
    return Object.freeze({
      selection: Object.freeze({
        entryId: selectedEntry.entryId,
        outfit: selectedOutfit,
        projectId: project.id,
        sourceArtifactId: project.current_image_artifact_id,
      }),
      beforeUrl: project.current_image_url,
    });
  };

  const action = (name) => {
    if (typeof onAction !== 'function') return undefined;
    try {
      return onAction(name, context());
    } catch (cause) {
      setError(cause?.message || 'Try-On selection is invalid.');
      return undefined;
    }
  };

  const withManualContext = (callback, fallbackMessage) => {
    try {
      return callback(context());
    } catch (cause) {
      const message = cause?.message || fallbackMessage;
      setError(message);
      return Promise.reject(cause instanceof Error ? cause : new Error(message));
    }
  };

  const loadManualGarmentSource = (garmentId) => {
    if (typeof onLoadManualGarmentSource !== 'function') return Promise.reject(new Error('Manual contour source loading is unavailable.'));
    return withManualContext(
      (value) => onLoadManualGarmentSource(value, garmentId),
      'Manual contour selection is invalid.',
    );
  };

  const saveManualContour = (value) => {
    if (typeof onSaveManualContour !== 'function') return Promise.reject(new Error('Manual contour saving is unavailable.'));
    return withManualContext(
      (current) => onSaveManualContour(current, value),
      'Manual contour selection is invalid.',
    );
  };

  const saveManualBodyAnchors = (value) => {
    if (typeof onSaveManualBodyAnchors !== 'function') return Promise.reject(new Error('Manual body-anchor saving is unavailable.'));
    return withManualContext(
      (current) => onSaveManualBodyAnchors(current, value),
      'Manual body-anchor selection is invalid.',
    );
  };

  const close = () => {
    if (typeof onClose === 'function') onClose();
    setSelectedOutfitId('');
    setSelectedEntryId('');
  };

  return (
    <section className="rounded-2xl border border-border p-3 space-y-2" aria-label="Canonical deterministic Try-On runner">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">Try one managed garment</p>
          <p className="text-[10px] text-muted-foreground">Choose one canonical Outfit entry. Selection alone never starts execution.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={load} disabled={selectionLocked || disabled} aria-label="Reload Try-On Outfit choices">
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {!hostActive && (
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={selectedOutfitId}
            onChange={(event) => { setSelectedOutfitId(event.target.value); setSelectedEntryId(''); setError(''); }}
            disabled={selectionLocked || disabled}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            aria-label="Outfit for deterministic Try-On"
          >
            <option value="">Choose Outfit…</option>
            {outfits.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.name}</option>)}
          </select>
          <select
            value={selectedEntryId}
            onChange={(event) => { setSelectedEntryId(event.target.value); setError(''); }}
            disabled={selectionLocked || disabled || !selectedOutfit}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            aria-label="Garment entry for deterministic Try-On"
          >
            <option value="">Choose garment…</option>
            {(selectedOutfit?.entries || []).map((entry) => {
              const garment = garmentById.get(entry.garmentId);
              return (
                <option key={entry.entryId} value={entry.entryId} disabled={entry.referenceReadiness !== 'READY'}>
                  {garment?.name || entry.garmentId}{entry.referenceReadiness === 'READY' ? '' : ` · ${entry.referenceReadiness.toLowerCase()}`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {hostActive && selectedOutfit && selectedEntry && (
        <p className="text-[11px] text-muted-foreground" role="status">
          Locked selection: {selectedOutfit.name} · {selectedGarment?.name || selectedEntry.garmentId}
        </p>
      )}

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      {selectedEntry && (
        <CanonicalTryOnProductControls
          garmentLabel={selectedGarment?.name || selectedEntry.garmentId}
          result={result}
          host={host}
          busy={busy}
          disabled={disabled}
          onInspect={() => action('inspect')}
          onRun={() => action('run')}
          onResume={() => action('resume')}
          onRecover={() => action('recover')}
          onAbandon={onAbandon}
          onClose={close}
        />
      )}

      {hostActive && state?.selection && (
        <CanonicalTryOnManualRemediationPanel
          selection={state.selection}
          result={result}
          busy={busy}
          disabled={disabled}
          onLoadContourSource={loadManualGarmentSource}
          onSaveContour={saveManualContour}
          onSaveBodyAnchors={saveManualBodyAnchors}
          onRecheck={() => action('inspect')}
        />
      )}
    </section>
  );
}
