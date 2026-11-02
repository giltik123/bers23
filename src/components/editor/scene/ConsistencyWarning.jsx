import React, { useId } from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { AlertTriangle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

const WARNING_LABEL_KEYS = Object.freeze({
  identity: 'sceneUi.warningIdentity',
  lighting: 'sceneUi.warningLighting',
  color: 'sceneUi.warningColor',
  camera: 'sceneUi.warningCamera',
  perspective: 'sceneUi.warningPerspective',
  style: 'sceneUi.warningStyle',
  background: 'sceneUi.warningBackground',
});

// Advisory warning only; the explicit user action continues through the existing Editor preview path.
export default function ConsistencyWarning({ warnings, onContinue, onCancel, onAutoCorrect }) {
  const { t } = useTranslation();
  const titleId = useId();
  return (
    <div role="alert" aria-labelledby={titleId} className="border border-amber-500/50 bg-amber-500/10 rounded-2xl p-4 space-y-3">
      <div id={titleId} className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4" aria-hidden="true" /> {t('sceneUi.warningTitle')}
      </div>
      <ul className="space-y-1">
        {warnings.map((warning, index) => (
          <li key={warning.category || index} className="text-xs text-amber-800 dark:text-amber-300">
            {t(WARNING_LABEL_KEYS[warning.category] || 'sceneUi.warningGeneric')}
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onAutoCorrect} className="flex-1"><Wand2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" /> {t('sceneUi.adjustAndPreview')}</Button>
        <Button type="button" size="sm" variant="outline" onClick={onContinue} className="flex-1">{t('sceneUi.continueToPreview')}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel} className="flex-1">{t('sceneUi.cancel')}</Button>
      </div>
    </div>
  );
}
