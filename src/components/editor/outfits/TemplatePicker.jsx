import React from 'react';
import { Plus, Layers } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { OUTFIT_TEMPLATES } from '@/lib/outfits/outfitTemplates';
import { labelize } from '@/lib/outfits/outfitModel';

export default function TemplatePicker({ open, onClose, onCreate }) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">New outfit</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          <button onClick={() => onCreate(null)} className="p-3 rounded-xl border border-dashed border-border hover:bg-accent transition-colors text-left">
            <Plus className="w-4 h-4 mb-1 text-primary" />
            <p className="text-xs font-medium">Blank outfit</p>
            <p className="text-[10px] text-muted-foreground">Start from scratch</p>
          </button>
          {OUTFIT_TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => onCreate(t)} className="p-3 rounded-xl border border-border hover:bg-accent transition-colors text-left">
              <Layers className="w-4 h-4 mb-1 text-primary" />
              <p className="text-xs font-medium">{t.name}</p>
              <p className="text-[10px] text-muted-foreground">{labelize(t.style)} · {t.slots.length} slots</p>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}