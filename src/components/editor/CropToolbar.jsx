import React from 'react';
import { Crop, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

const FIELDS = Object.freeze([
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
]);

export default function CropToolbar({ active, draft, sourceWidth, sourceHeight, busy, onStart, onChange, onApply, onCancel }) {
  if (!active) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStart}
          disabled={busy || !sourceWidth || !sourceHeight}
          aria-label="Start crop"
          title="Crop the current canonical image locally"
        >
          <Crop className="w-4 h-4 mr-1.5" />
          Crop
        </Button>
      </div>
    );
  }

  const setField = (key, raw) => {
    if (raw === '') return;
    const value = Number(raw);
    if (!Number.isSafeInteger(value)) return;
    onChange({ ...draft, [key]: value });
  };

  return (
    <section className="rounded-2xl border bg-card p-3 space-y-3" aria-label="Crop controls">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">Crop</p>
          <p className="text-xs text-muted-foreground">Drag on the image or enter exact pixel coordinates.</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy} aria-label="Cancel crop">
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FIELDS.map(({ key, label }) => (
          <label key={key} className="text-xs text-muted-foreground space-y-1">
            <span>{label}</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min={key === 'width' || key === 'height' ? 1 : 0}
              max={key === 'x' ? Math.max(0, sourceWidth - 1) : key === 'y' ? Math.max(0, sourceHeight - 1) : key === 'width' ? sourceWidth : sourceHeight}
              value={draft[key]}
              onChange={(event) => setField(key, event.target.value)}
              disabled={busy}
              aria-label={`Crop ${label.toLowerCase()}`}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground" aria-live="polite">
          Output: {draft.width} × {draft.height}px
        </p>
        <Button type="button" size="sm" onClick={onApply} disabled={busy} aria-label="Apply crop">
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Crop className="w-4 h-4 mr-1.5" />}
          {busy ? 'Cropping…' : 'Apply Crop'}
        </Button>
      </div>
    </section>
  );
}
