import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Archive, Camera, Heart, Images, Loader2, Plus, RefreshCw, RotateCcw, Shirt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';
import {
  CanonicalWardrobeAppendOutcomeUncertainError,
  CanonicalWardrobeAppendReloadError,
  CanonicalWardrobePartialCreateError,
  createCanonicalWardrobeViewModel,
} from '@/application/fashion/canonicalWardrobeViewModel';
import { getCategory } from '@/lib/fashion/garmentCategories';
import { filterCanonicalWardrobeVoice } from '@/application/voice/filterCanonicalWardrobeVoice';
import AddGarmentDialog from './AddGarmentDialog';
import CanonicalCollectionsView from './CanonicalCollectionsView';
import GarmentCaptureDialog from './GarmentCaptureDialog';

function captureLabel(assessment, t) {
  if (assessment?.cardinalComplete && assessment?.technicalResolution?.status === 'ADEQUATE') return t('fashionUi.captureReady');
  const coverage = Number(assessment?.cardinalCoverageScore);
  if (Number.isFinite(coverage)) return t('fashionUi.captureCoverage', { count: Math.round(coverage * 100) });
  return t('fashionUi.captureUnknown');
}

function WardrobeCard({ item, busy, onFavorite, onArchive, onRestore, onCapture }) {
  const { t, plural } = useTranslation();
  const category = getCategory(item.category);
  return (
    <article className="rounded-xl border border-border/70 bg-card overflow-hidden" aria-busy={busy || undefined}>
      <div className="aspect-[4/3] bg-secondary/40 flex items-center justify-center overflow-hidden">
        <img src={item.imageUrl} alt={item.name} className="h-full w-full object-contain" />
      </div>
      <div className="p-2.5 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{item.name}</p>
            <p className="text-[11px] text-muted-foreground capitalize">
              {t(`fashionUi.categories.${category?.id || 'other'}`)} · {t(`fashionUi.seasons.${item.season}`)}
              {item.material ? ` · ${item.material}` : ''}
            </p>
          </div>
          <button
            type="button"
            className="p-1 rounded-md hover:bg-accent disabled:opacity-50"
            aria-label={item.favorite ? t('fashionUi.removeFavorite', { name: item.name }) : t('fashionUi.addFavorite', { name: item.name })}
            aria-pressed={item.favorite}
            disabled={busy}
            onClick={() => onFavorite(item, !item.favorite)}
          >
            <Heart className={`h-4 w-4 ${item.favorite ? 'fill-current' : ''}`} />
          </button>
        </div>

        <div className="flex flex-wrap gap-1 text-[10px] text-muted-foreground">
          <span className="rounded-full bg-secondary px-2 py-0.5">{item.representationTier}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 flex items-center gap-1">
            <Images className="h-3 w-3" /> {plural('fashionUi.views', item.viewCount)}
          </span>
          <span className="rounded-full bg-secondary px-2 py-0.5">{captureLabel(item.captureAssessment, t)}</span>
        </div>

        {item.tags.length > 0 && (
          <p className="text-[10px] text-muted-foreground truncate">{item.tags.map((tag) => `#${tag}`).join(' ')}</p>
        )}

        <div className="flex justify-end gap-1">
          {item.status === 'ACTIVE' && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onCapture(item)}>
              <Camera className="h-3.5 w-3.5 mr-1" /> {t('fashionUi.addView')}
            </Button>
          )}
          {item.status === 'ACTIVE' ? (
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onArchive(item)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Archive className="h-3.5 w-3.5 mr-1" />}
              {t('fashionUi.archive')}
            </Button>
          ) : (
            <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => onRestore(item)}>
              {busy ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5 mr-1" />}
              {t('fashionUi.restore')}
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

export default function FashionPanel({ voiceQuery = null }) {
  const { t } = useTranslation();
  const wardrobe = useMemo(() => createCanonicalWardrobeViewModel({
    garments: coreClient.fashion.garments,
    wardrobe: coreClient.fashion.wardrobe,
  }), []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [captureItem, setCaptureItem] = useState(null);
  const [busyId, setBusyId] = useState('');
  const visibleItems=useMemo(
    ()=>filterCanonicalWardrobeVoice(items,voiceQuery),[items,voiceQuery],
  );

  const reload = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError('');
    }
    try {
      const next = await wardrobe.load();
      setItems(next);
      return next;
    } catch (cause) {
      if (!quiet) setError(cause?.message || { key: 'fashionUi.loadFailed' });
      throw cause;
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [wardrobe]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    wardrobe.load().then(
      (next) => { if (active) { setItems(next); setError(''); setLoading(false); } },
      (cause) => { if (active) { setError(cause?.message || { key: 'fashionUi.loadFailed' }); setLoading(false); } },
    );
    return () => { active = false; };
  }, [wardrobe]);

  const replaceItem = useCallback((next) => {
    setItems((current) => current.map((item) => item.id === next.id ? next : item));
  }, []);

  const createGarment = useCallback(async (intent) => {
    try {
      const created = await wardrobe.create(intent);
      setItems((current) => [created, ...current.filter((item) => item.id !== created.id)]);
    } catch (cause) {
      if (cause instanceof CanonicalWardrobePartialCreateError || cause?.code === 'GARMENT_CREATED_METADATA_PENDING') {
        try { await reload({ quiet: true }); } catch { /* preserve the original partial-create error */ }
      }
      throw cause;
    }
  }, [reload, wardrobe]);

  const appendGarmentView = useCallback(async (item, intent) => {
    setBusyId(item.id);
    setError('');
    try {
      const next = await wardrobe.appendView(item, intent);
      replaceItem(next);
      return next;
    } catch (cause) {
      const outcomeUncertain = cause instanceof CanonicalWardrobeAppendOutcomeUncertainError
        || cause?.code === 'GARMENT_VIEW_APPEND_OUTCOME_UNCERTAIN';
      const committedReloadPending = cause instanceof CanonicalWardrobeAppendReloadError
        || cause?.code === 'GARMENT_VIEW_APPENDED_RELOAD_PENDING';
      if (outcomeUncertain || committedReloadPending) {
        if (cause?.recoveredItem) replaceItem(cause.recoveredItem);
        else {
          try { await reload({ quiet: true }); } catch { /* preserve the append recovery status */ }
        }
        setCaptureItem(null);
        setError(cause?.message || { key: 'fashionUi.appendOutcomeUncertain' });
      }
      throw cause;
    } finally {
      setBusyId('');
    }
  }, [reload, replaceItem, wardrobe]);

  const runMutation = useCallback(async (item, mutate) => {
    setBusyId(item.id);
    setError('');
    try {
      replaceItem(await mutate(item));
    } catch (cause) {
      const message = cause?.message || { key: 'fashionUi.mutationConflict' };
      try { await reload({ quiet: true }); } catch { /* preserve the original action failure */ }
      setError(message);
    } finally {
      setBusyId('');
    }
  }, [reload, replaceItem]);

  return (
    <section className="rounded-2xl border border-border p-3 space-y-3" aria-label={t('fashionUi.panelLabel')}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Shirt className="w-3.5 h-3.5 text-primary" /> {t('fashionUi.wardrobe')}
        </p>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="h-8" onClick={() => reload().catch(() => undefined)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="sr-only">{t('fashionUi.reload')}</span>
          </Button>
          <Button size="sm" className="h-8" onClick={() => setAddOpen(true)}>
            <Plus className="h-3.5 w-3.5 mr-1" /> {t('fashionUi.addGarment')}
          </Button>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        {t('fashionUi.notice')}
      </p>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs text-destructive" role="alert">
          {typeof error === 'string' ? error : t(error.key)}
        </div>
      )}

      {voiceQuery?.query&&(
        <div role="status" className="text-xs rounded-md border px-2 py-2">
          {t('fashionUi.voiceSearchSummary', { query: voiceQuery.query, count: visibleItems.length, total: items.length })}
        </div>
      )}
      <CanonicalCollectionsView garments={items} />

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('fashionUi.loading')}
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="rounded-xl bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
          {voiceQuery?.query && items.length>0
            ? t('fashionUi.voiceSearchNoMatches')
            : t('fashionUi.empty')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {visibleItems.map((item) => (
            <WardrobeCard
              key={item.id}
              item={item}
              busy={busyId === item.id}
              onCapture={setCaptureItem}
              onFavorite={(current, favorite) => runMutation(current, (value) => wardrobe.setFavorite(value, favorite))}
              onArchive={(current) => runMutation(current, wardrobe.archive)}
              onRestore={(current) => runMutation(current, wardrobe.restore)}
            />
          ))}
        </div>
      )}

      <AddGarmentDialog open={addOpen} onClose={() => setAddOpen(false)} onCreate={createGarment} />
      <GarmentCaptureDialog
        open={Boolean(captureItem)}
        item={captureItem}
        onClose={() => setCaptureItem(null)}
        onAppend={appendGarmentView}
      />
    </section>
  );
}
