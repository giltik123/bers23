import React from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { ORTHOGONAL_TRANSFORM_MODES } from '@/platform/creative/deterministic/OrthogonalTransformIdentity';

export const ORTHOGONAL_TRANSFORM_LABELS = Object.freeze({
  FLIP_HORIZONTAL: 'Flip horizontal',
  FLIP_VERTICAL: 'Flip vertical',
  ROTATE_90_CW: 'Rotate 90° clockwise',
  ROTATE_180: 'Rotate 180°',
  ROTATE_270_CW: 'Rotate 90° counterclockwise',
});

const ORTHOGONAL_TRANSFORM_TRANSLATION_KEYS = Object.freeze({
  FLIP_HORIZONTAL: 'flipHorizontal',
  FLIP_VERTICAL: 'flipVertical',
  ROTATE_90_CW: 'rotate90CW',
  ROTATE_180: 'rotate180',
  ROTATE_270_CW: 'rotate270CW',
});

export default function OrthogonalTransformToolbar({ busy, activeMode, disabled, onApply }) {
  const { t } = useTranslation();
  const unavailable = Boolean(disabled || busy);
  return (
    <section className="rounded-2xl border bg-card p-3 space-y-2" aria-label={t('editorGeometry.rotateFlipControls')}>
      <div>
        <p className="text-sm font-medium">{t('editorGeometry.rotateFlipTitle')}</p>
        <p className="text-xs text-muted-foreground">{t('editorGeometry.rotateFlipHint')}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {ORTHOGONAL_TRANSFORM_MODES.map((mode) => {
          const applying = activeMode === mode;
          return (
            <Button
              key={mode}
              type="button"
              variant="outline"
              size="sm"
              data-transform-mode={mode}
              onClick={() => onApply(mode)}
              disabled={unavailable}
              aria-label={t(`editorGeometry.${ORTHOGONAL_TRANSFORM_TRANSLATION_KEYS[mode]}`)}
            >
              {applying && <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />}
              {applying ? t('editorGeometry.transformApplying') : t(`editorGeometry.${ORTHOGONAL_TRANSFORM_TRANSLATION_KEYS[mode]}`)}
            </Button>
          );
        })}
      </div>
    </section>
  );
}
