import React from 'react';
import { useTranslation } from '@/lib/i18n/TranslationProvider';
import { CheckCircle2, AlertTriangle, HelpCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STATUS = {
  ready: { icon: CheckCircle2, labelKey: 'editControls.planReady', className: 'text-emerald-600' },
  needs_clarification: { icon: HelpCircle, labelKey: 'editControls.planClarify', className: 'text-amber-600' },
  invalid: { icon: AlertTriangle, labelKey: 'editControls.planInvalid', className: 'text-destructive' },
};

const STEP_LABEL_KEYS = {
  segmentation: 'editControls.planSegmentation',
  tryon: 'editControls.planTryOn',
  editing: 'editControls.planEditing',
  save: 'editControls.planReview',
};

const PLANNER_MESSAGE_KEYS = Object.freeze({
  'No project loaded': 'editControls.planNoProject',
  'Project has no image': 'editControls.planNoImage',
  'Instruction is empty': 'editControls.planEmptyInstruction',
  'No object selected — select an object or describe which one to edit': 'editControls.planSelectObject',
  'Conflicting request: both removing and adding/replacing': 'editControls.planConflictingRequest',
  'No object selected for an object-scoped edit': 'editControls.planNoObjectScope',
});

function plannerNotice(message, t) {
  const key = PLANNER_MESSAGE_KEYS[message];
  return key ? t(key) : message;
}

// Advisory preview only: execution and Project history remain Core-authorized.
export default function PlanPreview({ plan }) {
  const { t } = useTranslation();
  if (!plan) return null;
  const s = STATUS[plan.status] || STATUS.invalid;
  const Icon = s.icon;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 font-medium ${s.className}`}>
          <Icon className="w-4 h-4" aria-hidden="true" /> {t(s.labelKey)}
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" />{t('editControls.planDuration', { seconds: plan.executionPlan.estimatedDurationSeconds })}</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{plan.intent.actionLabel}</Badge>
        <Badge variant="outline">
          {plan.resolution.object?.label || (plan.intent.scope === 'whole_image' ? t('editControls.planWholeImage') : t('editControls.planNoObject'))}
        </Badge>
        {plan.executionPlan.order.map((step) => (
          <Badge key={step.step} variant="outline" className="text-muted-foreground">{STEP_LABEL_KEYS[step.step] ? t(STEP_LABEL_KEYS[step.step]) : step.label}</Badge>
        ))}
      </div>

      <p role="note" className="text-xs text-muted-foreground">{t('editControls.planAdvisory')}</p>

      {(plan.validation.errors.length > 0 || plan.intent.ambiguity.length > 0) && (
        <ul className="space-y-0.5 text-xs">
          {plan.validation.errors.map((e, i) => (
            <li key={`e${i}`} className="text-destructive">• {plannerNotice(e, t)}</li>
          ))}
          {plan.status !== 'invalid' && plan.intent.ambiguity.map((a, i) => (
            <li key={`a${i}`} className="text-amber-600">• {plannerNotice(a, t)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}