import React from 'react';
import { Check, Loader2, Circle, X, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const StepIcon = ({ status }) => {
  if (status === 'done') return <Check className="w-3.5 h-3.5 text-green-600" />;
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-destructive" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40" />;
};

// Live step-by-step progress for a running recipe chain.
export default function ChainProgress({ chain, steps, running, onCancel, onDismiss }) {
  if (!steps) return null;
  return (
    <div className="border border-border/60 rounded-2xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{chain.name}</p>
        {running ? (
          <Button variant="ghost" size="sm" onClick={onCancel} className="h-7 text-xs">Cancel</Button>
        ) : (
          <button onClick={onDismiss} className="p-1 rounded hover:bg-accent" aria-label="Dismiss"><X className="w-3.5 h-3.5" /></button>
        )}
      </div>
      <div className="space-y-1.5">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <StepIcon status={step.status} />
            <span className={step.status === 'running' ? 'font-medium' : step.status === 'pending' ? 'text-muted-foreground' : ''}>{step.label}</span>
          </div>
        ))}
      </div>
      {!running && steps.every((s) => s.status === 'done') && (
        <p className="text-xs text-green-600 font-medium">Done — all steps applied.</p>
      )}
    </div>
  );
}