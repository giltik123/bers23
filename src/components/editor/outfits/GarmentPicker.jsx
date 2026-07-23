import React, { useState } from 'react';
import { Search, Shirt } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { garmentSearch } from '@/lib/fashion/garmentSearch';
import { getCategory } from '@/lib/fashion/garmentCategories';

export default function GarmentPicker({ open, title = 'Pick a garment', wardrobe, onPick, onClose }) {
  const [text, setText] = useState('');
  const garments = garmentSearch.search(wardrobe.filter((g) => !g.archived), { text });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">{title}</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search wardrobe…" className="pl-8 h-9 text-sm" />
        </div>
        {garments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No garments found — add some in the Fashion tab.</p>
        ) : (
          <div className="grid grid-cols-3 gap-2 max-h-72 overflow-y-auto">
            {garments.map((g) => (
              <button key={g.id} onClick={() => onPick(g)} className="text-left rounded-lg border border-border overflow-hidden hover:border-primary/50 transition-colors">
                <div className="aspect-square bg-muted flex items-center justify-center">
                  {g.thumbnail_url ? <img src={g.thumbnail_url} alt={g.name} className="w-full h-full object-cover" /> : <Shirt className="w-6 h-6 text-muted-foreground/40" />}
                </div>
                <div className="p-1.5">
                  <p className="text-[11px] font-medium truncate">{g.name}</p>
                  <p className="text-[9px] text-muted-foreground truncate">{getCategory(g.category).name}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}