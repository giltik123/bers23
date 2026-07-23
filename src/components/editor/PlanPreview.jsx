import React from 'react';
import { CheckCircle2, AlertTriangle, HelpCircle, Coins, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

const STATUS = {
  ready: { icon: CheckCircle2, label: 'Ready', className: 'text-emerald-600' },
  needs_clarification: { icon: HelpCircle, label: 'Needs clarification', className: 'text-amber-600' },
  invalid: { icon: AlertTriangle, label: 'Cannot run', className: 'text-destructive' },
};

// Shows the user exactly what will happen before generation starts.
export default function PlanPreview({ plan }) {
  if (!plan) return null;
  const s = STATUS[plan.status] || STATUS.invalid;
  const Icon = s.icon;

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-3 space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className={`flex items-center gap-1.5 font-medium ${s.className}`}>
          <Icon className="w-4 h-4" /> {s.label}
        </span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5" />{plan.credits.credits} credits</span>
          <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />~{plan.executionPlan.estimatedDurationSeconds}s</span>
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <Badge variant="secondary">{plan.intent.actionLabel}</Badge>
        <Badge variant="outline">
          {plan.resolution.object?.label || (plan.intent.scope === 'whole_image' ? 'Whole image' : 'No object')}
        </Badge>
        {plan.executionPlan.order.map((step) => (
          <Badge key={step.step} variant="outline" className="text-muted-foreground">{step.label}</Badge>
        ))}
      </div>

      {(plan.validation.errors.length > 0 || plan.intent.ambiguity.length > 0) && (
        <ul className="space-y-0.5 text-xs">
          {plan.validation.errors.map((e, i) => (
            <li key={`e${i}`} className="text-destructive">• {e}</li>
          ))}
          {plan.status !== 'invalid' && plan.intent.ambiguity.map((a, i) => (
            <li key={`a${i}`} className="text-amber-600">• {a}</li>
          ))}
        </ul>
      )}
    </div>
  );
}