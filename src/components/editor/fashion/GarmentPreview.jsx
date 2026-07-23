import React, { useState } from 'react';
import { Heart, Copy, Archive, ArchiveRestore, Trash2, Pencil, FolderPlus, Shirt, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { getCategory } from '@/lib/fashion/garmentCategories';
import { garmentManager } from '@/lib/fashion/garmentManager';
import { garmentFavorites } from '@/lib/fashion/garmentFavorites';
import { garmentCollections } from '@/lib/fashion/garmentCollections';
import { wardrobeManager } from '@/lib/fashion/wardrobeManager';

const Field = ({ label, value }) => value ? (
  <div><p className="text-[10px] text-muted-foreground">{label}</p><p className="text-xs">{value}</p></div>
) : null;

export default function GarmentPreview({ garment, collections, onClose }) {
  const [busy, setBusy] = useState(false);

  const run = async (fn, close = false) => {
    setBusy(true);
    try {
      await fn();
      await wardrobeManager.refresh();
      if (close) onClose();
    } finally {
      setBusy(false);
    }
  };

  const rename = () => {
    const name = window.prompt('Rename garment', garment.name);
    if (name && name !== garment.name) run(() => garmentManager.rename(garment, name));
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            {garment.name}
            <button onClick={rename} className="text-muted-foreground hover:text-foreground"><Pencil className="w-3.5 h-3.5" /></button>
          </DialogTitle>
        </DialogHeader>
        <div className="rounded-xl bg-muted aspect-video flex items-center justify-center overflow-hidden">
          {garment.preview_url ? (
            <img src={garment.preview_url} alt={garment.name} className="h-full object-contain" />
          ) : (
            <Shirt className="w-10 h-10 text-muted-foreground/40" />
          )}
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Field label="Category" value={`${getCategory(garment.category).name}${garment.subcategory ? ` / ${garment.subcategory}` : ''}`} />
          <Field label="Season" value={garment.season?.replace('_', ' ')} />
          <Field label="Material" value={garment.material} />
          <Field label="Color" value={garment.dominant_color} />
          <Field label="Brand" value={garment.brand} />
          <Field label="Size" value={garment.size} />
          <Field label="Fit" value={garment.fit} />
          <Field label="Gender" value={garment.gender} />
          <Field label="Used" value={garment.usage_count ? `${garment.usage_count}×` : ''} />
        </div>
        {garment.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {garment.tags.map((t) => <span key={t} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary">{t}</span>)}
          </div>
        )}
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => garmentFavorites.toggle(garment))}>
            <Heart className={`w-3.5 h-3.5 mr-1 ${garment.favorite ? 'fill-red-500 text-red-500' : ''}`} /> {garment.favorite ? 'Unfavorite' : 'Favorite'}
          </Button>
          <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => garmentManager.duplicate(garment))}>
            <Copy className="w-3.5 h-3.5 mr-1" /> Duplicate
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" disabled={busy || !collections.length}>
                <FolderPlus className="w-3.5 h-3.5 mr-1" /> Add to collection
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {collections.map((c) => (
                <DropdownMenuItem key={c.id} className="text-xs" onClick={() => run(() => garmentCollections.addGarment(c, garment.id))}>
                  {c.name}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          {garment.archived ? (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => garmentManager.restore(garment))}>
              <ArchiveRestore className="w-3.5 h-3.5 mr-1" /> Restore
            </Button>
          ) : (
            <Button variant="outline" size="sm" disabled={busy} onClick={() => run(() => garmentManager.archive(garment), true)}>
              <Archive className="w-3.5 h-3.5 mr-1" /> Archive
            </Button>
          )}
          <Button variant="outline" size="sm" disabled={busy} className="text-destructive" onClick={() => window.confirm('Delete this garment?') && run(() => garmentManager.remove(garment), true)}>
            {busy ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />} Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}