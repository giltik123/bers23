import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';
import AssetCard from '@/components/assets/AssetCard';
import AssetDetails from '@/components/assets/AssetDetails';
import {
  createLatestAssetLoadGate, projectAsset, projectConfirmedFavorite, selectionAfterFavorite,
} from '@/application/assets/projectAssetIndex';

export default function AssetLibrary() {
  const { t } = useTranslation();
  const [assets, setAssets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [text, setText] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const favoriteInFlight = useRef(false);
  const loadGate = useRef(null);
  if (!loadGate.current) loadGate.current = createLatestAssetLoadGate();

  const load = useCallback(async () => {
    const requestId = loadGate.current.start();
    setLoading(true);
    setError('');
    try {
      const projects = await coreClient.projects.list();
      if (!loadGate.current.isCurrent(requestId)) return;
      if (!Array.isArray(projects)) throw new Error('Invalid Core Project list response');
      setAssets(projects.filter((project) => project.current_image_artifact_id).map(projectAsset));
    } catch (loadError) {
      if (!loadGate.current.isCurrent(requestId)) return;
      setAssets([]);
      setError(loadError?.message || t('assetUi.loadFailed'));
    } finally {
      if (loadGate.current.isCurrent(requestId)) setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
    return () => loadGate.current.invalidate();
  }, [load]);

  const visible = useMemo(() => {
    const query = text.trim().toLowerCase();
    return assets.filter((asset) => {
      if (favoritesOnly && !asset.favorite) return false;
      if (!query) return true;
      return [asset.name, asset.type, ...(asset.tags || [])].join(' ').toLowerCase().includes(query);
    });
  }, [assets, favoritesOnly, text]);

  const selected = assets.find((asset) => asset.id === selectedId) || null;

  const toggleFavorite = async (asset) => {
    // A second click must not dispatch another Core mutation before the first resolves.
    if (favoriteInFlight.current || loading || error) return;
    favoriteInFlight.current = true;
    setFavoriteBusy(true);
    setActionError('');
    try {
      const project = await coreClient.projects.update(asset.project_id, { favorite: !asset.favorite });
      const updated = projectConfirmedFavorite(asset, project);
      setAssets((items) => items.map((item) => item.project_id === updated.project_id ? updated : item));
      // Do not steal the user's newer selection while the Core request was in flight.
      setSelectedId((current) => selectionAfterFavorite(current, asset.id, updated.id));
    } catch (updateError) {
      // A failed request may have committed on the server: reconcile before another edit.
      await load();
      setActionError(updateError?.message || t('assetUi.loadFailed'));
    } finally {
      favoriteInFlight.current = false;
      setFavoriteBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">{t('assetUi.title')}</h1>
        <p className="text-sm text-muted-foreground">{t('assetUi.subtitle')}</p>
      </div>

      <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 text-sm text-muted-foreground" role="status">
        {t('assetUi.notice')}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder={t('assetUi.search')} className="pl-9" />
        </div>
        <Button variant={favoritesOnly ? 'default' : 'outline'} onClick={() => setFavoritesOnly((value) => !value)}>{t('assetUi.favorites')}</Button>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive" role="alert">{error} <button type="button" className="underline" disabled={favoriteBusy} onClick={() => void load()}>{t('common.retry')}</button></div>}
      {actionError && <div className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive" role="alert">{actionError} <button type="button" className="underline" disabled={favoriteBusy} onClick={() => { setActionError(''); void load(); }}>{t('common.retry')}</button></div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]" aria-busy={loading || favoriteBusy}>
        <main>
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('assetUi.loading')}</p>
          ) : visible.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((asset) => <AssetCard key={asset.id} asset={asset} selected={selectedId === asset.id} onSelect={(value) => setSelectedId(value.id)} onFavorite={toggleFavorite} />)}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">{t('assetUi.empty')}</p>
          )}
        </main>

        <div className="space-y-2">
          <AssetDetails asset={selected} history={[]} onAddToCollection={null} />
          {selected && <Button asChild className="w-full" variant="outline"><Link to={`/editor?id=${encodeURIComponent(selected.project_id)}`}>{t('assetUi.open')}</Link></Button>}
        </div>
      </div>
    </div>
  );
}
