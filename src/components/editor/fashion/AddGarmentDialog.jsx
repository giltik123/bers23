import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { GARMENT_CATEGORIES } from '@/lib/fashion/garmentCategories';

const selectCls = 'w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm';
const SEASONS = Object.freeze(['all_season', 'spring', 'summer', 'autumn', 'winter']);
const VIEW_KINDS = Object.freeze([
  ['FRONT', 'front'],
  ['BACK', 'back'],
  ['LEFT', 'left'],
  ['RIGHT', 'right'],
  ['DETAIL', 'detail'],
  ['UNSPECIFIED', 'unspecified'],
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
  const { t } = useTranslation();
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
      setError(cause?.message || t('fashion.garmentDialog.saveFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">{t('fashion.garmentDialog.addTitle')}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-center gap-2 h-28 rounded-xl border border-dashed border-border cursor-pointer hover:bg-accent transition-colors overflow-hidden">
            {previewUrl ? (
              <img src={previewUrl} alt={t('fashion.garmentDialog.selectedPhotoPreview')} className="h-full w-full object-contain" />
            ) : (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Upload className="w-4 h-4" /> {t('fashion.garmentDialog.selectPhoto')}
              </span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" aria-label={t('fashion.garmentDialog.selectPhoto')} className="hidden" onChange={selectImage} disabled={saving} />
          </label>

          <Input aria-label={t('fashion.garmentDialog.name')} placeholder={t('fashion.garmentDialog.name')} value={form.name} onChange={set('name')} disabled={saving} />
          <div className="grid grid-cols-2 gap-2">
            <select aria-label={t('fashion.garmentDialog.category')} value={form.category} onChange={set('category')} className={selectCls} disabled={saving}>
              {GARMENT_CATEGORIES.map((category) => <option key={category.id} value={category.id}>{t('fashion.garmentDialog.categories.' + category.id)}</option>)}
            </select>
            <select aria-label={t('fashion.garmentDialog.initialView')} value={form.viewKind} onChange={set('viewKind')} className={selectCls} disabled={saving}>
              {VIEW_KINDS.map(([value, key]) => <option key={value} value={value}>{t('fashion.garmentDialog.viewKinds.' + key)}</option>)}
            </select>
            <select aria-label={t('fashion.garmentDialog.season')} value={form.season} onChange={set('season')} className={selectCls} disabled={saving}>
              {SEASONS.map((season) => <option key={season} value={season}>{t('fashion.garmentDialog.seasons.' + season)}</option>)}
            </select>
            <Input aria-label={t('fashion.garmentDialog.material')} placeholder={t('fashion.garmentDialog.material')} value={form.material} onChange={set('material')} disabled={saving} maxLength={50} />
          </div>
          <Input aria-label={t('fashion.garmentDialog.tags')} placeholder={t('fashion.garmentDialog.tags')} value={form.tags} onChange={set('tags')} disabled={saving} />

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {t('fashion.garmentDialog.metadataNotice')}
          </p>
          {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={close} disabled={saving}>{t('fashion.garmentDialog.cancel')}</Button>
          <Button size="sm" onClick={save} disabled={saving || !image || !form.name.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} {t('fashion.garmentDialog.saveGarment')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
