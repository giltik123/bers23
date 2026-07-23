import React from 'react';
import { Lightbulb, Plus } from 'lucide-react';
import { executionQueue } from '@/lib/agent/executionQueue';

export default function AgentSuggestions({ suggestions, disabled }) {
  if (!suggestions.length) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Lightbulb className="w-3.5 h-3.5" /> Suggested improvements</p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.key}
            disabled={disabled}
            onClick={() => executionQueue.add(s.task())}
            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            <Plus className="w-3 h-3" /> {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}