import React, { useState, useMemo } from 'react';
import { ArrowLeft, Heart, Pencil, MoreHorizontal, Plus, ArrowUp, ArrowDown, X, Repeat, Shirt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { outfitManager } from '@/lib/outfits/outfitManager';
import { outfitBuilder } from '@/lib/outfits/outfitBuilder';
import { outfitFavorites } from '@/lib/outfits/outfitFavorites';
import { outfitAnalyzer } from '@/lib/outfits/outfitAnalyzer';
import { OCCASIONS, OUTFIT_STYLES, labelize } from '@/lib/outfits/outfitModel';
import { SEASONS } from '@/lib/fashion/garmentMetadata';
import { getCategory } from '@/lib/fashion/garmentCategories';
import OutfitAnalysisCard from '@/components/editor/outfits/OutfitAnalysisCard';
import OutfitRecommendations from '@/components/editor/outfits/OutfitRecommendations';
import GarmentPicker from '@/components/editor/outfits/GarmentPicker';
import TryOnPanel from '@/components/editor/outfits/TryOnPanel';

const selectCls = 'h-8 rounded-md border border-input bg-transparent px-2 text-xs';

export default function OutfitBuilderView({ outfit, wardrobe, onBack, reload, project, objects, onCommit }) {
  const [picker, setPicker] = useState(null); // { mode: 'add' } | { mode: 'replace', garmentId }
  const [error, setError] = useState(null);
  const report = useMemo(() => outfitAnalyzer.analyze({ outfit, wardrobe }), [outfit, wardrobe]);
  const garments = report.garments;

  const run = async (fn) => { setError(null); await fn(); await reload(); };

  const rename = () => {
    const name = window.prompt('Rename outfit', outfit.name);
    if (name && name !== outfit.name) run(() => outfitManager.rename(outfit, name));
  };

  const pick = async (garment) => {
    if (picker.mode === 'replace') {
      await run(() => outfitBuilder.replaceGarment(outfit, wardrobe, picker.garmentId, garment));
    } else {
      const check = outfitBuilder.canAdd(outfit, wardrobe, garment);
      if (!check.ok) { setError(check.reason); setPicker(null); return; }
      await run(() => outfitBuilder.addGarment(outfit, wardrobe, garment));
    }
    setPicker(null);
  };

  const setMeta = (key) => (e) => run(() => outfitManager.update(outfit.id, { [key]: e.target.value }));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-accent transition-colors"><ArrowLeft className="w-4 h-4" /></button>
        <p className="text-sm font-medium truncate">{outfit.name}</p>
        <button onClick={rename} className="p-1 rounded-lg hover:bg-accent text-muted-foreground"><Pencil className="w-3.5 h-3.5" /></button>
        <button onClick={() => run(() => outfitFavorites.toggle(outfit))} className="p-1 rounded-lg hover:bg-accent ml-auto">
          <Heart className={`w-4 h-4 ${outfit.favorite ? 'fill-red-500 text-red-500' : 'text-muted-foreground'}`} />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger className="p-1.5 rounded-lg hover:bg-accent"><MoreHorizontal className="w-4 h-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem className="text-xs" onClick={() => run(() => outfitManager.duplicate(outfit))}>Duplicate</DropdownMenuItem>
            <DropdownMenuItem className="text-xs" onClick={() => run(() => outfitManager.clone(outfit))}>Clone</DropdownMenuItem>
            {outfit.archived ? (
              <DropdownMenuItem className="text-xs" onClick={() => run(() => outfitManager.restore(outfit))}>Restore</DropdownMenuItem>
            ) : (
              <DropdownMenuItem className="text-xs" onClick={async () => { await run(() => outfitManager.archive(outfit)); onBack(); }}>Archive</DropdownMenuItem>
            )}
            <DropdownMenuItem className="text-xs text-destructive" onClick={async () => { if (window.confirm('Delete this outfit?')) { await run(() => outfitManager.remove(outfit)); onBack(); } }}>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex gap-2">
        <select value={outfit.style} onChange={setMeta('style')} className={selectCls}>
          {OUTFIT_STYLES.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
        </select>
        <select value={outfit.occasion} onChange={setMeta('occasion')} className={selectCls}>
          {OCCASIONS.map((o) => <option key={o} value={o}>{labelize(o)}</option>)}
        </select>
        <select value={outfit.season} onChange={setMeta('season')} className={selectCls}>
          {SEASONS.map((s) => <option key={s} value={s}>{labelize(s)}</option>)}
        </select>
      </div>

      {error && <p className="text-[11px] text-destructive">{error}</p>}

      <div className="space-y-1.5">
        {garments.map((g, i) => (
          <div key={g.id} className="flex items-center gap-2 rounded-xl border border-border p-2">
            <div className="w-10 h-10 rounded-lg bg-muted overflow-hidden flex items-center justify-center shrink-0">
              {g.thumbnail_url ? <img src={g.thumbnail_url} alt={g.name} className="w-full h-full object-cover" /> : <Shirt className="w-4 h-4 text-muted-foreground/40" />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium truncate">{g.name}</p>
              <p className="text-[10px] text-muted-foreground truncate">{getCategory(g.category).name}{g.dominant_color ? ` · ${g.dominant_color}` : ''}{g.material ? ` · ${g.material}` : ''}</p>
            </div>
            <button disabled={i === 0} onClick={() => run(() => outfitBuilder.reorder(outfit, wardrobe, i, i - 1))} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ArrowUp className="w-3.5 h-3.5" /></button>
            <button disabled={i === garments.length - 1} onClick={() => run(() => outfitBuilder.reorder(outfit, wardrobe, i, i + 1))} className="p-1 rounded hover:bg-accent disabled:opacity-30"><ArrowDown className="w-3.5 h-3.5" /></button>
            <button onClick={() => setPicker({ mode: 'replace', garmentId: g.id })} className="p-1 rounded hover:bg-accent" title="Replace"><Repeat className="w-3.5 h-3.5" /></button>
            <button onClick={() => run(() => outfitBuilder.removeGarment(outfit, wardrobe, g.id))} className="p-1 rounded hover:bg-accent text-destructive"><X className="w-3.5 h-3.5" /></button>
          </div>
        ))}
        <Button variant="outline" size="sm" className="w-full" onClick={() => setPicker({ mode: 'add' })}>
          <Plus className="w-3.5 h-3.5 mr-1" /> Add garment
        </Button>
      </div>

      {project && onCommit && (
        <TryOnPanel project={project} objects={objects} outfit={outfit} wardrobe={wardrobe} onCommit={onCommit} />
      )}

      <OutfitAnalysisCard report={report} />
      <OutfitRecommendations outfit={outfit} wardrobe={wardrobe} onChanged={reload} />

      {picker && (
        <GarmentPicker
          open
          title={picker.mode === 'replace' ? 'Replace with…' : 'Add garment'}
          wardrobe={wardrobe}
          onPick={pick}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}