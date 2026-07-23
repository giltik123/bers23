import React from 'react';
import { Plus, FolderOpen, Trash2 } from 'lucide-react';
import { garmentCollections, SUGGESTED_COLLECTIONS } from '@/lib/fashion/garmentCollections';
import { wardrobeManager } from '@/lib/fashion/wardrobeManager';

export default function CollectionsView({ collections, selected, onSelect }) {
  const create = async (name) => {
    const finalName = name || window.prompt('Collection name');
    if (!finalName) return;
    await garmentCollections.create(finalName);
    wardrobeManager.refresh();
  };

  const remove = async (e, collection) => {
    e.stopPropagation();
    if (!window.confirm(`Delete collection "${collection.name}"? Garments are kept.`)) return;
    if (selected?.id === collection.id) onSelect(null);
    await garmentCollections.remove(collection);
    wardrobeManager.refresh();
  };

  const existing = new Set(collections.map((c) => c.name.toLowerCase()));

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {collections.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(selected?.id === c.id ? null : c)}
            className={`group flex items-center gap-1.5 text-[11px] px-2.5 py-1 rounded-full border transition-colors ${selected?.id === c.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
          >
            <FolderOpen className="w-3 h-3" /> {c.name}
            <span className="opacity-60">({(c.garment_ids || []).length})</span>
            <Trash2 className="w-3 h-3 opacity-0 group-hover:opacity-60 hover:!opacity-100" onClick={(e) => remove(e, c)} />
          </button>
        ))}
        <button onClick={() => create()} className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-dashed border-border hover:bg-accent transition-colors">
          <Plus className="w-3 h-3" /> New collection
        </button>
      </div>
      {collections.length < 3 && (
        <div className="flex flex-wrap gap-1 items-center">
          <span className="text-[10px] text-muted-foreground">Suggested:</span>
          {SUGGESTED_COLLECTIONS.filter((n) => !existing.has(n.toLowerCase())).slice(0, 5).map((name) => (
            <button key={name} onClick={() => create(name)} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary hover:bg-accent transition-colors">
              + {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}