import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { coreClient } from '@/api/coreClient';
import AssetCard from '@/components/assets/AssetCard';
import AssetDetails from '@/components/assets/AssetDetails';

function projectAsset(project) {
  const artifactId = project.current_image_artifact_id;
  return Object.freeze({
    id: `project:${project.id}:${artifactId}`,
    asset_key: `project:${project.id}:${artifactId}`,
    canonical_artifact_id: artifactId,
    project_id: project.id,
    type: 'project',
    name: project.name || 'Untitled project',
    thumbnail: project.thumbnail_url || project.current_image_url,
    preview: project.current_image_url,
    favorite: Boolean(project.favorite),
    tags: Object.freeze(['project', 'canonical artifact']),
    relations: Object.freeze([]),
  });
}

export default function AssetLibrary() {
  const [assets, setAssets] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [text, setText] = useState('');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const projects = await coreClient.projects.list();
      setAssets(projects.filter((project) => project.current_image_artifact_id).map(projectAsset));
    } catch (loadError) {
      setAssets([]);
      setError(loadError?.message || 'Unable to load canonical project assets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

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
    const project = await coreClient.projects.update(asset.project_id, { favorite: !asset.favorite });
    const updated = projectAsset(project);
    setAssets((items) => items.map((item) => item.project_id === updated.project_id ? updated : item));
    setSelectedId(updated.id);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 py-6">
      <div>
        <h1 className="text-2xl font-semibold">Asset Library</h1>
        <p className="text-sm text-muted-foreground">Canonical Project artifacts available for safe reuse and navigation.</p>
      </div>

      <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 text-sm text-muted-foreground" role="status">
        Managed uploads, garments, outfits and collections are not connected to the production Asset authority yet. This view only indexes canonical Project artifacts.
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input value={text} onChange={(event) => setText(event.target.value)} placeholder="Search project assets…" className="pl-9" />
        </div>
        <Button variant={favoritesOnly ? 'default' : 'outline'} onClick={() => setFavoritesOnly((value) => !value)}>Favorites</Button>
      </div>

      {error && <div className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{error} <button className="underline" onClick={() => void load()}>Retry</button></div>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]">
        <main>
          {loading ? (
            <p className="py-12 text-center text-sm text-muted-foreground">Loading canonical assets…</p>
          ) : visible.length ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
              {visible.map((asset) => <AssetCard key={asset.id} asset={asset} selected={selectedId === asset.id} onSelect={(value) => setSelectedId(value.id)} onFavorite={toggleFavorite} />)}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-muted-foreground">No canonical Project assets match these filters.</p>
          )}
        </main>

        <div className="space-y-2">
          <AssetDetails asset={selected} history={[]} onAddToCollection={null} />
          {selected && <Button asChild className="w-full" variant="outline"><Link to={`/editor?id=${encodeURIComponent(selected.project_id)}`}>Open project</Link></Button>}
        </div>
      </div>
    </div>
  );
}
