import React from 'react';
import { AlertTriangle, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Smart warning shown when the Consistency Engine detects drift risk before generation.
export default function ConsistencyWarning({ warnings, onContinue, onCancel, onAutoCorrect }) {
  return (
    <div className="border border-amber-500/50 bg-amber-500/10 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4" /> Scene consistency warning
      </div>
      <ul className="space-y-1">
        {warnings.map((w, i) => (
          <li key={i} className="text-xs text-amber-800 dark:text-amber-300">• {w.message}</li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Button size="sm" onClick={onAutoCorrect} className="flex-1"><Wand2 className="w-3.5 h-3.5 mr-1" /> Auto-correct</Button>
        <Button size="sm" variant="outline" onClick={onContinue} className="flex-1">Continue anyway</Button>
        <Button size="sm" variant="ghost" onClick={onCancel} className="flex-1">Cancel</Button>
      </div>
    </div>
  );
}