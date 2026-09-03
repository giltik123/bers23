import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GARMENT_CATEGORIES } from '@/lib/fashion/garmentCategories';
import { SEASONS, MATERIALS } from '@/lib/fashion/garmentMetadata';

const selectCls = 'w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm';
const VIEW_KINDS = Object.freeze([
  ['FRONT', 'Front'],
  ['BACK', 'Back'],
  ['LEFT', 'Left side'],
  ['RIGHT', 'Right side'],
  ['DETAIL', 'Detail'],
  ['UNSPECIFIED', 'Unspecified'],
]);
const INITIAL_FORM = Object.freeze({
  name: '',
  category: 'tshirts',
  season: 'all_season',
  material: '',
  tags: '',
  viewKind: 'FRONT',
});

export default function AddGarmentDialog({ open, onClose, onCreate }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [image, setImage] = useState(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const previewUrl = useMemo(() => image ? URL.createObjectURL(image) : '', [image]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const set = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const reset = () => {
    setForm(INITIAL_FORM);
    setImage(null);
    setError('');
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const selectImage = (event) => {
    const file = event.target.files?.[0] ?? null;
    setImage(file);
    setError('');
  };

  const save = async () => {
    if (!image || !form.name.trim() || typeof onCreate !== 'function') return;
    setSaving(true);
    setError('');
    try {
      await onCreate({
        name: form.name,
        image,
        viewKind: form.viewKind,
        category: form.category,
        season: form.season,
        material: form.material,
        tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      });
      reset();
      onClose();
    } catch (cause) {
      setError(cause?.message || 'Garment could not be saved. Reload the wardrobe and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">Add garment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-center gap-2 h-28 rounded-xl border border-dashed border-border cursor-pointer hover:bg-accent transition-colors overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt="Selected garment preview" className="h-full w-full object-contain" />
            ) : (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Upload className="w-4 h-4" /> Select garment photo
              </span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={selectImage} disabled={saving} />
          </label>

          <Input placeholder="Name" value={form.name} onChange={set('name')} disabled={saving} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label="Garment category" value={form.category} onChange={set('category')} className={selectCls} disabled={saving}>
              {GARMENT_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
            </select>
            <select aria-label="Initial photo view" value={form.viewKind} onChange={set('viewKind')} className={selectCls} disabled={saving}>
              {VIEW_KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <select aria-label="Season" value={form.season} onChange={set('season')} className={selectCls} disabled={saving}>
              {SEASONS.map((season) => <option key={season} value={season}>{season.replace('_', ' ')}</option>)}
            </select>
            <select aria-label="Material" value={form.material} onChange={set('material')} className={selectCls} disabled={saving}>
              <option value="">Material…</option>
              {MATERIALS.map((material) => <option key={material} value={material}>{material}</option>)}
            </select>
          </div>
          <Input placeholder="Tags (comma separated)" value={form.tags} onChange={set('tags')} disabled={saving} />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Brand, size and color are not shown here until they have a canonical server-owned metadata contract. The selected image is uploaded directly to Managed Garment authority when you save.
          </p>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={close} disabled={saving}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !image || !form.name.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Save garment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
