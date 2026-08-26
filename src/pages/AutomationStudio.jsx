import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import AutomationTemplateGallery from '@/components/automation/AutomationTemplateGallery';
import AutomationBuilderPanel from '@/components/automation/AutomationBuilderPanel';
import { automationBuilder } from '@/lib/automation/AutomationBuilder';
import { automationRunner } from '@/lib/automation/AutomationRunner';
import { actionLabel } from '@/lib/automation/AutomationActions';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

export default function AutomationStudio() {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(null);

  const preparedDraft = useMemo(() => {
    if (!draft) return null;
    return { ...draft, ...automationBuilder.estimate(draft) };
  }, [draft]);

  const preview = useMemo(() => {
    if (!preparedDraft) return null;
    try {
      return { plan: automationRunner.plan({ automation: preparedDraft }), error: null };
    } catch (error) {
      return { plan: null, error: error?.message || t('automation.planInvalid') };
    }
  }, [preparedDraft, t]);

  const chooseTemplate = (id) => setDraft(automationBuilder.fromTemplate(id));
  const createDraft = () => setDraft(automationBuilder.blank());

  return (
    <div className="mx-auto max-w-5xl space-y-5 px-4 py-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{t('automation.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('automation.previewSubtitle')}</p>
          </div>
          <Button variant="outline" onClick={createDraft}>{t('automation.newDraft')}</Button>
        </div>
        <div className="rounded-xl border border-border/60 bg-secondary/40 p-3 text-sm text-muted-foreground" role="status">
          {t('automation.previewOnlyNotice')}
        </div>
      </div>

      <AutomationTemplateGallery onChoose={chooseTemplate} />

      <AutomationBuilderPanel
        automation={preparedDraft}
        projects={[]}
        onChange={setDraft}
        previewOnly
      />

      {preparedDraft && (
        <section className="rounded-2xl border border-border/60 p-4" aria-label={t('automation.planPreview')}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">{t('automation.planPreview')}</p>
              <p className="text-xs text-muted-foreground">{t('automation.conditionsDeferred')}</p>
            </div>
            <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">
              {preview?.plan?.status || t('automation.planInvalid')}
            </span>
          </div>

          {preview?.error ? (
            <p className="text-sm text-destructive">{preview.error}</p>
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                <span>{t('automation.actionsCount', { count: preview?.plan?.actions?.length || 0 })}</span>
                <span>{t('automation.estimatedCredits')}: {preparedDraft.estimated_credits || 0}</span>
                <span>{t('automation.estimatedTime')}: {t('common.minutes', { count: Math.ceil((preparedDraft.estimated_time || 0) / 60000) })}</span>
              </div>
              <ol className="space-y-2">
                {(preview?.plan?.actions || []).map((action, index) => (
                  <li key={action.id || `${action.type}-${index}`} className="rounded-lg bg-secondary/50 px-3 py-2 text-sm">
                    <span className="mr-2 text-xs text-muted-foreground">{index + 1}.</span>
                    {actionLabel(action.type)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
