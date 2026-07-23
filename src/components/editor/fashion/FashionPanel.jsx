import React, { useState, useEffect } from 'react';
import { Plus, Search, Loader2, Shirt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { wardrobeManager } from '@/lib/fashion/wardrobeManager';
import { LIBRARY_VIEWS } from '@/lib/fashion/wardrobeLibrary';
import { garmentCollections } from '@/lib/fashion/garmentCollections';
import { garmentSearch } from '@/lib/fashion/garmentSearch';
import GarmentCard from '@/components/editor/fashion/GarmentCard';
import CategoryChips from '@/components/editor/fashion/CategoryChips';
import AddGarmentDialog from '@/components/editor/fashion/AddGarmentDialog';
import GarmentPreview from '@/components/editor/fashion/GarmentPreview';
import CollectionsView from '@/components/editor/fashion/CollectionsView';

// Fashion tab — wardrobe management only. No AI editing, no provider calls.
export default function FashionPanel() {
  const [state, setState] = useState(wardrobeManager.state);
  const [view, setView] = useState('personal');
  const [text, setText] = useState('');
  const [category, setCategory] = useState(null);
  const [collection, setCollection] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    const unsubscribe = wardrobeManager.subscribe(setState);
    wardrobeManager.ensure();
    return unsubscribe;
  }, []);

  const filters = { text, category };
  const liveCollection = collection && state.collections.find((c) => c.id === collection.id);
  const garments = view === 'collections'
    ? (liveCollection ? garmentSearch.search(garmentCollections.garmentsIn(liveCollection, state.garments), filters) : [])
    : wardrobeManager.resolve({ view, filters });
  const selectedGarment = selectedId && state.garments.find((g) => g.id === selectedId);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Search name, color, brand, tags…" className="pl-8 h-9 text-sm" />
        </div>
        <Button size="sm" onClick={() => setAdding(true)}><Plus className="w-4 h-4 mr-1" /> Add</Button>
      </div>

      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {[...LIBRARY_VIEWS, { id: 'collections', name: 'Collections' }].map((v) => (
          <button
            key={v.id}
            onClick={() => { setView(v.id); setCollection(null); }}
            className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${view === v.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
          >
            {v.name}
          </button>
        ))}
      </div>

      {view === 'collections' && (
        <CollectionsView collections={state.collections} selected={liveCollection} onSelect={setCollection} />
      )}

      <CategoryChips selected={category} onSelect={setCategory} />

      {state.loading && !state.loaded ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : garments.length === 0 ? (
        <div className="text-center py-8 space-y-1">
          <Shirt className="w-8 h-8 mx-auto text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">
            {view === 'online' ? 'Online collections are coming soon.'
              : view === 'collections' && !liveCollection ? 'Select or create a collection.'
              : 'No garments here yet — add your first one.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {garments.map((g) => <GarmentCard key={g.id} garment={g} onOpen={(garment) => setSelectedId(garment.id)} />)}
        </div>
      )}

      <AddGarmentDialog open={adding} onClose={() => setAdding(false)} />
      {selectedGarment && (
        <GarmentPreview garment={selectedGarment} collections={state.collections} onClose={() => setSelectedId(null)} />
      )}
    </div>
  );
}