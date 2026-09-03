import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Heart, Layers, Loader2, Plus, RefreshCw, RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { coreClient } from '@/api/coreClient';
import {
  createCanonicalOutfitViewModel,
  sortOutfits,
} from '@/application/fashion/canonicalOutfitViewModel';

const LAYER_ROLES = Object.freeze([
  'BASE_TOP',
  'MID_TOP',
  'OUTER_TOP',
  'FULL_BODY',
  'BOTTOM',
  'FOOTWEAR',
  'ACCESSORY',
]);

function replaceOutfit(current, next) {
  return sortOutfits([...current.filter((item) => item.id !== next.id), next]);
}

function readinessLabel(value) {
  return String(value || '').replaceAll('_', ' ').toLowerCase();
}

export default function OutfitPanel() {
  const model = useMemo(() => createCanonicalOutfitViewModel({
    outfits: coreClient.fashion.outfits,
    wardrobe: coreClient.fashion.wardrobe,
  }), []);
  const [outfits, setOutfits] = useState([]);
  const [garments, setGarments] = useState([]);
  const [wardrobeWarning, setWardrobeWarning] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [newName, setNewName] = useState('');
  const [addGarmentId, setAddGarmentId] = useState('');
  const [addRole, setAddRole] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const applySnapshot = useCallback((snapshot) => {
    setOutfits(snapshot.outfits);
    setGarments(snapshot.garments);
    setWardrobeWarning(snapshot.wardrobeError ? 'Wardrobe labels are temporarily unavailable; Outfit references remain canonical.' : '');
    setSelectedId((current) => (
      current && snapshot.outfits.some((item) => item.id === current)
        ? current
        : snapshot.outfits[0]?.id || ''
    ));
  }, []);

  const reload = useCallback(async () => {
    setBusy('load');
    setError('');
    try {
      applySnapshot(await model.load());
    } catch (cause) {
      setError(cause?.message || 'Outfits could not be loaded.');
    } finally {
      setBusy('');
    }
  }, [applySnapshot, model]);

  const reconcileQuietly = useCallback(async () => {
    try { applySnapshot(await model.load()); } catch { /* preserve the originating action error */ }
  }, [applySnapshot, model]);

  useEffect(() => { reload(); }, [reload]);

  const selected = outfits.find((item) => item.id === selectedId) || null;
  const garmentById = useMemo(() => new Map(garments.map((item) => [item.garmentId, item])), [garments]);
  const activeGarments = useMemo(() => garments.filter((item) => item.status === 'ACTIVE'), [garments]);

  useEffect(() => {
    if (!activeGarments.some((item) => item.garmentId === addGarmentId)) setAddGarmentId('');
  }, [activeGarments, addGarmentId]);

  const create = async (event) => {
    event.preventDefault();
    if (!newName.trim() || busy) return;
    setBusy('create');
    setError('');
    try {
      const created = await model.create({ name: newName });
      setOutfits((current) => replaceOutfit(current, created));
      setSelectedId(created.id);
      setNewName('');
    } catch (cause) {
      setError(cause?.message || 'Outfit could not be created.');
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
      setOutfits((current) => replaceOutfit(current, next));
      return true;
    } catch (cause) {
      const message = cause?.message || 'Outfit changed elsewhere. Reload and try again.';
      await reconcileQuietly();
      setError(message);
      return false;
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="rounded-2xl border border-border p-3 space-y-3" aria-label="Canonical Outfit builder">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-primary" /> Outfits
        </p>
        <Button variant="ghost" size="sm" className="h-8" onClick={reload} disabled={Boolean(busy)}>
          <RefreshCw className={`h-3.5 w-3.5 ${busy === 'load' ? 'animate-spin' : ''}`} />
          <span className="sr-only">Reload outfits</span>
        </Button>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Ordered garment references, layer roles, revisions and reference readiness are owned by the canonical Outfit authority.
      </p>

      <form className="flex gap-1.5" onSubmit={create}>
        <Input
          value={newName}
          onChange={(event) => setNewName(event.target.value)}
          placeholder="New outfit"
          maxLength={200}
          disabled={Boolean(busy)}
        />
        <Button type="submit" size="sm" disabled={!newName.trim() || Boolean(busy)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Create
        </Button>
      </form>

      {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
      {wardrobeWarning && <p className="text-[11px] text-amber-700 dark:text-amber-300" role="status">{wardrobeWarning}</p>}

      {busy === 'load' && outfits.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading canonical outfits…
        </div>
      ) : outfits.length === 0 ? (
        <div className="rounded-xl bg-secondary/40 p-4 text-center text-xs text-muted-foreground">
          No managed outfits yet. Create one to compose stable garment references.
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1">
            {outfits.map((outfit) => (
              <button
                key={outfit.id}
                type="button"
                onClick={() => setSelectedId(outfit.id)}
                className={`rounded-full border px-2 py-1 text-[11px] ${selectedId === outfit.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
              >
                {outfit.name} ({outfit.entries.length})
              </button>
            ))}
          </div>

          {selected && (
            <div className="rounded-xl border border-border/70 bg-secondary/20 p-2.5 space-y-2">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selected.name}</p>
                  <p className="text-[10px] text-muted-foreground capitalize">
                    {selected.style.replace('_', ' ')} · {selected.season.replace('_', ' ')} · {selected.occasion.replace('_', ' ')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    readiness: {readinessLabel(selected.referenceReadiness)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={selected.favorite ? `Remove ${selected.name} from favorites` : `Add ${selected.name} to favorites`}
                    aria-pressed={selected.favorite}
                    className="rounded-md p-1 hover:bg-accent disabled:opacity-50"
                    disabled={Boolean(busy)}
                    onClick={() => mutateSelected('favorite', (outfit) => model.setFavorite(outfit, !outfit.favorite))}
                  >
                    <Heart className={`h-4 w-4 ${selected.favorite ? 'fill-current' : ''}`} />
                  </button>
                  {selected.status === 'ACTIVE' ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={Boolean(busy)} onClick={() => mutateSelected('archive', model.archive)}>
                      <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={Boolean(busy)} onClick={() => mutateSelected('restore', model.restore)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                    </Button>
                  )}
                </div>
              </div>

              {selected.status === 'ACTIVE' && (
                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
                  <select
                    value={addGarmentId}
                    onChange={(event) => setAddGarmentId(event.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    disabled={Boolean(busy) || activeGarments.length === 0}
                  >
                    <option value="">Add garment…</option>
                    {activeGarments.map((garment) => (
                      <option key={garment.garmentId} value={garment.garmentId}>
                        {garment.name} · {garment.category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={addRole}
                    onChange={(event) => setAddRole(event.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    disabled={Boolean(busy)}
                  >
                    <option value="">Auto role</option>
                    {LAYER_ROLES.map((role) => <option key={role} value={role}>{readinessLabel(role)}</option>)}
                  </select>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!addGarmentId || Boolean(busy)}
                    onClick={() => mutateSelected(
                      `add:${addGarmentId}`,
                      (outfit) => model.addEntry(outfit, addGarmentId, addRole),
                    ).then((ok) => { if (ok) { setAddGarmentId(''); setAddRole(''); } })}
                  >
                    Add
                  </Button>
                </div>
              )}

              {selected.entries.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">This Outfit has no garment references yet.</p>
              ) : (
                <div className="space-y-1">
                  {selected.entries.map((entry, index) => {
                    const garment = garmentById.get(entry.garmentId);
                    return (
                      <div key={entry.entryId} className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5 rounded-lg bg-background/70 px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium truncate">{garment?.name || 'Unavailable garment reference'}</p>
                          <p className="text-[9px] text-muted-foreground truncate">
                            {entry.referenceReadiness === 'READY' ? garment?.category || entry.garmentCategory || entry.garmentId : readinessLabel(entry.referenceReadiness)}
                          </p>
                        </div>
                        <select
                          value={entry.layerRole}
                          onChange={(event) => mutateSelected(
                            `role:${entry.entryId}`,
                            (outfit) => model.setEntryRole(outfit, entry.entryId, event.target.value),
                          )}
                          className="h-7 rounded-md border border-input bg-transparent px-1 text-[10px]"
                          disabled={Boolean(busy) || selected.status !== 'ACTIVE'}
                        >
                          {LAYER_ROLES.map((role) => <option key={role} value={role}>{readinessLabel(role)}</option>)}
                        </select>
                        <div className="flex items-center">
                          <button
                            type="button"
                            aria-label={`Move ${garment?.name || entry.garmentId} up`}
                            className="rounded-md p-1 hover:bg-accent disabled:opacity-40"
                            disabled={Boolean(busy) || selected.status !== 'ACTIVE' || index === 0}
                            onClick={() => mutateSelected(`up:${entry.entryId}`, (outfit) => model.moveEntry(outfit, entry.entryId, -1))}
                          >
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Move ${garment?.name || entry.garmentId} down`}
                            className="rounded-md p-1 hover:bg-accent disabled:opacity-40"
                            disabled={Boolean(busy) || selected.status !== 'ACTIVE' || index === selected.entries.length - 1}
                            onClick={() => mutateSelected(`down:${entry.entryId}`, (outfit) => model.moveEntry(outfit, entry.entryId, 1))}
                          >
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove ${garment?.name || entry.garmentId} from ${selected.name}`}
                            className="rounded-md p-1 hover:bg-accent disabled:opacity-40"
                            disabled={Boolean(busy) || selected.status !== 'ACTIVE'}
                            onClick={() => mutateSelected(`remove:${entry.entryId}`, (outfit) => model.removeEntry(outfit, entry.entryId))}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
