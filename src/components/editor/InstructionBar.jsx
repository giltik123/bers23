import React from 'react';
import { Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function InstructionBar({ selectedObject, instruction, onInstructionChange, onApply, applying, allowWholeImage = false }) {
  const { t } = useTranslation();
  const canEdit = Boolean(selectedObject || allowWholeImage);
  const wholeImage = !selectedObject && allowWholeImage;
  const hint = selectedObject
    ? t('editControls.selectedObject', { name: selectedObject.label })
    : wholeImage
      ? t('editControls.wholeImage')
      : t('editControls.selectObject');

  return (
    <section className="space-y-4 rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5" aria-label={t('editControls.describe')}>
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">{t('editControls.describeTitle')}</p>
        <h2 className="mt-1 text-lg font-semibold">{t('editControls.question')}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground" role="status">{hint}</p>
      </div>
      <label htmlFor="edit-instruction" className="block text-xs font-medium text-foreground">{t('editControls.instruction')}</label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="edit-instruction"
          value={instruction}
          onChange={(event) => onInstructionChange(event.target.value)}
          placeholder={selectedObject ? t('editControls.exampleObject', { name: selectedObject.label }) : wholeImage ? t('editControls.exampleWhole') : t('editControls.selectFirst')}
          disabled={!canEdit || applying}
          className="h-12 flex-1 rounded-xl"
          onKeyDown={(event) => event.key === 'Enter' && canEdit && !applying && instruction.trim() && onApply()}
        />
        <Button
          type="button"
          onClick={onApply}
          disabled={!canEdit || !instruction.trim() || applying}
          className="min-h-12 shrink-0 rounded-xl px-5"
          aria-label={t('editControls.preview')}
        >
          {applying ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Wand2 className="h-4 w-4" aria-hidden="true" />}
          {applying ? t('editControls.preparing') : t('editControls.preview')}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">{t('editControls.previewHint')}</p>
    </section>
  );
}
