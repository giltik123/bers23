import React from 'react';
import { Link2, Link2Off, Loader2, Scaling, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { RESIZE_MAX_DIMENSION, RESIZE_MAX_OUTPUT_PIXELS } from '@/platform/creative/deterministic/ResizeIdentity';

const FIELDS = Object.freeze([
  { key: 'width', label: 'Width' },
  { key: 'height', label: 'Height' },
]);

export default function ResizeToolbar({
  active,
  draft,
  valid,
  sourceWidth,
  sourceHeight,
  busy,
  aspectLocked,
  onAspectLockedChange,
  onStart,
  onFieldChange,
  onApply,
  onCancel,
}) {
  const { t, language } = useTranslation();
  if (!active) {
    return (
      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onStart}
          disabled={busy || !sourceWidth || !sourceHeight}
          aria-label={t('editorGeometry.startResize')}
          title={t('editorGeometry.resizeTooltip')}
        >
          <Scaling className="w-4 h-4 mr-1.5" />
          {t('editorGeometry.resize')}
        </Button>
      </div>
    );
  }

  const setField = (key, raw) => onFieldChange(key, raw === '' ? '' : Number(raw));

  return (
    <section className="rounded-2xl border bg-card p-3 space-y-3" aria-label={t('editorGeometry.resizeControls')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-medium">{t('editorGeometry.resize')}</p>
          <p className="text-xs text-muted-foreground">{t('editorGeometry.resizeHint', { width: sourceWidth, height: sourceHeight })}</p>
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={busy} aria-label={t('editorGeometry.cancelResize')}>
          <X className="w-4 h-4" />
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map(({ key }) => (
          <label key={key} className="text-xs text-muted-foreground space-y-1">
            <span>{t(`editorGeometry.${key}`)}</span>
            <input
              type="number"
              inputMode="numeric"
              step="1"
              min="1"
              max={RESIZE_MAX_DIMENSION}
              value={draft[key]}
              onChange={(event) => setField(key, event.target.value)}
              disabled={busy}
              aria-label={t('editorGeometry.resizeField', { field: t(`editorGeometry.${key}`) })}
              aria-invalid={!valid}
              className="w-full h-9 rounded-md border bg-background px-2 text-sm text-foreground disabled:opacity-50"
            />
          </label>
        ))}
      </div>

      <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={aspectLocked}
          onChange={(event) => onAspectLockedChange(event.target.checked)}
          disabled={busy}
          aria-label={t('editorGeometry.keepAspectLabel')}
          className="size-4 rounded border"
        />
        {aspectLocked ? <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> : <Link2Off className="w-3.5 h-3.5" aria-hidden="true" />}
        {t('editorGeometry.keepAspect')}
      </label>

      <div className="flex items-center justify-between gap-3">
        <p className={`text-xs ${valid ? 'text-muted-foreground' : 'text-destructive'}`} role="status" aria-live="polite">
          {valid
            ? t('editorGeometry.resizeOutput', { width: draft.width, height: draft.height, pixels: new Intl.NumberFormat(language).format(draft.width * draft.height) })
            : t('editorGeometry.resizeInvalid', { dimension: RESIZE_MAX_DIMENSION, pixels: new Intl.NumberFormat(language).format(RESIZE_MAX_OUTPUT_PIXELS) })}
        </p>
        <Button type="button" size="sm" onClick={onApply} disabled={busy || !valid} aria-label={t('editorGeometry.applyResize')}>
          {busy ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Scaling className="w-4 h-4 mr-1.5" />}
          {busy ? t('editorGeometry.resizing') : t('editorGeometry.applyResize')}
        </Button>
      </div>
    </section>
  );
}
