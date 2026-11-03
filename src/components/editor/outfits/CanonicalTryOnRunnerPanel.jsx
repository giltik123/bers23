import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';
import { createCanonicalOutfitViewModel } from '@/application/fashion/canonicalOutfitViewModel';
import { filterCanonicalWardrobeVoice } from '@/application/voice/filterCanonicalWardrobeVoice';
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
  voiceQuery = null,
  outfitRevision = 0,
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
  const { t, plural } = useTranslation();
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
  const loadRequestRef = useRef(0);

  const hostActive = Boolean(state?.host?.active);
  const lockedSelection = hostActive ? state?.selection : null;

  const load = useCallback(async () => {
    // A changed Outfit revision must refresh the chooser, but never replace
    // an admitted/in-flight Core Try-On selection.
    if (hostActive || busy) return;
    const request = ++loadRequestRef.current;
    setLoading(true);
    setError('');
    try {
      const snapshot = await model.load();
      if (request !== loadRequestRef.current) return;
      const selectable = snapshot.outfits.filter((outfit) => outfit.status === 'ACTIVE' && outfit.entries.length > 0);
      setOutfits(selectable);
      setGarments(snapshot.garments);
      // An archived or emptied Outfit must never remain a hidden select value.
      setSelectedOutfitId((current) => selectable.some((outfit) => outfit.id === current) ? current : '');
      setSelectedEntryId('');
    } catch (cause) {
      if (request === loadRequestRef.current) {
        // A failed canonical read cannot authorize Run from a prior snapshot.
        // Leave Reload usable, but require a fresh successful selection.
        setOutfits([]);
        setGarments([]);
        setSelectedOutfitId('');
        setSelectedEntryId('');
        setError(t('fashionUi.refreshError'));
      }
    } finally {
      if (request === loadRequestRef.current) setLoading(false);
    }
  }, [busy, hostActive, model, t, language]);

  useEffect(() => {
    void load(); // read-only refresh; never starts Try-On execution
    return () => { loadRequestRef.current += 1; };
  }, [load, outfitRevision]);

  const selectedOutfit = lockedSelection?.outfit
    || outfits.find((outfit) => outfit.id === selectedOutfitId)
    || null;
  const effectiveEntryId = lockedSelection?.entryId || selectedEntryId;
  const selectedEntry = selectedOutfit?.entries.find((entry) => entry.entryId === effectiveEntryId) || null;
  const garmentById = useMemo(() => new Map(garments.map((garment) => [garment.garmentId, garment])), [garments]);
  const selectedGarment = selectedEntry ? garmentById.get(selectedEntry.garmentId) : null;
  const voiceMatches=useMemo(()=>{
    if(!voiceQuery?.query)return [];
    const acceptedIds=new Set(filterCanonicalWardrobeVoice(
      garments.map(garment=>({...garment,id:garment.garmentId})),voiceQuery,
    ).map(item=>item.id));
    return outfits.flatMap(outfit=>outfit.entries.flatMap(entry=>{
      const garment=garmentById.get(entry.garmentId);
      if(entry.referenceReadiness!=='READY'||!garment ||
        !acceptedIds.has(entry.garmentId))return [];
      return [{outfitName:outfit.name,garmentName:garment.name,
        outfitId:outfit.id,entryId:entry.entryId}];
    }));
  },[voiceQuery,outfits,garmentById,garments]);
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
      setError(t('fashionUi.selectionInvalid'));
      return undefined;
    }
  };

  const withManualContext = async (callback, fallbackMessage) => {
    try {
      return await callback(context());
    } catch {
      // Never expose raw Core/runtime exception text in this user-facing panel.
      const message = fallbackMessage || t('fashionUi.selectionInvalid');
      setError(message);
      throw new Error(message);
    }
  };

  const loadManualGarmentSource = (garmentId) => {
    if (typeof onLoadManualGarmentSource !== 'function') return Promise.reject(new Error(t('fashionUi.manualContourSourceUnavailable')));
    return withManualContext(
      (value) => onLoadManualGarmentSource(value, garmentId),
      t('fashionUi.manualContourInvalid'),
    );
  };

  const saveManualContour = (value) => {
    if (typeof onSaveManualContour !== 'function') return Promise.reject(new Error(t('fashionUi.manualContourSaveUnavailable')));
    return withManualContext(
      (current) => onSaveManualContour(current, value),
      t('fashionUi.manualContourInvalid'),
    );
  };

  const saveManualBodyAnchors = (value) => {
    if (typeof onSaveManualBodyAnchors !== 'function') return Promise.reject(new Error(t('fashionUi.manualBodyAnchorsSaveUnavailable')));
    return withManualContext(
      (current) => onSaveManualBodyAnchors(current, value),
      t('fashionUi.manualBodyAnchorsInvalid'),
    );
  };

  const close = () => {
    if (typeof onClose === 'function') onClose();
    setSelectedOutfitId('');
    setSelectedEntryId('');
  };

  return (
    <section className="rounded-2xl border border-border p-3 space-y-2" aria-label={t('fashionUi.runnerLabel')} aria-busy={loading}>
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-xs font-medium">{t('fashionUi.tryOn')}</p>
          <p className="text-[10px] text-muted-foreground">{t('fashionUi.tryOnHint')}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" className="h-8" onClick={load} disabled={selectionLocked || disabled} aria-label={t('fashionUi.reloadOutfits')}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {voiceQuery?.query && (
        <div role="status" aria-live="polite" className="rounded-md border p-2 text-xs space-y-1">
          <p>{t('fashionUi.voiceQuery', { query: voiceQuery.query })}</p>
          <p>{plural('fashionUi.voiceQueryMatches', voiceMatches.length)}</p>
          <p>{voiceMatches.length === 1
            ? t('fashionUi.voiceQuerySingleMatch', {
              garmentName: voiceMatches[0].garmentName,
              outfitName: voiceMatches[0].outfitName,
            })
            : voiceMatches.length === 0
              ? t('fashionUi.voiceQueryNoMatches')
              : t('fashionUi.voiceQueryManualChoice')}</p>
          <p>{t('fashionUi.voiceQueryNoAutoRun')}</p>
        </div>
      )}
      {loading && <p className="text-[10px] text-muted-foreground" role="status" aria-live="polite">{t('common.loading')}</p>}

      {!hostActive && (
        <div className="grid grid-cols-2 gap-1.5">
          <select
            value={selectedOutfitId}
            onChange={(event) => { setSelectedOutfitId(event.target.value); setSelectedEntryId(''); setError(''); }}
            disabled={selectionLocked || disabled}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            aria-label={t('fashionUi.outfitForTryon')}
          >
            <option value="">{t('fashionUi.chooseOutfit')}</option>
            {outfits.map((outfit) => <option key={outfit.id} value={outfit.id}>{outfit.name}</option>)}
          </select>
          <select
            value={selectedEntryId}
            onChange={(event) => { setSelectedEntryId(event.target.value); setError(''); }}
            disabled={selectionLocked || disabled || !selectedOutfit}
            className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
            aria-label={t('fashionUi.garmentForTryon')}
          >
            <option value="">{t('fashionUi.chooseGarment')}</option>
            {(selectedOutfit?.entries || []).map((entry) => {
              const garment = garmentById.get(entry.garmentId);
              return (
                <option key={entry.entryId} value={entry.entryId} disabled={entry.referenceReadiness !== 'READY'}>
                  {garment?.name || entry.garmentId}{entry.referenceReadiness === 'READY' ? '' : ` · ${t('fashionUi.entryNotReady')}`}
                </option>
              );
            })}
          </select>
        </div>
      )}

      {hostActive && selectedOutfit && selectedEntry && (
        <p className="text-[11px] text-muted-foreground" role="status">
          {t('fashionUi.locked', { name: selectedOutfit.name })} · {selectedGarment?.name || selectedEntry.garmentId}
        </p>
      )}

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      {selectedEntry && (
        <CanonicalTryOnProductControls
          garmentLabel={selectedGarment?.name || selectedEntry.garmentId}
          result={result}
          host={host}
          busy={busy}
          disabled={disabled || loading}
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
