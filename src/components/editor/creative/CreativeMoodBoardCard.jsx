import React from 'react';
import { Palette } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function CreativeMoodBoardCard({ board }) {
  const { t } = useTranslation();
  return (
    <div className="rounded-xl border border-border/60 p-3">
      <div className="flex items-center gap-2">
        <Palette className="w-4 h-4 text-primary" />
        <p className="text-sm font-medium">{t('creative.themes.' + board.themeKey)}</p>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {t('creative.lighting.' + board.lightingKey)} · {t('creative.composition.' + board.compositionKey)}
      </p>
      <div className="mt-2 flex flex-wrap gap-1">
        {board.palette.slice(0, 3).map((color) => (
          <span key={color} className="rounded-full bg-secondary px-2 py-0.5 text-[10px]">{color}</span>
        ))}
      </div>
    </div>
  );
}
