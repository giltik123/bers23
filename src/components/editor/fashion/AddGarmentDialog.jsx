import React, { useState } from 'react';
import { Loader2, Upload } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { coreClient } from '@/api/coreClient';
import { GARMENT_CATEGORIES } from '@/lib/fashion/garmentCategories';
import { SEASONS, MATERIALS } from '@/lib/fashion/garmentMetadata';
import { garmentManager } from '@/lib/fashion/garmentManager';
import { wardrobeManager } from '@/lib/fashion/wardrobeManager';

const selectCls = 'w-full h-9 rounded-md border border-input bg-transparent px-3 text-sm';

export default function AddGarmentDialog({ open, onClose }) {
  const [form, setForm] = useState({ name: '', category: 'tshirts', season: 'all_season', material: '', brand: '', size: '', dominant_color: '', tags: '', source: 'personal' });
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const upload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await coreClient.integrations.Core.UploadFile({ file });
      setImageUrl(file_url);
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      await garmentManager.create({
        ...form,
        tags: form.tags.split(',').map((t) => t.trim()).filter(Boolean),
        original_image_url: imageUrl,
      });
      await wardrobeManager.refresh();
      setForm({ name: '', category: 'tshirts', season: 'all_season', material: '', brand: '', size: '', dominant_color: '', tags: '', source: 'personal' });
      setImageUrl('');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle className="text-base">Add garment</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <label className="flex items-center justify-center gap-2 h-24 rounded-xl border border-dashed border-border cursor-pointer hover:bg-accent transition-colors overflow-hidden">
            {imageUrl ? (
              <img src={imageUrl} alt="Garment" className="h-full object-contain" />
            ) : (
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploading ? 'Uploading…' : 'Upload garment photo'}
              </span>
            )}
            <input type="file" accept="image/*" className="hidden" onChange={upload} />
          </label>
          <Input placeholder="Name" value={form.name} onChange={set('name')} />
          <div className="grid grid-cols-2 gap-2">
            <select value={form.category} onChange={set('category')} className={selectCls}>
              {GARMENT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <select value={form.season} onChange={set('season')} className={selectCls}>
              {SEASONS.map((s) => <option key={s} value={s}>{s.replace('_', ' ')}</option>)}
            </select>
            <select value={form.material} onChange={set('material')} className={selectCls}>
              <option value="">Material…</option>
              {MATERIALS.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
            <select value={form.source} onChange={set('source')} className={selectCls}>
              <option value="personal">Personal</option>
              <option value="imported">Imported</option>
            </select>
            <Input placeholder="Brand" value={form.brand} onChange={set('brand')} />
            <Input placeholder="Size" value={form.size} onChange={set('size')} />
          </div>
          <Input placeholder="Dominant color" value={form.dominant_color} onChange={set('dominant_color')} />
          <Input placeholder="Tags (comma separated)" value={form.tags} onChange={set('tags')} />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} disabled={saving || !form.name.trim()}>
            {saving && <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />} Save garment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}