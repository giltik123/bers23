import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, ArrowDown, ArrowUp, Heart, Layers, Loader2, Plus, RefreshCw, RotateCcw, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { coreClient } from '@/api/coreClient';
import {
  OUTFIT_OCCASIONS,
  OUTFIT_SEASONS,
  OUTFIT_STYLES,
  allowedLayerRolesForCategory,
  allowedLayerRolesForEntry,
  createCanonicalOutfitViewModel,
  sortOutfits,
} from '@/application/fashion/canonicalOutfitViewModel';

function replaceOutfit(current, next) {
  return sortOutfits([...current.filter((item) => item.id !== next.id), next]);
}

function label(value) {
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
  const [editName, setEditName] = useState('');
  const [editStyle, setEditStyle] = useState('casual');
  const [editSeason, setEditSeason] = useState('all_season');
  const [editOccasion, setEditOccasion] = useState('casual');
  const [addGarmentId, setAddGarmentId] = useState('');
  const [addRole, setAddRole] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const applySnapshot = useCallback((snapshot) => {
    setOutfits(snapshot.outfits);
    setGarments(snapshot.garments);
    setWardrobeWarning(snapshot.wardrobeError
      ? 'Wardrobe labels are temporarily unavailable; Outfit references remain canonical.'
      : '');
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
    try { applySnapshot(await model.load()); } catch { /* keep the originating mutation error */ }
  }, [applySnapshot, model]);

  useEffect(() => { reload(); }, [reload]);

  const selected = outfits.find((item) => item.id === selectedId) || null;
  const garmentById = useMemo(() => new Map(garments.map((item) => [item.garmentId, item])), [garments]);
  const selectedGarmentIds = useMemo(() => new Set(selected?.entries.map((entry) => entry.garmentId) ?? []), [selected]);
  const availableGarments = useMemo(() => garments.filter(
    (item) => item.status === 'ACTIVE' && !selectedGarmentIds.has(item.garmentId),
  ), [garments, selectedGarmentIds]);
  const addGarment = garmentById.get(addGarmentId);
  const addAllowedRoles = allowedLayerRolesForCategory(addGarment?.category);

  useEffect(() => {
    if (!availableGarments.some((item) => item.garmentId === addGarmentId)) {
      setAddGarmentId('');
      setAddRole('');
      return;
    }
    if (addRole && !addAllowedRoles.includes(addRole)) setAddRole('');
  }, [availableGarments, addGarmentId, addAllowedRoles, addRole]);

  useEffect(() => {
    if (!selected) return;
    setEditName(selected.name);
    setEditStyle(selected.style);
    setEditSeason(selected.season);
    setEditOccasion(selected.occasion);
  }, [selected?.id, selected?.revision]);

  const metadataDirty = Boolean(selected) && (
    editName.trim() !== selected.name
    || editStyle !== selected.style
    || editSeason !== selected.season
    || editOccasion !== selected.occasion
  );

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
      await reconcileQuietly();
      setError(`Creation result was not confirmed. Canonical state was refreshed; check the list before retrying. ${cause?.message || ''}`.trim());
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
      await reconcileQuietly();
      setError(`${cause?.message || 'Outfit mutation was not confirmed.'} Canonical state was refreshed; review it before retrying.`);
      return false;
    } finally {
      setBusy('');
    }
  };

  const saveMetadata = () => mutateSelected('metadata', (outfit) => model.updateMetadata(outfit, {
    name: editName,
    style: editStyle,
    season: editSeason,
    occasion: editOccasion,
  }));

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
        Outfit order, layer roles, readiness and revisions are server-owned. Failed mutations are reconciled by reloading canonical state and are never retried automatically.
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
            <div className="rounded-xl border border-border/70 bg-secondary/20 p-2.5 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{selected.name}</p>
                  <p className="text-[10px] text-muted-foreground">readiness: {label(selected.referenceReadiness)}</p>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={selected.favorite ? `Remove ${selected.name} from favorites` : `Add ${selected.name} to favorites`}
                    aria-pressed={selected.favorite}
                    className="rounded-md p-1 hover:bg-accent disabled:opacity-50"
                    disabled={Boolean(busy) || selected.status !== 'ACTIVE'}
                    onClick={() => mutateSelected('favorite', (outfit) => model.setFavorite(outfit, !outfit.favorite))}
                  >
                    <Heart className={`h-4 w-4 ${selected.favorite ? 'fill-current' : ''}`} />
                  </button>
                  {selected.status === 'ACTIVE' ? (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={Boolean(busy)} onClick={() => mutateSelected('archive', (outfit) => model.archive(outfit))}>
                      <Archive className="h-3.5 w-3.5 mr-1" /> Archive
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={Boolean(busy)} onClick={() => mutateSelected('restore', (outfit) => model.restore(outfit))}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" /> Restore
                    </Button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-1.5">
                <Input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={200} disabled={Boolean(busy) || selected.status !== 'ACTIVE'} aria-label="Outfit name" />
                <select value={editStyle} onChange={(event) => setEditStyle(event.target.value)} disabled={Boolean(busy) || selected.status !== 'ACTIVE'} className="h-9 rounded-md border border-input bg-transparent px-2 text-xs" aria-label="Outfit style">
                  {OUTFIT_STYLES.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                </select>
                <select value={editSeason} onChange={(event) => setEditSeason(event.target.value)} disabled={Boolean(busy) || selected.status !== 'ACTIVE'} className="h-9 rounded-md border border-input bg-transparent px-2 text-xs" aria-label="Outfit season">
                  {OUTFIT_SEASONS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                </select>
                <select value={editOccasion} onChange={(event) => setEditOccasion(event.target.value)} disabled={Boolean(busy) || selected.status !== 'ACTIVE'} className="h-9 rounded-md border border-input bg-transparent px-2 text-xs" aria-label="Outfit occasion">
                  {OUTFIT_OCCASIONS.map((value) => <option key={value} value={value}>{label(value)}</option>)}
                </select>
              </div>
              <div className="flex justify-end">
                <Button size="sm" variant="secondary" className="h-8" disabled={!metadataDirty || Boolean(busy) || selected.status !== 'ACTIVE'} onClick={saveMetadata}>
                  <Save className="h-3.5 w-3.5 mr-1" /> Save metadata
                </Button>
              </div>

              {selected.status === 'ACTIVE' && (
                <div className="grid grid-cols-[1fr_auto_auto] gap-1.5">
                  <select
                    value={addGarmentId}
                    onChange={(event) => setAddGarmentId(event.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    disabled={Boolean(busy) || availableGarments.length === 0}
                    aria-label="Garment to add"
                  >
                    <option value="">Add garment…</option>
                    {availableGarments.map((garment) => (
                      <option key={garment.garmentId} value={garment.garmentId}>
                        {garment.name} · {garment.category}
                      </option>
                    ))}
                  </select>
                  <select
                    value={addRole}
                    onChange={(event) => setAddRole(event.target.value)}
                    className="h-8 rounded-md border border-input bg-transparent px-2 text-xs"
                    disabled={Boolean(busy) || !addGarmentId || addAllowedRoles.length === 0}
                    aria-label="Layer role for new garment"
                  >
                    <option value="">Auto role</option>
                    {addAllowedRoles.map((role) => <option key={role} value={role}>{label(role)}</option>)}
                  </select>
                  <Button
                    size="sm"
                    className="h-8"
                    disabled={!addGarmentId || addAllowedRoles.length === 0 || Boolean(busy)}
                    onClick={() => mutateSelected(
                      `add:${addGarmentId}`,
                      (outfit) => model.addEntry(outfit, addGarmentId, addRole),
                    ).then((ok) => { if (ok) { setAddGarmentId(''); setAddRole(''); } })}
                  >
                    Add
                  </Button>
                </div>
              )}
              {selected.status === 'ACTIVE' && addGarmentId && addAllowedRoles.length === 0 && (
                <p className="text-[10px] text-muted-foreground" role="status">This garment category has no admitted Outfit layer role. Update its Wardrobe category before adding it.</p>
              )}

              {selected.entries.length === 0 ? (
                <p className="text-[11px] text-muted-foreground">This Outfit has no garment references yet.</p>
              ) : (
                <div className="space-y-1">
                  {selected.entries.map((entry, index) => {
                    const garment = garmentById.get(entry.garmentId);
                    const allowedRoles = allowedLayerRolesForEntry(entry, garment);
                    const currentRoleIsAllowed = allowedRoles.includes(entry.layerRole);
                    return (
                      <div key={entry.entryId} className="grid grid-cols-[1fr_auto_auto] items-center gap-1.5 rounded-lg bg-background/70 px-2 py-1.5">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium truncate">{garment?.name || 'Unavailable garment reference'}</p>
                          <p className="text-[9px] text-muted-foreground truncate">
                            {entry.referenceReadiness === 'READY' ? garment?.category || entry.garmentCategory || entry.garmentId : label(entry.referenceReadiness)}
                          </p>
                        </div>
                        <select
                          value={entry.layerRole}
                          onChange={(event) => mutateSelected(
                            `role:${entry.entryId}`,
                            (outfit) => model.setEntryRole(outfit, entry.entryId, event.target.value),
                          )}
                          className="h-7 rounded-md border border-input bg-transparent px-1 text-[10px]"
                          disabled={Boolean(busy) || selected.status !== 'ACTIVE' || allowedRoles.length === 0}
                          aria-label={`Layer role for ${garment?.name || entry.garmentId}`}
                        >
                          {!currentRoleIsAllowed && <option value={entry.layerRole}>{label(entry.layerRole)} · review</option>}
                          {allowedRoles.map((role) => <option key={role} value={role}>{label(role)}</option>)}
                        </select>
                        <div className="flex items-center">
                          <button type="button" aria-label={`Move ${garment?.name || entry.garmentId} up`} className="rounded-md p-1 hover:bg-accent disabled:opacity-40" disabled={Boolean(busy) || selected.status !== 'ACTIVE' || index === 0} onClick={() => mutateSelected(`up:${entry.entryId}`, (outfit) => model.moveEntry(outfit, entry.entryId, -1))}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" aria-label={`Move ${garment?.name || entry.garmentId} down`} className="rounded-md p-1 hover:bg-accent disabled:opacity-40" disabled={Boolean(busy) || selected.status !== 'ACTIVE' || index === selected.entries.length - 1} onClick={() => mutateSelected(`down:${entry.entryId}`, (outfit) => model.moveEntry(outfit, entry.entryId, 1))}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </button>
                          <button type="button" aria-label={`Remove ${garment?.name || entry.garmentId} from ${selected.name}`} className="rounded-md p-1 hover:bg-accent disabled:opacity-40" disabled={Boolean(busy) || selected.status !== 'ACTIVE'} onClick={() => mutateSelected(`remove:${entry.entryId}`, (outfit) => model.removeEntry(outfit, entry.entryId))}>
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
