import React from 'react';
import { Play, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { AUTOMATION_TRIGGERS, triggerLabel } from '@/lib/automation/AutomationTriggers';
import { AUTOMATION_ACTIONS, actionLabel } from '@/lib/automation/AutomationActions';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
const updateList = (list, item) => [...list, item];

export default function AutomationBuilderPanel({ automation, projects = [], onChange, onSave, onRun, running, previewOnly = false }) {
  const { t } = useTranslation();
  if (!automation) return <section className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">{t('automation.emptyBuilder')}</section>;
  const update = (patch) => onChange({ ...automation, ...patch });
  const addAction = () => update({ actions: updateList(automation.actions || [], { id: `action-${Date.now()}`, type: 'enhance_quality' }) });
  const addCondition = () => update({ conditions: updateList(automation.conditions || [], { id: `condition-${Date.now()}`, type: 'contains', value: 'person' }) });

  return <section className="space-y-4 rounded-2xl border border-border/60 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <input value={automation.name} onChange={(event) => update({ name: event.target.value })} className="bg-transparent text-lg font-semibold outline-none" />
      {previewOnly ? (
        <span className="rounded-full border border-border/60 bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground">{t('automation.previewOnlyBadge')}</span>
      ) : (
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSave}>{t('automation.save')}</Button>
          <Button onClick={onRun} disabled={running || !projects.length}>{running ? t('automation.queuing') : <><Play className="h-4 w-4" />{t('automation.run')}</>}</Button>
        </div>
      )}
    </div>
    <textarea value={automation.description || ''} onChange={(event) => update({ description: event.target.value })} placeholder={t('automation.describePlaceholder')} className="min-h-16 w-full rounded-lg border border-input bg-background p-2 text-sm" />
    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-xl bg-secondary/60 p-3">
        <p className="mb-2 text-xs font-medium">{t('automation.trigger')}</p>
        <select value={automation.trigger} onChange={(event) => update({ trigger: event.target.value })} className="w-full rounded border border-input bg-background p-2 text-xs">{AUTOMATION_TRIGGERS.map((trigger) => <option key={trigger} value={trigger}>{triggerLabel(trigger)}</option>)}</select>
      </div>
      <div className="rounded-xl bg-secondary/60 p-3">
        <p className="mb-2 text-xs font-medium">{t('automation.conditions')}</p>
        {(automation.conditions || []).map((condition, index) => <div key={condition.id} className="mb-1 flex gap-1"><select value={condition.value} onChange={(event) => update({ conditions: automation.conditions.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) })} className="min-w-0 flex-1 rounded border border-input bg-background p-1 text-xs"><option value="person">{t('automation.containsPerson')}</option><option value="vehicle">{t('automation.containsVehicle')}</option><option value="product">{t('automation.containsProduct')}</option><option value="animal">{t('automation.containsAnimal')}</option><option value="text">{t('automation.containsText')}</option></select><button onClick={() => update({ conditions: automation.conditions.filter((_, itemIndex) => itemIndex !== index) })}><X className="h-3.5 w-3.5" /></button></div>)}
        <button onClick={addCondition} className="flex items-center gap-1 text-xs"><Plus className="h-3.5 w-3.5" />{t('automation.condition')}</button>
      </div>
      <div className="rounded-xl bg-secondary/60 p-3">
        <p className="mb-2 text-xs font-medium">{t('automation.schedule')}</p>
        <select value={automation.schedule || 'manual_only'} onChange={(event) => update({ schedule: event.target.value })} className="w-full rounded border border-input bg-background p-2 text-xs"><option value="immediate">{t('automation.scheduleImmediate')}</option><option value="scheduled">{t('automation.scheduleScheduled')}</option><option value="daily">{t('automation.scheduleDaily')}</option><option value="weekly">{t('automation.scheduleWeekly')}</option><option value="manual_only">{t('automation.scheduleManual')}</option></select>
      </div>
    </div>
    <div className="rounded-xl border border-border/60 p-3">
      <div className="mb-2 flex items-center justify-between"><p className="text-sm font-medium">{t('automation.actions')}</p><button onClick={addAction} className="flex items-center gap-1 text-xs"><Plus className="h-3.5 w-3.5" />{t('automation.action')}</button></div>
      <div className="flex flex-wrap gap-2">{(automation.actions || []).map((action, index) => <div key={action.id} className="flex items-center gap-1 rounded-lg bg-secondary px-2 py-1"><select value={action.type} onChange={(event) => update({ actions: automation.actions.map((item, itemIndex) => itemIndex === index ? { ...item, type: event.target.value } : item) })} className="bg-transparent text-xs">{AUTOMATION_ACTIONS.map((type) => <option key={type} value={type}>{actionLabel(type)}</option>)}</select><button onClick={() => update({ actions: automation.actions.filter((_, itemIndex) => itemIndex !== index) })}><X className="h-3.5 w-3.5" /></button></div>)}</div>
    </div>
    <div className="flex gap-4 text-xs text-muted-foreground"><span>{t('automation.variables')}: {(automation.variables || []).length}</span><span>{t('automation.estimatedCredits')}: {automation.estimated_credits || 0}</span><span>{t('automation.estimatedTime')}: {t('common.minutes', { count: Math.ceil((automation.estimated_time || 0) / 60000) })}</span></div>
  </section>;
}
