import React from 'react';
import { ListChecks, Coins, Clock } from 'lucide-react';
import TaskRow from '@/components/editor/agent/TaskRow';

export default function ExecutionPlan({ tasks, issues = [], running }) {
  const active = tasks.filter((t) => t.enabled);
  const credits = active.reduce((s, t) => s + t.estimatedCredits, 0);
  const timeS = Math.round(active.reduce((s, t) => s + t.estimatedTime, 0) / 1000);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1"><ListChecks className="w-3.5 h-3.5" /> {active.length} of {tasks.length} tasks</span>
        <span className="flex items-center gap-1"><Coins className="w-3.5 h-3.5" /> ~{credits} credits</span>
        <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" /> ~{timeS}s</span>
      </div>

      {issues.length > 0 && (
        <div className="border border-amber-500/40 bg-amber-500/10 rounded-xl p-2.5 space-y-0.5">
          {issues.map((iss, i) => <p key={i} className="text-[11px] text-amber-700 dark:text-amber-400">{iss.message}</p>)}
        </div>
      )}

      <div className="space-y-2">
        {tasks.map((task, i) => (
          <TaskRow key={task.id} task={task} index={i} total={tasks.length} orderLabel={`${i + 1}.`} running={running} />
        ))}
      </div>
    </div>
  );
}