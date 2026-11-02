import React, { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Check, Trash2, RotateCcw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAdaptiveGestures } from '@/components/adaptive/AdaptiveGestures';
import { canCompareOperationAligned, canComparePixelsAligned, nativeInspectionCanvasSize } from './compareGeometryPolicy';
import { reviewCandidateIdentity, canAcceptReviewedCandidate } from '@/application/editor/ai-first/resultReviewGate';

const FASHION_REVIEW = Object.freeze([
  ['fit', 'editControls.fashionReviewFit'],
  ['occlusion', 'editControls.fashionReviewOcclusion'],
  ['texture', 'editControls.fashionReviewTexture'],
  ['identity', 'editControls.fashionReviewIdentity'],
]);
const EMPTY_REVIEW = Object.freeze({ fit: false, occlusion: false, texture: false, identity: false });

// A read-only inspector for an unaccepted candidate. The Core-owned Accept,
// Discard, and Retry callbacks remain the ONLY controls changing Project state.
// Split view is admitted only after both images have identical real geometry;
// cropping/rotation/failed image delivery must never masquerade as aligned pixels.
export default function ResultCompare({ beforeUrl, result, candidateOperation, kind = null, editScope = null, onAccept, onDiscard, onRetry, busy }) {
  const { t } = useTranslation();
  const [view, setView] = useState('after');
  const [splitPosition, setSplitPosition] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [geometry, setGeometry] = useState('loading');
  const [naturalSizes, setNaturalSizes] = useState({ before: null, after: null });
  const afterUrl = result?.preview_url || result?.image_url || '';
  const [fashionReview, setFashionReview] = useState(EMPTY_REVIEW);
  const [scopedReview, setScopedReview] = useState(false);
  const [acknowledgedIdentity, setAcknowledgedIdentity] = useState(null);
  const [loaded, setLoaded] = useState({ before: null, after: null });
  const [failed, setFailed] = useState({ before: null, after: null });
  const fashion = kind === 'FASHION_TRYON' || kind === 'VIRTUAL_TRY_ON';
  const scopedGeneration = kind === 'AI_SCOPED_GENERATION';
  const allFashionAccepted = !fashion || Object.values(fashionReview).every(Boolean);
  const identity = reviewCandidateIdentity({
    beforeUrl, afterUrl, finalArtifactId: result?.finalArtifactId,
    executionId: result?.executionId, kind, scope: editScope,
  });
  const needsHumanReview = scopedGeneration || fashion;
  const reviewImagesReady = loaded.before === identity && loaded.after === identity
    && failed.before !== identity && failed.after !== identity;
  const markLoaded = role => {
    setLoaded(previous => ({ ...previous, [role]: identity }));
    setFailed(previous => ({ ...previous, [role]: null }));
  };
  const markFailed = role => {
    setFailed(previous => ({ ...previous, [role]: identity }));
    setLoaded(previous => ({ ...previous, [role]: null }));
  };
  const reviewBlocked = needsHumanReview && !canAcceptReviewedCandidate({
    identity, acknowledgedIdentity,
    afterLoadedIdentity: loaded.after, beforeLoadedIdentity: loaded.before,
    afterErrorIdentity: failed.after, beforeErrorIdentity: failed.before,
    requiresBefore: scopedGeneration || fashion,
    requiresReview: needsHumanReview,
    reviewComplete: scopedGeneration ? scopedReview : allFashionAccepted,
    busy,
  });
  useEffect(() => {
    setFashionReview(EMPTY_REVIEW);
    setScopedReview(false);
    setAcknowledgedIdentity(identity);
  }, [identity]);
  const gestures = useAdaptiveGestures({
    onSwipeLeft: () => setView('after'),
    onSwipeRight: () => setView('before'),
  });

  useEffect(() => {
    setGeometry('loading');
    setNaturalSizes({ before: null, after: null });
    setView('after');
    setZoom(1);
    setSplitPosition(50);
    if (!beforeUrl || !afterUrl) {
      setGeometry('unavailable');
      return undefined;
    }
    let alive = true;
    let beforeSize = null;
    let afterSize = null;
    const before = new Image();
    const after = new Image();
    const resolve = () => {
      if (!alive || !beforeSize || !afterSize) return;
      setGeometry(
        canComparePixelsAligned(beforeSize, afterSize)
          ? 'aligned' : 'different',
      );
    };
    before.onload = () => {
      beforeSize = { width: before.naturalWidth, height: before.naturalHeight };
      if (alive) setNaturalSizes((current) => ({ ...current, before: beforeSize }));
      resolve();
    };
    after.onload = () => {
      afterSize = { width: after.naturalWidth, height: after.naturalHeight };
      if (alive) setNaturalSizes((current) => ({ ...current, after: afterSize }));
      resolve();
    };
    const unavailable = () => { if (alive) setGeometry('unavailable'); };
    before.onerror = unavailable;
    after.onerror = unavailable;
    before.src = beforeUrl;
    after.src = afterUrl;
    return () => {
      alive = false;
      before.onload = null;
      after.onload = null;
      before.onerror = null;
      after.onerror = null;
      before.src = '';
      after.src = '';
    };
  }, [beforeUrl, afterUrl]);

  const splitAllowed = geometry === 'aligned' && canCompareOperationAligned(candidateOperation);
  const mode = view === 'split' && !splitAllowed ? 'after' : view;
  // At 100%, one decoded source pixel occupies one CSS pixel (200%=2 CSS px).
  // A fixed-height object-contain container would otherwise pretend to be 100%
  // while silently reducing detail on tall/large photographs.
  const naturalSize = mode === 'before' ? naturalSizes.before : naturalSizes.after;
  const inspectedCanvas = nativeInspectionCanvasSize(naturalSize, zoom)
    || { width: '100%', height: 340 };
  const executionLabel = result?.provider || t('editControls.localCorePreview');
  const durationLabel = Number.isFinite(result?.generation_time_ms) && result.generation_time_ms > 0
    ? ` · ${(result.generation_time_ms / 1000).toFixed(1)}${t('editControls.secondsAbbrev')}` : '';

  return (
    <section className="border border-border/60 rounded-2xl p-3 space-y-3" aria-label={t('editControls.reviewPendingAria')}>
      <header className="mb-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">{t('editControls.almost')}</p>
        <h2 className="mt-1 text-xl font-semibold">{t('editControls.review')}</h2>
        <p role="status" className="text-sm text-muted-foreground">{t('editControls.reviewHint')}</p>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex rounded-lg border border-border overflow-hidden text-xs" role="group" aria-label={t('editControls.compareMode')}>
          <button type="button" aria-pressed={mode === 'before'} onClick={() => setView('before')}
            className={`px-3 py-1.5 ${mode === 'before' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t('editControls.before')}</button>
          <button type="button" aria-pressed={mode === 'after'} onClick={() => setView('after')}
            className={`px-3 py-1.5 ${mode === 'after' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t('editControls.after')}</button>
          <button type="button" aria-pressed={mode === 'split'} disabled={!splitAllowed} onClick={() => setView('split')}
            className={`px-3 py-1.5 disabled:opacity-40 ${mode === 'split' ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{t('editControls.split')}</button>
        </div>
        <span className="text-[11px] text-muted-foreground">
          {executionLabel}{durationLabel}
        </span>
      </div>

      {(naturalSizes.before || naturalSizes.after) && (
        <p className="text-xs text-muted-foreground" role="status">
          {t('editControls.source')}: {naturalSizes.before ? `${naturalSizes.before.width}×${naturalSizes.before.height}` : t('editControls.unavailable')}
          {' → '}
          {t('editControls.candidate')}: {naturalSizes.after ? `${naturalSizes.after.width}×${naturalSizes.after.height}` : t('editControls.unavailable')} {t('editControls.pixels')}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <label htmlFor="editor-preview-zoom">{t('editControls.zoom')}</label>
          <select id="editor-preview-zoom" aria-label={t('editControls.zoom')} value={zoom} disabled={!naturalSize}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="rounded-md border border-border bg-background px-2 py-1">
            <option value={1}>100%</option>
            <option value={2}>200%</option>
          </select>
        </div>
        {mode === 'split' && (
          <label className="flex flex-1 items-center gap-2 min-w-[160px] max-w-xs">
            {t('editControls.boundary')}
            <input aria-label={t('editControls.boundary')} type="range" min="0" max="100" step="1"
              value={splitPosition} onChange={(event) => setSplitPosition(Number(event.target.value))}
              className="flex-1 accent-primary" />
            <span className="tabular-nums">{splitPosition}%</span>
          </label>
        )}
      </div>

      {geometry === 'aligned' && !canCompareOperationAligned(candidateOperation) && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('editControls.noSplit')}
        </p>
      )}
      {geometry === 'different' && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('editControls.different')}
        </p>
      )}
      {geometry === 'unavailable' && (
        <p role="status" className="text-xs text-muted-foreground">
          {t('editControls.sizeUnknown')}
        </p>
      )}

      <div className="overflow-auto rounded-xl bg-muted max-h-[420px]" {...gestures.handlers}>
        <div className="relative" style={inspectedCanvas}>
          {mode === 'split' ? (
            <>
              <img src={afterUrl} alt={t('editControls.rightSplit')} draggable={false}
                onLoad={()=>markLoaded('after')} onError={()=>markFailed('after')}
                className="absolute inset-0 h-full w-full object-fill" />
              <img src={beforeUrl} alt={t('editControls.leftSplit')} draggable={false}
                onLoad={()=>markLoaded('before')} onError={()=>markFailed('before')}
                className="absolute inset-0 h-full w-full object-fill"
                style={{ clipPath: `inset(0 ${100 - splitPosition}% 0 0)` }} />
              <div aria-hidden="true" className="absolute top-0 bottom-0 w-px bg-primary pointer-events-none"
                style={{ left: `${splitPosition}%` }} />
            </>
          ) : (
            <img src={mode === 'before' ? beforeUrl : afterUrl}
              onLoad={()=>markLoaded(mode === 'before' ? 'before' : 'after')}
              onError={()=>markFailed(mode === 'before' ? 'before' : 'after')}
              alt={mode === 'before' ? t('editControls.originalImage') : t('editControls.editedImage')}
              draggable={false} className="h-full w-full object-fill" />
          )}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t('editControls.qualityHint')}
      </p>
      {(failed.before === identity || failed.after === identity) && needsHumanReview && (
        <p role="alert" className="text-sm text-destructive">{t('editControls.reviewImageLoadFailed')}</p>
      )}
      {needsHumanReview && !reviewImagesReady && (
        <p role="status" className="text-xs text-muted-foreground">{t('editControls.reviewBothImagesBeforeAccept')}</p>
      )}
      {scopedGeneration && (
        <label className="flex gap-2 text-sm rounded-xl border p-3" aria-label={t('editControls.scopedReviewLabel')}>
          <input type="checkbox" disabled={busy || !reviewImagesReady}
            checked={scopedReview} onChange={event=>setScopedReview(event.target.checked)}/>
          <span>{t(editScope === 'MASKED' ? 'editControls.scopedMaskedReview' : 'editControls.scopedWholeImageReview')} {t('editControls.manualReviewDisclaimer')}</span>
        </label>
      )}
      {fashion && (
        <section className="rounded-xl border p-3 space-y-2" aria-label={t('editControls.fashionReviewAria')}>
          <p className="font-medium text-sm">{t('editControls.fashionReviewRequired')}</p>
          {FASHION_REVIEW.map(([key,labelKey])=>(
            <label key={key} className="flex gap-2 items-start text-sm">
              <input type="checkbox" disabled={busy || !reviewImagesReady}
                checked={fashionReview[key]}
                onChange={event=>setFashionReview(previous=>({...previous,[key]:event.target.checked}))}/>
              <span>{t(labelKey)}</span>
            </label>
          ))}
        </section>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={onAccept} disabled={busy || reviewBlocked} className="flex-1 min-w-[100px]">
          {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />} {t('editControls.accept')}
        </Button>
        {onRetry && kind !== 'VIRTUAL_TRY_ON' && <Button variant="outline" onClick={onRetry} disabled={busy} className="rounded-xl">
          <RotateCcw className="w-4 h-4 mr-2" /> {t('editControls.retry')}
        </Button>}
        <Button variant="outline" onClick={onDiscard} disabled={busy} className="rounded-xl text-destructive hover:text-destructive">
          <Trash2 className="w-4 h-4 mr-2" /> {t('editControls.discard')}
        </Button>
      </div>
    </section>
  );
}
