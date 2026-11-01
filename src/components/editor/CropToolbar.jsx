import React from 'react';
import { Crop, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const FIELDS = Object.freeze([
  { key: 'x', label: 'X' },
  { key: 'y', label: 'Y' },
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
]);

export default function CropToolbar({ active, draft, valid, sourceWidth, sourceHeight, busy, onStart, onChange, onApply, onCancel }) {
  const { t } = useTranslation();
  if (!active) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStart}
          disabled={busy || !sourceWidth || !sourceHeight}
          aria-label={t('editorGeometry.startCrop')}
          title={t('editorGeometry.cropTooltip')}
        >
          <Crop className="w-4 h-4 mr-1.5" />
          {t('editorGeometry.crop')}
        </Button>
      </div>
    );
  }

  const setField = (key, raw) => {
    const value = raw === '' ? '' : Number(raw);
    onChange({ ...draft, [key]: value });
  };

  return (
    <section className="rounded-2xl border bg-card p-3 space-y-3" aria-label={t('editorGeometry.cropControls')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t('editorGeometry.crop')}</p>
          <p className="text-xs text-muted-foreground">{t('editorGeometry.cropHint')}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy} aria-label={t('editorGeometry.cancelCrop')}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {FIELDS.map(({ key }) => (
          <label key={key} className="text-xs text-muted-foreground space-y-1">
            <span>{t(`editorGeometry.${key}`)}</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min={key === 'width' || key === 'height' ? 1 : 0}
              max={key === 'x' ? Math.max(0, sourceWidth - 1) : key === 'y' ? Math.max(0, sourceHeight - 1) : key === 'width' ? sourceWidth : sourceHeight}
              value={draft[key]}
              onChange={(event) => setField(key, event.target.value)}
              disabled={busy}
              aria-label={t('editorGeometry.cropField', { field: t(`editorGeometry.${key}`) })}
              aria-invalid={!valid}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs ${valid ? 'text-muted-foreground' : 'text-destructive'}`} role="status" aria-live="polite">
          {valid ? t('editorGeometry.cropOutput', { width: draft.width, height: draft.height }) : t('editorGeometry.cropInvalid')}
        </p>
        <Button type="button" size="sm" onClick={onApply} disabled={busy || !valid} aria-label={t('editorGeometry.applyCrop')}>
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Crop className="w-4 h-4 mr-1.5" />}
          {busy ? t('editorGeometry.cropping') : t('editorGeometry.applyCrop')}
        </Button>
      </div>
    </section>
  );
}
