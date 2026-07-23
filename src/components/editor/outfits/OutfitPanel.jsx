import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Loader2, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { outfitManager } from '@/lib/outfits/outfitManager';
import { outfitLibrary, OUTFIT_VIEWS } from '@/lib/outfits/outfitLibrary';
import { outfitAnalyzer } from '@/lib/outfits/outfitAnalyzer';
import { wardrobeManager } from '@/lib/fashion/wardrobeManager';
import OutfitCard from '@/components/editor/outfits/OutfitCard';
import OutfitBuilderView from '@/components/editor/outfits/OutfitBuilderView';
import TemplatePicker from '@/components/editor/outfits/TemplatePicker';

// Outfit Builder tab — builds and validates outfits only. No AI editing here;
// future Virtual Try-On will consume these outfits via the OutfitManager.
export default function OutfitPanel({ project, objects, onCommit }) {
  const [outfits, setOutfits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [wardrobe, setWardrobe] = useState(wardrobeManager.state);
  const [view, setView] = useState('personal');
  const [selectedId, setSelectedId] = useState(null);
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const list = await outfitManager.list();
    setOutfits(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    const unsubscribe = wardrobeManager.subscribe(setWardrobe);
    wardrobeManager.ensure();
    reload();
    return unsubscribe;
  }, [reload]);

  const create = async (template) => {
    const outfit = await outfitManager.create(template
      ? { name: template.name, style: template.style, occasion: template.occasion, season: template.season, template_id: template.id }
      : { name: 'New outfit' });
    setCreating(false);
    await reload();
    setSelectedId(outfit.id);
  };

  const selected = selectedId && outfits.find((o) => o.id === selectedId);
  if (selected) {
    return <OutfitBuilderView outfit={selected} wardrobe={wardrobe.garments} onBack={() => setSelectedId(null)} reload={reload} project={project} objects={objects} onCommit={onCommit} />;
  }

  const shown = outfitLibrary.filter(outfits, view);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
          {OUTFIT_VIEWS.map((v) => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={`text-[11px] px-2.5 py-1 rounded-full border whitespace-nowrap transition-colors ${view === v.id ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-accent'}`}
            >
              {v.name}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => setCreating(true)}><Plus className="w-4 h-4 mr-1" /> New</Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
      ) : shown.length === 0 ? (
        <div className="text-center py-8 space-y-1">
          <Layers className="w-8 h-8 mx-auto text-muted-foreground/30" />
          <p className="text-xs text-muted-foreground">No outfits here yet — create one from a template.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {shown.map((o) => (
            <OutfitCard
              key={o.id}
              outfit={o}
              score={(o.garment_ids || []).length ? outfitAnalyzer.analyze({ outfit: o, wardrobe: wardrobe.garments }).score : null}
              onOpen={(outfit) => setSelectedId(outfit.id)}
            />
          ))}
        </div>
      )}

      <TemplatePicker open={creating} onClose={() => setCreating(false)} onCreate={create} />
    </div>
  );
}