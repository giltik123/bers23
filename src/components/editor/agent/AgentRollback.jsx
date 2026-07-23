import React from 'react';
import { History, Undo2 } from 'lucide-react';
import { taskHistory } from '@/lib/agent/taskHistory';

// Per-task rollback: reverting one task restores the image state just before it ran.
export default function AgentRollback({ snapshots, onRollback, disabled }) {
  if (!snapshots.length) return null;
  return (
    <div className="border border-border/60 rounded-xl p-3 space-y-2">
      <p className="text-[11px] text-muted-foreground flex items-center gap-1"><History className="w-3.5 h-3.5" /> Task snapshots</p>
      {snapshots.map((s) => (
        <div key={s.taskId} className="flex items-center gap-2 text-xs">
          <img src={s.afterUrl} alt="" className="w-8 h-8 rounded object-cover border border-border" />
          <span className="flex-1 truncate">{s.label}</span>
          <button
            disabled={disabled}
            onClick={() => onRollback(s.beforeUrl, `Rolled back "${s.label}"`)}
            className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-border hover:bg-accent disabled:opacity-50"
          >
            <Undo2 className="w-3 h-3" /> Rollback
          </button>
        </div>
      ))}
      <button
        disabled={disabled}
        onClick={() => onRollback(taskHistory.chainStartUrl(), 'Rolled back agent chain')}
        className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-border hover:bg-accent disabled:opacity-50"
      >
        Rollback whole chain
      </button>
    </div>
  );
}