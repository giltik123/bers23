import React, { useState, useEffect } from 'react';
import { Zap } from 'lucide-react';
import { workspaceManager } from '@/lib/workspace/workspaceManager';

// The workspace's own quick-action toolbar. Actions only prefill the prompt —
// execution always flows through Planner → Editing Engine.
export default function WorkspaceToolbar({ onUse, disabled }) {
  const [state, setState] = useState(workspaceManager.state);
  useEffect(() => workspaceManager.subscribe(setState), []);

  const ws = workspaceManager.active();
  if (!ws.quickActions?.length) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><Zap className="w-3.5 h-3.5" /> Quick actions</p>
      <div className="flex flex-wrap gap-1.5">
        {ws.quickActions.map((a) => (
          <button
            key={a.label}
            disabled={disabled}
            onClick={() => onUse(a.prompt)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-border hover:bg-accent transition-colors disabled:opacity-50"
          >
            {a.label}
          </button>
        ))}
      </div>
    </div>
  );
}