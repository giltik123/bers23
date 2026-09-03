import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, FolderPlus, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { coreClient } from '@/api/coreClient';
import {
  createCanonicalCollectionViewModel,
  sortCollections,
} from '@/application/fashion/canonicalCollectionViewModel';

function replaceCollection(current, next) {
  return sortCollections([...current.filter((item) => item.id !== next.id), next]);
}

export default function CanonicalCollectionsView({ garments }) {
  const model = useMemo(
    () => createCanonicalCollectionViewModel({ collections: coreClient.fashion.collections }),
    [],
  );
  const [collections, setCollections] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [addGarmentId, setAddGarmentId] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmRemoveId, setConfirmRemoveId] = useState('');

  const applySnapshot = useCallback((next) => {
    setCollections(next);
    setSelectedId((current) => (current && next.some((item) => item.id === current) ? current : next[0]?.id || ''));
  }, []);

  const reload = useCallback(async () => {
    setBusy('load');
    setError('');
    try {
      applySnapshot(await model.load());
    } catch (cause) {
      setError(cause?.message || 'Collections could not be loaded.');
    } finally {
      setBusy('');
    }
  }, [applySnapshot, model]);

  const reconcileQuietly = useCallback(async () => {
    try { applySnapshot(await model.load()); } catch { /* preserve the originating action error */ }
  }, [applySnapshot, model]);

  useEffect(() => { reload(); }, [reload]);

  const selected = collections.find((item) => item.id === selectedId) || null;
  const garmentById = useMemo(() => new Map((garments || []).map((item) => [item.id, item])), [garments]);
  const availableToAdd = selected
    ? (garments || []).filter((item) => item.status === 'ACTIVE' && !selected.garmentIds.includes(item.id))
    : [];

  useEffect(() => {
    if (!availableToAdd.some((item) => item.id === addGarmentId)) setAddGarmentId('');
  }, [addGarmentId, availableToAdd]);

  const create = async (event) => {
    event.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy('create');
    setError('');
    try {
      const created = await model.create({ name: newName, description: '' });
      setCollections((current) => replaceCollection(current, created));
      setSelectedId(created.id);
      setNewName('');
    } catch (cause) {
      setError(cause?.message || 'Collection could not be created.');
    } finally {
      setBusy('');
    }
  };

  const mutateSelected = async (key, action) => {
    if (!selected || busy) return false;
    setBusy(key);
    setError('');
    try {
      const next = await action(selected);
      setCollections((current) => replaceCollection(current, next));
      return true;
    } catch (cause) {
      const message = cause?.message || 'Collection changed elsewhere. Reload and try again.';
      await reconcileQuietly();
      setError(message);
      return false;
    } finally {
      setBusy('');
    }
  };

  const removeCollection = async () => {
    if (!selected || confirmRemoveId !== selected.id || busy) {
      setConfirmRemoveId(selected?.id || '');
      return;
    }
    setBusy('remove-collection');
    setError('');
    try {
      const removedId = await model.remove(selected);
      const next = collections.filter((item) => item.id !== removedId);
      setCollections(next);
      setSelectedId(next[0]?.id || '');
      setConfirmRemoveId('');
    } catch (cause) {
      const message = cause?.message || 'Collection could not be removed.';
      await reconcileQuietly();
      setError(message);
    } finally {
      setBusy('');
    }
  };

  const moveGarment = async (garmentId, targetId) => {
    if (!selected || !targetId || busy) return;
    const target = collections.find((item) => item.id === targetId);
    if (!target) return;
    setBusy(`move:${garmentId}`);
    setError('');
    try {
      const moved = await model.moveGarment(selected, target, garmentId);
      setCollections((current) => {
        let next = replaceCollection(current, moved.source);
        next = replaceCollection(next, moved.target);
        return next;
      });
    } catch (cause) {
      const message = cause?.message || 'Garment move conflicted with a newer collection revision.';
      await reconcileQuietly();
      setError(message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="rounded-xl border border-border/70 bg-secondary/20 p-2.5 space-y-2" aria-label="Canonical garment collections">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium">Collections</p>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={reload} disabled={Boolean(busy)}>
          {busy === 'load' ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : null}
          Reload
        </Button>
      </div>

      <form className="flex gap-1.5" onSubmit={create}>
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New collection"
          maxLength={100}
          disabled={Boolean(busy)}
        />
        <Button type="submit" size="sm" disabled={!newName.trim() || Boolean(busy)}>
          <FolderPlus className="h-3.5 w-3.5 mr-1" /> Create
        </Button>
      </form>

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}

      {collections.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No collections yet.</p>
      ) : (
        <div className="flex flex-wrap gap-1">
          {collections.map((collection) => (
            <button
              type="button"
              key={collection.id}
              onClick={() => { setSelectedId(collection.id); setConfirmRemoveId(''); }}
              className={`rounded-full border px-2 py-1 text-[11px] ${selectedId === collection.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
            >
              {collection.name} ({collection.garmentIds.length})
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="space-y-2 border-t border-border/60 pt-2">
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">{selected.name}</p>
              {selected.description && <p className="text-[10px] text-muted-foreground truncate">{selected.description}</p>}
            </div>
            <Button
              variant={confirmRemoveId === selected.id ? 'destructive' : 'ghost'}
              size="sm"
              className="h-7 text-xs"
              onClick={removeCollection}
              disabled={Boolean(busy)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" />
              {confirmRemoveId === selected.id ? 'Confirm delete' : 'Delete'}
            </Button>
          </div>

          <div className="flex gap-1.5">
            <select
              className="h-8 flex-1 rounded-md border border-input bg-transparent px-2 text-xs"
              value={addGarmentId}
              onChange={(event) => setAddGarmentId(event.target.value)}
              disabled={Boolean(busy) || availableToAdd.length === 0}
            >
              <option value="">Add garment…</option>
              {availableToAdd.map((garment) => <option key={garment.id} value={garment.id}>{garment.name}</option>)}
            </select>
            <Button
              size="sm"
              className="h-8"
              disabled={!addGarmentId || Boolean(busy)}
              onClick={() => mutateSelected(
                `add:${addGarmentId}`,
                (collection) => model.addGarment(collection, addGarmentId),
              ).then((ok) => { if (ok) setAddGarmentId(''); })}
            >
              Add
            </Button>
          </div>

          {selected.garmentIds.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">This collection is empty.</p>
          ) : (
            <div className="space-y-1">
              {selected.garmentIds.map((garmentId) => {
                const garment = garmentById.get(garmentId);
                const targets = collections.filter((item) => item.id !== selected.id);
                return (
                  <div key={garmentId} className="flex items-center gap-1.5 rounded-lg bg-background/70 px-2 py-1.5">
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-medium truncate">{garment?.name || 'Unavailable garment reference'}</p>
                      {!garment && <p className="text-[9px] text-muted-foreground truncate">{garmentId}</p>}
                    </div>
                    {targets.length > 0 && (
                      <select
                        aria-label={`Move ${garment?.name || garmentId}`}
                        className="h-7 max-w-28 rounded-md border border-input bg-transparent px-1 text-[10px]"
                        defaultValue=""
                        disabled={Boolean(busy)}
                        onChange={(event) => {
                          const targetId = event.target.value;
                          event.target.value = '';
                          moveGarment(garmentId, targetId);
                        }}
                      >
                        <option value="">Move to…</option>
                        {targets.map((target) => <option key={target.id} value={target.id}>{target.name}</option>)}
                      </select>
                    )}
                    <button
                      type="button"
                      className="rounded-md p-1 hover:bg-accent disabled:opacity-50"
                      aria-label={`Remove ${garment?.name || garmentId} from ${selected.name}`}
                      disabled={Boolean(busy)}
                      onClick={() => mutateSelected(`remove:${garmentId}`, (collection) => model.removeGarment(collection, garmentId))}
                    >
                      {busy === `move:${garmentId}` ? <ArrowRight className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
