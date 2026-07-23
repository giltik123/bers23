import React from 'react';
import { FolderPlus, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function AssetCollectionsPanel({ collections, activeId, onSelect, onCreate }) {
  return <aside className="space-y-3 rounded-2xl border border-border/60 p-3"><div className="flex items-center justify-between"><p className="text-sm font-medium">Collections</p><Button variant="ghost" size="icon" onClick={onCreate} aria-label="Create collection"><FolderPlus className="h-4 w-4" /></Button></div><button onClick={() => onSelect('')} className={`block w-full rounded-lg px-2 py-1.5 text-left text-xs ${!activeId ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>All assets</button>{collections.map((collection) => <button key={collection.id} onClick={() => onSelect(collection.id)} className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs ${activeId === collection.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}>{collection.pinned && <Star className="h-3 w-3" />}{collection.name}</button>)}</aside>;
}