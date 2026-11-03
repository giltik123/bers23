import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useTranslation } from '@/lib/i18n/TranslationProvider';

const STATUS = {
  ready: { icon: CheckCircle2, key: 'editor.planStatus.ready', className: 'text-emerald-600' },
  needs_clarification: { icon: HelpCircle, key: 'editor.planStatus.needsClarification', className: 'text-amber-600' },
  invalid: { icon: AlertTriangle, key: 'editor.planStatus.invalid', className: 'text-destructive' },
};

// Shows the user exactly what will happen before generation starts.
export default function PlanPreview({ plan }) {
  const { t } = useTranslation();
  if (!plan) return null;
  const status = STATUS[plan.status] || STATUS.invalid;
  const Icon = status.icon;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 font-medium ${status.className}`} role="status" aria-live="polite">
          <Icon className="w-4 h-4" aria-hidden="true" /> {t(status.key)}
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" aria-hidden="true" />~{plan.executionPlan.estimatedDurationSeconds}s</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{plan.intent.actionLabel}</Badge>
        <Badge variant="outline">
          {plan.resolution.object?.label || (plan.intent.scope === 'whole_image' ? t('editor.planScope.wholeImage') : t('editor.planScope.noObject'))}
        </Badge>
        {plan.executionPlan.order.map((step) => (
          <Badge key={step.step} variant="outline" className="text-muted-foreground">{step.label}</Badge>
        ))}
      </div>

      {(plan.validation.errors.length > 0 || plan.intent.ambiguity.length > 0) && (
        <ul className="space-y-0.5 text-xs">
          {plan.validation.errors.map((error, index) => (
            <li key={`e${index}`} className="text-destructive">• {error}</li>
          ))}
          {plan.status !== 'invalid' && plan.intent.ambiguity.map((ambiguity, index) => (
            <li key={`a${index}`} className="text-amber-600">• {ambiguity}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
