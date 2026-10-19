import React from 'react';
import { Undo2, Redo2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function HistoryControls({ canUndo, canRedo, onUndo, onRedo, onRestore, disabled }) {
  const { t } = useTranslation();
  const confirmRestore = () => {
    if (window.confirm(t('editControls.restoreConfirm'))) onRestore();
  };

  return (
    <div className="flex flex-wrap items-center gap-1" role="group" aria-label={t('editControls.history')}>
      <Button type="button" variant="ghost" size="sm" onClick={onUndo} disabled={disabled || !canUndo} aria-label={t('editControls.undo')} className="min-h-10 rounded-xl px-3">
        <Undo2 className="h-4 w-4" aria-hidden="true" />
        {t('editControls.undo')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={onRedo} disabled={disabled || !canRedo} aria-label={t('editControls.redo')} className="min-h-10 rounded-xl px-3">
        <Redo2 className="h-4 w-4" aria-hidden="true" />
        {t('editControls.redo')}
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={confirmRestore} disabled={disabled || !canUndo} aria-label={t('editControls.restore')} className="min-h-10 rounded-xl px-3 text-muted-foreground">
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        {t('editControls.reset')}
      </Button>
    </div>
  );
}
