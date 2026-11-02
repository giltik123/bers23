import React from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { Download, FileJson2, FolderOpen, Loader2, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';

const NOTICE_KEYS = Object.freeze({
  'Edit recipe saved as JSON. Keep the original photo to restore it later.': 'recipeSaved',
  'Edit recipe restored for this exact photo. Undo reverts the entire import.': 'recipeRestored',
  'Saved on this device only. A later browser-draft save will replace this copy.': 'browserDraftSaved',
  'Browser draft restored for this exact original. Undo reverses the entire restore.': 'browserDraftRestored',
  'Browser draft deleted. Current edits are unchanged.': 'browserDraftDeleted',
});

export default function LocalRecipeControls({
  saving, restoring, onSave, onChooseFile, fileInputRef, notice,
  hasDeviceDraft, savingDevice, restoringDevice,
  onSaveDevice, onRestoreDevice, onClearDevice,
}) {
  const { t } = useTranslation();
  const noticeKey = NOTICE_KEYS[notice];
  return (
    <section aria-label={t('localEditorUi.recipeSection')} className="space-y-3 rounded-2xl border border-border/70 bg-muted/20 p-4">
      <div className="flex flex-wrap items-start gap-3">
        <FileJson2 className="h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{t('localEditorUi.continueEditing')}</h3>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {t('localEditorUi.recipeDescription')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={onSave} disabled={saving || restoring}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Download className="h-4 w-4" aria-hidden="true" />}
          {saving ? t('localEditorUi.savingRecipe') : t('localEditorUi.saveRecipe')}
        </Button>
        <Button type="button" variant="outline" className="min-h-11 rounded-xl" onClick={() => fileInputRef.current?.click()} disabled={saving || restoring}>
          {restoring ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <FolderOpen className="h-4 w-4" aria-hidden="true" />}
          {restoring ? t('localEditorUi.restoringRecipe') : t('localEditorUi.restoreRecipe')}
        </Button>
        <input
          type="file" accept=".json,application/json" className="sr-only" tabIndex={-1}
          ref={fileInputRef} onChange={onChooseFile}
          aria-label={t('localEditorUi.chooseRecipe')}
        />
      </div>
      <details className="rounded-xl border border-border/70 bg-card p-3">
        <summary className="cursor-pointer font-semibold text-sm focus-visible:outline-2 focus-visible:outline-ring">{t('localEditorUi.saveOnDevice')}</summary>
        <p className="mt-2 text-xs leading-5 text-muted-foreground">
          {t('localEditorUi.devicePrivacy')}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-xl" onClick={onSaveDevice} disabled={savingDevice || restoringDevice || saving || restoring}>
            {savingDevice ? t('localEditorUi.savingLocally') : t('localEditorUi.saveBrowserDraft')}
          </Button>
          <Button type="button" variant="outline" size="sm" className="min-h-11 rounded-xl" onClick={onRestoreDevice} disabled={!hasDeviceDraft || savingDevice || restoringDevice || saving || restoring}>
            {restoringDevice ? t('localEditorUi.restoringLocally') : t('localEditorUi.restoreBrowserDraft')}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="min-h-11 rounded-xl" onClick={onClearDevice} disabled={!hasDeviceDraft || savingDevice || restoringDevice || saving || restoring}>
            {t('localEditorUi.deleteBrowserDraft')}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground" role="status">
          {hasDeviceDraft ? t('localEditorUi.draftExists') : t('localEditorUi.noDraft')}
        </p>
      </details>
      <p className="flex items-start gap-2 text-xs leading-5 text-muted-foreground">
        <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        {t('localEditorUi.exactOriginalInstruction')}
      </p>
      {notice && <p role="status" className="text-sm text-foreground">{noticeKey ? t('localEditorUi.' + noticeKey) : notice}</p>}
    </section>
  );
}
